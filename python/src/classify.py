"""
Step 1: Thematic Classification.

Two flavours of classifier:

- ``run_classification`` (legacy): one binary 0/1 LLM call per (target, category)
  pair. Multi-label by construction. Kept for back-compat where callers explicitly
  want the old behaviour, and as the schema baseline.
- ``rank_classification`` (preferred): one LLM call per target returns a
  probability-ranked list of categories with scores. Top-ranked entry is the
  ``isPrimary`` classification (single-label per target per taxonomy);
  ``isRelevant`` is derived from ``score >= RELEVANCE_THRESHOLD``. Multi-label
  data is preserved as records with ``isRelevant=true, isPrimary=false``.

The ranked classifier exists so visualizations can show consistent counts
across views: each target contributes to exactly one category's primary
count, and per-category target totals sum to the total target count.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from .llm import call_llm_batch

logger = logging.getLogger(__name__)

# Score >= this is considered "relevant" for backwards-compatible isRelevant flag.
RELEVANCE_THRESHOLD = 0.5

# ---------------------------------------------------------------------------
# Prompts — exact replicas from old_scripts cell 41 + cell 40 + cell 47
# ---------------------------------------------------------------------------


def build_system_prompt(all_category_names: list[str]) -> str:
    """
    Build the system prompt exactly as the original notebook (cell 41).

    The original interpolates {all_themes} which is a semicolon-separated
    list of all theme/category names.
    """
    all_themes = "; ".join(all_category_names)
    return f"""
# CONTEXT #
I work with international policy and need to identify whether cross-reference theme texts \
are covered in target texts.

# PERSONA #
You are a policy specialist focused on the subject-matters of Biodiversity/Nature, Climate, \
Land Degradation, {all_themes}.

# TASK #
Your task is to assess whether a target text is connected to a cross-reference theme text, \
by following these steps:
**Step 1** - Identify the essential overarching topic and purpose of the cross-reference theme text;
**Step 2** - Identify the sub-topic and subject of the cross-reference theme text;
**Step 3** - Relying on your subject-matter expert knowledge and keeping in mind that a specific \
purpose relating to different subjects (e.g., ecosystem impacted or considered) relate to \
different themes, assess whether the target text covers the cross-reference theme text.

# STYLE #
Write in the style of a United Nations (UN) official document.

# RESPONSE #
**Option 1**: If the target text does **not** cover the essential overarching topic and purpose \
of the cross-reference theme text and its sub-topic or subject, return `0`;
**Option 2**: If the target text does cover the essential overarching topic and purpose of the \
cross-reference theme text and its sub-topics or subject, return `1`.

