"""
Corpus-level synthesis: distil cross-cutting storylines from the per-doc-pair
syntheses for one country.

One LLM call per country takes every doc-pair synthesis as input plus
deterministic count summaries, and produces 5-7 named storylines (mixed
reinforcement and friction) plus a 3-4 sentence briefing-style summary
paragraph. Counts are computed in Python from contributing_doc_pairs against
the deterministic doc-pair counts — never asked of the LLM.

Module entrypoint: `synthesize_corpus(doc_pair_syntheses, country_name)`.

CLI:
    cd python && python -m src.synthesize_corpus --country mongolia
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Any

from .config import DATA_DIR, OUTPUT_DIR
from .llm import call_llm
from .synthesis_states import canonical_hidden_key, filter_doc_pair_records

logger = logging.getLogger(__name__)

CACHE_NAMESPACE = "corpus_themes"


SYSTEM_PROMPT = (
    "You distil cross-cutting storylines from a country's policy coherence "
    "analysis. You are given the per-doc-pair syntheses already produced for "
    "this country. Output recurring storylines that span multiple doc pairs.\n\n"
    "Voice rules (strict):\n"
    "- Hedged, neutral, no blame, no em dashes, no 'contradiction' as a "
    "settled term.\n"
    "- Use 'recurs', 'tends to', 'points to', 'flagged for review', "
    "'reinforces', 'aligns with'.\n"
    "- Each storyline must trace to evidence already provided in the input. "
    "Do not invent new doc-pair claims.\n"
    "- Mix reinforcement and friction storylines. Never friction-only. If the "
    "set leans heavily one way, reflect that proportion honestly.\n"
    "- 1-2 sentences per storyline description. Concrete mechanisms.\n"
    "- The summary_paragraph is for a deputy minister to read first thing. "
    "3-4 sentences. Balanced. No prescription."
)


def _format_input_synthesis(record: dict[str, Any]) -> str:
    s = record.get("synthesis") or {}
    doc_a = record.get("doc_a", "?")
    doc_b = record.get("doc_b", "?")
    label_a = record.get("label_a", doc_a)
    label_b = record.get("label_b", doc_b)
    return (
        f"### {label_a} ({doc_a}) <-> {label_b} ({doc_b})\n"
        f"  Aligned: {record.get('aligned_count', 0)}, "
        f"Flagged: {record.get('flagged_count', 0)}\n"
        f"  Storyline: {s.get('storyline_name', '?')}\n"
        f"  Reinforce: {s.get('reinforce', '?')}\n"
        f"  Clash: {s.get('clash', '?')}\n"
        f"  Coordination: {s.get('coordination_hint', '?')}\n"
        f"  Confidence: {s.get('confidence', '?')}"
    )


def build_user_prompt(
    country_name: str,
    syntheses: list[dict[str, Any]],
) -> str:
    blocks = [_format_input_synthesis(r) for r in syntheses]
    body = "\n\n".join(blocks)
    return (
        f"COUNTRY: {country_name}\n\n"
        f"DOC-PAIR SYNTHESES ({len(syntheses)} total):\n\n{body}\n\n"
        "Produce a JSON object with these fields:\n"
        "  storylines: array of 5-7 objects, each with:\n"
        "    name: 5-10 word verb-phrase storyline name\n"
        "    type: 'reinforcement' or 'friction'\n"
        "    description: 1-2 sentence explanation, concrete\n"
        "    contributing_doc_pairs: array of doc-pair strings like 'FSS<->NBSAP'. "
        "MUST be drawn from doc-pairs that actually appear in the input. Never "
        "invent doc-pairs.\n"
        "    confidence: low|medium|high\n"
        "  summary_paragraph: 3-4 sentence briefing-style paragraph. Balanced "
        "(reinforce + friction). Hedged. No em dashes. No prescription.\n"
        "Return ONLY the JSON object."
    )


REQUIRED_TOP_FIELDS = ("storylines", "summary_paragraph")
REQUIRED_STORYLINE_FIELDS = ("name", "type", "description", "contributing_doc_pairs", "confidence")
VALID_TYPES = {"reinforcement", "friction"}


def parse_corpus(raw: str) -> dict[str, Any] | None:
    if not raw:
        return None
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    if not cleaned.startswith("{"):
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not m:
            return None
        cleaned = m.group(0)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.warning(f"synthesize_corpus: JSON decode failed: {e}")
        return None
    if not isinstance(data, dict):
        return None
    for k in REQUIRED_TOP_FIELDS:
        if k not in data:
            logger.warning(f"synthesize_corpus: missing top-level field: {k}")
    # Strip em dashes everywhere
    if isinstance(data.get("summary_paragraph"), str):
        data["summary_paragraph"] = data["summary_paragraph"].replace("—", ",").replace("–", ",")
    for s in data.get("storylines", []) or []:
        for k in ("name", "description"):
            if isinstance(s.get(k), str):
                s[k] = s[k].replace("—", ",").replace("–", ",")
    return data


def _augment_with_deterministic_counts(
    parsed: dict[str, Any],
    doc_pair_records: list[dict[str, Any]],
) -> dict[str, Any]:
    """Compute pair_count and unique_documents per storyline from the
    contributing_doc_pairs claim, using the deterministic doc-pair counts.

    LLM is not asked for a count; we look up the actual totals from the
    doc-pair syntheses it cites. Doc-pair strings are canonicalised so:
      - order is irrelevant ('FSS<->NBSAP' == 'NBSAP<->FSS')
      - human labels are accepted as aliases for IDs ('Vision 2050' resolves
        to its underlying doc id, e.g. 'SECTORAL'). Without this aliasing the
        LLM's natural tendency to use the readable label produces lots of
        false-unverifiable cites.
    """
    by_unordered_pair: dict[frozenset[str], dict[str, Any]] = {}
    # term_to_doc_ids maps any recognised name (id or label, case-folded) to
    # the set of doc-ids it could refer to. Usually one element; we keep a
    # set to surface ambiguous-label cases honestly.
    term_to_doc_ids: dict[str, set[str]] = {}

    def _register(term: str | None, doc_id: str) -> None:
        if not term:
            return
        key = term.strip().casefold()
        if not key:
            return
        term_to_doc_ids.setdefault(key, set()).add(doc_id)

    for rec in doc_pair_records:
        by_unordered_pair[frozenset([rec["doc_a"], rec["doc_b"]])] = rec
        _register(rec.get("doc_a"), rec["doc_a"])
        _register(rec.get("doc_b"), rec["doc_b"])
        _register(rec.get("label_a"), rec["doc_a"])
        _register(rec.get("label_b"), rec["doc_b"])

    def _resolve(term: str) -> str | None:
        candidates = term_to_doc_ids.get(term.strip().casefold())
        if candidates and len(candidates) == 1:
            return next(iter(candidates))
        return None

    for s in parsed.get("storylines", []) or []:
        cites = s.get("contributing_doc_pairs", []) or []
        pair_count = 0
        doc_union: set[str] = set()
        verified_pairs: list[str] = []
        unknown_pairs: list[str] = []
        for cite in cites:
            if not isinstance(cite, str):
                continue
            parts = re.split(r"<->|↔|<-|->|/|,|\|", cite)
            parts = [p.strip() for p in parts if p.strip()]
            if len(parts) != 2:
                unknown_pairs.append(cite)
                continue
            resolved_a = _resolve(parts[0])
            resolved_b = _resolve(parts[1])
            if not resolved_a or not resolved_b:
                unknown_pairs.append(cite)
                continue
            key = frozenset([resolved_a, resolved_b])
            rec = by_unordered_pair.get(key)
            if rec is None:
                unknown_pairs.append(cite)
                continue
            verified_pairs.append(f"{rec['doc_a']}<->{rec['doc_b']}")
            doc_union.update([rec["doc_a"], rec["doc_b"]])
            if s.get("type") == "friction":
                pair_count += rec.get("flagged_count", 0)
            elif s.get("type") == "reinforcement":
                pair_count += rec.get("aligned_count", 0)
            else:
                pair_count += rec.get("aligned_count", 0) + rec.get("flagged_count", 0)
        # Dedupe verified_pairs while preserving order
        seen: set[str] = set()
        deduped: list[str] = []
        for p in verified_pairs:
            if p not in seen:
                seen.add(p)
                deduped.append(p)
        s["contributing_doc_pairs"] = deduped
        s["unknown_doc_pairs"] = unknown_pairs
        s["pair_count"] = pair_count
        s["spans_documents"] = sorted(doc_union)
    return parsed


async def synthesize_corpus(
    doc_pair_syntheses: list[dict[str, Any]],
    country_name: str,
) -> dict[str, Any]:
    """Produce one corpus-themes record for the country.

    Returns the LLM JSON augmented with deterministic per-storyline counts.
    """
    # Only feed records that actually have a usable synthesis.
    valid = [r for r in doc_pair_syntheses if r.get("synthesis")]
    if not valid:
        logger.warning("synthesize_corpus: no doc-pair syntheses available")
        return {
            "storylines": [],
            "summary_paragraph": "No doc-pair syntheses available to compose corpus themes.",
            "doc_pair_count": 0,
        }
    user = build_user_prompt(country_name, valid)
    raw = await call_llm(
        SYSTEM_PROMPT, user,
        cache_namespace=CACHE_NAMESPACE,
    )
    parsed = parse_corpus(raw)
    if parsed is None:
        return {
            "storylines": [],
            "summary_paragraph": "Synthesis failed to parse.",
            "doc_pair_count": len(valid),
            "parse_error": True,
        }
    parsed["doc_pair_count"] = len(valid)
    parsed = _augment_with_deterministic_counts(parsed, valid)
    return parsed


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


async def _cli_run(country: str, hidden_key: str = "") -> None:
    out_dir = OUTPUT_DIR / country
    in_path = out_dir / "doc_pair_synthesis.json"
    if not in_path.exists():
        raise SystemExit(
            f"Missing {in_path}. Run synthesize_doc_pairs first."
        )
    config_path = DATA_DIR / f"{country}-country-config.json"
    country_name = country.capitalize()
    if config_path.exists():
        config = json.loads(config_path.read_text())
        country_name = config.get("name", country_name)

    syntheses = json.loads(in_path.read_text())

    # `--hidden` mode: regenerate corpus themes for an off-path document subset
    # on demand (used by the /api/storyline-state route). Filter the doc-pair
    # syntheses to the visible set, emit ONLY JSON on stdout, and do NOT
    # overwrite corpus_themes.json (which holds the precomputed states). Hits
    # and populates the same .cache/corpus_themes namespace, so each subset is
    # an LLM call at most once.
    hidden = {h for h in hidden_key.split("+") if h}
    if hidden:
        syntheses = filter_doc_pair_records(syntheses, hidden)
        logger.info(
            f"Synthesising corpus themes for {country_name}, hidden="
            f"{canonical_hidden_key(hidden)}: {len(syntheses)} doc-pair "
            f"syntheses after filter"
        )
        result = await synthesize_corpus(syntheses, country_name)
        print(json.dumps(result, ensure_ascii=False))
        return

    logger.info(
        f"Synthesising corpus themes for {country_name}: "
        f"{len(syntheses)} doc-pair syntheses as input"
    )

    result = await synthesize_corpus(syntheses, country_name)

    out_path = out_dir / "corpus_themes.json"
    out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    logger.info(f"Wrote corpus themes to {out_path}")

    print()
    print("=" * 78)
    print(f"CORPUS THEMES  ({country_name})")
    print("=" * 78)
    print(f"\nSummary paragraph:\n{result.get('summary_paragraph', '?')}\n")
    for s in result.get("storylines", []) or []:
        ds = ", ".join(s.get("spans_documents", []))
        print(f"[{s.get('type', '?'):<13}] {s.get('name', '?')}")
        print(f"  {s.get('description', '?')}")
        print(f"  spans {len(s.get('spans_documents', []))} docs ({ds}); "
              f"~{s.get('pair_count', 0)} contributing pairs; conf={s.get('confidence', '?')}")
        if s.get("unknown_doc_pairs"):
            print(f"  WARN: unverifiable cites: {s['unknown_doc_pairs']}")
        print()


def _cli() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    p = argparse.ArgumentParser(description="Run corpus theme synthesis for one country")
    p.add_argument("--country", required=True, help="Country slug")
    p.add_argument(
        "--hidden",
        default="",
        help=(
            "Canonical hidden-doc key (e.g. 'ENR' or 'HR+PEG'). When set, "
            "regenerate themes for that visible subset and print JSON to "
            "stdout without writing corpus_themes.json."
        ),
    )
    args = p.parse_args()
    asyncio.run(_cli_run(args.country, args.hidden))


if __name__ == "__main__":
    _cli()
