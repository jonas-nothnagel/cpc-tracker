"""
Quantitative and time-bound detection for targets.

Uses an LLM to assess each target for:
- isQuantitative: measurable outcomes (percentages, amounts, metrics)
- isTimeBound: deadlines or timeframes (e.g. "by 2030", "until 2035")

The original pipeline used spaCy NER (CARDINAL, DATE entities) with exclusion rules.
LLM-based detection is multilingual, requires no extra deps, and aligns with the
report: "combine lexical and grammatical analysis to distinguish substantive
quantitative elements from administrative references (e.g. 'Article 2')."
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from .llm import call_llm_batch

logger = logging.getLogger(__name__)

BATCH_SIZE = 12  # targets per LLM call

SYSTEM = """You analyze policy targets for quantitative and time-bound elements.

CRITICAL: isQuantitative is true ONLY when the target contains explicit NUMERIC values:
- Percentages: "30%", "10 percent"
- Counts or amounts: "50 million tons", "20,000 hectares", "4.15 million"
Without numbers, a target is NOT quantitative. Phrases like "reduce emissions", "enhance carbon sink", "strengthen adaptation" with no figures are false.

isTimeBound is true ONLY when the target contains an explicit time horizon: a year (e.g. 2030, 2025), month, day, or timeframe. Phrases like "by 2030", "until 2035", "2024-2025" qualify. Without a specific date/year, it is false.

Exclude administrative references: "Article 2", "Target 3", "Section 4".

Output a JSON array. Each object must have:
- "targetId": exact string from the list
- "isQuantitative": true only if the target text contains numeric values (%, digits, amounts)
- "isTimeBound": true only if the target contains a specific year, month, day, or timeframe
- "quantitativeDetails": if isQuantitative, the exact phrase(s) containing numbers (e.g. "30%", "5.277 million tons"); else ""
- "timeBoundDetails": if isTimeBound, the exact phrase(s) with dates (e.g. "by 2030"); else """""

USER_TEMPLATE = """For each target below, set isQuantitative (only if it contains numbers), isTimeBound, and extract the phrases.

Targets (id, text):
{targets_list}

Respond with a JSON array only, e.g.:
[{{"targetId":"NAP_1","isQuantitative":false,"isTimeBound":false,"quantitativeDetails":"","timeBoundDetails":""}}, ...]"""


def _parse_response(text: str) -> list[dict[str, Any]]:
    """Extract JSON array from LLM response, handling markdown code blocks."""
    text = text.strip()
    # Strip markdown code block if present
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    return json.loads(text)


async def assess_quantitative_flags(targets: list[dict]) -> list[dict[str, Any]]:
    """
    For each target, determine isQuantitative and isTimeBound via LLM.

    Returns list of {targetId, isQuantitative, isTimeBound}.
    """
    if not targets:
        return []

    # Build batches
    batches: list[list[dict]] = []
    for i in range(0, len(targets), BATCH_SIZE):
        batches.append(targets[i : i + BATCH_SIZE])

    def make_prompt(batch: list[dict]) -> str:
        lines = []
        for t in batch:
            lines.append(f'- "{t["id"]}": {t["text"][:200]}{"..." if len(t.get("text","")) > 200 else ""}')
        return "\n".join(lines)

    calls = [
        {
            "system": SYSTEM,
            "user": USER_TEMPLATE.format(targets_list=make_prompt(b)),
        }
        for b in batches
    ]

    results = await call_llm_batch(
        calls,
        cache_namespace="quantitative_v3",
        desc="Quantitative/time-bound",
    )

    # Regex: target must contain at least one digit or % to be quantitative
    HAS_NUMBER = re.compile(r"\d|%")
    # Regex: target must contain a year (19xx/20xx) or time word to be time-bound
    HAS_TIME = re.compile(r"\b(19|20)\d{2}\b", re.IGNORECASE)

    # Parse and merge
    flags_by_id: dict[str, dict] = {}
    for raw in results:
        try:
            arr = _parse_response(raw)
            for item in arr:
                tid = item.get("targetId") or item.get("id")
                if tid:
                    flags_by_id[tid] = {
                        "targetId": tid,
                        "isQuantitative": bool(item.get("isQuantitative", False)),
                        "isTimeBound": bool(item.get("isTimeBound", False)),
                        "quantitativeDetails": str(item.get("quantitativeDetails", "") or "").strip(),
                        "timeBoundDetails": str(item.get("timeBoundDetails", "") or "").strip(),
                    }
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse quantitative response: {e}")

    # Default missing to False; enforce: no numbers in text => not quantitative
    out = []
    for t in targets:
        fid = t["id"]
        text = t.get("text", "") or ""
        flags = flags_by_id.get(
            fid,
            {
                "targetId": fid,
                "isQuantitative": False,
                "isTimeBound": False,
                "quantitativeDetails": "",
                "timeBoundDetails": "",
            },
        )
        if flags.get("isQuantitative") and not HAS_NUMBER.search(text):
            flags = {**flags, "isQuantitative": False, "quantitativeDetails": ""}
        if flags.get("isTimeBound") and not HAS_TIME.search(text):
            flags = {**flags, "isTimeBound": False, "timeBoundDetails": ""}
        out.append(flags)

    return out
