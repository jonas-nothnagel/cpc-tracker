"""
Steps 2–4: Target Decomposition + Pairwise Alignment.

Two-agent workflow from the original pipeline
(Target_to_Target_4_Level_UNDP_OpenAI_GPT4o-mini.ipynb):

  Agent 1 (Target Analyst): decomposes each target into 5 structured fields.
  Agent 2 (Alignment Advisor): compares pairs and classifies alignment level.

Pairs are only formed between targets from different document types
that share at least one theme (from Step 1 classification results).
"""

from __future__ import annotations

import json
import logging
import re
from itertools import combinations
from typing import Any

from .llm import call_llm, call_llm_batch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Agent 1: Target Analyst prompts (from old scripts)
# ---------------------------------------------------------------------------

ANALYST_SYSTEM = "You are an expert in policy analysis and climate strategy."

ANALYST_USER_TEMPLATE = """    Role: Target Analyst
    Goal: Analyze provided targets and produce a structured breakdown of key elements to facilitate alignment assessment.
    Backstory: An expert in policy analysis, climate strategy, and biodiversity management, specializing in breaking down \
complex targets into structured components. \
This ensures clarity in goal-setting, execution, and potential synergies with other targets, particularly in the fields \
of Climate and Nature/Biodiversity.

    Task:
    1. Analyze the target: "{target_text}".
    2. Identify **Goal/Purpose** – objective or intended impact of the target.
    3. Identify **Action/Intervention** – specific measures or actions that need to be taken to achieve the target.
    4. Identify **Ecosystem/Area** – the sector, environment, or domain to which the target applies.
    5. Identify **Target Audience** – the primary group(s) or stakeholders responsible for implementation or who will benefit \
from the target.
    6. Identify **Expected Impact/Outcome** – measurable or anticipated results.
    7. Do not speculate or infer information that is not explicitly provided in the target. Remain factual and avoid assumptions.

    Output the result in the following dictionary format and nothing else:
    "Goal/Purpose": "<Extracted goal>",
    "Action/Intervention": "<Specific measures/actions>",
    "Ecosystem/Area": "<Relevant sector, environment, or domain>",
    "Target Audience": "<Primary stakeholders or beneficiaries>",
    "Expected Impact/Outcome": "<Measurable results or anticipated changes>"
    """

# ---------------------------------------------------------------------------
# Agent 2: Alignment Advisor prompts (from old scripts)
# ---------------------------------------------------------------------------

ADVISOR_SYSTEM = "You are a Target Alignment Advisor, ensuring factual, graded alignment assessments."