Take each step one at a time, but **do not return Steps 1 and 3**; rather, \
return **only your final response**.
"""


def build_user_message(theme_text: str, target_text: str) -> str:
    """
    Build the user message exactly as the original notebook (cell 47 + cell 40).

    The original concatenates:
      "Here are the cross-reference theme texts:\n{theme_text}'\n"
      "Here is the target texts:\n{target_text}'\n"
      "{prompt}"

    Where `prompt` (cell 40) = "Assess whether or not the target texts
    cover the topics of the cross-reference theme texts."
    """
    return (
        f"Here are the cross-reference theme texts:\n"
        f"{theme_text}'\n"
        f"Here is the target texts:\n"
        f"{target_text}'\n"
        f"\nAssess whether or not the target texts cover the topics of the cross-reference theme texts.\n"
    )


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def parse_classification(raw: str) -> bool:
    """Parse a 0/1 response from the LLM."""
    cleaned = raw.strip().strip('"').strip("'").strip(".")
    if cleaned.startswith("1"):
        return True
    if cleaned.startswith("0"):
        return False
    # Fallback: look for yes/no keywords
    lower = cleaned.lower()
    if "yes" in lower or "pertains" in lower:
        return True
    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def run_classification(
    targets: list[dict[str, Any]],
    categories: list[dict[str, Any]],
    taxonomy_type: str,
) -> list[dict[str, Any]]:
    """
    Classify every target against every category.

    Returns a list of dicts:
      { targetId, categoryId, taxonomyType, isRelevant }
    """
    logger.info(
        f"Classifying {len(targets)} targets × {len(categories)} {taxonomy_type} categories "
        f"= {len(targets) * len(categories)} calls"
    )

    # Build system prompt with all category names (matches original all_themes)
    all_names = [cat["name"] for cat in categories]
    system_prompt = build_system_prompt(all_names)

    # Build all LLM call specs
    calls: list[dict[str, Any]] = []
    call_keys: list[tuple[str, str]] = []  # (target_id, category_id) for each call

    for target in targets:
        for cat in categories:
            # Original notebook (cell 34): theme_text = theme_name + " " + theme_description
            theme_text = cat["name"] + " " + cat["description"]
            user = build_user_message(theme_text, target["text"])
            calls.append({
                "system": system_prompt,
                "user": user,
                "top_p": 0.3,         # original: top_p = 0.3
                "max_tokens": 500,    # original: max_tokens = 500
            })
            call_keys.append((target["id"], cat["id"]))

    # Run all calls concurrently
    results = await call_llm_batch(
        calls,
        cache_namespace=f"classify_{taxonomy_type}",
        desc=f"Classification ({taxonomy_type})",
    )

    # Parse results
    classifications = []
    for (target_id, category_id), raw in zip(call_keys, results):
        is_relevant = parse_classification(raw)
        classifications.append({
            "targetId": target_id,
            "categoryId": category_id,
            "taxonomyType": taxonomy_type,
            "isRelevant": is_relevant,
        })

    relevant_count = sum(1 for c in classifications if c["isRelevant"])
    logger.info(
        f"  {taxonomy_type} classification done: "
        f"{relevant_count} relevant out of {len(classifications)} total"
    )

    return classifications


# ---------------------------------------------------------------------------
# Ranked classifier (preferred)
# ---------------------------------------------------------------------------


def build_rank_system_prompt(taxonomy_type: str) -> str:
    """System prompt for the ranked classifier."""
    return f"""You are a policy classifier. Your job is to assess how strongly a policy target relates to each category in a {taxonomy_type} taxonomy.

# TASK
Given a target and a list of N categories, score every category for its relevance to the target on a 0.0-1.0 scale, where:
- 1.0 = the target is primarily and explicitly about this category
- 0.7-0.9 = clearly relevant; this category is a major theme of the target
- 0.4-0.6 = partially relevant; the target touches this category as one of several themes
- 0.1-0.3 = tangentially relevant; weak or indirect connection
- 0.0 = no relevance

The ranking must reflect probability of relevance: higher score means higher confidence that the target genuinely belongs to that category. Return ALL categories you consider at all relevant (score > 0.0). Categories you assess as score 0.0 may be omitted.

# RESPONSE FORMAT
Return ONLY a JSON object, no markdown:
{{
  "ranked": [
    {{"id": "<categoryId>", "score": <0.0-1.0>, "reasoning": "<one short sentence>"}},
    {{"id": "<categoryId>", "score": <0.0-1.0>, "reasoning": "<one short sentence>"}}
  ]
}}

