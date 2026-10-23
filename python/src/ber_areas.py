"""Step 2 of the BER plan, "Tag each line": place every budget line of an
expenditure review in an area of a lens, for a person to check.

Two AI models read the same description of each line and score every area of
the lens, with a reason for the top two:

  - the pipeline's model (LLM_MODEL, gpt-5.4 on Azure), through src/llm.py,
    cached like every pipeline call;
  - a second model through the Anthropic API (Claude Opus 5.5), as a check on
    the first, never as a vote: two models agreeing does not count as a person
    having checked the line.

A line takes an area only when the pipeline's model scores it at the tool's
relevance mark (RELEVANCE_THRESHOLD, 0.5) and the second model's top area is
the same. Otherwise the line is kept apart until a person decides.

The description of a line comes from the review's own record and carries no
amounts (they do not decide the area and could sway it). The prompt is
project-defined framing, written for budget lines; the areas are the lens's
own source definitions, the same the targets are classified with.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from .classify import RELEVANCE_THRESHOLD, parse_rank_response
from .config import CACHE_DIR
from .llm import call_llm_batch

logger = logging.getLogger(__name__)

PROMPT_VERSION = 1
PIPELINE_NAMESPACE = f"ber_line_area_v{PROMPT_VERSION}"
CLAUDE_NAMESPACE = f"ber_line_area_claude_v{PROMPT_VERSION}"
CLAUDE_MODEL = "claude-opus-5-5"
CLAUDE_EFFORT = "high"
CLAUDE_CONCURRENCY = 8

# Project-defined framing (CLAUDE.md: no LLM-drafted content in pipeline
# inputs; framing is allowed when labelled as project-defined, as here). It
# tells the models how to read a budget line against the lens and introduces
# no policy content of its own. The running-costs sentence follows the
# handover's recommendation for lines that are mostly administration (count
# them under what they administer), which is also where GLOBE itself files
# protected-area administration (expenditure type 7.01.16).
SYSTEM_TEMPLATE = """You place one line of a government budget in a {lens} taxonomy. The line comes from the country's Biodiversity Expenditure Review, which counted it as spending relevant to biodiversity. You are given what the review and the budget say about the line: its name, what it is for, what it pays for and who spends it. You are not given its amounts: the size of a line has no bearing on where it belongs.

# TASK
Score every category for how well it describes what the money of this budget line is spent on, on a 0.0-1.0 scale:
- 1.0 = the line is spent primarily and explicitly on this category
- 0.7-0.9 = a major part of what the line pays for falls in this category
- 0.4-0.6 = the line partly serves this category, as one of several purposes
- 0.1-0.3 = a weak or indirect connection
- 0.0 = no connection (omit the category)

Judge the purpose the money serves, from all the information given, not from words in the name alone. Running costs (wages, offices, administration) belong with the purpose of the body or programme they keep running: the wages of protected-area staff serve protected areas. When the information does not say enough to place the line with confidence, give low scores; an empty list is a correct answer.

For the two highest-scoring categories, give the reason in one short sentence that points to the information it rests on. Do not add facts about the line that you were not given.

# RESPONSE FORMAT
Return ONLY a JSON object, no markdown:
{{"ranked": [{{"id": "<categoryId>", "score": <0.0-1.0>, "reasoning": "<one short sentence>"}}]}}
Order the array from highest score to lowest.

