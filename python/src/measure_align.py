"""
Step 6: Target-to-Measure alignment.

Compares policy targets with BTR mitigation measures to assess
implementation coherence. Reuses the decomposition agent (Agent 1)
and an adapted alignment prompt (Agent 2*) tuned for
policy-target vs. reported-measure comparisons.
"""

from __future__ import annotations

import json
import logging
import re
from collections import defaultdict
from typing import Any

from .align import (
    ANALYST_SYSTEM,
    ANALYST_USER_TEMPLATE,
    DOC_TYPE_LABELS,
    parse_alignment,
)
from .llm import call_llm_batch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Adapted Agent 2 prompt for implementation alignment
# ---------------------------------------------------------------------------

MEASURE_ADVISOR_SYSTEM = (
    "You are an Implementation Coherence Advisor assessing whether reported "
    "government measures effectively implement stated policy targets. You "
    "provide factual, graded assessments."
)

# Prepended to the user template when the reported action is an adaptation action
# rather than a mitigation measure. Keeps all prompt surface in one place.
ADAPTATION_CONTEXT_NOTE = (
    "    NOTE: The reported action below is an ADAPTATION action, not a mitigation measure. "
    "When assessing coherence, consider whether it reduces vulnerability, builds adaptive "
    "capacity, or could undermine the target's intent. Adaptation outcomes are not measured "
    "in CO2e; do not penalize the action for lacking emissions reductions.\n\n"
)

MEASURE_ADVISOR_USER_TEMPLATE = """{adaptation_note}    Role: Implementation Coherence Advisor
    Goal: Compare a policy target with a reported implementation measure and assess how well the measure \
implements or supports the target.

    Backstory: You specialize in evaluating whether government-reported actions (from Biennial \
Transparency Reports) genuinely implement or support stated policy targets (from national climate-nature policy documents). Your \
assessments are grounded in real-world feasibility and operational overlap. You identify both strong \
implementation links and genuine contradictions, including cross-type tensions where a mitigation measure \
and an adaptation action push the same sector in opposite directions.

    Task:
    1. Analyze the following policy target and reported implementation action:
       - {target_type} policy target: {target_decomp}
       - BTR reported action: {measure_decomp}
    2. Assess whether the action directly implements, partially supports, or has no relationship to the target.
    3. Consider whether the action's actions, sector, and intended outcomes genuinely advance the target's goals.
    4. Also consider whether the action could inadvertently undermine or contradict the target.

    Classify the relationship into one of the seven levels below. Always use the exact label and format:

    **1.** "No alignment" – The measure and target operate in completely different domains with no shared goals, \
actions, or outcomes.
        Return: No alignment - [Concise 2-sentence explanation.]

    **2.** "Low alignment" – The measure has a tangential relationship to the target. They share a broad sector \
or thematic area but the measure does not meaningfully advance the target's specific goals.
       Return: Low alignment - [Concise 2-sentence explanation.]

    **3.** "Medium alignment" – The measure partially implements or supports the target. There is clear \
thematic overlap and the measure advances some aspects of the target, but it does not fully address the \
target's core objectives.
       Return: Medium alignment - [Concise 2-sentence explanation.]

    **4.** "High alignment" – The measure directly implements or strongly supports the target. The measure's \
actions, sector, and intended outcomes closely match the target's goals. This measure is a concrete step \
toward achieving the target.
       Return: High alignment - [Concise 2-sentence explanation.]

    === CONTRADICTION LEVELS (use only when the measure genuinely conflicts with the target) ===

    For contradiction levels, you MUST also specify the contradiction type in parentheses after the label. \
The four types are:
    - Goal conflict: The measure works against the target's objective.
    - Resource competition: The measure diverts resources that the target needs.
    - Implementation tension: Implementing the measure undermines feasibility of the target.
    - Scale/scope mismatch: The measure operates at an incompatible scale or timeline.

    **5.** "Low tension" – Minor friction: the measure creates a trade-off with the target but is not \
fundamentally incompatible.
       Return: Low tension (Type) - [Concise 2-sentence explanation.]

    **6.** "Moderate contradiction" – Clear conflict in approach or resources, though partial coexistence \
may be possible.
       Return: Moderate contradiction (Type) - [Concise 2-sentence explanation.]

    **7.** "High contradiction" – The measure directly opposes the target's goals or outcomes.
       Return: High contradiction (Type) - [Concise 2-sentence explanation.]

    Your output should be in English.
    """


