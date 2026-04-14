"""
GLOBE subcategory classifier using BIOFIN expert few-shot examples.

One LLM call per target returns a probability-ranked list of GLOBE
subcategories with explicit scores. The top-ranked subcategory is the
``isPrimary`` classification; subcategories above the relevance threshold
are also marked ``isRelevant`` (multi-label) but only the primary is used
by single-label visualizations.

Few-shot examples from the 138 BIOFIN expert items
(``mongolia-ber-globe-examples.json``) calibrate the LLM toward the
official methodology.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from .classify import RELEVANCE_THRESHOLD
from .llm import call_llm_batch

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------


def _format_subcategory_catalog(
    subcategories: list[dict[str, Any]],
    primary_categories: list[dict[str, Any]],
) -> str:
    """Render the 48 GLOBE subcategories grouped by primary category."""
    parent_by_id = {c["id"]: c["name"] for c in primary_categories}
    groups: dict[str, list[dict[str, Any]]] = {}
    for sub in subcategories:
        groups.setdefault(sub["parentId"], []).append(sub)

    lines: list[str] = []
    for parent_id in sorted(groups.keys()):
        parent_name = parent_by_id.get(parent_id, parent_id)
        lines.append(f"\n## {parent_name}")
        for sub in sorted(groups[parent_id], key=lambda s: s["id"]):
            lines.append(f"- **{sub['id']} {sub['name']}**: {sub['description']}")
    return "\n".join(lines)


# Synthetic score schedule for few-shot examples derived from expert codes.
# The expert data lists 1-5 codes per item without explicit ranking, so we
# assign decreasing scores by position: first listed is treated as primary.
_FEWSHOT_SCORES = [0.9, 0.7, 0.55, 0.4, 0.3]


def _format_few_shot_examples(
    examples: list[dict[str, Any]],
    max_examples: int = 15,
) -> str:
    """Render a curated selection of expert examples in the ranked output format."""
    selected: list[dict[str, Any]] = []
    seen_codes: set[str] = set()

    # First pass: examples with Medium/High confidence
    for ex in examples:
        if len(selected) >= max_examples:
            break
        if ex.get("confidence") not in ("Medium", "High"):
            continue
        codes = {c["code"] for c in ex.get("globeSubcategories", [])}
        if not codes:
            continue
        if codes - seen_codes or len(selected) < 5:
            selected.append(ex)
            seen_codes.update(codes)

    # Second pass: a few Low-confidence examples (most common in reality)
    for ex in examples:
        if len(selected) >= max_examples:
            break
        if ex.get("confidence") != "Low":
            continue
        codes = {c["code"] for c in ex.get("globeSubcategories", [])}
        if not codes or codes.issubset(seen_codes):
            continue
        selected.append(ex)
        seen_codes.update(codes)

    lines: list[str] = []
    for ex in selected:
        # Prefer English description if available; fall back to Mongolian
        desc = (ex.get("descriptionEn") or ex.get("description") or "").strip()
        if len(desc) > 220:
            desc = desc[:217] + "..."
        codes = [c["code"] for c in ex.get("globeSubcategories", [])]
        ranked = []
        for i, code in enumerate(codes):
            score = _FEWSHOT_SCORES[i] if i < len(_FEWSHOT_SCORES) else 0.2
            # Slight noise based on confidence: Low examples get lower base scores
            if ex.get("confidence") == "Low" and i == 0:
                score = max(0.4, score - 0.2)  # ~0.7 -> 0.5 for low-conf primary
            ranked.append({
                "id": code,
                "score": round(score, 2),
                "reasoning": ex.get("barJustification", "") if i == 0 else "",
            })
        output = {"ranked": ranked}
        lines.append(
            f"Description: {desc}\n"
            f"Output: {json.dumps(output, ensure_ascii=False)}"
        )
    return "\n\n".join(lines)


def build_system_prompt(
    subcategories: list[dict[str, Any]],
    primary_categories: list[dict[str, Any]],
    few_shot_examples: list[dict[str, Any]],
) -> str:
    """System prompt: GLOBE methodology + subcategory catalog + ranked few-shot."""
    catalog = _format_subcategory_catalog(subcategories, primary_categories)
    examples = _format_few_shot_examples(few_shot_examples)

    return f"""You are a biodiversity expenditure classifier working within the BIOFIN/UNDP methodology for Biodiversity Expenditure Reviews (BER).

Your task is to classify a given item (a budget program, policy target, or implementation action) against the GLOBE 2024 taxonomy -- the official BIOFIN framework for standardizing biodiversity expenditure reviews across 40+ countries.

# GLOBE Subcategory Catalog

