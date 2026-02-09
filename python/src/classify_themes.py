"""
Thematic Classification Pipeline.

For each target, independently assess whether it pertains to each NBS category
and cross-cutting theme. Produces a binary (Yes/No) classification for every
target × category combination.

This is a placeholder for the actual LLM pipeline. Replace the `classify`
function body with real API calls to OpenRouter / Azure OpenAI.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ThematicResult:
    target_id: str
    category_id: str
    taxonomy_type: str  # "nbs" or "theme"
    is_relevant: bool


SYSTEM_PROMPT = """You are a policy specialist with expertise in biodiversity, 
nature, climate, land degradation, and related cross-cutting themes.

Given a policy target and a thematic category with its description, determine 
whether the target can be categorized under the specified theme.

Respond with ONLY "1" (yes) or "0" (no)."""


def build_user_prompt(target_text: str, category_name: str, category_description: str) -> str:
    return f"""Policy Target:
{target_text}

Thematic Category: {category_name}
Description: {category_description}

Does this target pertain to this category? Respond with 1 (yes) or 0 (no)."""


def classify(
    target_id: str,
    target_text: str,
    category_id: str,
    category_name: str,
    category_description: str,
    taxonomy_type: str,
) -> ThematicResult:
    """
    Classify a single target against a single category.

    TODO: Replace with actual LLM API call.
    """
    # Placeholder — returns False for everything
    # In production, call OpenRouter/Azure OpenAI here
    return ThematicResult(
        target_id=target_id,
        category_id=category_id,
        taxonomy_type=taxonomy_type,
        is_relevant=False,
    )


if __name__ == "__main__":
    # Example usage
    result = classify(
        target_id="NAP_1",
        target_text="Enhance policies, legal structures, and organizational capacities to support climate change adaptation across all sectors",
        category_id="theme_adaptation",
        category_name="Climate change adaptation",
        category_description="Actions that help reduce vulnerability to the current or expected impacts of climate change...",
        taxonomy_type="theme",
    )
    print(result)