# ---------------------------------------------------------------------------
# Measure-to-pseudo-target conversion
# ---------------------------------------------------------------------------


def measures_to_pseudo_targets(
    measures: list[dict[str, Any]],
    *,
    action_type: str = "mitigation",
) -> list[dict[str, Any]]:
    """Convert BTR reported actions (mitigation or adaptation) into target-like dicts.

    `action_type` defaults to "mitigation" so existing callers stay backward compatible.
    For adaptation actions, pass `action_type="adaptation"`; this flows into each
    pseudo-target so the alignment prompt and frontend can render cross-type pairs.

    Adaptation actions are allowed to carry a pre-assigned `id` (e.g. "ADP_3_1_1"
    from Table III.9 row numbering); if present it is preserved verbatim. Otherwise
    an ID is auto-generated with a prefix that avoids collision with mitigation IDs.
    """
    pseudo: list[dict[str, Any]] = []
    sector_idx: dict[str, int] = defaultdict(int)
    id_prefix = "BTR" if action_type == "mitigation" else "BTRA"

    for m in measures:
        status = (m.get("status") or "").strip()
        name = (m.get("name") or "").strip()
        if not name or not status:
            continue

        sector = m.get("sector", "sector_other")
        sector_idx[sector] += 1
        idx = sector_idx[sector]

        # Honor a pre-assigned id (hand-curated data); otherwise auto-generate.
        pre_id = (m.get("id") or "").strip()
        if pre_id:
            pid = pre_id
        else:
            short_sector = sector.replace("sector_", "")
            pid = f"{id_prefix}_{short_sector}_{idx}"

        parts = [name]
        desc = (m.get("description") or "").strip()
        obj = (m.get("objectives") or "").strip()
        if desc and desc != name:
            parts.append(desc)
        if obj and obj not in (name, desc, "Implemented", "Adopted"):
            parts.append(obj)
        # Adaptation rows carry a narrative implementationStatus that's usually the
        # richest semantic field; include it when present so the decomposer sees
        # quantitative content like "771,600 participants" or "325 springs in 2022".
        impl = (m.get("implementationStatus") or "").strip()
        if impl and impl not in parts:
            parts.append(impl)
        text = ". ".join(parts)

        label = name if len(name) <= 60 else name[:57] + "..."

        entry: dict[str, Any] = {
            "id": pid,
            "sourceDocument": "BTR",
            "sourceLabel": label,
            "text": text,
            "country": "",
            "isQuantitative": False,
            "isTimeBound": False,
            "sector": sector,
            "measureStatus": status,
            "actionType": action_type,
        }
        # Carry adaptation-specific fields through for the frontend renderer.
        if action_type == "adaptation":
            if m.get("adaptationGoal") is not None:
                entry["adaptationGoal"] = m["adaptationGoal"]
            if impl:
                entry["implementationStatus"] = impl
        pseudo.append(entry)

    return pseudo


# ---------------------------------------------------------------------------
# Measure-target pairing (all combinations)
# ---------------------------------------------------------------------------


