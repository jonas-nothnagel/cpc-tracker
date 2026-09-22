"""
How fully each target is defined.

WHY: the Panama focal-group report (23 Jul 2026) asked the tool to "gradually
incorporate goals, indicators, progress". A planner cannot track a target that
does not say what will change, by how much, where, or by when — and telling them
which targets are ready to monitor, and which still need an indicator written,
is the most useful thing this analysis can add without new data.

WHAT THIS IS: a read of WHICH ELEMENTS THE TARGET TEXT STATES. Element presence
is observable in the text. It is not a grade of the target, and it is not a
judgement of the institution that wrote it — that would breach the
political-sensitivity guardrail in CLAUDE.md, and would assert a confidence the
model cannot have about policy language that is often deliberately broad.

So there is no score, no "weak"/"poor", and nothing here ranks documents or
sectors. Every element the model claims to find must come back with the exact
phrase that supports it; an element with no quotable phrase is not present.

FIVE ELEMENTS. Two already exist and are merged in by `run_analysis.py` rather
than recomputed here:

    measurable  — an explicit numeric value        (quantitative_flags.json)
    deadline    — an explicit year or timeframe    (quantitative_flags.json)

The three this module assesses:

    action      — a specific intervention, not only "strengthen" / "promote" /
                  "support" with no object
    scope       — a named place, sector, or population the target applies to
    outcome     — a stated result, as distinct from restating the action

WHY THESE THREE: they are the parts of a target that a monitoring framework
needs and that free text most often leaves implicit. They mirror the
decomposition the pipeline already produces (Goal / Action / Area / Audience /
Outcome), which is passed in as context where available so the assessment sees
the same reading of the target the rest of the pipeline did.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from .llm import call_llm_batch

logger = logging.getLogger(__name__)

BATCH_SIZE = 8  # targets per LLM call; smaller than quantitative.py because
# each item returns three judgements plus evidence rather than two booleans.

#: The elements this module assesses. `measurable` and `deadline` are merged in
#: from quantitative_flags.json by the caller.
ASSESSED_ELEMENTS = ("action", "scope", "outcome")

SYSTEM = """You read policy targets and report WHICH ELEMENTS THE TEXT STATES.

You are not grading the target and not judging whoever wrote it. Policy language \
is often deliberately broad; a target that leaves an element unstated is not a \
bad target. Report only what the words on the page say.

For each target, decide three things:

- "action": true when the text names a SPECIFIC intervention — something a \
reader could picture being done. False when it only uses an open verb \
("strengthen", "promote", "support", "improve", "encourage") with no concrete \
object or instrument attached.
- "scope": true when the text names WHERE or FOR WHOM it applies — a place, \
ecosystem, sector, institution, or population. False when it applies to \
everything and everyone without saying so.
- "outcome": true when the text states a RESULT that would follow — a change in \
the world. False when the "result" only restates the action in other words \
("implement the plan in order to have the plan implemented").

EVIDENCE IS REQUIRED. For every element you mark true, quote the exact phrase \
from the target that supports it, copied verbatim. If you cannot quote a phrase, \
the element is false. Never paraphrase into the evidence field.

Output a JSON array. Each object must have:
- "targetId": exact string from the list
- "action": boolean
- "actionEvidence": verbatim phrase, or "" when action is false
- "scope": boolean
- "scopeEvidence": verbatim phrase, or "" when scope is false
- "outcome": boolean
- "outcomeEvidence": verbatim phrase, or "" when outcome is false
- "confidence": "high" | "medium" | "low" — how clearly the text settles these \
three, not how good the target is"""

USER_TEMPLATE = """For each target below, report which of the three elements the \
text states, with a verbatim quote for each one you mark true.

Targets:
{targets_list}

