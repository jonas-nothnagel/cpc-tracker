"""The approved prompts for the public contracts: the instrument of each contract, and a re-check of
each strong match against the target's own means.

Project-defined prompt text (not from a primary source): drafted by Claude on 30 September 2026,
tested on known cases (the instrument against 96 contracts whose documents were read: 84 agree;
the re-check against 45 known matches), and approved verbatim by Jonas the same day. Change it
only with his review, and give it a new cache namespace when it changes.

Why the instrument: August's comparison of contracts with targets rated contracts in a target's
sector as delivering it even when the target works through another instrument (267 school-food
purchases against a bill on children's meals). The re-check asks whether a contract carries out
or directly prepares what the target commits to.

Re-check v3 (approved by Jonas the same day, replacing v2 before anything was applied): v2 asked
the title to show the target's own measure, and 52% of its 9,865 removals rested on "the title
does not state", stripping valid nature matches (protection of critically endangered wildlife
from species conservation). v3 judges the kind of work and adds "cannot_tell": delivers keeps a
strong match, different_means drops it to related, cannot_tell keeps the earlier verdict for the
human check.
"""

from __future__ import annotations

import json
import re

INSTRUMENT_NAMESPACE = "contract_instrument_v1"
RECHECK_NAMESPACE = "contract_delivers_v3"

INSTRUMENTS = (
    "construction_works",
    "repair_maintenance",
    "equipment_goods",
    "routine_supplies",
    "services",
    "information_training",
    "support_to_households_or_firms",
    "study_plan_design",
    "software_it",
    "other",
)
VERDICTS = ("delivers", "different_means", "cannot_tell")

INSTRUMENT_SYSTEM = """You classify a public procurement contract from Mongolia by its instrument: the kind of spending it is. You see only the contract's title as published (in Mongolian), the buying organisation and the portal's contract type. Choose exactly one category. Decide from what the title states; use "other" when the title does not say what is bought."""

INSTRUMENT_USER = """Contract title: {title}
Buyer: {buyer}
Portal contract type: {ctype}

Categories:
- construction_works: building new structures or infrastructure (buildings, roads, bridges, networks, wells, fences).
- repair_maintenance: repairing, renovating or maintaining existing assets, including spare parts and materials for that.
- equipment_goods: durable goods the buyer keeps and uses (vehicles, machinery, furniture, IT hardware, medical or laboratory equipment).
- routine_supplies: consumables for the buyer's own running (food, fuel, coal for heating, stationery, medicines, reagents, cleaning supplies, uniforms).
- services: services performed for the buyer (transport, cleaning, security, catering, insurance, printing, communications).
- information_training: training, awareness campaigns, media programmes, publications and events for the public.
- support_to_households_or_firms: goods, animals, equipment, services or money the buyer hands on to herders, households, cooperatives or businesses under a programme.
- study_plan_design: studies, assessments, plans, designs, drafts of laws or rules, surveys, technical supervision.
- software_it: software, information systems, databases, websites.
- other: none of the above, or the title does not say.

Answer with JSON only: {{"instrument": "<category>", "clear": true or false}}
"clear" is false when the title leaves the kind of spending uncertain."""

DELIVERS_SYSTEM = """You check whether a public procurement contract carries out a specific national policy target, or only works in the same field. Contract titles are short, so they rarely repeat a target's details: judge the kind of work.

Answer "delivers" when the kind of work the contract buys is the kind of work the target calls for: it builds, repairs, equips, designs, studies, supplies or supports the thing or the people the target names, even if the title does not repeat the target's details. For example, a feasibility study for a new wastewater plant delivers a target to build wastewater treatment, and vehicles for a ranger service deliver a target to strengthen protected-area management.

Answer "different_means" when the contract clearly does something else in the same field. For example, food bought for a hospital's own kitchen does not deliver a law on patients' nutrition, and fuel bought for a ministry's cars does not deliver a target on clean transport. Routine supplies for an organisation's own running rarely deliver a target.

Answer "cannot_tell" when the title is too short or too general to judge.

Judge only from the texts given."""

DELIVERS_USER = """Policy target ({doc}): {target}
Target activities: {activities}

Contract title (Mongolian): {title_mn}
Contract title (English, machine translation): {title_en}
Buyer: {buyer}
Kind of spending: {instrument}

Answer with JSON only: {{"verdict": "delivers" or "different_means" or "cannot_tell", "reason": "<one plain English sentence, no names of people or companies>"}}"""


def _json(raw: str | None) -> dict:
    m = re.search(r"\{.*\}", raw or "", re.S)
    try:
        value = json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def instrument_of(raw: str | None) -> tuple[str, bool]:
    """The instrument and whether the title made it clear; an unknown answer is other and unclear."""
    answer = _json(raw)
    instrument = answer.get("instrument")
    if instrument not in INSTRUMENTS:
        return "other", False
    return instrument, bool(answer.get("clear"))


def verdict_of(raw: str | None) -> tuple[str, str]:
    """The re-check's verdict and its one-sentence reason; an answer outside the three (including
    v2's "related" and "unrelated") is unreadable."""
    answer = _json(raw)
    verdict = answer.get("verdict")
    if verdict not in VERDICTS:
        return "unreadable", ""
    return verdict, str(answer.get("reason") or "")
