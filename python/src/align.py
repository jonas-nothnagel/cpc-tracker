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
from .alignment_schema import (
    ALIGNMENT_MAP,
    FLAGGED_LEVELS,
    MECHANISM_MAP,
    MANAGEABILITY_MAP,
    CONFIDENCE_MAP,
    parse_alignment,
)

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

ADVISOR_SYSTEM = (
    "You are a Target Alignment Advisor, ensuring factual, graded alignment "
    "assessments. Most policy target pairs within climate-nature frameworks "
    "share some degree of alignment."
)

# v2.1 canonical template. Use as-is for target-target alignment by passing
# intro_framing="". The wrapper modules in measure_align.py, budget_align.py,
# and nr7_align.py format with their own framing string so the same scoring
# rubric drives every alignment family.
ADVISOR_USER_TEMPLATE = """    Role: Alignment Advisor
    Goal: Compare two structured targets from different policies and assign an alignment level from five clearly defined categories.

    Backstory: You specialize in evaluating alignment potential between policy targets. Your assessments are based on \
real-world feasibility, operational synergy, and strategic overlap. You never assume alignment based on superficial wording alone. \
You also flag pairs that may pull against each other for human review when targets appear to work in opposite directions, but you \
recognize that most targets within national climate-nature policy frameworks share some degree of alignment since they are all \
working toward environmental and climate goals.

    IMPORTANT, boundary rule for the negative side: Flagging a pair "for review" is the only negative-side label, and it applies \
only when you can name a specific real-world friction (goal opposition, competition for the same finite resource, or implementation \
undermining). Two targets operating in different sectors or at different scales are NOT flagged; they are simply unrelated \
(No alignment) or weakly aligned (Low alignment). DO flag for review when targets create real-world trade-offs even when both \
are positively framed, for example expanding agricultural operations in the same area an ecosystem-restoration target seeks \
to protect, even if both mention "sustainability". Because policy text is aspirational, you observe text-level friction signals, \
not implementation outcomes, so even a clearly named friction is flagged for review, not asserted as a contradiction.

    Within the single flagged state, you separately characterise three sub-dimensions, rendered inline in parentheses: \
the mechanism (what kind of friction), the manageability (can coordination resolve it, or would a target need to be redesigned), \
and your confidence (how strongly the text supports the flag).
{intro_framing}
    Task:
    1. Analyze the following two targets (structured analysis from Target Analyst):
       - {target_1_type} target: {target_1_decomp}
       - {target_2_type} target: {target_2_decomp}
    2. Compare the goal, action, ecosystem, target audience, and expected impact of both targets to assess their relationship.
    2a. Pay particular attention to overlaps or conflicts in specific implementation activities and actions/measures, not only high-level goals.
    2b. Check whether the targets reference the same geographic area, watershed, or ecosystem. Targets that compete for the same \
physical space or resources within a shared geography are more likely to create implementation tensions, even when both use positive framing.
    3. Consider hierarchical relationships between ecosystems. Recognize that specific ecosystems (e.g., mangroves, coral reefs) \
may fall under broader categories such as coastal-marine ecosystems.
    4. Determine whether aligning these targets would optimize resources, avoid duplication, or create synergies that enhance \
efficiency. Consider enabling relationships when one target creates the conditions for the other to succeed.
    5. Ensure that alignment would lead to tangible, measurable outcomes and not just theoretical synergy. Avoid aligning targets \
that operate at different levels (e.g., policy vs. on-the-ground implementation) without some operational overlap.
    6. Focus on real-world feasibility. Do not propose alignment based solely on similar wording or superficial themes.
    7. Only flag pairs for review when targets have genuinely opposing objectives, compete for the same specific resources, or when \
implementing one would actively undermine the other. Different approaches to environmental goals are NOT a reason to flag.

    Classify the relationship into one of the five categories below. Always use the exact label and format.

    Source-annotated examples below: examples marked "real" are compressed from the project's targets data; \
examples marked "illustrative" are hand-crafted didactic pairs.

    **1.** "No alignment" - The targets have no shared goals, actions, ecosystems, or actors. Aligning them would not make sense \
in a real-world implementation or policy context.
        Return: No alignment - [Concise 2-sentence explanation.]

    Example (illustrative):
      Target 1: Reduce GHG emissions in the transportation sector by 40% by 2030.
      Target 2: Establish 15 urban pollinator gardens to support bee populations.
      Output:
      No alignment - These targets operate in completely different domains, with no shared geography, actors, or implementation \
pathways. Aligning them would not yield any mutual benefit or policy efficiency.

    **2.** "Low alignment" - The targets share superficial similarities, such as common terminology or a broad thematic area, but \
differ significantly in intent, scale, timeline, or geographic scope. Any synergy is weak, unclear, or impractical for coordinated implementation.
       Return: Low alignment - [Concise 2-sentence explanation.]

    Example (illustrative):
      Target 1: Promote nature-based solutions to sequester carbon through wetland restoration.
      Target 2: Protect migratory bird corridors in high-altitude forest zones.
      Output:
      Low alignment - Both mention natural ecosystems, but they focus on different geographies, species, and purposes. The thematic \
overlap is too broad for practical coordination.

    **3.** "Medium alignment" - The targets share clear thematic or geographic overlap and reflect compatible priorities. They could \
support each other through shared enabling conditions or parallel efforts, though they are not mutually dependent.
       Return: Medium alignment - [Concise 2-sentence explanation.]

    Example (illustrative):
      Target 1: Increase national forest cover by 10% by 2035 to enhance carbon sinks.
      Target 2: Implement afforestation and soil restoration programs in degraded upland regions.
      Output:
      Medium alignment - The targets share goals around reforestation and ecosystem recovery, and could align through joint planning \
or funding. However, they remain independently implementable and serve somewhat distinct primary goals.

    **4.** "High alignment" - The targets are strongly aligned across goals, actions, ecosystems, and actors. Coordinated implementation \
would significantly enhance outcomes, efficiency, or scale; the targets directly support or amplify each other.
       Return: High alignment - [Concise 2-sentence explanation.]

    Example (illustrative):
      Target 1: Restore 20,000 hectares of mangroves by 2030 for biodiversity and coastal protection.
      Target 2: Enhance climate resilience by restoring coastal blue carbon ecosystems, including mangroves, by 2030.
      Output:
      High alignment - Both targets focus on the same ecosystem (mangroves), within the same timeframe, and involve similar actions \
and actors. Coordinated implementation would clearly enhance efficiency and maximize both climate and biodiversity outcomes.

    === FLAGGED FOR REVIEW (use only when a specific real-world friction is identifiable) ===

    **5.** "Flagged for review" - The targets pull against each other in a way that warrants closer human review. You characterise the \
friction along three sub-dimensions rendered inline in parentheses:

       Return: Flagged for review (<Goal conflict | Resource competition | Delivery friction>, <Manageable | Fundamental>, Confidence: \
<High | Medium | Low>) - [Concise 2-sentence explanation.]

    Sub-field A, Mechanism (pick exactly one):

       **1. Goal conflict**: The two targets state demonstrably opposing objectives. Achieving one substantively means not achieving the other.
          Example (illustrative):
            Target 1: Convert 500,000 hectares of forest land to commercial agriculture by 2030.
            Target 2: Increase national forest cover by 20% and halt all deforestation by 2030.
            This is a Goal conflict because the targets contradict each other at the level of stated intent for the same land base.

       **2. Resource competition**: Both targets place demands on the same specific limited resource (land, water, budget envelope, \
staff capacity, infrastructure capacity, emissions budget). The competition is for a resource both need in ways that are not freely additive.
          Example (illustrative):
            Target 1: Rapidly expand irrigation infrastructure for crop production across arid regions.
            Target 2: Protect watershed ecosystems and maintain minimum environmental water flows in those river basins.
            This is Resource competition because both depend on the same finite water in the same basins.

       **3. Delivery friction**: The targets pursue compatible or even similar goals, but how one is implemented undermines how the \
other is implemented. Includes mismatched scales, timelines, or operational intensities. This is the most common case for modern policy \
documents that broadly share goals but compete in delivery.
          Example (illustrative):
            Target 1: Strengthen REDD+ safeguards and forest stewardship monitoring.
            Target 2: Establish more effective logistics corridors, ports, and oil-related infrastructure.
            This is Delivery friction because both can succeed in principle, but corridor routing through forest landscapes creates \
pressure that safeguard systems must contain.

    Sub-field B, Manageability (pick exactly one):

       - **Manageable**: The friction is in delivery and can be resolved through coordination, safeguards, sequencing, or zoning. Both \
targets can stand as written if the coordination happens.
       - **Fundamental**: At least one target would need to be modified or dropped for both to coexist. The friction is in the targets \
themselves, not in how they are delivered.

       Apply this test independently of which mechanism applies: ask "could coordination, safeguards, or sequencing fully resolve the \
friction?" If yes, Manageable. If at least one target would need to be revised or dropped, Fundamental.

    Sub-field C, Confidence (pick exactly one):

       - **High**: Both targets contain language that clearly indicates the named friction. A human reviewer would almost certainly \
agree this warrants closer review.
       - **Medium**: The text supports the friction, but a reviewer might reasonably read it as Low alignment or No alignment instead.
       - **Low**: The friction is inferred from indirect signals, the policy text does not name it directly and you are extrapolating. \
Treat as a hunch worth checking, not a finding.

    Worked examples of Flagged for review:

    Example A (real; Mongolia FSS_11 + NAP_3) - Delivery friction, Manageable, Confidence: Medium:
      Target 1: Ensure a stable supply of energy, steam, heat and fuel for food supply and domestic production.
      Target 2: Improve the adaptive capacity of ecosystems and biodiversity.
      Output:
      Flagged for review (Delivery friction, Manageable, Confidence: Medium) - Subsidised energy and fuel for food production can \
intensify agricultural pressure on ecosystems and habitats the adaptation target seeks to protect. The two are not fundamentally \
opposed and can coexist if production support is paired with siting and intensity safeguards.

    Example B (real; Mongolia FSS_21 + NAP_4) - Resource competition, Manageable, Confidence: Medium:
      Target 1: Focus on increasing the cultivation of all types of rice, sugar beet, and other cash crops, with policy and financing support.
      Target 2: Reduce desertification, land degradation, and permafrost loss.
      Output:
      Flagged for review (Resource competition, Manageable, Confidence: Medium) - Expanding irrigated cash-crop cultivation increases \
demand for land and water in regions also targeted for degradation reduction, creating localised competition for the same physical \
resource. Careful watershed allocation and land-use zoning could keep the two compatible.

    Example C (real; Mongolia FSS_15 + NAP_7) - Goal conflict, Fundamental, Confidence: High:
      Target 1: Convert up to 200,000 hectares of newly reclaimed land into agricultural land.
      Target 2: Establish sustainable forest management and climate-resilient natural forests and better reforestation capacity.
      Output:
      Flagged for review (Goal conflict, Fundamental, Confidence: High) - The agricultural expansion target proposes converting new \
land to cropland, which competes directly with the forest restoration target's intent for the same land base. Reconciling the two \
would require revising either the conversion area or the reforestation footprint.

    Example D (real; Panama CNR + PEG) - Delivery friction, Manageable, Confidence: High:
      Target 1: PIEA expansion inside the Panama Canal watershed for sustainable land-use management.
      Target 2: Establish more effective logistics corridors among ports, airports, and free zones, prioritising export sectors.
      Output:
      Flagged for review (Delivery friction, Manageable, Confidence: High) - The PIEA target aims for conservation and sustainable \
land use in the Canal watershed, while logistics expansion creates development pressure linked to the Canal economy in the same \
geography. Coordinated spatial planning and safeguards in corridor routing could keep both viable.

    Example E (real; Mongolia FSS_11 + NAP_4) - Delivery friction, Manageable, Confidence: Low:
      Target 1: Ensure a stable supply of energy, steam, heat and fuel for food supply and domestic production.
      Target 2: Reduce desertification, land degradation, and permafrost loss.
      Output:
      Flagged for review (Delivery friction, Manageable, Confidence: Low) - Subsidised energy and fuel for food producers could \
indirectly intensify agricultural production in arid and degraded regions, adding pressure to lands the adaptation target seeks to \
protect. The link is two steps removed from the policy text and inferred rather than named, so a reviewer might equally read the \
pair as Low alignment with no flag needed.

    Example F (real; Mongolia FSS_29 + NDC_22) - Resource competition, Fundamental, Confidence: High:
      Target 1: Increase enterprise participation in the expansion and establishment of pig, poultry, and fattening lamb and cattle farms.
      Target 2: Reduce 5.277 million tons of agricultural CO2 by 2030 by adhering to the national livestock herd cap of 50 million head \
in line with rangeland carrying capacity.
      Output:
      Flagged for review (Resource competition, Fundamental, Confidence: High) - Both targets bind the same finite resource, \
livestock-sector headcount under rangeland carrying capacity and the emissions budget tied to it, and expanding farms while holding \
the 50 million head cap is only feasible through efficiency gains, not herd growth. As written, the two targets cannot both be \
fully delivered without revising one, so the friction lives in the targets themselves rather than in delivery.

    Your output should be in English. Use no em dashes. Do not invent facts.
    """


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------
#
# ALIGNMENT_MAP, MECHANISM_MAP, MANAGEABILITY_MAP, CONFIDENCE_MAP,
# FLAGGED_LEVELS, and parse_alignment now live in alignment_schema.py so the
# four alignment-family modules (align, measure_align, budget_align,
# nr7_align) share a single source of truth.

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


