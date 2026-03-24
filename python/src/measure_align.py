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

MEASURE_ADVISOR_USER_TEMPLATE = """    Role: Implementation Coherence Advisor
    Goal: Compare a policy target with a reported implementation measure and assess how well the measure \
implements or supports the target.

    Backstory: You specialize in evaluating whether government-reported mitigation measures (from Biennial \
Transparency Reports) genuinely implement or support stated policy targets (from NDCs, NAPs, NBSAPs). Your \
assessments are grounded in real-world feasibility and operational overlap. You identify both strong \
implementation links and genuine contradictions.

    Task:
    1. Analyze the following policy target and reported implementation measure:
       - {target_type} policy target: {target_decomp}
       - BTR reported measure: {measure_decomp}
    2. Assess whether the measure directly implements, partially supports, or has no relationship to the target.
    3. Consider whether the measure's actions, sector, and intended outcomes genuinely advance the target's goals.
    4. Also consider whether the measure could inadvertently undermine or contradict the target.

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


def measures_to_pseudo_targets(measures: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert BTR mitigation measures into target-like dicts for the pipeline."""
    pseudo: list[dict[str, Any]] = []
    sector_idx: dict[str, int] = defaultdict(int)

    for m in measures:
        status = (m.get("status") or "").strip()
        name = (m.get("name") or "").strip()
        if not name or not status:
            continue

        sector = m.get("sector", "sector_other")
        sector_idx[sector] += 1
        idx = sector_idx[sector]

        short_sector = sector.replace("sector_", "")
        pid = f"BTR_{short_sector}_{idx}"

        parts = [name]
        desc = (m.get("description") or "").strip()
        obj = (m.get("objectives") or "").strip()
        if desc and desc != name:
            parts.append(desc)
        if obj and obj not in (name, desc, "Implemented", "Adopted"):
            parts.append(obj)
        text = ". ".join(parts)

        label = name if len(name) <= 60 else name[:57] + "..."

        pseudo.append({
            "id": pid,
            "sourceDocument": "BTR",
            "sourceLabel": label,
            "text": text,
            "country": "",
            "isQuantitative": False,
            "isTimeBound": False,
            "sector": sector,
            "measureStatus": status,
        })

    return pseudo


# ---------------------------------------------------------------------------
# Sector-based pairing
# ---------------------------------------------------------------------------


def generate_measure_pairs(
    targets: list[dict[str, Any]],
    pseudo_targets: list[dict[str, Any]],
    classifications: list[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Pair each measure with real targets that share the same IPCC sector."""
    target_sectors: dict[str, set[str]] = defaultdict(set)
    for c in classifications:
        if c.get("taxonomyType") == "sector" and c.get("isRelevant"):
            target_sectors[c["targetId"]].add(c["categoryId"])

    pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    seen: set[tuple[str, str]] = set()

    for pt in pseudo_targets:
        measure_sector = pt["sector"]
        for t in targets:
            t_sectors = target_sectors.get(t["id"], set())
            if measure_sector in t_sectors:
                key = (t["id"], pt["id"])
                if key not in seen:
                    seen.add(key)
                    pairs.append((t, pt))

    logger.info(
        f"Generated {len(pairs)} target-measure pairs "
        f"from {len(targets)} targets × {len(pseudo_targets)} measures"
    )
    return pairs


# ---------------------------------------------------------------------------
# Decompose + Assess
# ---------------------------------------------------------------------------


async def decompose_measures(
    pseudo_targets: list[dict[str, Any]],
) -> dict[str, str]:
    """Run Agent 1 on measures (reuses the same analyst prompt)."""
    logger.info(f"Decomposing {len(pseudo_targets)} measures (Agent 1)")

    calls = []
    ids = []
    for pt in pseudo_targets:
        user = ANALYST_USER_TEMPLATE.format(
            target_text=pt["text"],
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
) -> list[dict[str, Any]]:
    """Run adapted Agent 2 on target-measure pairs."""
    logger.info(
        f"Assessing implementation alignment for {len(pairs)} pairs"
    )

    calls = []
    pair_keys: list[tuple[str, str]] = []

    for target, measure in pairs:
        decomp_t = decompositions.get(target["id"], "")
        decomp_m = decompositions.get(measure["id"], "")

        user = MEASURE_ADVISOR_USER_TEMPLATE.format(
            target_type=DOC_TYPE_LABELS.get(
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