Order the array from highest score to lowest. The top entry will be treated as the primary classification."""


def build_rank_user_message(
    target_text: str, categories: list[dict[str, Any]]
) -> str:
    """User message: target + full category catalog.

    Descriptions are sent in full so the verbatim sourcing established in
    `categories.json` actually reaches the rank LLM. The previous 300-char
    cap silently chopped most of the new IPCC / GLOBE descriptions (some
    over 4,000 chars), which defeated the audit. Total catalog stays well
    under typical context windows (largest taxonomy ≈ 17 k chars).
    """
    catalog_lines = []
    for cat in categories:
        desc = cat.get("description", "")
        catalog_lines.append(f"- {cat['id']}: {cat['name']} -- {desc}")
    catalog = "\n".join(catalog_lines)
    return (
        f"Target:\n{target_text}\n\n"
        f"Categories:\n{catalog}\n\n"
        f"Score every category that has any relevance and return JSON."
    )


def parse_rank_response(
    raw: str, valid_ids: set[str]
) -> list[dict[str, Any]]:
    """Parse the ranked-output JSON. Returns list of {id, score, reasoning}."""
    cleaned = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()

    obj_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not obj_match:
        logger.warning(f"No JSON object in rank response: {raw[:200]}")
        return []

    try:
        parsed = json.loads(obj_match.group(0))
    except json.JSONDecodeError as e:
        logger.warning(f"Rank JSON parse failed: {e}. Raw: {raw[:200]}")
        return []

    raw_ranked = parsed.get("ranked", [])
    if not isinstance(raw_ranked, list):
        return []

    ranked: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for entry in raw_ranked:
        if not isinstance(entry, dict):
            continue
        cid = entry.get("id")
        if not isinstance(cid, str) or cid not in valid_ids or cid in seen_ids:
            continue
        try:
            score = float(entry.get("score", 0))
        except (TypeError, ValueError):
            continue
        score = max(0.0, min(1.0, score))
        # Drop zero-score entries so a target with no relevant categories
        # produces no isPrimary record (the prompt asks the LLM to omit
        # zero-score entries, but some models include them anyway).
        if score <= 0:
            continue
        reasoning = entry.get("reasoning", "")
        if not isinstance(reasoning, str):
            reasoning = ""
        ranked.append(
            {"id": cid, "score": score, "reasoning": reasoning.strip()[:200]}
        )
        seen_ids.add(cid)

    # Defensive sort: highest score first (LLM should already do this, but
    # we don't trust output ordering for primary selection).
    ranked.sort(key=lambda x: -x["score"])
    return ranked


async def rank_classification(
    targets: list[dict[str, Any]],
    categories: list[dict[str, Any]],
    taxonomy_type: str,
) -> list[dict[str, Any]]:
    """
    Score every (target, category) pair via a single ranked LLM call per target.

    Returns one record per (target, category) for ALL categories (whether the
    LLM scored them or not). Records have:
      - score: float 0.0-1.0 (0.0 for categories the LLM omitted)
      - isPrimary: True for the single highest-scoring category per target
      - isRelevant: score >= RELEVANCE_THRESHOLD

    If the LLM returns no rankings (parse failure or empty list), no record is
    marked isPrimary and all are isRelevant=False.
    """
    logger.info(
        f"Ranking {len(targets)} targets against {len(categories)} {taxonomy_type} categories "
        f"({len(targets)} LLM calls, returning {len(targets) * len(categories)} records)"
    )

    system_prompt = build_rank_system_prompt(taxonomy_type)
    valid_ids = {c["id"] for c in categories}

    calls: list[dict[str, Any]] = []
    target_ids: list[str] = []
    for target in targets:
        user = build_rank_user_message(target["text"], categories)
        calls.append({
            "system": system_prompt,
            "user": user,
            "temperature": 0.0,
            "max_tokens": 800,
        })
        target_ids.append(target["id"])

    raw_results = await call_llm_batch(
        calls,
        cache_namespace=f"rank_{taxonomy_type}",
        desc=f"Ranked classification ({taxonomy_type})",
    )

    classifications: list[dict[str, Any]] = []
    primary_count = 0
    relevant_count = 0
    for target_id, raw in zip(target_ids, raw_results):
        ranked = parse_rank_response(raw, valid_ids)
        score_by_id = {r["id"]: r for r in ranked}
        primary_id = ranked[0]["id"] if ranked else None
        if primary_id:
            primary_count += 1

        for cat in categories:
            entry = score_by_id.get(cat["id"])
            score = entry["score"] if entry else 0.0
            reasoning = entry["reasoning"] if entry else ""
            is_primary = cat["id"] == primary_id
            is_relevant = score >= RELEVANCE_THRESHOLD
            if is_relevant:
                relevant_count += 1
            record: dict[str, Any] = {
                "targetId": target_id,
                "categoryId": cat["id"],
                "taxonomyType": taxonomy_type,
                "isRelevant": is_relevant,
                "isPrimary": is_primary,
                "score": round(score, 3),
            }
            if reasoning and (is_primary or is_relevant):
                record["reasoning"] = reasoning
            classifications.append(record)

    logger.info(
        f"  {taxonomy_type} ranking done: "
        f"{primary_count}/{len(targets)} got a primary, "
        f"{relevant_count} relevant entries (score >= {RELEVANCE_THRESHOLD})"
    )

    return classifications
