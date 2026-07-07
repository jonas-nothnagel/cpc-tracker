"""
Doc-pair synthesis: compress per-pair alignment records into recurring
storylines between each pair of documents.

For each cross-document pair with total signal (aligned medium/high + flagged)
of at least 3 records, one LLM call produces a JSON synthesis with an
alignment story and a possible-misalignment story (JSON keys `reinforce` /
`clash` are kept stable for consumers; the prose inside follows the
guardrailed vocabulary). Output is consumed by the findings-home frontend
(Section 3 ranking + doc-pair drawer) and by the corpus-level synthesis step.
Style violations trigger one corrective retry, then deterministic
sanitization; style problems never crash a run.

Module entrypoint: `synthesize_doc_pairs(targets, alignment, doc_type_labels=None)`
returns a list of synthesis records, ready to JSON-dump.

CLI for ad-hoc runs:
    cd python && python -m src.synthesize_doc_pairs --country mongolia
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import random
import re
from collections import Counter
from pathlib import Path
from typing import Any

from .config import DATA_DIR, OUTPUT_DIR
from .llm import call_llm_batch
from .synthesis_style import (
    check_prose,
    check_theme_name,
    corrections_block,
    sanitize_name,
    sanitize_prose,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TENSION_LEVELS = {"flagged"}
ALIGNMENT_LEVELS = {"medium", "high"}
MIN_TOTAL_SIGNAL = 3  # floor for "recurring" claim; below this we skip synthesis
MAX_SAMPLES_PER_SIDE = 25  # cap prompt size; sample randomly above this

CACHE_NAMESPACE = "doc_pair_synthesis"

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are summarising how two of a country's policy documents relate, based "
    "on a per-pair AI alignment analysis the country office has already "
    "produced. Your job is to compress repetitive per-pair findings into the "
    "recurring storylines an analyst would describe.\n\n"
    "Voice rules (strict):\n"
    "- This is a decision-support summary for policymakers, not a verdict. "
    "Stay hedged. Use 'tends to', 'recurs', 'often points to', 'could'.\n"
    "- Neutral, non-blame language. Never say a ministry, sector, or document "
    "is failing, lagging, or causing harm.\n"
    "- NO em dashes. Use commas or full stops.\n"
    "- Do not invent facts. Every storyline must trace to the supplied pairs.\n"
    "- Negative-side vocabulary: say 'possible misalignment' or 'potential "
    "misalignment'. NEVER use the words 'tension', 'contradiction', 'friction', "
    "'conflict', or the phrase 'flagged for review' in any output text.\n"
    "- Positive-side vocabulary: say 'aligns with', 'pulls in the same "
    "direction', 'supports'. Do not use the word 'reinforces' in prose.\n"
    "- Never use 'should' or 'must'. For suggestions use 'could' or 'may'.\n"
    "- 1-2 sentences per field. Concrete mechanisms, not abstract categories.\n"
    "- If one side (alignment or possible misalignment) has no records, say so "
    "honestly. Do not fabricate a pattern the records do not show.\n"
    "- coordination_hint stays hedged ('could', 'may help'). Never prescriptive."
)


def _format_pair_block(rec: dict[str, Any], idx: int) -> str:
    return (
        f"[{idx}] level={rec['level']} mechanism={rec['ctype']}\n"
        f"    {rec['a_doc']} {rec['a_label']}: {rec['a_text'][:240]}\n"
        f"    {rec['b_doc']} {rec['b_label']}: {rec['b_text'][:240]}\n"
        f"    REASONING: {rec['reason']}"
    )


def build_user_prompt(
    doc_a: str,
    doc_b: str,
    label_a: str,
    label_b: str,
    aligned: list[dict[str, Any]],
    flagged: list[dict[str, Any]],
    rng: random.Random,
) -> str:
    aligned_sample = (
        rng.sample(aligned, MAX_SAMPLES_PER_SIDE)
        if len(aligned) > MAX_SAMPLES_PER_SIDE
        else list(aligned)
    )
    flagged_sample = (
        rng.sample(flagged, MAX_SAMPLES_PER_SIDE)
        if len(flagged) > MAX_SAMPLES_PER_SIDE
        else list(flagged)
    )
    aligned_blocks = "\n".join(
        _format_pair_block(r, i + 1) for i, r in enumerate(aligned_sample)
    )
    flagged_blocks = "\n".join(
        _format_pair_block(r, i + 1) for i, r in enumerate(flagged_sample)
    )

    mechanism_summary = Counter(r["ctype"] for r in flagged if r["ctype"])
    mechanism_str = ", ".join(f"{k}={v}" for k, v in mechanism_summary.items()) or "none"

    return (
        f"DOCUMENT PAIR: {label_a} ({doc_a}) vs {label_b} ({doc_b})\n"
        f"Counts in this country: {len(aligned)} pairs at medium/high alignment, "
        f"{len(flagged)} identified for review.\n"
        f"Breakdown of pairs identified for review, by mechanism: {mechanism_str}\n\n"
        f"--- ALIGNED PAIRS (sample of {len(aligned_sample)} of {len(aligned)}) ---\n"
        f"{aligned_blocks or '(none in this pair)'}\n\n"
        f"--- PAIRS IDENTIFIED FOR REVIEW (sample of {len(flagged_sample)} of {len(flagged)}) ---\n"
        f"{flagged_blocks or '(none in this pair)'}\n\n"
        "Produce a JSON object with these fields:\n"
        "  storyline_name: noun phrase of 5 to 9 words naming the dominant "
        "pattern, for example 'Shared reliance on protected-area management "
        "plans'. Never an imperative verb phrase: it names what recurs, not an "
        "action to take.\n"
        "  reinforce: 1-2 sentences naming what these docs share or where they "
        "pull in the same direction, concretely (named mechanisms or "
        "instruments). If no aligned pairs, say 'No aligned pairs in this set.'\n"
        "  clash: 1-2 sentences naming where possible misalignments recur, "
        "concretely. If no pairs were identified for review, say 'No recurring "
        "possible misalignment in this set.'\n"
        "  coordination_hint: 1 sentence pointing at coordination that could "
        "help, hedged ('could', 'may'). One sentence only.\n"
        "  confidence: low|medium|high. low if total records < 6, medium if "
        "6-15 with one-sided dominance, high if 15+ and the pattern is clear.\n"
        "Return ONLY the JSON object. No preamble, no markdown fences."
    )


# ---------------------------------------------------------------------------
# Pair pool construction
# ---------------------------------------------------------------------------


def _index_targets(targets: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {t["id"]: t for t in targets}


def _collect_doc_pair_pools(
    alignment: list[dict[str, Any]],
    targets_by_id: dict[str, dict[str, Any]],
) -> dict[tuple[str, str], dict[str, list[dict[str, Any]]]]:
    """Group cross-doc records by (docA, docB) lexicographic key.

    Returns dict { (docA, docB): { "aligned": [...], "flagged": [...] } }.
    Each entry record carries the fields needed to render the prompt.
    """
    pools: dict[tuple[str, str], dict[str, list[dict[str, Any]]]] = {}
    for r in alignment:
        level = r.get("alignment")
        if level == "none":
            continue
        tA = targets_by_id.get(r["targetAId"])
        tB = targets_by_id.get(r["targetBId"])
        if not tA or not tB:
            continue
        if tA["sourceDocument"] == tB["sourceDocument"]:
            continue
        key = tuple(sorted([tA["sourceDocument"], tB["sourceDocument"]]))
        entry = pools.setdefault(key, {"aligned": [], "flagged": []})
        rec = {
            "level": level,
            # v2.1 uses `mechanism`; fall back to v1 `contradictionType` for legacy records.
            "ctype": r.get("mechanism") or r.get("contradictionType"),
            "a_doc": tA["sourceDocument"],
            "a_label": tA["sourceLabel"],
            "a_text": tA["text"],
            "b_doc": tB["sourceDocument"],
            "b_label": tB["sourceLabel"],
            "b_text": tB["text"],
            "reason": r.get("description", ""),
        }
        if level in ALIGNMENT_LEVELS:
            entry["aligned"].append(rec)
        elif level in TENSION_LEVELS:
            entry["flagged"].append(rec)
    return pools


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------


REQUIRED_FIELDS = ("storyline_name", "reinforce", "clash", "coordination_hint", "confidence")


def parse_synthesis(raw: str) -> dict[str, Any] | None:
    """Parse the LLM's JSON synthesis. Returns None on unrecoverable failure."""
    if not raw:
        return None
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    # Some models add a preamble before the JSON; find the first {…} block.
    if not cleaned.startswith("{"):
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not m:
            return None
        cleaned = m.group(0)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.warning(f"synthesize_doc_pairs: JSON decode failed: {e}")
        return None
    if not isinstance(data, dict):
        return None
    if not all(k in data for k in REQUIRED_FIELDS):
        logger.warning(
            f"synthesize_doc_pairs: missing fields in response: "
            f"{set(REQUIRED_FIELDS) - set(data.keys())}"
        )
    return data


