"""The approved prompts for tagging contracts and re-checking strong matches: answers are read safely."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from contract_prompts import INSTRUMENTS, VERDICTS, instrument_of, verdict_of  # noqa: E402


def test_an_instrument_answer_is_read_from_plain_or_fenced_json():
    assert instrument_of('{"instrument": "routine_supplies", "clear": true}') == ("routine_supplies", True)
    assert instrument_of('```json\n{"instrument": "study_plan_design", "clear": false}\n```') == ("study_plan_design", False)


def test_an_unknown_or_broken_instrument_answer_is_other_and_unclear():
    assert instrument_of('{"instrument": "gifts"}') == ("other", False)
    assert instrument_of("") == ("other", False)
    assert instrument_of("not json") == ("other", False)


def test_a_verdict_is_read_with_its_reason():
    assert verdict_of('{"verdict": "related", "reason": "Food for a school kitchen, not a law."}') == (
        "related",
        "Food for a school kitchen, not a law.",
    )


def test_an_unreadable_verdict_keeps_nothing():
    assert verdict_of('{"verdict": "maybe"}') == ("unreadable", "")
    assert verdict_of("") == ("unreadable", "")


def test_the_categories_are_the_approved_ones():
    assert INSTRUMENTS == (
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
    assert VERDICTS == ("delivers", "related", "unrelated")