ADVISOR_USER_TEMPLATE = """    Role: Alignment Advisor
    Goal: Compare two structured targets from different policies and assign an alignment level from four clearly defined categories.

    Backstory: You specialize in evaluating alignment potential between policy targets. Your assessments are based on \
real-world feasibility, operational synergy, and strategic overlap. You never assume alignment based on superficial wording alone.

    Task:
    1. Analyze the following two targets:
       - {target_1_type} target: {target_1_text}
         Structured analysis: {target_1_decomp}
       - {target_2_type} target: {target_2_text}
         Structured analysis: {target_2_decomp}
    2. Compare the goal, action, ecosystem, target audience, and expected impact of both targets to assess their relationship.
    3. Consider hierarchical relationships between ecosystems. Recognize that specific ecosystems (e.g., mangroves, coral reefs) \
may fall under broader categories such as coastal-marine ecosystems.
    4. Determine whether aligning these targets would optimize resources, avoid duplication, or create synergies that enhance \
efficiency. Consider enabling relationships when one target creates the conditions for the other to succeed.
    5. Ensure that alignment would lead to tangible, measurable outcomes and not just theoretical synergy. Avoid aligning \
targets that operate at different levels (e.g., policy vs. on-the-ground implementation) without some operational overlap.
    6. Focus on real-world feasibility — do not propose alignment based solely on similar wording or superficial themes.
    7. Do not focus only on action verbs; consider the broader context and strategic intent.

    Classify the alignment into one of four distinct levels below. Always use the exact label and format:

    **1.** "No alignment" – The targets have no shared goals, actions, ecosystems, or actors. Aligning them would not make sense in a \
real-world implementation or policy context, and could even be counterproductive.
        Return: No alignment - [Concise 2-sentence explanation.]

    Example:

      Target 1: Reduce GHG emissions in the transportation sector by 40% by 2030.
      Target 2: Establish 15 urban pollinator gardens to support bee populations.
      Output:
      No alignment - These targets operate in completely different domains, with no shared geography, actors, \
or implementation pathways. Aligning them would not yield any mutual benefit or policy efficiency.

    **2.** "Low alignment" – The targets share superficial similarities—such as common terminology or a broad thematic area—but \
differ significantly in intent, scale, timeline, or geographic scope. Any synergy is weak, \
unclear, or impractical for coordinated implementation.
       Return: Low alignment - [Concise 2-sentence explanation of the minor thematic overlap and why it does not allow for real-world alignment.]

    Example:
      Target 1: Promote nature-based solutions to sequester carbon through wetland restoration.
      Target 2: Protect migratory bird corridors in high-altitude forest zones.

      Output:
      Low alignment - Both mention natural ecosystems, but they focus on different geographies, species, and purposes. \
The thematic overlap is too broad for practical coordination.

    **3.** "Medium alignment" – The targets share clear thematic or geographic overlap and reflect compatible priorities. \
They could support each other through shared enabling conditions or parallel efforts, though they are not mutually dependent.
       Return: Medium alignment - [Concise 2-sentence explanation of how the targets complement each other and could align with modest coordination.]

    Example:
      Target 1: Increase national forest cover by 10% by 2035 to enhance carbon sinks.
      Target 2: Implement afforestation and soil restoration programs in degraded upland regions.

      Output:
      Medium alignment - The targets share goals around reforestation and ecosystem recovery, and could align through joint \
planning or funding. However, they remain independently implementable and serve somewhat distinct primary goals.

    **4.** "High alignment" – The targets are strongly aligned across goals, actions, ecosystems, and actors. Coordinated \
implementation would significantly enhance outcomes, efficiency, or scale; the targets directly support or amplify each other.
       Return: High alignment - [Concise 2-sentence explanation of how the targets reinforce each other and why joint implementation would be beneficial.]

    Example:
      Target 1: Restore 20,000 hectares of mangroves by 2030 for biodiversity and coastal protection.
      Target 2: Enhance climate resilience by restoring coastal blue carbon ecosystems, including mangroves, by 2030.

      Output:
      High alignment - Both targets focus on the same ecosystem (mangroves), within the same timeframe, and involve similar actions and actors. \
Coordinated implementation would clearly enhance efficiency and maximize both climate and biodiversity outcomes.
      - Your output should be in English.
    """


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

ALIGNMENT_MAP = {
    "no alignment": "none",
    "low alignment": "low",
    "medium alignment": "medium",
    "high alignment": "high",
}

DOC_TYPE_LABELS = {
    "NDC": "NDC",
    "NBSAP": "NBT",
    "NAP": "NAP",
    "LDN": "LDN",
}