PROSE_FIELDS = ("storyline_name", "reinforce", "clash", "coordination_hint")


def check_synthesis_style(parsed: dict[str, Any]) -> list[str]:
    """Shared style rules applied to one doc-pair synthesis."""
    violations = check_theme_name(parsed.get("storyline_name"), field="storyline_name")
    for field in PROSE_FIELDS:
        violations += check_prose(parsed.get(field), field)
    return violations


def _sanitize_synthesis(parsed: dict[str, Any]) -> None:
    """Last-resort in-place repair after the corrective retry."""
    if isinstance(parsed.get("storyline_name"), str):
        parsed["storyline_name"] = sanitize_name(parsed["storyline_name"])
    for field in ("reinforce", "clash", "coordination_hint"):
        if isinstance(parsed.get(field), str):
            parsed[field] = sanitize_prose(parsed[field])


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------


async def synthesize_doc_pairs(
    targets: list[dict[str, Any]],
    alignment: list[dict[str, Any]],
    doc_type_labels: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Produce one synthesis record per qualifying cross-doc pair.

    Args:
        targets: list of target records with id, sourceDocument, sourceLabel, text.
        alignment: list of alignment records with targetAId, targetBId, alignment,
            description, contradictionType.
        doc_type_labels: optional map from docType id to human-readable label
            used in the prompt; defaults to docType id.

    Returns:
        List of synthesis records, one per qualifying pair, with deterministic
        fields (counts, doc ids) plus LLM-generated fields.
    """
    doc_type_labels = doc_type_labels or {}
    targets_by_id = _index_targets(targets)
    pools = _collect_doc_pair_pools(alignment, targets_by_id)

    # Build call payloads only for pairs that clear the floor.
    qualifying: list[tuple[tuple[str, str], dict[str, list[dict[str, Any]]]]] = []
    skipped_thin: list[tuple[tuple[str, str], int]] = []
    for key, pool in pools.items():
        total = len(pool["aligned"]) + len(pool["flagged"])
        if total >= MIN_TOTAL_SIGNAL:
            qualifying.append((key, pool))
        else:
            skipped_thin.append((key, total))

    logger.info(
        f"synthesize_doc_pairs: {len(qualifying)} doc-pairs qualify "
        f"(>= {MIN_TOTAL_SIGNAL} records), {len(skipped_thin)} skipped as too thin"
    )
    for key, total in skipped_thin:
        logger.info(f"  skipped {key[0]} <-> {key[1]}: only {total} record(s)")

    if not qualifying:
        return []

    # Build call list. Each call gets its own deterministic RNG seeded by the
    # pair key so repeated runs sample the same examples (and the disk cache
    # actually hits).
    calls: list[dict[str, Any]] = []
    for key, pool in qualifying:
        doc_a, doc_b = key
        label_a = doc_type_labels.get(doc_a, doc_a)
        label_b = doc_type_labels.get(doc_b, doc_b)
        # Stable across processes (unlike builtin hash(), which is randomized
        # per interpreter run), so oversized pools sample the same examples on
        # every run and the disk cache actually hits.
        seed = int(hashlib.sha256(f"{doc_a}__{doc_b}".encode()).hexdigest()[:8], 16)
        rng = random.Random(seed)
        # Pre-sample aligned with the same RNG so the prompt stays deterministic.
        # We mutate `pool` in-place for sampling visibility, but only the prompt
        # uses the sampled list; the original counts are preserved in metadata
        # below.
        user = build_user_prompt(
            doc_a, doc_b, label_a, label_b,
            pool["aligned"], pool["flagged"], rng,
        )
        calls.append({
            "system": SYSTEM_PROMPT,
            "user": user,
        })

    raws = await call_llm_batch(
        calls,
        cache_namespace=CACHE_NAMESPACE,
        desc="doc-pair synthesis",
    )
    parsed_list = [parse_synthesis(raw) for raw in raws]

    # One corrective retry for responses that violate the style rules; the
    # appended corrections change the cache key, so the retry never re-reads
    # the cached bad answer. Keep the retry only if it did not get worse.
    retry_indices: list[int] = []
    retry_calls: list[dict[str, Any]] = []
    for i, parsed in enumerate(parsed_list):
        if parsed is None:
            continue
        violations = check_synthesis_style(parsed)
        if violations:
            retry_indices.append(i)
            retry_calls.append({
                "system": SYSTEM_PROMPT,
                "user": calls[i]["user"] + corrections_block(violations),
            })
    if retry_calls:
        logger.info(
            f"synthesize_doc_pairs: {len(retry_calls)} corrective retr"
            f"{'y' if len(retry_calls) == 1 else 'ies'} for style violations"
        )
        retry_raws = await call_llm_batch(
            retry_calls,
            cache_namespace=CACHE_NAMESPACE,
            desc="doc-pair synthesis style retries",
        )
        for i, raw in zip(retry_indices, retry_raws):
            reparsed = parse_synthesis(raw)
            if reparsed is None:
                continue
            before = parsed_list[i]
            if len(check_synthesis_style(reparsed)) <= len(check_synthesis_style(before)):
                parsed_list[i] = reparsed

    # Deterministic last resort: banned vocabulary and dashes never ship.
    for parsed in parsed_list:
        if parsed is not None:
            _sanitize_synthesis(parsed)

    results: list[dict[str, Any]] = []
    for (key, pool), parsed in zip(qualifying, parsed_list):
        doc_a, doc_b = key
        record = {
            "doc_a": doc_a,
            "doc_b": doc_b,
            "label_a": doc_type_labels.get(doc_a, doc_a),
            "label_b": doc_type_labels.get(doc_b, doc_b),
            "aligned_count": len(pool["aligned"]),
            "flagged_count": len(pool["flagged"]),
            "contradiction_types": dict(
                Counter(r["ctype"] for r in pool["flagged"] if r["ctype"])
            ),
            "synthesis": parsed,
            "synthesis_error": None if parsed else "parse_failed",
        }
        results.append(record)

    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


async def _cli_run(country: str) -> None:
    out_dir = OUTPUT_DIR / country
    align_path = out_dir / "alignment.json"
    targets_path = DATA_DIR / f"{country}-targets.json"
    config_path = DATA_DIR / f"{country}-country-config.json"
    if not align_path.exists() or not targets_path.exists():
        raise SystemExit(
            f"Missing inputs: alignment.json and {country}-targets.json must exist"
        )

    alignment = json.loads(align_path.read_text())
    targets = json.loads(targets_path.read_text())
    doc_type_labels: dict[str, str] = {}
    if config_path.exists():
        config = json.loads(config_path.read_text())
        for dt in config.get("documentTypes", []):
            doc_type_labels[dt["id"]] = dt.get("mediumLabel") or dt.get("shortLabel") or dt["id"]

    logger.info(
        f"Synthesising doc-pairs for {country}: {len(alignment)} alignment "
        f"records, {len(targets)} targets, {len(doc_type_labels)} doc-type labels"
    )
    results = await synthesize_doc_pairs(targets, alignment, doc_type_labels)

    out_path = out_dir / "doc_pair_synthesis.json"
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    logger.info(f"Wrote {len(results)} doc-pair syntheses to {out_path}")

    # Brief preview of first 2 records for sanity-check
    for record in results[:2]:
        s = record.get("synthesis") or {}
        print()
        print(f"--- {record['label_a']} <-> {record['label_b']} "
              f"({record['aligned_count']} aligned, {record['flagged_count']} flagged) ---")
        print(f"  Storyline: {s.get('storyline_name', '?')}")
        print(f"  Reinforce: {s.get('reinforce', '?')}")
        print(f"  Clash:     {s.get('clash', '?')}")
        print(f"  Coord:     {s.get('coordination_hint', '?')}")
        print(f"  Conf:      {s.get('confidence', '?')}")


def _cli() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    p = argparse.ArgumentParser(description="Run doc-pair synthesis for one country")
    p.add_argument("--country", required=True, help="Country slug (mongolia, panama, ...)")
    args = p.parse_args()
    asyncio.run(_cli_run(args.country))


if __name__ == "__main__":
    _cli()