# parse_alignment lives in alignment_schema.py (imported at the top of this
# module). It returns a 5-tuple (level, explanation, mechanism, manageability,
# confidence). See assess_alignment() below for the call site.


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
    doc_type_labels: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """
    Run Agent 2 (Alignment Advisor) on each pair.
    Returns list of alignment results.

    The original (cell 39) passes the raw Agent 1 output string directly:
        alignment_advisor(target_1_type, target_1_analyzed, target_2_type, target_2_analyzed)
    """
    logger.info(f"Assessing alignment for {len(pairs)} pairs (Agent 2: Alignment Advisor)")

    labels = doc_type_labels or DOC_TYPE_LABELS
    calls = []
    pair_keys: list[tuple[str, str]] = []

    for ta, tb in pairs:
        # Pass raw decomposition strings, exactly as the original
        decomp_a = decompositions.get(ta["id"], "")
        decomp_b = decompositions.get(tb["id"], "")

        user = ADVISOR_USER_TEMPLATE.format(
            intro_framing="",
            target_1_type=labels.get(ta["sourceDocument"], ta["sourceDocument"]),
            target_1_decomp=decomp_a,
            target_2_type=labels.get(tb["sourceDocument"], tb["sourceDocument"]),
            target_2_decomp=decomp_b,
        )
        calls.append({"system": ADVISOR_SYSTEM, "user": user})
        pair_keys.append((ta["id"], tb["id"]))

    results = await call_llm_batch(
        calls,
        cache_namespace="alignment_v2",
        desc="Alignment",
    )

    alignment_results = []
    level_counts: dict[str, int] = {}

    for (aid, bid), raw in zip(pair_keys, results):
        level, explanation, mechanism, manageability, confidence = parse_alignment(raw)
        level_counts[level] = level_counts.get(level, 0) + 1
        result: dict[str, Any] = {
            "targetAId": aid,
            "targetBId": bid,
            "alignment": level,
            "description": explanation,
        }
        if mechanism:
            result["mechanism"] = mechanism
        if manageability:
            result["manageability"] = manageability
        if confidence:
            result["confidence"] = confidence
        alignment_results.append(result)

    logger.info(
        f"  Alignment done: {level_counts}"
    )
    return alignment_results
