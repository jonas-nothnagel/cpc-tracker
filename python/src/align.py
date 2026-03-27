"""
Steps 2–4: Target Decomposition + Pairwise Alignment.

Two-agent workflow from the original pipeline
(Target_to_Target_4_Level_UNDP_OpenAI_GPT4o-mini.ipynb):

  Agent 1 (Target Analyst): decomposes each target into 5 structured fields.
  Agent 2 (Alignment Advisor): compares pairs and classifies alignment level.

All cross-document pairs are assessed — classification is used for
visualization grouping only, not as a pairing filter.
"""

from __future__ import annotations

import json
import logging
import re
from itertools import combinations
from typing import Any

from collections import defaultdict

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
{activities_block}{actions_block}\
    2. Identify **Goal/Purpose** – objective or intended impact of the target.
    3. Identify **Action/Intervention** – specific measures or actions that need to be taken to achieve the target. \
{action_instruction}
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

ADVISOR_SYSTEM = "You are a Target Alignment Advisor, ensuring factual, graded alignment assessments. Most policy target pairs within climate-nature frameworks share some degree of alignment."

ADVISOR_USER_TEMPLATE = """    Role: Alignment Advisor
    Goal: Compare two structured targets from different policies and assign an alignment level from seven clearly defined categories.

    Backstory: You specialize in evaluating alignment potential between policy targets. Your assessments are based on \
real-world feasibility, operational synergy, and strategic overlap. You never assume alignment based on superficial wording alone. \
You also identify genuine contradictions when targets truly work against each other, but you recognize that most targets within \
national climate-nature policy frameworks (NAP, NDC, NBSAP, LDN) share some degree of alignment since they are all working \
toward environmental and climate goals.

    IMPORTANT: High and moderate contradictions should be reserved for cases where implementing one target genuinely \
undermines, opposes, or competes with the other. Two targets operating in different sectors or at different scales are NOT \
contradictory — they are simply unrelated (No alignment) or weakly aligned (Low alignment). However, DO identify "Low tension" \
when targets create real-world trade-offs even if both are positively framed. For example, a target to expand livestock \
production inherently creates tension with a target to reduce grazing pressure on rangelands, even if both targets mention \
"sustainability." Look for implicit resource competition, not just explicit opposition.

    Task:
    1. Analyze the following two targets (structured analysis from Target Analyst):
       - {target_1_type} target: {target_1_decomp}
       - {target_2_type} target: {target_2_decomp}
    2. Compare the goal, action, ecosystem, target audience, and expected impact of both targets to assess their relationship.
    2a. Pay particular attention to overlaps or conflicts in specific implementation activities and actions/measures, \
not only high-level goals.
    3. Consider hierarchical relationships between ecosystems. Recognize that specific ecosystems (e.g., mangroves, coral reefs) \
may fall under broader categories such as coastal-marine ecosystems.
    4. Determine whether aligning these targets would optimize resources, avoid duplication, or create synergies that enhance \
efficiency. Consider enabling relationships when one target creates the conditions for the other to succeed.
    5. Ensure that alignment would lead to tangible, measurable outcomes and not just theoretical synergy. Avoid aligning \
targets that operate at different levels (e.g., policy vs. on-the-ground implementation) without some operational overlap.
    6. Focus on real-world feasibility — do not propose alignment based solely on similar wording or superficial themes.
    7. Only flag contradictions when targets have genuinely opposing objectives, compete for the same specific resources, \
or when implementing one would actively undermine the other. Different approaches to environmental goals are NOT contradictions.

    Classify the relationship into one of the seven levels below. Always use the exact label and format:

    **1.** "No alignment" – The targets have no shared goals, actions, ecosystems, or actors. Aligning them would not make sense in a \
real-world implementation or policy context.
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
       Return: Low alignment - [Concise 2-sentence explanation.]

    Example:
      Target 1: Promote nature-based solutions to sequester carbon through wetland restoration.
      Target 2: Protect migratory bird corridors in high-altitude forest zones.

      Output:
      Low alignment - Both mention natural ecosystems, but they focus on different geographies, species, and purposes. \
The thematic overlap is too broad for practical coordination.

    **3.** "Medium alignment" – The targets share clear thematic or geographic overlap and reflect compatible priorities. \
They could support each other through shared enabling conditions or parallel efforts, though they are not mutually dependent.
       Return: Medium alignment - [Concise 2-sentence explanation.]

    Example:
      Target 1: Increase national forest cover by 10% by 2035 to enhance carbon sinks.
      Target 2: Implement afforestation and soil restoration programs in degraded upland regions.

      Output:
      Medium alignment - The targets share goals around reforestation and ecosystem recovery, and could align through joint \
planning or funding. However, they remain independently implementable and serve somewhat distinct primary goals.

    **4.** "High alignment" – The targets are strongly aligned across goals, actions, ecosystems, and actors. Coordinated \
implementation would significantly enhance outcomes, efficiency, or scale; the targets directly support or amplify each other.
       Return: High alignment - [Concise 2-sentence explanation.]

    Example:
      Target 1: Restore 20,000 hectares of mangroves by 2030 for biodiversity and coastal protection.
      Target 2: Enhance climate resilience by restoring coastal blue carbon ecosystems, including mangroves, by 2030.

      Output:
      High alignment - Both targets focus on the same ecosystem (mangroves), within the same timeframe, and involve similar actions and actors. \
Coordinated implementation would clearly enhance efficiency and maximize both climate and biodiversity outcomes.

    === CONTRADICTION LEVELS (use only when targets genuinely conflict) ===

    For contradiction levels, you MUST also specify the contradiction type in parentheses after the label. \
The four types are:
    - Goal conflict: Targets have directly opposing objectives (e.g., expand agriculture vs protect forests).
    - Resource competition: Targets compete for the same specific limited resources in ways that are mutually exclusive.
    - Implementation tension: Achieving one target actively undermines the feasibility of achieving the other.
    - Scale/scope mismatch: Targets set incompatible geographic scales, timelines, or intensity levels that cannot coexist.

    **5.** "Low tension" – There is minor friction or an implicit trade-off between the targets, but they are not \
fundamentally incompatible. The tension is manageable with coordination.
       Return: Low tension (Type) - [Concise 2-sentence explanation.]

    Example:
      Target 1: Rapidly expand irrigation infrastructure for crop production across arid regions.
      Target 2: Protect watershed ecosystems and maintain minimum environmental water flows.
      Output:
      Low tension (Resource competition) - Rapid irrigation expansion could reduce water availability that the watershed target aims to protect. \
However, the targets are not fundamentally incompatible and could coexist with careful water allocation planning.

    **6.** "Moderate contradiction" – There is a clear conflict in approach, resources, or expected outcomes, though \
partial coexistence may be possible with significant trade-offs.
       Return: Moderate contradiction (Type) - [Concise 2-sentence explanation.]

    Example:
      Target 1: Maximize livestock production by increasing the national herd to 80 million head by 2035.
      Target 2: Restore 30% of degraded rangelands by reducing grazing pressure in steppe ecosystems.
      Output:
      Moderate contradiction (Resource competition) - Both targets place competing demands on the same rangeland resources. \
Increasing herd size would intensify grazing pressure on the very ecosystems the second target aims to restore.

    **7.** "High contradiction" – The targets directly oppose each other in goals, actions, or expected outcomes. \
Implementing both would be counterproductive.
       Return: High contradiction (Type) - [Concise 2-sentence explanation.]

    Example:
      Target 1: Convert 500,000 hectares of forest land to commercial agriculture by 2030.
      Target 2: Increase national forest cover by 20% and halt all deforestation by 2030.
      Output:
      High contradiction (Goal conflict) - These targets have directly opposing objectives for the same land resource. \
Implementing commercial agricultural expansion on forest land fundamentally contradicts the goal of increasing forest cover and halting deforestation.

    Your output should be in English.
    """


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

