"""
Step 7: Budget-to-Target alignment.

Compares policy targets with government budget programs to assess
financing-to-commitment coherence. Reuses the decomposition agent (Agent 1)
and a custom alignment prompt (Agent 2**) tuned for budget-target comparisons.

Follows the same pattern as measure_align.py.
"""

from __future__ import annotations

import logging
from typing import Any

from .align import (
    ADVISOR_SYSTEM,
    ADVISOR_USER_TEMPLATE,
    ANALYST_SYSTEM,
    ANALYST_USER_TEMPLATE,
    DOC_TYPE_LABELS,
)
from .alignment_schema import parse_alignment
from .llm import call_llm_batch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Budget alignment: reuses canonical v2.2 advisor prompt via intro_framing
# ---------------------------------------------------------------------------

BUDGET_ADVISOR_SYSTEM = ADVISOR_SYSTEM  # Reuse the canonical system prompt.

# Bumped with the canonical prompt version so responses from different prompt
# revisions never share a cache dir.
BUDGET_CACHE_NAMESPACE = "budget_alignment_v3"

# Framing injected into the canonical ADVISOR_USER_TEMPLATE's {intro_framing}
# slot. Tells the advisor it is comparing a policy target against a budget
# expenditure programme; same five-category rubric otherwise.
BUDGET_INTRO_FRAMING = (
    "\n    Context for this comparison: one side of this pair is a policy target "
    "extracted from a national strategy or policy document; the other side is a "
    "government budget programme described by name, mandate, and recorded "
    "expenditure. Apply the same scoring rubric. A programme whose mandate and "
    "expenditure clearly fund the target's goals is High alignment; a programme "
    "in the same broad sector that does not meaningfully fund the target's "
    "specific goals is Low alignment; a programme whose expenditure works "
    "against the target (e.g. subsidies for activities the target seeks to curb) "
    "is Flagged for review, provided the friction meets the flagging gate above.\n"
)


# ---------------------------------------------------------------------------
# Program-to-pseudo-target conversion
# ---------------------------------------------------------------------------


def programs_to_pseudo_targets(
    programs: list[dict[str, Any]],
    expenditure: list[dict[str, Any]],
    currency: str = "",
    unit: str = "",
    period: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Convert BER budget programs into target-like dicts for the pipeline.

    Every program becomes a pseudo-target, including programs with no
    recorded expenditure. Zero-spend programs are explicitly labelled so
    the alignment agent can reason about policy intent without budget.
    """
    exp_by_code: dict[str, dict[str, Any]] = {}
    for e in expenditure:
        exp_by_code[e["code"]] = e.get("values", {})

    money_label = f"{unit} {currency}".strip() if (unit or currency) else ""

    period_label = ""
    if period and period.get("start") is not None and period.get("end") is not None:
        period_label = f"{period['start']}-{period['end']}"

    all_years: list[str] = []
    if period and period.get("start") is not None and period.get("end") is not None:
        all_years = [str(y) for y in range(int(period["start"]), int(period["end"]) + 1)]

    pseudo: list[dict[str, Any]] = []
    zero_spend_count = 0
    for prog in programs:
        code = prog["code"]
        name = prog.get("name", "")
        description = prog.get("description", "")
        prog_type = prog.get("type", "environmental")

        values = exp_by_code.get(code, {})
        has_any = any(v is not None for v in values.values())

        if has_any:
            year_parts = []
            total = 0.0
            for year in sorted(values.keys()):
                v = values[year]
                if v is not None:
                    year_parts.append(f"{year}: {v}{' ' + money_label if money_label else ''}")
                    total += v
                else:
                    year_parts.append(f"{year}: no data")

            exp_summary = (
                f"Expenditure: {', '.join(year_parts)}. "
                f"Total: {total:.1f}{' ' + money_label if money_label else ''}."
            )
        else:
            zero_spend_count += 1
            if period_label:
                exp_summary = f"No expenditure recorded {period_label}."
            else:
                exp_summary = "No expenditure recorded in the available reporting years."

        if not values and all_years:
            values = {year: None for year in all_years}

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
        f"Converted {len(programs)} budget programs -> "
        f"{len(pseudo)} pseudo-targets ({zero_spend_count} with no recorded expenditure)"
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
        f"from {len(targets)} targets x {len(pseudo_targets)} programs"
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
    doc_type_labels: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Run adapted Agent 2 on target-budget pairs."""
    logger.info(
        f"Assessing budget alignment for {len(pairs)} pairs"
    )

    labels = doc_type_labels or DOC_TYPE_LABELS

    calls = []
    pair_keys: list[tuple[str, str]] = []

    for target, program in pairs:
        decomp_t = decompositions.get(target["id"], "")
        decomp_p = decompositions.get(program["id"], "")

        user = ADVISOR_USER_TEMPLATE.format(
            intro_framing=BUDGET_INTRO_FRAMING,
            target_1_type=labels.get(
                target["sourceDocument"], target["sourceDocument"]
            ),
            target_1_decomp=decomp_t,
            target_2_type="Budget programme",
            target_2_decomp=decomp_p,
        )
        calls.append({"system": BUDGET_ADVISOR_SYSTEM, "user": user})
        pair_keys.append((target["id"], program["id"]))

    results = await call_llm_batch(
        calls,
        # v3: canonical prompt v2.2 (flagging gate tightened).
        cache_namespace=BUDGET_CACHE_NAMESPACE,
        desc="Budget alignment",
    )

    alignment_results = []
    level_counts: dict[str, int] = {}

    for (tid, pid), raw in zip(pair_keys, results):
        level, explanation, mechanism, manageability, confidence = parse_alignment(raw)
        level_counts[level] = level_counts.get(level, 0) + 1
        result: dict[str, Any] = {
            "targetAId": tid,
            "targetBId": pid,
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

    logger.info(f"  Budget alignment done: {level_counts}")
    return alignment_results