# CATEGORIES
{catalogue}"""


def system_prompt(lens_name: str, categories: Sequence[dict[str, Any]]) -> str:
    """The framing and the lens's full catalogue, in the classifier's own
    format. Every line of a lens shares it, so both models can cache it."""
    catalogue = "\n".join(f"- {c['id']}: {c['name']} -- {c.get('description', '')}" for c in categories)
    return SYSTEM_TEMPLATE.format(lens=lens_name, catalogue=catalogue)


def user_message(description: str) -> str:
    return f"Budget line:\n{description}\n\nScore every category that has any relevance and return JSON."


# ---------------------------------------------------------------------------
# What a line is, in the review's own words (no amounts)
# ---------------------------------------------------------------------------


def _shares(items: Sequence[dict[str, Any]], key: str = "name", limit: int = 5) -> str:
    parts = [f"{i[key]} {round(i['share'] * 100)}%" for i in items[:limit] if i.get(key) and i.get("share", 0) >= 0.01]
    return "; ".join(parts)


def describe_line(country: str, record: dict[str, Any], line: dict[str, Any]) -> str:
    """A budget line as the models see it: the review's and the budget's own
    words, no amounts. Each country's review records different things."""
    rows: list[tuple[str, str]] = [("Name", line["name"])]
    if country == "mongolia":
        if line["kind"] == "programme":
            rows.append(("Kind", f"a programme of Mongolia's national budget (code {line['code']}), part of the environment function"))
        else:
            rows.append(
                (
                    "Kind",
                    f"a purpose code of Mongolia's national budget ({line['code']}), counted wherever it appears in programmes outside the environment function",
                )
            )
        if line.get("description"):
            rows.append((f"What it is for ({line['source'].split(', ')[-1]} of the review's report)", line["description"]))
        complete = [y["year"] for y in record["years"] if y["complete"]]
        if line.get("payments"):
            rows.append((f"What it pays for ({complete[0]}-{complete[-1]})", _shares(line["payments"])))
        latest = next((y for y in reversed(complete) if y in (line.get("bodies") or {})), None)
        if latest:
            bodies = line["bodies"][latest]
            names = [b.get("name") or b["nameMn"] for b in bodies["top"][:6]]
            rows.append((f"Who spends it ({latest})", f"{bodies['count']} spending units, among them " + "; ".join(names)))
    elif country == "panama":
        tags = sorted(set(line.get("tags", {}).values()))
        tag_words = {"Directo": "Directo (direct)", "Indirecto": "Indirecto (indirect)"}
        rows[0] = ("Name (Spanish, as in the budget)", line["name"])
        rows.append(
            (
                "Kind",
                "an activity of Panama's national budget, tagged by the review as "
                + " and ".join(tag_words.get(t, t) for t in tags)
                + " biodiversity spending",
            )
        )
        rows.append(("Programme", f"{line['programmeName']}; subprogramme: {line['subprogramme']}"))
        rows.append(("Institution", line["institution"]))
        rows.append(("Budget", "investment" if line.get("budgetType", "").upper().startswith("INVERSI") else "operating"))
        sector = line.get("sector") or {}
        if sector.get("sector"):
            rows.append(("Sector (the budget's own classification)", " / ".join(s for s in (sector.get("group"), sector.get("account"), sector.get("sector")) if s)))
        if line.get("payments"):
            rows.append(("What it pays for", _shares(line["payments"])))
    elif country == "sri-lanka":
        rows.append(("Kind", f"a project line of Sri Lanka's national budget, counted by the review as {line['tier']} (weight {line['weight']:g})"))
        rows.append(("Ministry", line["ministry"]))
        if line.get("tags"):
            rows.append(("The review's own tags", "; ".join(line["tags"])))
    else:
        raise ValueError(f"No line description for {country}")
    return "\n".join(f"{label}: {text}" for label, text in rows)


# ---------------------------------------------------------------------------
# The two models
# ---------------------------------------------------------------------------


async def place_with_pipeline_model(
    descriptions: dict[str, str], categories: Sequence[dict[str, Any]], lens_name: str
) -> dict[str, list[dict[str, Any]]]:
    """code -> ranked areas from the pipeline's model, cached like every call."""
    system = system_prompt(lens_name, categories)
    codes = list(descriptions)
    calls = [{"system": system, "user": user_message(descriptions[c]), "temperature": 0.0, "max_tokens": 900} for c in codes]
    raw = await call_llm_batch(calls, cache_namespace=PIPELINE_NAMESPACE, desc=f"Budget lines ({lens_name})")
    valid = {c["id"] for c in categories}
    return {code: parse_rank_response(text, valid) for code, text in zip(codes, raw)}


