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
from typing import Any

from .align import (
    ADVISOR_USER_TEMPLATE,
    ANALYST_SYSTEM,
    ANALYST_USER_TEMPLATE,
    DOC_TYPE_LABELS,
)
from .alignment_schema import parse_alignment
from .llm import call_llm_batch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Adapted Agent 2 prompt for implementation alignment
# ---------------------------------------------------------------------------
# WHY THIS DIVERGES FROM THE v2.1 TEMPLATE (2026-06-10): the canonical template
# frames every pair as "two targets" ("Goal: Compare two structured targets...",
# "- {type} target: ...") and gives no instruction on how the explanation should
# refer to the sides. With one side being a reported BTR action, ~70% of the
# stored rationales opened with "Both targets ...", presenting an implementation
# action as a policy commitment in user-facing text. The fix below keeps the
# SCORING RUBRIC AND EXAMPLES byte-identical with target-target alignment (to
# minimise verdict churn and rubric drift) and rewrites only the pair-framing
# lines plus an explicit wording rule for the explanation. align.py itself is
# untouched, so the target-target / budget / NR7 prompt caches stay valid.

MEASURE_ADVISOR_SYSTEM = (
    "You are an Implementation Alignment Advisor, ensuring factual, graded "
    "assessments of whether reported implementation actions support policy "
    "targets. Most reported actions within climate-nature frameworks share "
    "some degree of alignment with the policy framework they report under."
)

# Targeted rewrites of the canonical template's pair-framing lines. Each
# original string is asserted below so that if align.py's template drifts,
# this module fails loudly at import time instead of silently mis-rendering.
_CANON_GOAL = (
    "Goal: Compare two structured targets from different policies and assign "
    "an alignment level from five clearly defined categories."
)
_MEASURE_GOAL = (
    "Goal: Compare a policy target with a reported implementation action and "
    "assign an alignment level from five clearly defined categories."
)
_CANON_TASK1 = """    1. Analyze the following two targets (structured analysis from Target Analyst):
       - {target_1_type} target: {target_1_decomp}
       - {target_2_type} target: {target_2_decomp}"""
_MEASURE_TASK1 = """    1. Analyze the following pair (structured analysis from Target Analyst):
       - {target_1_type}: {target_1_decomp}
       - {target_2_type}: {target_2_decomp}"""
_CANON_STEP2 = (
    "2. Compare the goal, action, ecosystem, target audience, and expected "
    "impact of both targets to assess their relationship."
)
_MEASURE_STEP2 = (
    "2. Compare the goal, action, ecosystem, target audience, and expected "
    "impact of both sides to assess their relationship."
)

# Hard RuntimeError (asserts vanish under `python -O`), and uniqueness is
# required: str.replace rewrites EVERY occurrence, so a needle that appears
# twice would silently corrupt the rubric.
for _needle in (_CANON_GOAL, _CANON_TASK1, _CANON_STEP2):
    if ADVISOR_USER_TEMPLATE.count(_needle) != 1:
        raise RuntimeError(
            "align.py's v2.1 ADVISOR_USER_TEMPLATE changed (needle count "
            f"{ADVISOR_USER_TEMPLATE.count(_needle)} != 1); update the "
            f"measure-alignment rewrites in measure_align.py: {_needle[:60]}..."
        )

MEASURE_ADVISOR_USER_TEMPLATE = (
    ADVISOR_USER_TEMPLATE.replace(_CANON_GOAL, _MEASURE_GOAL)
    .replace(_CANON_TASK1, _MEASURE_TASK1)
    .replace(_CANON_STEP2, _MEASURE_STEP2)
)

# Prepended to the advisor template when the reported action is an
# adaptation action rather than a mitigation measure. Keeps the same scoring
# rubric but tells the advisor not to penalise adaptation actions for lacking
# CO2e reduction estimates.
ADAPTATION_CONTEXT_NOTE = (
    "    NOTE: The reported action on one side is an ADAPTATION action, not a mitigation measure. "
    "When assessing coherence, consider whether it reduces vulnerability, builds adaptive "
    "capacity, or could undermine the target's intent. Adaptation outcomes are not measured "
    "in CO2e; do not penalize the action for lacking emissions reductions.\n"
)

