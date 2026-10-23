"""
Step 7: Budget-to-Target alignment.

Compares policy targets with the lines of a country's Biodiversity Expenditure
Review (BER). Reuses the decomposition agent (Agent 1) and the canonical
alignment prompt (Agent 2) with a framing for budget lines.

Two kinds of BER file:
  - a review rebuilt from its own workbook (`record`, step 1 of the BER plan):
    every line the review decided on that holds reviewed spending, described
    in the review's and the budget's own words without amounts (the
    description the step 2 placement reads, src/ber_areas.py). The results
    are marked `"basis": "ber-record"` in budget_alignment.meta.json, which
    the brief reads before it shows them;
  - an earlier file of programmes and their expenditure (Country X's
    illustrative file), each programme's text with its amounts as before.

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
from .ber_areas import area_lines, describe_line
from .llm import call_llm_batch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Budget alignment: reuses canonical v2.2 advisor prompt via intro_framing
# ---------------------------------------------------------------------------

BUDGET_ADVISOR_SYSTEM = ADVISOR_SYSTEM  # Reuse the canonical system prompt.

# The budget framing's own revision, stamped into budget_alignment.meta.json.
# 4: rebuilt for the lines of a review's record (BER plan step 3): no "fund"
# (it ran through 68% of Mongolia's v3 explanations), no amounts, running
# costs read with what they keep running.
BUDGET_PROMPT_VERSION = 4

# Bumped with the framing so responses from different prompt revisions never
# share a cache dir.
BUDGET_CACHE_NAMESPACE = "budget_alignment_v4"

# What the advisor is told the second side is ("Budget line target: ...").
BUDGET_LINE_TYPE = "Budget line"

# Framing injected into the canonical ADVISOR_USER_TEMPLATE's {intro_framing}
# slot: same five-category rubric otherwise. Project-defined text (CLAUDE.md:
# no LLM-drafted content in pipeline inputs unless labelled so, as here),
# shown verbatim to the project lead before any run of it. It names no policy
# content: the line's side is the review's own description. The running-costs
# sentence follows the handover's recommendation for lines that are mostly
# administration (count them under what they administer), as the step 2
# placement does (src/ber_areas.py).
BUDGET_INTRO_FRAMING = (
    "\n    Context for this comparison: one side of this pair is a policy target "
    "from a national strategy or policy document. The other side is a line of "
    "the government budget that the country's Biodiversity Expenditure Review "
    "counted as spending relevant to biodiversity, described by what the budget "
    "and the review record about it, such as its name, programme, institution "
    "and what it pays for. Its amounts are not given: the size of a line has no "
    "bearing on the level. Apply the same scoring rubric to what the money of "
    "the line is spent on, set against the goals, actions, ecosystems and actors "
    "of the target. Running costs (wages, offices, administration) serve the "
    "purpose of the body or programme they keep running. A line spent on the "
    "very activities, ecosystems or actors the target names is High alignment; "
    "a line in the same broad area whose spending does not reach the target's "
    "specific goals is Low alignment; a line whose spending pays for activities "
    "the target seeks to reduce is Flagged for review, provided the friction "
    "meets the flagging gate above. Write the explanation in terms of what "
    "the line's spending goes to and how that relates to the target (for example "
    "\"the line's spending on protected-area staff\"), without the words "
    "\"fund\" or \"finance\", and without judging whether the amount is enough.\n"
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
        # The models read the programme without its amounts (the framing
        # says so); the amounts stay in the text a reader sees.
        analysis_text = ". ".join(parts)
        parts.append(exp_summary)
        text = ". ".join(parts)

        pid = f"BER_{code}"

        pseudo.append({
            "id": pid,
            "sourceDocument": "BER",
            "sourceLabel": f"{code} {name}" if len(name) <= 50 else f"{code} {name[:47]}...",
            "text": text,
            "analysisText": analysis_text,
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


def _counted(line: dict[str, Any], year: str) -> float | None:
    """A line's counted amount in a year, every part of the budget together;
    None where the review's data hold no cell for the line that year."""
    cells = (line.get("amounts") or {}).get(year)
    if not cells:
        return None
    return sum((c or {}).get("counted") or 0 for c in cells.values())


def _shown_text(line: dict[str, Any]) -> str:
    """The line's text for a reader, as the brief shows it (lineText in
    src/lib/brief/ber-record.ts): the review's own description where it has
    one, else where the line sits in the budget."""
    if line.get("description"):
        return line["description"]
    parts = [line.get(k) for k in ("programmeName", "institution", "ministry")]
    tags = line["tags"] if isinstance(line.get("tags"), list) else []
    return " · ".join(p for p in [*parts, *tags] if isinstance(p, str) and p) or line["name"]


def record_lines_to_pseudo_targets(country: str, record: dict[str, Any]) -> list[dict[str, Any]]:
    """The lines of a review's record (step 1 of the BER plan) as target-like
    dicts for the pipeline: every line the review decided on that holds
    reviewed spending in any year. `analysisText` is what the models read,
    the review's and the budget's own words without amounts (the description
    the step 2 placement reads); `text` is what a reader sees."""
    years = [y["year"] for y in record["years"]]
    pseudo: list[dict[str, Any]] = []
    for line in area_lines(record):
        by_year = {y: _counted(line, y) for y in years}
        if not any(v for v in by_year.values()):
            continue
        name = line["name"]
        pseudo.append({
            "id": f"BER_{line['code']}",
            "sourceDocument": "BER",
            "sourceLabel": f"{line['code']} {name}" if len(name) <= 50 else f"{line['code']} {name[:47]}...",
            "text": _shown_text(line),
            "analysisText": describe_line(country, record, line),
            "country": "",
            "isQuantitative": False,
            "isTimeBound": False,
            "lineKind": line["kind"],
            "expenditure": by_year,
        })
    logger.info(f"{len(area_lines(record))} lines in the record -> {len(pseudo)} with reviewed spending")
    return pseudo


def budget_items(country: str, ber: dict[str, Any]) -> tuple[list[dict[str, Any]], str | None]:
    """The budget lines to compare with the targets, and their basis: the
    record's lines ("ber-record") where the file has a record, else the
    earlier file's programmes (None)."""
    record = ber.get("record")
    if record:
        return record_lines_to_pseudo_targets(country, record), "ber-record"
    return (
        programs_to_pseudo_targets(
            ber.get("programs", []),
            ber.get("expenditure", []),
            currency=ber.get("currency", ""),
            unit=ber.get("unit", ""),
            period=ber.get("period"),
        ),
        None,
    )


def budget_meta(basis: str | None, model: str, lines: int, targets: int, pairs: int) -> dict[str, Any]:
    """budget_alignment.meta.json: what the comparisons were built for. The
    brief shows them for a record only when `basis` is "ber-record"."""
    return {
        "basis": basis,
        "promptVersion": BUDGET_PROMPT_VERSION,
        "cacheNamespace": BUDGET_CACHE_NAMESPACE,
        "model": model,
        "lines": lines,
        "targets": targets,
        "pairs": pairs,
        "framing": BUDGET_INTRO_FRAMING.strip(),
    }


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
            # A record's line is read from its description without amounts.
            target_text=pt.get("analysisText") or pt["text"],
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
            target_2_type=BUDGET_LINE_TYPE,
            target_2_decomp=decomp_p,
        )
        calls.append({"system": BUDGET_ADVISOR_SYSTEM, "user": user})
        pair_keys.append((target["id"], program["id"]))

    results = await call_llm_batch(
        calls,
        # v4: the budget framing rebuilt for a record's lines (canonical v2.3).
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
