"""
Step 1: Thematic Classification.

For each target × category pair, asks the LLM: does this target pertain to
this category? Binary 1/0.

Prompts replicated exactly from the original pipeline
(JP_Nature_Climate_themes_UNDP_GPT4o-min_v5_14Mar25.ipynb).
"""

from __future__ import annotations

import logging
from typing import Any

from .llm import call_llm_batch

logger = logging.getLogger(__name__)

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
