"""The review sheet's import (scripts/ber_review_sheet.py): a person's call is
stored with who made it and when, and a sheet that repeats an earlier call
keeps it as it was."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

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


def test_area_names_follow_the_lens_and_the_country():
    from ber_review_sheet import area_names, default_out

    assert area_names("globe", "panama")["globe_1"] == "Access and benefit sharing"
    assert area_names("sector", "sri-lanka")["sector_energy"] == "Energy"
    assert area_names("gga", "mongolia")["gga_water"] == "Water"
    assert area_names("adaptation", "sri-lanka")["lk_livestock"] == "Livestock"
    # One workbook per lens.
    assert default_out("globe").name == "BER review sheet - GLOBE.xlsx"
    assert default_out("sector").name == "BER review sheet - climate mitigation.xlsx"


# ---------------------------------------------------------------------------
# One workbook per lens: a sheet's calls go to the lens it was built for
# ---------------------------------------------------------------------------


def _filled_sheet(path: Path, model1_area: str, call: str = "Accept") -> None:
    """A Mongolia sheet with one called row, as a reviewer sends it back."""
    import ber_review_sheet as sheet
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Mongolia"
    ws.append([c for c, _ in sheet.COLUMNS])
    agrees = sheet.STATUS_WORDS["second-agrees"]
    shown = ["71405", "Security of protected areas", "", "", 10.45, 4.1, "2020-2021"]
    ws.append([*shown, model1_area, 0.9, "r", model1_area, "r", agrees, call, "", ""])
    wb.save(path)


def test_a_workbook_is_imported_under_the_lens_it_was_built_for():
    from ber_review_sheet import mark_lens, sheet_lens
    from openpyxl import Workbook

    built = Workbook()
    mark_lens(built, "sector")
    assert sheet_lens(built, None) == "sector"
    assert sheet_lens(built, "sector") == "sector"
    with pytest.raises(SystemExit):
        sheet_lens(built, "globe")
    # A workbook built before its lens was recorded: GLOBE's, as then.
    earlier = Workbook()
    assert sheet_lens(earlier, None) == "globe"
    assert sheet_lens(earlier, "gga") == "gga"


def test_a_sheet_of_another_lens_stops_the_import_before_anything_is_written(tmp_path, monkeypatch):
    import ber_review_sheet as sheet

    monkeypatch.setattr(sheet, "calls_path", lambda country: tmp_path / f"{country}-ber-areas.json")
    monkeypatch.setattr(sheet, "read_type_calls", lambda wb, by: [])
    path = tmp_path / "sheet.xlsx"
    # A climate mitigation sheet read as GLOBE's: its areas are not GLOBE's.
    _filled_sheet(path, "Land use, land-use change and forestry (LULUCF)", call="None fits")
    with pytest.raises(SystemExit):
        sheet.import_calls(path, "globe", "A reviewer")
    assert not (tmp_path / "mongolia-ber-areas.json").exists()


def test_a_sheet_of_the_lens_named_imports_its_calls_under_that_lens(tmp_path, monkeypatch):
    import ber_review_sheet as sheet

    monkeypatch.setattr(sheet, "calls_path", lambda country: tmp_path / f"{country}-ber-areas.json")
    monkeypatch.setattr(sheet, "read_type_calls", lambda wb, by: [])
    path = tmp_path / "sheet.xlsx"
    lulucf = sheet.area_names("sector", "mongolia")
    name = next(v for v in lulucf.values() if "LULUCF" in v)
    _filled_sheet(path, name)
    sheet.import_calls(path, "sector", "A reviewer")
    stored = json.loads((tmp_path / "mongolia-ber-areas.json").read_text())
    assert list(stored) == ["_provenance", "sector"]
    assert stored["sector"]["71405"]["call"] == "accept"
    assert stored["sector"]["71405"]["area"] == next(k for k, v in lulucf.items() if v == name)


def test_a_bad_row_on_a_type_sheet_stops_the_import_before_any_file_is_written(
    tmp_path, monkeypatch
):
    import ber_review_sheet as sheet
    from openpyxl import load_workbook

    monkeypatch.setattr(sheet, "calls_path", lambda country: tmp_path / f"{country}-ber-areas.json")
    monkeypatch.setattr(
        sheet, "type_calls_path", lambda country: tmp_path / f"{country}-ber-types.json"
    )
    path = tmp_path / "sheet.xlsx"
    # A good call on the areas sheet, an unknown one on the type sheet.
    _filled_sheet(path, next(iter(sheet.area_names("globe", "mongolia").values())))
    wb = load_workbook(path)
    types = wb.create_sheet(sheet.type_sheet_title("Mongolia"))
    types.append([c for c, _ in sheet.TYPE_COLUMNS])
    row = [""] * max(15, len(sheet.TYPE_COLUMNS))
    row[0], row[12] = "71405", "Maybe"
    types.append(row)
    wb.save(path)
    with pytest.raises(SystemExit, match="unknown call"):
        sheet.import_calls(path, "globe", "A reviewer")
    assert list(tmp_path.glob("*.json")) == []


def test_a_lens_that_does_not_serve_the_country_builds_no_workbook(tmp_path, monkeypatch):
    import ber_review_sheet as sheet

    out = tmp_path / "gga.xlsx"
    argv = ["ber_review_sheet.py", "build", "--lens", "gga", "--country", "sri-lanka"]
    monkeypatch.setattr(sys, "argv", [*argv, "--out", str(out)])
    with pytest.raises(SystemExit, match="serves"):
        sheet.main()
    assert not out.exists()


def test_the_guide_of_a_climate_workbook_says_a_line_has_no_area_of_its_lens(tmp_path):
    import ber_review_sheet as sheet
    from openpyxl import load_workbook

    out = tmp_path / "sector.xlsx"
    sheet.build("sector", out, ("mongolia",), types=False)
    rows = load_workbook(out)["How to use"].iter_rows(values_only=True)
    guide = " ".join(str(r[0]) for r in rows if r[0])
    assert "has no area of the climate mitigation lens" in guide
    assert "general biodiversity spending" not in guide