# Framing injected into the {intro_framing} slot for policy-target x reported-
# action pairs. The scoring rubric (five categories + three sub-fields) is
# shared with target-target alignment; only the framing and the wording rule
# differ.
MEASURE_INTRO_FRAMING = (
    "\n    Context for this comparison: one side of this pair is a policy target "
    "extracted from a national strategy or policy document; the other side is a "
    "REPORTED IMPLEMENTATION ACTION from a Biennial Transparency Report. The reported "
    "action is something the country reports doing; it is NOT a policy target. Apply the "
    "same scoring rubric. An action that directly implements the target is High alignment; "
    "an action that operates in the same broad sector but does not advance the target's "
    "specific goals is Low alignment; an action that creates real-world friction with the "
    "target (e.g. expanding livestock while the target caps the herd) is Flagged for review.\n"
    '    Wording rule for the explanation: refer to the policy side as "the target" (or by '
    'its document name) and to the BTR side as "the reported action" or "the action". '
    'Never call the reported action a target, and never write "both targets".\n'
)

# Framing for BTR-internal mitigation x adaptation pairs, where NEITHER side
# is a policy target.
CROSS_TYPE_INTRO_FRAMING = (
    "\n    Context for this comparison: BOTH sides of this pair are reported implementation "
    "actions from the same Biennial Transparency Report (one mitigation, one adaptation); "
    "neither side is a policy target. Apply the same scoring rubric to whether the two "
    "reported actions work together or against each other on the ground.\n"
    '    Wording rule for the explanation: refer to the sides as "the mitigation action" and '
    '"the adaptation action". Never call either side a target, and never write "both targets".\n'
)


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
    id_prefix = "BTR" if action_type == "mitigation" else "BTRA"

    seq = 0
    for m in measures:
        status = (m.get("status") or "").strip()
        name = (m.get("name") or "").strip()
        if not name or not status:
            continue

        seq += 1

        # Honor a pre-assigned id (hand-curated data); otherwise auto-generate.
        pre_id = (m.get("id") or "").strip()
        if pre_id:
            pid = pre_id
        else:
            pid = f"{id_prefix}_{seq}"

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
            "sector": m.get("sector", ""),
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


def _side_label(
    row: dict[str, Any], labels: dict[str, str]
) -> str:
    """How the advisor prompt names one side of a pair.

    Pseudo-actions (built by `measures_to_pseudo_targets`, marked by their
    `measureStatus` field) are named as reported actions, never as targets;
    real policy targets carry their document label.
    """
    if "measureStatus" in row:
        kind = row.get("actionType", "mitigation")
        return f"Reported {kind} action (BTR)"
    doc = row["sourceDocument"]
    return f"Policy target ({labels.get(doc, doc)})"


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

        # Cross-type pairs (mitigation x adaptation, both BTR-internal) get
        # their own framing: neither side is a policy target.
        is_cross_type = "measureStatus" in target
        base_framing = (
            CROSS_TYPE_INTRO_FRAMING if is_cross_type else MEASURE_INTRO_FRAMING
        )

        # Inject the adaptation context note when the BTR-side row is an
        # adaptation action so the advisor doesn't penalize it for missing
        # CO2e reduction estimates.
        adaptation_note = (
            ADAPTATION_CONTEXT_NOTE
            if measure.get("actionType") == "adaptation"
            else ""
        )
        intro_framing = base_framing + adaptation_note

        user = MEASURE_ADVISOR_USER_TEMPLATE.format(
            intro_framing=intro_framing,
            target_1_type=_side_label(target, labels),
            target_1_decomp=decomp_t,
            target_2_type=_side_label(measure, labels),
            target_2_decomp=decomp_m,
        )
        calls.append({"system": MEASURE_ADVISOR_SYSTEM, "user": user})
        pair_keys.append((target["id"], measure["id"]))

    results = await call_llm_batch(
        calls,
        # v3: side-correct framing + explanation wording rule (2026-06-10).
        # New namespace so stale "both targets" rationales are never reused.
        cache_namespace="measure_alignment_v3",
        desc="Measure alignment",
    )

    alignment_results = []
    level_counts: dict[str, int] = {}

    for (tid, mid), raw in zip(pair_keys, results):
        level, explanation, mechanism, manageability, confidence = parse_alignment(raw)
        level_counts[level] = level_counts.get(level, 0) + 1
        result: dict[str, Any] = {
            "targetAId": tid,
            "targetBId": mid,
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

    logger.info(f"  Measure alignment done: {level_counts}")
    return alignment_results