def parse_decomposition(raw: str) -> dict[str, str]:
    """Parse the structured decomposition from Agent 1.

    The original output format is a Python-style dictionary with keys like
    "Goal/Purpose", "Action/Intervention", etc.  We try JSON first (the model
    often wraps it in braces), then fall back to regex extraction.
    """
    # Try JSON parse first (model may wrap output in braces)
    try:
        # Strip markdown code fences if present
        cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`")
        # Ensure it looks like a JSON object
        if not cleaned.startswith("{"):
            cleaned = "{" + cleaned + "}"
        data = json.loads(cleaned)
        return {
            "Goal/Purpose": data.get("Goal/Purpose", data.get("goal_purpose", "")),
            "Action/Intervention": data.get("Action/Intervention", data.get("action_intervention", "")),
            "Ecosystem/Area": data.get("Ecosystem/Area", data.get("ecosystem_area", "")),
            "Target Audience": data.get("Target Audience", data.get("target_audience", "")),
            "Expected Impact/Outcome": data.get("Expected Impact/Outcome", data.get("expected_impact", "")),
        }
    except (json.JSONDecodeError, AttributeError):
        pass

    # Fallback: use raw text as-is (the original script passed the raw string
    # directly to Agent 2, so this is faithful)
    logger.warning("Failed to parse decomposition as JSON, using raw text")
    return {
        "Goal/Purpose": raw,
        "Action/Intervention": "",
        "Ecosystem/Area": "",
        "Target Audience": "",
        "Expected Impact/Outcome": "",
    }


def parse_alignment(raw: str) -> tuple[str, str]:
    """Parse alignment level and explanation from Agent 2.

    The original output format is: "Label - explanation"
    e.g. "Medium alignment - The targets share goals around..."
    """
    raw_stripped = raw.strip()

    # Primary: "Label - explanation" text format (original format)
    for label_text, level_code in ALIGNMENT_MAP.items():
        if label_text in raw_stripped.lower():
            # Try to extract explanation after the label
            parts = raw_stripped.split("-", 1)
            explanation = parts[1].strip() if len(parts) > 1 else ""
            return level_code, explanation

    # Fallback: JSON format (in case model returns JSON anyway)
    try:
        cleaned = re.sub(r"```(?:json)?\s*", "", raw_stripped).strip().rstrip("`")
        data = json.loads(cleaned)
        label = data.get("alignment", "No alignment").strip().lower()
        explanation = data.get("explanation", "")
        level = ALIGNMENT_MAP.get(label, "none")
        return level, explanation
    except (json.JSONDecodeError, AttributeError):
        pass

    logger.warning(f"Could not parse alignment from: {raw_stripped[:100]}")
    return "none", ""


# ---------------------------------------------------------------------------
# Step 2: Generate theme-filtered pairs
# ---------------------------------------------------------------------------


def generate_pairs(
    targets: list[dict[str, Any]],
    classifications: list[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """
    Generate cross-document target pairs matching the original methodology.

    Original approach (old_scripts cell 18 + 22-25):
    1. Input data has one row per (target, theme) where target is relevant
    2. Group by document type
    3. Cartesian product across document types
    4. Filter: Target 1 Theme == Target 2 Theme (same theme)

    This means the same target pair can appear multiple times if they share
    multiple themes, but each assessment is for a specific shared theme.

    For our pipeline we deduplicate to unique pairs (since the alignment prompt
    doesn't include theme context, assessing the same pair twice would be
    redundant). But the FILTERING is per-theme: a pair is included only if
    both targets share at least one theme.
    """
    target_map = {t["id"]: t for t in targets}

    # Build per-theme target lists (only relevant classifications)
    from collections import defaultdict
    theme_targets: dict[str, set[str]] = defaultdict(set)
    for c in classifications:
        if c["isRelevant"]:
            theme_targets[c["categoryId"]].add(c["targetId"])

    # Group targets by document type
    by_doc: dict[str, list[dict[str, Any]]] = {}
    for t in targets:
        doc = t["sourceDocument"]
        if doc not in by_doc:
            by_doc[doc] = []
        by_doc[doc].append(t)

    # Generate per-theme cross-document pairs, then deduplicate
    # (Original creates per-theme pairs in cell 25; we dedup because the
    # alignment prompt is theme-agnostic so duplicates would give same result)
    pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    seen: set[tuple[str, str]] = set()
    per_theme_count = 0

    for theme_id, theme_target_ids in sorted(theme_targets.items()):
        for doc_a, doc_b in combinations(sorted(by_doc.keys()), 2):
            targets_a = [t for t in by_doc[doc_a] if t["id"] in theme_target_ids]
            targets_b = [t for t in by_doc[doc_b] if t["id"] in theme_target_ids]
            for ta in targets_a:
                for tb in targets_b:
                    per_theme_count += 1
                    pair_key = tuple(sorted([ta["id"], tb["id"]]))
                    if pair_key not in seen:
                        seen.add(pair_key)
                        pairs.append((ta, tb))

    logger.info(
        f"Generated {per_theme_count} per-theme pairs "
        f"({len(pairs)} unique) from {len(by_doc)} document types, "
        f"{len(theme_targets)} themes"
    )
    return pairs


# ---------------------------------------------------------------------------
# Step 3: Decompose targets
# ---------------------------------------------------------------------------


async def decompose_targets(
    targets: list[dict[str, Any]],
) -> dict[str, str]:
    """
    Run Agent 1 (Target Analyst) on each target.

    Returns a dict mapping target_id -> raw decomposition string.

    The original pipeline (cell 30: get_target_analysis) stores the raw LLM
    output and passes it directly to Agent 2.  We do the same for fidelity.
    """
    logger.info(f"Decomposing {len(targets)} targets (Agent 1: Target Analyst)")

    calls = []
    target_ids = []
    for t in targets:
        user = ANALYST_USER_TEMPLATE.format(target_text=t["text"])
        calls.append({"system": ANALYST_SYSTEM, "user": user})
        target_ids.append(t["id"])

    results = await call_llm_batch(
        calls,
        cache_namespace="decompose",
        desc="Decomposition",
    )

    decompositions: dict[str, str] = {}
    for tid, raw in zip(target_ids, results):
        decompositions[tid] = raw  # store raw output, matching original

    logger.info(f"  Decomposed {len(decompositions)} targets")
    return decompositions


# ---------------------------------------------------------------------------
# Step 4: Assess alignment for each pair
# ---------------------------------------------------------------------------


async def assess_alignment(
    pairs: list[tuple[dict[str, Any], dict[str, Any]]],
    decompositions: dict[str, str],
) -> list[dict[str, Any]]:
    """
    Run Agent 2 (Alignment Advisor) on each pair.
    Returns list of alignment results.

    The original (cell 39) passes the raw Agent 1 output string directly:
        alignment_advisor(target_1_type, target_1_analyzed, target_2_type, target_2_analyzed)
    """
    logger.info(f"Assessing alignment for {len(pairs)} pairs (Agent 2: Alignment Advisor)")

    calls = []
    pair_keys: list[tuple[str, str]] = []

    for ta, tb in pairs:
        # Pass raw decomposition strings, exactly as the original
        decomp_a = decompositions.get(ta["id"], "")
        decomp_b = decompositions.get(tb["id"], "")

        user = ADVISOR_USER_TEMPLATE.format(
            target_1_type=DOC_TYPE_LABELS.get(ta["sourceDocument"], ta["sourceDocument"]),
            target_1_text=ta["text"],
            target_1_decomp=decomp_a,
            target_2_type=DOC_TYPE_LABELS.get(tb["sourceDocument"], tb["sourceDocument"]),
            target_2_text=tb["text"],
            target_2_decomp=decomp_b,
        )
        calls.append({"system": ADVISOR_SYSTEM, "user": user})
        pair_keys.append((ta["id"], tb["id"]))

    results = await call_llm_batch(
        calls,
        cache_namespace="alignment",
        desc="Alignment",
    )

    alignment_results = []
    level_counts: dict[str, int] = {"none": 0, "low": 0, "medium": 0, "high": 0}

    for (aid, bid), raw in zip(pair_keys, results):
        level, explanation = parse_alignment(raw)
        level_counts[level] = level_counts.get(level, 0) + 1
        alignment_results.append({
            "targetAId": aid,
            "targetBId": bid,
            "alignment": level,
            "description": explanation,
        })

    logger.info(
        f"  Alignment done: {level_counts}"
    )
    return alignment_results
