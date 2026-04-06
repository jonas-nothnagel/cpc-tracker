"""
Step 7: Budget-to-Target alignment.

Compares policy targets with government budget programs to assess
financing-to-commitment coherence. Reuses the decomposition agent (Agent 1)
and a custom alignment prompt (Agent 2**) tuned for budget-target comparisons.

Follows the same pattern as measure_align.py.
"""

from __future__ import annotations

import json
import logging
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
# Adapted Agent 2 prompt for budget alignment
# ---------------------------------------------------------------------------

BUDGET_ADVISOR_SYSTEM = (
    "You are a Budget Alignment Advisor assessing whether government budget "
    "programs fund activities that advance stated policy targets. You "
    "provide factual, graded assessments of financing-to-commitment coherence."
)

BUDGET_ADVISOR_USER_TEMPLATE = """\
    Role: Budget Alignment Advisor
    Goal: Compare a policy target with a government budget program and assess whether the program's \
funded activities advance the target.

    Backstory: You specialize in evaluating whether public expenditure programs genuinely fund \
activities that advance stated policy commitments (from NDCs, NAPs, NBSAPs, LDN targets). \
Your assessments examine whether the program's mandate, activities, and resource allocation \
are directed toward the target's objectives. You identify both strong financing links and \
genuine misalignments.

    Task:
    1. Analyze the following policy target and government budget program:
       - {target_type} policy target: {target_decomp}
       - Budget program: {program_decomp}
    2. Assess whether the budget program funds activities that directly advance, partially support, \
or have no relationship to achieving the target.
    3. Consider whether the program's mandate, funded activities, and sector genuinely contribute \
to the target's goals.
    4. Also consider whether the program's expenditure could work against the target.

    Classify the relationship into one of the seven levels below. Always use the exact label and format:

    **1.** "No alignment" – The program and target operate in completely different domains with no shared \
goals, actions, or outcomes.
        Return: No alignment - [Concise 2-sentence explanation.]

    **2.** "Low alignment" – The program has a tangential relationship to the target. They share a broad \
sector or thematic area but the program does not meaningfully fund the target's specific goals.
       Return: Low alignment - [Concise 2-sentence explanation.]

    **3.** "Medium alignment" – The program partially funds or supports the target. There is clear \
thematic overlap and the program advances some aspects of the target, but it does not fully address \
the target's core objectives.
       Return: Medium alignment - [Concise 2-sentence explanation.]

    **4.** "High alignment" – The program directly funds or strongly supports the target. The program's \
mandate, funded activities, and sector closely match the target's goals. This program is a concrete \
financing mechanism for achieving the target.
       Return: High alignment - [Concise 2-sentence explanation.]

    === CONTRADICTION LEVELS (use only when the program genuinely conflicts with the target) ===

    For contradiction levels, you MUST also specify the contradiction type in parentheses after the label. \
The four types are:
    - Goal conflict: The program works against the target's objective.
    - Resource competition: The program diverts resources that the target needs.
    - Implementation tension: Implementing the program undermines feasibility of the target.
    - Scale/scope mismatch: The program operates at an incompatible scale or timeline.

    **5.** "Low tension" – Minor friction: the program creates a trade-off with the target but is not \
fundamentally incompatible.
       Return: Low tension (Type) - [Concise 2-sentence explanation.]

    **6.** "Moderate contradiction" – Clear conflict in approach or resources, though partial coexistence \
may be possible.
       Return: Moderate contradiction (Type) - [Concise 2-sentence explanation.]

    **7.** "High contradiction" – The program directly opposes the target's goals or outcomes.
       Return: High contradiction (Type) - [Concise 2-sentence explanation.]

    Your output should be in English.
    """


# ---------------------------------------------------------------------------
# Program-to-pseudo-target conversion
# ---------------------------------------------------------------------------


