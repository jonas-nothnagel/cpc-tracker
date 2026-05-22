"""
Sector-scoped synthesis: for each taxonomy lens x each populated sector, one
LLM call producing a sector-scoped reinforce/clash storyline.

Pool rule: include a target-pair if AT LEAST ONE side has a classification
record with `taxonomyType=T`, `categoryId=X`, and `score >= 0.5` (i.e.
`isRelevant=true`). Multi-label richness preserved.

Taxonomy-agnostic by design: the script reads classifications.json,
auto-detects taxonomy types, and runs against any taxonomy. Category names
are resolved from caller-supplied lookups (categories.json, country-config,
etc.). Same code path serves GLOBE, IPCC, country sectors, NBS, adaptation
goals, and future user-uploaded taxonomies.

Module entrypoint: `synthesize_by_sector(targets, alignment, classifications,
category_names, doc_type_labels, taxonomy_allowlist)`.

CLI:
    cd python && python -m src.synthesize_by_sector --country mongolia
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import random
import re
from collections import Counter
from pathlib import Path
from typing import Any

from .config import DATA_DIR, OUTPUT_DIR
from .llm import call_llm_batch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TENSION_LEVELS = {"possible_misalignment", "possible_conflict", "likely_conflict"}
ALIGNMENT_LEVELS = {"medium", "high"}
RELEVANCE_FLOOR = 0.5  # baseline; can be raised via threshold arg if synthesis is noisy
MIN_TOTAL_SIGNAL = 3
MAX_SAMPLES_PER_SIDE = 20  # slightly tighter than doc-pair, since prompts include sector context

CACHE_NAMESPACE = "sector_synthesis"

# Default taxonomy allowlist for sector-level synthesis. globe_sub is excluded
# by default because 49 subcategories produce too many thin pools to be useful
# at the section-2 sector-card level; the subcategory drilldown belongs in a
# different surface. Override via the function arg if you want them in.
DEFAULT_TAXONOMY_ALLOWLIST = ("nbs", "sector", "globe", "country", "adaptation_goal")


SYSTEM_PROMPT = (
    "You are summarising how a country's policy documents relate within a "
    "single sector (a category in one taxonomy). You receive a sample of "
    "target-pairs that touch this sector, with their AI-generated alignment "
    "verdicts. Your job is to compress these into recurring storylines an "
    "analyst would describe FOR THIS SECTOR specifically.\n\n"
    "Voice rules (strict):\n"
    "- Decision-support tone. Hedged: 'tends to', 'recurs', 'often points to'.\n"
    "- Neutral, non-blame language.\n"
    "- NO em dashes. Use commas or full stops.\n"
    "- Do not invent facts. Every storyline must trace to supplied pairs.\n"
    "- 'Possible misalignment' / 'flagged for review' / 'reinforces' / 'aligns'.\n"
    "- 1-2 sentences per field. Concrete mechanisms.\n"
    "- If one side has no records (e.g. no flagged pairs touch this sector), "
    "say so honestly. Never fabricate friction or reinforcement.\n"
    "- The sector name is provided as context; treat it as opaque and let the "
    "supplied pair content anchor the storyline. Do not over-extrapolate to "
    "the whole sector beyond what these pairs support."
)


def _format_pair_block(rec: dict[str, Any], idx: int) -> str:
    return (
        f"[{idx}] level={rec['level']} ctype={rec['ctype']} sector_role={rec['sector_role']}\n"
        f"    {rec['a_doc']} {rec['a_label']}: {rec['a_text'][:220]}\n"
        f"    {rec['b_doc']} {rec['b_label']}: {rec['b_text'][:220]}\n"
        f"    REASONING: {rec['reason']}"
    )


def build_user_prompt(
    taxonomy_type: str,
    category_id: str,
    category_name: str,
    aligned: list[dict[str, Any]],
    flagged: list[dict[str, Any]],
    pool_composition: dict[str, int],
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
    ctype_summary = Counter(r["ctype"] for r in flagged if r["ctype"])
    ctype_str = ", ".join(f"{k}={v}" for k, v in ctype_summary.items()) or "none"

    return (
        f"SECTOR: {category_name} (taxonomy={taxonomy_type}, id={category_id})\n"
        f"Pool composition: {pool_composition['primary_count']} pairs where the "
        f"sector is the primary classification on at least one side; "
        f"{pool_composition['relevant_only_count']} pairs where it is only a "
        f"relevant secondary classification.\n"
        f"Counts: {len(aligned)} pairs at medium/high alignment, "
        f"{len(flagged)} flagged for review.\n"
        f"Flagged breakdown by contradictionType: {ctype_str}\n\n"
        f"sector_role tells you whether the target touching this sector is on "
        f"side A, side B, or BOTH sides of the pair.\n\n"
        f"--- REINFORCING PAIRS (sample of {len(aligned_sample)} of {len(aligned)}) ---\n"
        f"{aligned_blocks or '(none touch this sector)'}\n\n"
        f"--- FLAGGED PAIRS (sample of {len(flagged_sample)} of {len(flagged)}) ---\n"
        f"{flagged_blocks or '(none touch this sector)'}\n\n"
        "Produce a JSON object with these fields:\n"
        "  storyline_name: 5-10 word verb-phrase capturing the recurring "
        "sector pattern.\n"
        "  reinforce: 1-2 sentences naming what aligns within this sector. If "
        "no reinforcing pairs touch the sector, say 'No reinforcing pairs in "
        "this sector.'\n"
        "  clash: 1-2 sentences naming recurring friction within this sector. "
        "If no flagged pairs, say 'No friction flagged in this sector.'\n"
        "  coordination_hint: 1 sentence, hedged, sector-scoped.\n"
        "  confidence: low|medium|high. low if total < 6 or pool is mostly "
        "relevant-only; medium if 6-15 with primary backing; high if 15+ with "
        "strong primary representation.\n"
        "Return ONLY the JSON object."
    )


REQUIRED_FIELDS = ("storyline_name", "reinforce", "clash", "coordination_hint", "confidence")


def parse_synthesis(raw: str) -> dict[str, Any] | None:
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
        logger.warning(f"synthesize_by_sector: JSON decode failed: {e}")
        return None
    if not isinstance(data, dict):
        return None
    # Strip em dashes
    for k in ("storyline_name", "reinforce", "clash", "coordination_hint"):
        if isinstance(data.get(k), str):
            data[k] = data[k].replace("—", ",").replace("–", ",")
    return data


# ---------------------------------------------------------------------------
# Pool construction
# ---------------------------------------------------------------------------


def _classifications_index(
    classifications: list[dict[str, Any]],
) -> dict[str, dict[tuple[str, str], dict[str, Any]]]:
    """Group classifications by targetId then by (taxonomy, categoryId).

    Returns: { targetId: { (taxonomy, categoryId): record } }
    """
    out: dict[str, dict[tuple[str, str], dict[str, Any]]] = {}
    for c in classifications:
        target_id = c.get("targetId")
        if not target_id:
            continue
        key = (c.get("taxonomyType", ""), c.get("categoryId", ""))
        out.setdefault(target_id, {})[key] = c
    return out


def _enumerate_sectors_with_signal(
    classifications: list[dict[str, Any]],
    allowed_taxonomies: set[str],
) -> list[tuple[str, str]]:
    """Return all (taxonomyType, categoryId) combos that have at least one
    relevant classification under the allowlist."""
    seen: set[tuple[str, str]] = set()
    for c in classifications:
        if not c.get("isRelevant"):
            continue
        ttype = c.get("taxonomyType", "")
        if ttype not in allowed_taxonomies:
            continue
        cid = c.get("categoryId", "")
        if cid:
            seen.add((ttype, cid))
    return sorted(seen)


def _collect_sector_pool(
    taxonomy_type: str,
    category_id: str,
    alignment: list[dict[str, Any]],
    targets_by_id: dict[str, dict[str, Any]],
    classifications_index: dict[str, dict[tuple[str, str], dict[str, Any]]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    """Return (aligned, flagged, pool_composition) for one sector.

    A pair belongs in the sector if AT LEAST ONE side has a classification
    record for (taxonomy_type, category_id) with score >= RELEVANCE_FLOOR.
    pool_composition tracks how many pairs have the sector as primary on at
    least one side vs. relevant-only on both sides.
    """
    key = (taxonomy_type, category_id)
    aligned: list[dict[str, Any]] = []
    flagged: list[dict[str, Any]] = []
    primary_count = 0
    relevant_only_count = 0

    for r in alignment:
        level = r.get("alignment")
        if level == "none":
            continue
        tA = targets_by_id.get(r["targetAId"])
        tB = targets_by_id.get(r["targetBId"])
        if not tA or not tB:
            continue
        cA = classifications_index.get(r["targetAId"], {}).get(key)
        cB = classifications_index.get(r["targetBId"], {}).get(key)
        score_a = (cA or {}).get("score", 0) if cA else 0
        score_b = (cB or {}).get("score", 0) if cB else 0
        touches_a = score_a >= RELEVANCE_FLOOR
        touches_b = score_b >= RELEVANCE_FLOOR
        if not touches_a and not touches_b:
            continue
        is_primary_a = bool((cA or {}).get("isPrimary"))
        is_primary_b = bool((cB or {}).get("isPrimary"))
        is_primary = (touches_a and is_primary_a) or (touches_b and is_primary_b)

        sector_role = (
            "both" if touches_a and touches_b
            else "a" if touches_a
            else "b"
        )
        rec = {
            "level": level,
            "ctype": r.get("contradictionType"),
            "a_doc": tA["sourceDocument"],
            "a_label": tA["sourceLabel"],
            "a_text": tA["text"],
            "b_doc": tB["sourceDocument"],
            "b_label": tB["sourceLabel"],
            "b_text": tB["text"],
            "reason": r.get("description", ""),
            "sector_role": sector_role,
            "is_primary": is_primary,
        }
        if is_primary:
            primary_count += 1
        else:
            relevant_only_count += 1
        if level in ALIGNMENT_LEVELS:
            aligned.append(rec)
        elif level in TENSION_LEVELS:
            flagged.append(rec)

    return aligned, flagged, {
        "primary_count": primary_count,
        "relevant_only_count": relevant_only_count,
    }


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------


async def synthesize_by_sector(
    targets: list[dict[str, Any]],
    alignment: list[dict[str, Any]],
    classifications: list[dict[str, Any]],
    category_names: dict[tuple[str, str], str] | None = None,
    doc_type_labels: dict[str, str] | None = None,
    taxonomy_allowlist: tuple[str, ...] = DEFAULT_TAXONOMY_ALLOWLIST,
) -> list[dict[str, Any]]:
    """Produce one synthesis record per qualifying (taxonomy, sector) pair.

    Args:
        targets: target records.
        alignment: alignment records.
        classifications: classification records (must include `score`,
            `taxonomyType`, `categoryId`, `targetId`, `isRelevant`, `isPrimary`).
        category_names: optional {(taxonomyType, categoryId): displayName}.
            Falls back to categoryId if missing.
        doc_type_labels: not used in the prompt at sector level (pair-level
            labels carry it); accepted for symmetry with other synthesis steps.
        taxonomy_allowlist: which taxonomy types to synthesise. Defaults to the
            user-facing lenses; subcategory taxonomies (`globe_sub`) excluded.

    Returns: list of synthesis records.
    """
    category_names = category_names or {}
    targets_by_id = {t["id"]: t for t in targets}
    cls_index = _classifications_index(classifications)
    allowed = set(taxonomy_allowlist)
    sectors = _enumerate_sectors_with_signal(classifications, allowed)
    logger.info(
        f"synthesize_by_sector: scanning {len(sectors)} (taxonomy, sector) "
        f"combinations across allowlist {sorted(allowed)}"
    )

    # Build pool for each sector, keep only those with enough signal.
    qualifying: list[dict[str, Any]] = []
    for taxonomy_type, category_id in sectors:
        aligned, flagged, pool = _collect_sector_pool(
            taxonomy_type, category_id, alignment, targets_by_id, cls_index,
        )
        total = len(aligned) + len(flagged)
        if total >= MIN_TOTAL_SIGNAL:
            qualifying.append({
                "taxonomy_type": taxonomy_type,
                "category_id": category_id,
                "category_name": category_names.get(
                    (taxonomy_type, category_id), category_id,
                ),
                "aligned": aligned,
                "flagged": flagged,
                "pool_composition": pool,
            })
    logger.info(
        f"synthesize_by_sector: {len(qualifying)} sectors qualify (>= {MIN_TOTAL_SIGNAL} records)"
    )
    if not qualifying:
        return []

    # Build LLM call payloads
    calls: list[dict[str, Any]] = []
    for q in qualifying:
        seed = hash(f"{q['taxonomy_type']}__{q['category_id']}") & 0xFFFFFFFF
        rng = random.Random(seed)
        user = build_user_prompt(
            q["taxonomy_type"], q["category_id"], q["category_name"],
            q["aligned"], q["flagged"], q["pool_composition"], rng,
        )
        calls.append({"system": SYSTEM_PROMPT, "user": user})

    raws = await call_llm_batch(
        calls, cache_namespace=CACHE_NAMESPACE, desc="sector synthesis"
    )

    results: list[dict[str, Any]] = []
    for q, raw in zip(qualifying, raws):
        parsed = parse_synthesis(raw)
        results.append({
            "taxonomy_type": q["taxonomy_type"],
            "category_id": q["category_id"],
            "category_name": q["category_name"],
            "aligned_count": len(q["aligned"]),
            "flagged_count": len(q["flagged"]),
            "pool_composition": q["pool_composition"],
            "contradiction_types": dict(
                Counter(r["ctype"] for r in q["flagged"] if r["ctype"])
            ),
            "synthesis": parsed,
            "synthesis_error": None if parsed else "parse_failed",
        })
    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _load_category_names(country: str) -> dict[tuple[str, str], str]:
    """Build category name lookup from the country's data files.

    Standard taxonomies (nbs, sector, globe, globe_sub) come from
    `python/data/categories.json`. Country-specific categories (countrySectors,
    adaptation goals) come from country-specific files.
    """
    names: dict[tuple[str, str], str] = {}
    cats_path = DATA_DIR / "categories.json"
    if cats_path.exists():
        cats = json.loads(cats_path.read_text())
        for c in cats.get("nbs_categories", []):
            names[("nbs", c["id"])] = c.get("name", c["id"])
        for c in cats.get("ipcc_sectors", []):
            names[("sector", c["id"])] = c.get("name", c["id"])
        for c in cats.get("globe_categories", []):
            names[("globe", c["id"])] = c.get("name", c["id"])
        for c in cats.get("globe_subcategories", []):
            names[("globe_sub", c["id"])] = c.get("name", c["id"])

    cfg_path = DATA_DIR / f"{country}-country-config.json"
    if cfg_path.exists():
        cfg = json.loads(cfg_path.read_text())
        for c in cfg.get("countrySectors", []):
            names[("country", c["id"])] = c.get("name", c["id"])

    adp_path = DATA_DIR / f"{country}-btr-adaptation.json"
    if adp_path.exists():
        adp = json.loads(adp_path.read_text())
        for g in adp.get("adaptationGoals", []):
            gid = str(g["id"])
            descr = g.get("description", gid)
            short = descr[:80].rstrip(",.")
            if len(descr) > 80:
                short = short + "…"
            names[("adaptation_goal", gid)] = short
    return names


async def _cli_run(country: str) -> None:
    out_dir = OUTPUT_DIR / country
    align_path = out_dir / "alignment.json"
    cls_path = out_dir / "classifications.json"
    targets_path = DATA_DIR / f"{country}-targets.json"
    if not (align_path.exists() and cls_path.exists() and targets_path.exists()):
        raise SystemExit("Missing alignment.json, classifications.json, or targets file")

    alignment = json.loads(align_path.read_text())
    classifications = json.loads(cls_path.read_text())
    targets = json.loads(targets_path.read_text())
    category_names = _load_category_names(country)
    logger.info(
        f"Synthesising sectors for {country}: {len(alignment)} alignment, "
        f"{len(classifications)} classifications, {len(targets)} targets, "
        f"{len(category_names)} category names"
    )
    results = await synthesize_by_sector(
        targets, alignment, classifications,
        category_names=category_names,
    )

    out_path = out_dir / "sector_synthesis.json"
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    logger.info(f"Wrote {len(results)} sector syntheses to {out_path}")

    # Brief preview of first 3
    for r in results[:3]:
        s = r.get("synthesis") or {}
        pc = r["pool_composition"]
        print()
        print(f"--- {r['taxonomy_type']} / {r['category_name']} "
              f"({r['aligned_count']} aligned, {r['flagged_count']} flagged; "
              f"{pc['primary_count']} primary + {pc['relevant_only_count']} relevant-only) ---")
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
    p = argparse.ArgumentParser(description="Run sector synthesis for one country")
    p.add_argument("--country", required=True)
    args = p.parse_args()
    asyncio.run(_cli_run(args.country))


if __name__ == "__main__":
    _cli()