Respond with a JSON array only, e.g.:
[{{"targetId":"NAP_1","action":true,"actionEvidence":"restore 5,000 hectares of mangrove",\
"scope":true,"scopeEvidence":"in the Gulf of Montijo","outcome":false,"outcomeEvidence":"",\
"confidence":"high"}}, ...]"""

#: Open verbs that carry no intervention on their own. Used only as a guard
#: AGAINST a false positive: a target whose text is one of these verbs and
#: nothing else cannot have a specific action, whatever the model returned.
_OPEN_VERBS = re.compile(
    r"^\W*(strengthen|promote|support|improve|encourage|enhance|foster|ensure)\b",
    re.IGNORECASE,
)


def _parse_response(text: str) -> list[dict[str, Any]]:
    """Extract the JSON array from an LLM response, tolerating a code fence."""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    return json.loads(text)


def _evidence_is_grounded(evidence: str, target_text: str) -> bool:
    """True when `evidence` really appears in the target.

    The model is told to quote verbatim; this is what makes that instruction
    enforceable rather than aspirational. Whitespace is normalised because
    source documents wrap mid-phrase, but nothing else is: a paraphrase must
    fail this check, since a quote a reader cannot find in the target is worse
    than no evidence at all.
    """
    if not evidence:
        return False
    norm = lambda s: re.sub(r"\s+", " ", s).strip().lower()  # noqa: E731
    return norm(evidence) in norm(target_text)


async def assess_target_quality(
    targets: list[dict], decompositions: dict[str, str] | None = None
) -> list[dict[str, Any]]:
    """
    For each target, report which of `ASSESSED_ELEMENTS` the text states.

    `decompositions` maps target id → the pipeline's existing decomposition
    text, passed as context so this assessment reads the target the same way the
    rest of the pipeline does. Optional: absent, the target text alone is used.

    Returns one record per target:
        {targetId, elements: {action, scope, outcome},
         evidence: {action, scope, outcome}, confidence}

    An element the model marked true but could not evidence with a phrase found
    in the target is downgraded to false — the claim is only as good as the
    quote behind it.
    """
    if not targets:
        return []

    batches = [targets[i : i + BATCH_SIZE] for i in range(0, len(targets), BATCH_SIZE)]

    def make_prompt(batch: list[dict]) -> str:
        lines = []
        for t in batch:
            text = (t.get("text") or "")[:1200]
            lines.append(f'- "{t["id"]}": {text}')
            decomposition = (decompositions or {}).get(t["id"])
            if decomposition:
                lines.append(f"  (pipeline decomposition: {decomposition[:600]})")
        return "\n".join(lines)

    calls = [
        {"system": SYSTEM, "user": USER_TEMPLATE.format(targets_list=make_prompt(b))}
        for b in batches
    ]

    results = await call_llm_batch(
        calls,
        cache_namespace="target_quality_v1",
        desc="Target definition elements",
    )

    by_id: dict[str, dict] = {}
    for raw in results:
        try:
            for item in _parse_response(raw):
                tid = item.get("targetId") or item.get("id")
                if tid:
                    by_id[tid] = item
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.warning(f"Failed to parse target-quality response: {e}")

    out: list[dict[str, Any]] = []
    for t in targets:
        tid = t["id"]
        text = t.get("text", "") or ""
        item = by_id.get(tid, {})

        elements: dict[str, bool] = {}
        evidence: dict[str, str] = {}
        for element in ASSESSED_ELEMENTS:
            claimed = bool(item.get(element, False))
            quote = str(item.get(f"{element}Evidence", "") or "").strip()
            grounded = _evidence_is_grounded(quote, text)
            if claimed and not grounded:
                # Reported but unquotable. Drop the claim, keep the record
                # honest, and say so in the log rather than in the UI.
                logger.debug(f"{tid}: dropped ungrounded '{element}' evidence: {quote[:60]}")
            elements[element] = claimed and grounded
            evidence[element] = quote if elements[element] else ""

        # Guard: a target that is nothing but an open verb cannot state a
        # specific action, whatever came back.
        if elements.get("action") and _OPEN_VERBS.match(text) and len(text.split()) < 6:
            elements["action"] = False
            evidence["action"] = ""

        confidence = str(item.get("confidence", "") or "").lower()
        if confidence not in ("high", "medium", "low"):
            confidence = "low" if not item else "medium"

        out.append(
            {
                "targetId": tid,
                "elements": elements,
                "evidence": evidence,
                "confidence": confidence,
            }
        )

    stated = sum(sum(r["elements"].values()) for r in out)
    logger.info(
        f"Target definition elements: {stated} stated across {len(out)} targets "
        f"({len(ASSESSED_ELEMENTS)} assessed per target)"
    )
    return out