The GLOBE taxonomy has 9 Primary Biodiversity Categories with 48 subcategories. Score every subcategory that has any relevance to the item. The first entry in your output is treated as the PRIMARY classification, so order them strictly by relevance (highest first).
{catalog}

# Scoring scale

- 0.85-1.0 = the item is primarily and explicitly about this subcategory
- 0.6-0.84 = clearly relevant, this subcategory is a major theme
- 0.4-0.59 = partially relevant, the item touches this subcategory among others
- 0.2-0.39 = tangentially relevant
- below 0.2 = omit

The first item must always be the single most relevant subcategory. Most items will have 1-3 entries. Items with no biodiversity relevance return an empty array.

# Expert Calibration Examples

The following examples show how a BIOFIN expert classified real expenditure items, converted to the ranked output format. The first code is treated as primary; secondary codes get progressively lower scores.

{examples}

# Response Format

Return ONLY a JSON object, no markdown:
{{
  "ranked": [
    {{"id": "<X.XX>", "score": <0.0-1.0>, "reasoning": "<one short sentence>"}},
    {{"id": "<Y.YY>", "score": <0.0-1.0>, "reasoning": ""}}
  ]
}}

Rules:
- Order strictly by score, highest first. The first entry is the primary classification.
- Never invent codes that are not in the catalog above.
- Use lower scores for items with weak/indirect biodiversity intent (typical for general operating expenditure inside an environmental programme).
- Reasoning is required on the primary entry; optional on others.
- Empty array `{{"ranked": []}}` if no subcategory applies."""


def build_user_message(target_text: str) -> str:
    return f"Classify this item:\n\n{target_text}"


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def parse_response(raw: str, valid_codes: set[str]) -> list[dict[str, Any]]:
    """Parse the ranked-output JSON. Returns list of {id, score, reasoning} ordered by score desc."""
    cleaned = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()

    obj_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not obj_match:
        logger.warning(f"No JSON object in subcategory rank response: {raw[:200]}")
        return []

    try:
        parsed = json.loads(obj_match.group(0))
    except json.JSONDecodeError as e:
        logger.warning(f"Subcategory JSON parse failed: {e}. Raw: {raw[:200]}")
        return []

    raw_ranked = parsed.get("ranked", [])
    # Backwards-compat: if the LLM returned the old flat-list format, treat
    # entries as descending-rank with synthetic scores.
    if not raw_ranked and isinstance(parsed.get("subcategories"), list):
        raw_ranked = [
            {"id": c, "score": _FEWSHOT_SCORES[i] if i < len(_FEWSHOT_SCORES) else 0.2}
            for i, c in enumerate(parsed["subcategories"])
        ]

    if not isinstance(raw_ranked, list):
        return []

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in raw_ranked:
        if not isinstance(entry, dict):
            continue
        cid = entry.get("id") or entry.get("code")
        if not isinstance(cid, str):
            continue
        cid = cid.strip()
        if cid not in valid_codes or cid in seen:
            continue
        try:
            score = float(entry.get("score", 0))
        except (TypeError, ValueError):
            continue
        score = max(0.0, min(1.0, score))
        # Drop zero-score entries: an empty / all-zero ranking should produce
        # no isPrimary record so targets that don't fit any subcategory stay
        # honestly unmapped (rather than getting an arbitrary first entry).
        if score <= 0:
            continue
        reasoning = entry.get("reasoning", "")
        if not isinstance(reasoning, str):
            reasoning = ""
        out.append({
            "id": cid,
            "score": score,
            "reasoning": reasoning.strip()[:200],
        })
        seen.add(cid)

    out.sort(key=lambda x: -x["score"])
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def classify_globe_subcategories(
    targets: list[dict[str, Any]],
    subcategories: list[dict[str, Any]],
    primary_categories: list[dict[str, Any]],
    few_shot_examples: list[dict[str, Any]],
    *,
    cache_suffix: str = "",
) -> list[dict[str, Any]]:
    """
    Classify each target against the GLOBE subcategory taxonomy with ranked output.

    Returns one record per (target, subcategory) for ALL subcategories. Records have:
      - score: float 0.0-1.0 (0.0 for subcategories the LLM omitted)
      - isPrimary: True for the highest-ranked subcategory per target
      - isRelevant: score >= RELEVANCE_THRESHOLD
      - reasoning: present on primary and relevant entries
    """
    logger.info(
        f"GLOBE subcategory ranking: {len(targets)} targets x "
        f"{len(subcategories)} subcategories ({len(targets)} LLM calls)"
    )

    system_prompt = build_system_prompt(
        subcategories, primary_categories, few_shot_examples
    )
    valid_codes = {s["id"] for s in subcategories}

    calls: list[dict[str, Any]] = []
    target_ids: list[str] = []

    for target in targets:
        user = build_user_message(target["text"])
        calls.append({
            "system": system_prompt,
            "user": user,
            "temperature": 0.0,
            "max_tokens": 600,
        })
        target_ids.append(target["id"])

    namespace = f"rank_globe_sub{('_' + cache_suffix) if cache_suffix else ''}"
    raw_results = await call_llm_batch(
        calls,
        cache_namespace=namespace,
        desc=f"GLOBE subcategory ranking ({cache_suffix or 'default'})",
    )

    classifications: list[dict[str, Any]] = []
    primary_count = 0
    relevant_count = 0
    for target_id, raw in zip(target_ids, raw_results):
        ranked = parse_response(raw, valid_codes)
        score_by_id = {r["id"]: r for r in ranked}
        primary_id = ranked[0]["id"] if ranked else None
        if primary_id:
            primary_count += 1

        for sub in subcategories:
            entry = score_by_id.get(sub["id"])
            score = entry["score"] if entry else 0.0
            reasoning = entry["reasoning"] if entry else ""
            is_primary = sub["id"] == primary_id
            is_relevant = score >= RELEVANCE_THRESHOLD
            if is_relevant:
                relevant_count += 1
            record: dict[str, Any] = {
                "targetId": target_id,
                "categoryId": sub["id"],
                "taxonomyType": "globe_sub",
                "isRelevant": is_relevant,
                "isPrimary": is_primary,
                "score": round(score, 3),
            }
            if reasoning and (is_primary or is_relevant):
                record["reasoning"] = reasoning
            classifications.append(record)

    logger.info(
        f"  GLOBE subcategory ranking done: "
        f"{primary_count}/{len(targets)} got a primary, "
        f"{relevant_count} relevant entries (score >= {RELEVANCE_THRESHOLD})"
    )

    return classifications


def derive_globe_top_level_classifications(
    sub_classifications: list[dict[str, Any]],
    subcategories: list[dict[str, Any]],
    primary_categories: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Roll up subcategory classifications to the top-level GLOBE taxonomy
    (taxonomyType="globe"). Each target's primary parent = parent of its
    primary subcategory. Score per (target, parent) = max score of any
    matched child subcategory.
    """
    parent_by_sub = {s["id"]: s["parentId"] for s in subcategories}
    parent_ids = [c["id"] for c in primary_categories]

    # Group sub records by target
    by_target: dict[str, list[dict[str, Any]]] = {}
    for c in sub_classifications:
        if c["taxonomyType"] != "globe_sub":
            continue
        by_target.setdefault(c["targetId"], []).append(c)

    out: list[dict[str, Any]] = []
    primary_count = 0
    relevant_count = 0
    for target_id, recs in by_target.items():
        # Best score per parent (highest-scoring child). Only consider
        # subcategories with non-zero score so a target with no relevant
        # subcategories doesn't get an arbitrary parent assigned.
        best_per_parent: dict[str, dict[str, Any]] = {}
        for r in recs:
            parent = parent_by_sub.get(r["categoryId"])
            if not parent:
                continue
            score = r.get("score", 0)
            if score <= 0:
                continue
            current = best_per_parent.get(parent)
            if current is None or score > current["score"]:
                best_per_parent[parent] = {
                    "score": score,
                    "reasoning": r.get("reasoning", ""),
                }

        # Primary parent: parent of the primary subcategory (which exists
        # only if the LLM ranked at least one subcategory). Fall back to
        # parent with highest max-score among non-zero subcategories.
        primary_parent = None
        for r in recs:
            if r.get("isPrimary"):
                primary_parent = parent_by_sub.get(r["categoryId"])
                break
        if primary_parent is None and best_per_parent:
            primary_parent = max(best_per_parent.items(), key=lambda kv: kv[1]["score"])[0]

        if primary_parent:
            primary_count += 1

        for pid in parent_ids:
            entry = best_per_parent.get(pid)
            score = entry["score"] if entry else 0.0
            reasoning = entry["reasoning"] if entry else ""
            is_primary = pid == primary_parent
            is_relevant = score >= RELEVANCE_THRESHOLD
            if is_relevant:
                relevant_count += 1
            record: dict[str, Any] = {
                "targetId": target_id,
                "categoryId": pid,
                "taxonomyType": "globe",
                "isRelevant": is_relevant,
                "isPrimary": is_primary,
                "score": round(score, 3),
            }
            if reasoning and (is_primary or is_relevant):
                record["reasoning"] = reasoning
            out.append(record)

    logger.info(
        f"  Derived top-level GLOBE from subcategory: "
        f"{primary_count} primaries, {relevant_count} relevant"
    )
    return out


def load_few_shot_examples(path: str) -> list[dict[str, Any]]:
    """Load expert examples from the mongolia-ber-globe-examples.json file."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("records", [])
