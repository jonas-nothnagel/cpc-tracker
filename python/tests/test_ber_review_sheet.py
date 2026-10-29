"""The review sheet's import (scripts/ber_review_sheet.py): a person's call is
stored with who made it and when, and a sheet that repeats an earlier call
keeps it as it was."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from ber_review_sheet import kept, line_code, review_tags, sheet_order  # noqa: E402


def test_lines_to_look_at_come_first_largest_money_first():
    rows = [
        ("second-agrees", 500.0, "a"),
        ("no-clear-area", 29.0, "gorgas"),
        ("second-differs", 111.6, "flies"),
        ("no-reading", 1.0, "x"),
        ("second-differs", 49.5, "animal-health"),
    ]
    ordered = [code for _, _, code in sorted(rows, key=lambda r: sheet_order(*r))]
    assert ordered == ["flies", "animal-health", "gorgas", "x", "a"]


def test_the_reviews_own_tags_show_as_the_review_records_them():
    assert review_tags({"tags": ["Core", "PA"]}) == "Core; PA"
    assert review_tags({"tags": {"2016": "Indirecto", "2017": "Indirecto"}}) == "Indirecto"
    assert review_tags({"tags": {"2016": "Directo", "2017": "Indirecto"}}) == "Directo; Indirecto"
    assert review_tags({}) == ""


def test_a_code_the_spreadsheet_turned_into_a_number_reads_as_the_record_keys_it():
    assert line_code("71401") == "71401"
    assert line_code(71401) == "71401"
    assert line_code(71401.0) == "71401"
    assert line_code(" 0-27-1-1-4-3 ") == "0-27-1-1-4-3"


def test_a_repeated_call_keeps_who_made_it_and_when():
    alice = {"call": "accept", "area": "globe_8", "by": "Alice", "at": "2026-10-01"}
    bob = {"call": "accept", "area": "globe_8", "by": "Bob", "at": "2026-10-27"}
    assert kept(alice, bob) is alice


def test_an_accept_filled_in_as_a_change_to_the_same_area_is_the_same_call():
    # build fills an earlier Accept in as a Change once model 1 reads another area.
    alice = {"call": "accept", "area": "globe_8", "by": "Alice", "at": "2026-10-01"}
    again = {"call": "change", "area": "globe_8", "by": "Bob", "at": "2026-10-27"}
    assert kept(alice, again) is alice


def test_a_new_decision_or_note_is_the_importers():
    alice = {"call": "accept", "area": "globe_8", "by": "Alice", "at": "2026-10-01"}
    other = {"call": "change", "area": "globe_7", "by": "Bob", "at": "2026-10-27"}
    noted = {"call": "accept", "area": "globe_8", "by": "Bob", "at": "2026-10-27", "note": "Seen"}
    assert kept(alice, other) is other
    assert kept(alice, noted) is noted
    assert kept(None, other) is other


def test_none_fits_and_an_accept_of_no_area_are_the_same_call():
    earlier = {"call": "accept", "area": None, "by": "Alice", "at": "2026-10-01"}
    again = {"call": "none", "area": None, "by": "Bob", "at": "2026-10-27"}
    assert kept(earlier, again) is earlier


def test_types_are_compared_as_areas_are():
    alice = {"call": "accept", "type": "7.01.12", "by": "Alice", "at": "2026-10-01"}
    same = {"call": "change", "type": "7.01.12", "by": "Bob", "at": "2026-10-27"}
    assert kept(alice, same) is alice
    changed = {"call": "change", "type": "7.01.16", "by": "Bob", "at": "2026-10-27"}
    assert kept(alice, changed) is changed