ALIGNMENT_MAP = {
    "high contradiction": "high_contradiction",
    "moderate contradiction": "moderate_contradiction",
    "low tension": "low_tension",
    "no alignment": "none",
    "low alignment": "low",
    "medium alignment": "medium",
    "high alignment": "high",
}

CONTRADICTION_LEVELS = {"high_contradiction", "moderate_contradiction", "low_tension"}

CONTRADICTION_TYPE_MAP = {
    "goal conflict": "goal_conflict",
    "resource competition": "resource_competition",
    "implementation tension": "implementation_tension",
    "scale/scope mismatch": "scale_scope_mismatch",
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


def _extract_contradiction_type(text: str) -> str | None:
    """Extract contradiction type from parenthesized label, e.g. '(Goal conflict)'."""
    m = re.search(r"\(([^)]+)\)", text)
    if m:
        inner = m.group(1).strip().lower()
        return CONTRADICTION_TYPE_MAP.get(inner)
    return None


def parse_alignment(raw: str) -> tuple[str, str, str | None]:
    """Parse relationship level, explanation, and optional contradiction type.

    Returns (level_code, explanation, contradiction_type).
    contradiction_type is non-None only for negative levels.

    Output format: "Label (Type) - explanation" for contradictions,
                   "Label - explanation" for alignment/neutral.
    """
    raw_stripped = raw.strip()
    lower = raw_stripped.lower()

    # Primary: "Label - explanation" text format
    for label_text, level_code in ALIGNMENT_MAP.items():
        if label_text in lower:
            contradiction_type = None
            if level_code in CONTRADICTION_LEVELS:
                contradiction_type = _extract_contradiction_type(raw_stripped)

            # Extract explanation: split on first " - " after the label
            idx = lower.index(label_text)
            after_label = raw_stripped[idx + len(label_text):]
            # Skip past optional "(Type)" parenthetical
            after_paren = re.sub(r"^\s*\([^)]*\)\s*", "", after_label)
            parts = after_paren.split("-", 1)
            explanation = parts[1].strip() if len(parts) > 1 else after_paren.strip().lstrip("-").strip()
            return level_code, explanation, contradiction_type

    # Fallback: JSON format
    try:
        cleaned = re.sub(r"```(?:json)?\s*", "", raw_stripped).strip().rstrip("`")
        data = json.loads(cleaned)
        label = data.get("alignment", data.get("relationship", "No alignment")).strip().lower()
        explanation = data.get("explanation", data.get("description", ""))
        level = ALIGNMENT_MAP.get(label, "none")
        contradiction_type = None
        if level in CONTRADICTION_LEVELS:
            ct = data.get("contradictionType", data.get("contradiction_type", ""))
            if ct:
                contradiction_type = CONTRADICTION_TYPE_MAP.get(ct.lower(), ct.lower())
        return level, explanation, contradiction_type
    except (json.JSONDecodeError, AttributeError):
        pass

    logger.warning(f"Could not parse alignment from: {raw_stripped[:100]}")
    return "none", "", None


# ---------------------------------------------------------------------------
# Step 2: Generate cross-document pairs
# ---------------------------------------------------------------------------


def generate_pairs(
    targets: list[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Generate ALL cross-document target pairs.

    Every target is paired with every target from a different document type.
    Classification is no longer used as a pairing filter — the alignment LLM
    (Agent 2) decides relevance directly.
    """
    by_doc: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for t in targets:
        by_doc[t["sourceDocument"]].append(t)

    pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    seen: set[tuple[str, str]] = set()

    for doc_a, doc_b in combinations(sorted(by_doc.keys()), 2):
        for ta in by_doc[doc_a]:
            for tb in by_doc[doc_b]:
                key = tuple(sorted([ta["id"], tb["id"]]))
                if key not in seen:
                    seen.add(key)
                    pairs.append((ta, tb))

    logger.info(
        f"Generated {len(pairs)} cross-document pairs "
        f"from {len(by_doc)} document types"
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
        activities = (t.get("activities") or "").strip()
        actions = (t.get("actions") or "").strip()

        activities_block = (
            f'    The target has associated implementation activities: "{activities}"\n'
            if activities else ""
        )
        actions_block = (
            f'    The target has associated actions/measures: "{actions}"\n'
            if actions else ""
        )
        action_instruction = (
            "Use the provided activities and actions/measures to inform this field, "
            "integrating them with any actions described in the target text itself."
            if (activities or actions) else ""
        )

        user = ANALYST_USER_TEMPLATE.format(
            target_text=t["text"],
            activities_block=activities_block,
            actions_block=actions_block,
            action_instruction=action_instruction,
        )
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
            target_1_decomp=decomp_a,
            target_2_type=DOC_TYPE_LABELS.get(tb["sourceDocument"], tb["sourceDocument"]),
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
    level_counts: dict[str, int] = {}

    for (aid, bid), raw in zip(pair_keys, results):
        level, explanation, contradiction_type = parse_alignment(raw)
        level_counts[level] = level_counts.get(level, 0) + 1
        result: dict[str, Any] = {
            "targetAId": aid,
            "targetBId": bid,
            "alignment": level,
            "description": explanation,
        }
        if contradiction_type:
            result["contradictionType"] = contradiction_type
        alignment_results.append(result)

    logger.info(
        f"  Alignment done: {level_counts}"
    )
    return alignment_results