def generate_measure_pairs(
    targets: list[dict[str, Any]],
    pseudo_targets: list[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Pair every BTR action (mitigation or adaptation) with every policy target.

    Classification is no longer used as a pairing filter — the alignment LLM
    decides relevance directly.
    """
    pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for pt in pseudo_targets:
        for t in targets:
            pairs.append((t, pt))

    logger.info(
        f"Generated {len(pairs)} target-measure pairs "
        f"from {len(targets)} targets × {len(pseudo_targets)} measures"
    )
    return pairs


def generate_cross_type_pairs(
    pseudo_targets: list[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Generate mitigation × adaptation pairs to surface reported cross-type tensions.

    These are BTR-internal pairs: each reported mitigation measure crossed with each
    reported adaptation action. Captures the case (flagged by Mongolia stakeholders
    on 7 April 2026) where a mitigation measure ("reduce livestock") and an
    adaptation action ("improve fodder production") point the same sector in
    opposite directions. Existing target×action pairing misses this.
    """
    mit = [p for p in pseudo_targets if p.get("actionType") == "mitigation"]
    adp = [p for p in pseudo_targets if p.get("actionType") == "adaptation"]
    pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for m in mit:
        for a in adp:
            # Convention: put mitigation on the "target" side, adaptation on the
            # "measure" side, so the existing assess_measure_alignment() loop sees
            # the adaptation row on the side that receives the adaptation context
            # note in the advisor prompt.
            pairs.append((m, a))
    logger.info(
        f"Generated {len(pairs)} cross-type measure pairs "
        f"from {len(mit)} mitigation × {len(adp)} adaptation actions"
    )
    return pairs


# ---------------------------------------------------------------------------
# Decompose + Assess
# ---------------------------------------------------------------------------


async def decompose_measures(
    pseudo_targets: list[dict[str, Any]],
) -> dict[str, str]:
    """Run Agent 1 on reported BTR actions (reuses the same analyst prompt).

    Adaptation actions get the same Goal/Action/Ecosystem/Audience/Outcome
    decomposition structure as mitigation measures; the framing naturally
    captures adaptation content because the fields are neutral. No separate
    adaptation prompt class is introduced.
    """
    logger.info(f"Decomposing {len(pseudo_targets)} measures (Agent 1)")

    calls = []
    ids = []
    for pt in pseudo_targets:
        # Prefix the adaptation framing note only for adaptation rows. This
        # nudges the decomposer to surface vulnerability-reduction content in
        # the Outcome field rather than fabricating CO2e numbers.
        text = pt["text"]
        if pt.get("actionType") == "adaptation":
            text = (
                "[ADAPTATION ACTION — frame Outcome as vulnerability reduction "
                "or adaptive-capacity gain, not CO2e.] "
                + text
            )
        user = ANALYST_USER_TEMPLATE.format(
            target_text=text,
            activities_block="",
            actions_block="",
            action_instruction="",
        )
        calls.append({"system": ANALYST_SYSTEM, "user": user})
        ids.append(pt["id"])

    results = await call_llm_batch(
        calls,
        cache_namespace="decompose",
        desc="Measure decomposition",
    )

    decomps: dict[str, str] = {}
    for tid, raw in zip(ids, results):
        decomps[tid] = raw

    logger.info(f"  Decomposed {len(decomps)} measures")
    return decomps


async def assess_measure_alignment(
    pairs: list[tuple[dict[str, Any], dict[str, Any]]],
    decompositions: dict[str, str],
    doc_type_labels: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Run adapted Agent 2 on target-measure pairs (mitigation or adaptation)."""
    logger.info(
        f"Assessing implementation alignment for {len(pairs)} pairs"
    )

    labels = doc_type_labels or DOC_TYPE_LABELS
    calls = []
    pair_keys: list[tuple[str, str]] = []

    for target, measure in pairs:
        decomp_t = decompositions.get(target["id"], "")
        decomp_m = decompositions.get(measure["id"], "")

        # Inject the adaptation context note when the BTR-side row is an
        # adaptation action so the advisor doesn't penalize it for missing
        # CO2e reduction estimates.
        adaptation_note = (
            ADAPTATION_CONTEXT_NOTE
            if measure.get("actionType") == "adaptation"
            else ""
        )

        user = MEASURE_ADVISOR_USER_TEMPLATE.format(
            adaptation_note=adaptation_note,
            target_type=labels.get(
                target["sourceDocument"], target["sourceDocument"]
            ),
            target_decomp=decomp_t,
            measure_decomp=decomp_m,
        )
        calls.append({"system": MEASURE_ADVISOR_SYSTEM, "user": user})
        pair_keys.append((target["id"], measure["id"]))

    results = await call_llm_batch(
        calls,
        cache_namespace="measure_alignment",
        desc="Measure alignment",
    )

    alignment_results = []
    level_counts: dict[str, int] = {}

    for (tid, mid), raw in zip(pair_keys, results):
        level, explanation, contradiction_type = parse_alignment(raw)
        level_counts[level] = level_counts.get(level, 0) + 1
        result: dict[str, Any] = {
            "targetAId": tid,
            "targetBId": mid,
            "alignment": level,
            "description": explanation,
        }
        if contradiction_type:
            result["contradictionType"] = contradiction_type
        alignment_results.append(result)

    logger.info(f"  Measure alignment done: {level_counts}")
    return alignment_results