def _claude_schema(categories: Sequence[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "ranked": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "enum": [c["id"] for c in categories]},
                        "score": {"type": "number"},
                        "reasoning": {"type": "string"},
                    },
                    "required": ["id", "score", "reasoning"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["ranked"],
        "additionalProperties": False,
    }


def _claude_cache_path(system: str, user: str) -> Path:
    key = hashlib.sha256(f"{system}\x00{user}\x00{CLAUDE_MODEL}\x00{CLAUDE_EFFORT}".encode()).hexdigest()[:16]
    return CACHE_DIR / CLAUDE_NAMESPACE / f"{key}.json"


async def place_with_claude(
    descriptions: dict[str, str], categories: Sequence[dict[str, Any]], lens_name: str
) -> tuple[dict[str, dict[str, Any]], dict[str, int]]:
    """code -> {ranked, model} from the second model, and the run's usage.

    Structured output keeps the answer valid JSON in the classifier's own
    shape. Server-side fallbacks are on: should Opus 5.5 decline a line, the
    API answers with another Claude model, and the line records which model
    answered. Answers are cached on disk by prompt, so a re-run costs nothing.
    """
    import anthropic  # a dev dependency: only this check needs it

    system = system_prompt(lens_name, categories)
    schema = _claude_schema(categories)
    valid = {c["id"] for c in categories}
    client = anthropic.AsyncAnthropic(max_retries=6)
    gate = asyncio.Semaphore(CLAUDE_CONCURRENCY)
    usage = {"calls": 0, "cached": 0, "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0}

    async def one(code: str) -> tuple[str, dict[str, Any]]:
        user = user_message(descriptions[code])
        path = _claude_cache_path(system, user)
        if path.exists():
            usage["cached"] += 1
            stored = json.loads(path.read_text())
        else:
            async with gate:
                response = await client.beta.messages.create(
                    model=CLAUDE_MODEL,
                    max_tokens=16000,
                    system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                    messages=[{"role": "user", "content": user}],
                    thinking={"type": "adaptive"},
                    output_config={"effort": CLAUDE_EFFORT, "format": {"type": "json_schema", "schema": schema}},
                    betas=["server-side-fallback-2026-07-01"],
                    fallbacks="default",
                )
            usage["calls"] += 1
            usage["input_tokens"] += response.usage.input_tokens or 0
            usage["output_tokens"] += response.usage.output_tokens or 0
            usage["cache_read_tokens"] += getattr(response.usage, "cache_read_input_tokens", 0) or 0
            text = next((b.text for b in response.content if b.type == "text"), "")
            stored = {
                "model": response.model,
                "stop_reason": response.stop_reason,
                "text": text,
                "request_id": getattr(response, "_request_id", None),
            }
            if response.stop_reason != "refusal":
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(stored))
        ranked = parse_rank_response(stored["text"], valid) if stored["stop_reason"] != "refusal" else []
        return code, {"ranked": ranked, "model": stored["model"], "declined": stored["stop_reason"] == "refusal"}

    results = await asyncio.gather(*(one(c) for c in descriptions))
    await client.close()
    return dict(results), usage


# ---------------------------------------------------------------------------
# Combining the readings
# ---------------------------------------------------------------------------


def top(ranked: Sequence[dict[str, Any]]) -> dict[str, Any] | None:
    return ranked[0] if ranked else None


def reading(ranked: Sequence[dict[str, Any]], model: str) -> dict[str, Any]:
    first = top(ranked)
    return {
        "model": model,
        "area": first["id"] if first else None,
        "score": first["score"] if first else 0.0,
        "ranked": list(ranked),
    }


def combine(first: dict[str, Any], second: dict[str, Any] | None) -> dict[str, Any]:
    """The line's area and why: placed only when the pipeline's model reaches
    the relevance mark and the second model's top area is the same."""
    area = first["area"]
    if not area or first["score"] < RELEVANCE_THRESHOLD:
        return {"area": None, "status": "no-clear-area"}
    if second is None:
        return {"area": area, "status": "one-model"}
    if second["area"] != area:
        return {"area": None, "status": "models-differ"}
    return {"area": area, "status": "models-agree"}


def claude_ready() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))