def programs_to_pseudo_targets(
    programs: list[dict[str, Any]],
    expenditure: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Convert BER budget programs into target-like dicts for the pipeline.

    Filters out programs where all yearly expenditure values are null.
    """
    # Build lookup: code → expenditure values
    exp_by_code: dict[str, dict[str, Any]] = {}
    for e in expenditure:
        exp_by_code[e["code"]] = e.get("values", {})

    pseudo: list[dict[str, Any]] = []
    for prog in programs:
        code = prog["code"]
        name = prog.get("name", "")
        description = prog.get("description", "")
        prog_type = prog.get("type", "environmental")

        values = exp_by_code.get(code, {})

        # Filter: skip programs with no expenditure data at all
        has_any = any(v is not None for v in values.values())
        if not has_any:
            continue

        # Build expenditure summary for the LLM
        year_parts = []
        total = 0.0
        for year in sorted(values.keys()):
            v = values[year]
            if v is not None:
                year_parts.append(f"{year}: {v}B MNT")
                total += v
            else:
                year_parts.append(f"{year}: no data")

        exp_summary = f"Expenditure: {', '.join(year_parts)}. Total: {total:.1f}B MNT."

        parts = [name]
        if description and description != name:
            parts.append(description)
        parts.append(exp_summary)
        text = ". ".join(parts)

        pid = f"BER_{code}"

        pseudo.append({
            "id": pid,
            "sourceDocument": "BER",
            "sourceLabel": f"{code} {name}" if len(name) <= 50 else f"{code} {name[:47]}...",
            "text": text,
            "country": "",
            "isQuantitative": False,
            "isTimeBound": False,
            "programType": prog_type,
            "expenditure": values,
        })

    logger.info(
        f"Converted {len(programs)} budget programs → "
        f"{len(pseudo)} pseudo-targets (filtered out {len(programs) - len(pseudo)} with no expenditure)"
    )
    return pseudo


# ---------------------------------------------------------------------------
# Budget-target pairing (all combinations)
# ---------------------------------------------------------------------------


def generate_budget_pairs(
    targets: list[dict[str, Any]],
    pseudo_targets: list[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Pair every budget program with every policy target."""
    pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for pt in pseudo_targets:
        for t in targets:
            pairs.append((t, pt))

    logger.info(
        f"Generated {len(pairs)} target-budget pairs "
        f"from {len(targets)} targets × {len(pseudo_targets)} programs"
    )
    return pairs


# ---------------------------------------------------------------------------
# Decompose + Assess
# ---------------------------------------------------------------------------


async def decompose_programs(
    pseudo_targets: list[dict[str, Any]],
) -> dict[str, str]:
    """Run Agent 1 on budget programs (reuses the same analyst prompt)."""
    logger.info(f"Decomposing {len(pseudo_targets)} budget programs (Agent 1)")

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
        desc="Budget program decomposition",
    )

    decomps: dict[str, str] = {}
    for tid, raw in zip(ids, results):
        decomps[tid] = raw

    logger.info(f"  Decomposed {len(decomps)} budget programs")
    return decomps


async def assess_budget_alignment(
    pairs: list[tuple[dict[str, Any], dict[str, Any]]],
    decompositions: dict[str, str],
) -> list[dict[str, Any]]:
    """Run adapted Agent 2 on target-budget pairs."""
    logger.info(
        f"Assessing budget alignment for {len(pairs)} pairs"
    )

    calls = []
    pair_keys: list[tuple[str, str]] = []

    for target, program in pairs:
        decomp_t = decompositions.get(target["id"], "")
        decomp_p = decompositions.get(program["id"], "")

        user = BUDGET_ADVISOR_USER_TEMPLATE.format(
            target_type=DOC_TYPE_LABELS.get(
                target["sourceDocument"], target["sourceDocument"]
            ),
            target_decomp=decomp_t,
            program_decomp=decomp_p,
        )
        calls.append({"system": BUDGET_ADVISOR_SYSTEM, "user": user})
        pair_keys.append((target["id"], program["id"]))

    results = await call_llm_batch(
        calls,
        cache_namespace="budget_alignment",
        desc="Budget alignment",
    )

    alignment_results = []
    level_counts: dict[str, int] = {}

    for (tid, pid), raw in zip(pair_keys, results):
        level, explanation, contradiction_type = parse_alignment(raw)
        level_counts[level] = level_counts.get(level, 0) + 1
        result: dict[str, Any] = {
            "targetAId": tid,
            "targetBId": pid,
            "alignment": level,
            "description": explanation,
        }
        if contradiction_type:
            result["contradictionType"] = contradiction_type
        alignment_results.append(result)

    logger.info(f"  Budget alignment done: {level_counts}")
    return alignment_results
