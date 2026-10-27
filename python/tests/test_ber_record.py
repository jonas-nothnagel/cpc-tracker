"""The committed spending records reproduce what each review published.

Step 1 of the BER plan: a country's reviewed spending is shown only when the
record reproduces the review's own totals. The adapters refuse to write when
a figure is missed; these tests read the committed files, so a hand edit or a
stale file cannot slip through either. The published figures below are typed
in from the sources, not read from the records.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from src.ber_record import (  # noqa: E402
    Check,
    ReconciliationError,
    berdata_view,
    checks_json,
    require_reproduced,
)
from src.config import DATA_DIR  # noqa: E402

# Mongolia: BER_1112.xlsx, sheet Хөтөлбөр, row 29 (billion MNT); the report's
# Table 9 prints them rounded (210, 229, 121, 112, 216).
MONGOLIA = {"2020": 209.63855528, "2021": 229.19013638, "2022": 121.22982063, "2023": 112.12927362, "2024": 216.14449806}
# Panama: BIOFIN's headline, Tablas_adicionales, sheet Gasto total en BD (million PAB).
PANAMA = {
    "2016": 100.32615775, "2017": 97.88953128, "2018": 89.31960123, "2019": 87.67056822, "2020": 78.32848763,
    "2021": 83.97190143, "2022": 97.102279, "2023": 105.91925151, "2024": 95.92058055,
}
# Sri Lanka: BER 2015-2024 Dataset, sheet All Central Govt, row 6 (million LKR).
SRI_LANKA = {
    "2015": 6198.793, "2016": 6804.278, "2017": 6737.134, "2018": 6691.330, "2019": 7140.541,
    "2020": 6518.918, "2021": 8456.221, "2022": 7112.446, "2023": 7821.380, "2024": 9346.441,
}
PUBLISHED = {"mongolia": (MONGOLIA, 1e-6), "panama": (PANAMA, 1e-6), "sri-lanka": (SRI_LANKA, 1e-3)}


def load(country: str) -> dict:
    return json.loads((DATA_DIR / f"{country}-ber.json").read_text())


def counted(line: dict, year: str) -> float:
    return sum((cell or {}).get("counted", 0.0) for cell in (line["amounts"].get(year) or {}).values())


@pytest.mark.parametrize("country", sorted(PUBLISHED))
def test_every_published_total_is_reproduced(country):
    record = load(country)["record"]
    assert record["checks"], "a record without checks"
    assert all(c["ok"] for c in record["checks"]), [c for c in record["checks"] if not c["ok"]]


@pytest.mark.parametrize("country", sorted(PUBLISHED))
def test_year_totals_match_the_source(country):
    published, tolerance = PUBLISHED[country]
    record = load(country)["record"]
    totals = {y["year"]: sum(y["reviewed"].values()) for y in record["years"]}
    assert set(totals) == set(published)
    for year, value in published.items():
        assert totals[year] == pytest.approx(value, abs=tolerance), year


@pytest.mark.parametrize("country", sorted(PUBLISHED))
def test_lines_add_up_to_each_year_and_level(country):
    record = load(country)["record"]
    # Sri Lanka's project lines are a second view of the institutions' money,
    # never added to them: the year totals are the institutions'.
    lines = [l for l in record["lines"] if l["kind"] != "project"]
    for year in record["years"]:
        for level, reviewed in year["reviewed"].items():
            got = sum(((l["amounts"].get(year["year"]) or {}).get(level) or {}).get("counted", 0.0) for l in lines)
            assert got == pytest.approx(reviewed, abs=1e-6), (year["year"], level)


@pytest.mark.parametrize("country", sorted(PUBLISHED))
def test_the_pipeline_view_holds_complete_years_only(country):
    payload = load(country)
    record = payload["record"]
    complete = [y["year"] for y in record["years"] if y["complete"]]
    period = payload["period"]
    assert [str(y) for y in range(period["start"], period["end"] + 1)] == complete
    by_code = {l["code"]: l for l in record["lines"]}
    assert [p["code"] for p in payload["programs"]] == [e["code"] for e in payload["expenditure"]]
    for entry in payload["expenditure"]:
        assert set(entry["values"]) == set(complete)
        for year, value in entry["values"].items():
            assert value == pytest.approx(counted(by_code[entry["code"]], year), abs=1e-6)


def test_mongolia_keeps_its_budget_levels_apart():
    record = load("mongolia")["record"]
    coverage = {y["year"]: (y["levels"], y["complete"]) for y in record["years"]}
    assert coverage == {
        "2020": (["central", "local"], True),
        "2021": (["central", "local"], True),
        "2022": (["local"], False),
        "2023": (["central"], False),
        "2024": (["local"], False),
    }
    # A level the year's sheet does not hold is "not in the data" (null), never zero.
    for line in record["lines"]:
        assert line["amounts"]["2022"]["central"] is None
        assert line["amounts"]["2023"]["local"] is None
        assert line["amounts"]["2024"]["central"] is None


def test_mongolia_drops_the_mislabelled_programme_headline():
    payload = load("mongolia")
    # 1,245.5 of 1,825.7 billion was the review's own 2016-2024 total, not
    # National Biodiversity Program execution.
    assert "keyFindings" not in payload
    assert len(payload["programs"]) == 28
    kinds = [l["kind"] for l in payload["record"]["lines"]]
    assert kinds.count("programme") == 13 and kinds.count("purpose") == 15


def test_mongolia_names_and_descriptions_are_the_reports_own():
    lines = {l["code"]: l for l in load("mongolia")["record"]["lines"]}
    assert lines["71405"]["name"] == "Security of protected areas"
    assert lines["71405"]["source"].endswith("Table 1")
    assert lines["71405"]["description"].startswith("Includes recurrent and capital expenditures")
    assert lines["81707"]["source"].endswith("Table 2")


def test_panama_matches_the_review_to_the_cent_and_keeps_2015_out():
    payload = load("panama")
    record = payload["record"]
    assert [y["year"] for y in record["years"]][0] == "2016"
    assert sum(y["reviewed"]["all"] for y in record["years"]) == pytest.approx(880.50267061 - 44.05431201, abs=1e-6)
    # Saneamiento is the review's special case: kept apart, never in the lines.
    assert all("special" in y for y in record["years"])
    assert all(l["kind"] == "activity" for l in record["lines"])


def test_sri_lanka_keeps_institutions_and_projects_apart():
    payload = load("sri-lanka")
    record = payload["record"]
    kinds = [l["kind"] for l in record["lines"]]
    assert kinds.count("project") == 106
    # The pipeline view (the lines placed in policy areas) holds the projects only.
    assert len(payload["programs"]) == 106
    projects_total = sum(y["projects"] for y in record["years"])
    assert projects_total == pytest.approx(32268.7, abs=0.05)
    assert sum(y["reviewed"]["all"] for y in record["years"]) == pytest.approx(72827.48, abs=0.01)


# --- The helpers --------------------------------------------------------------


def test_a_missed_total_stops_the_build():
    good = Check("2021, all lines", "sheet", 229.19, 229.19 + 1e-9, 1e-6)
    bad = Check("2022, all lines", "sheet", 121.23, 121.0, 1e-6)
    require_reproduced([good])
    with pytest.raises(ReconciliationError, match="2022, all lines"):
        require_reproduced([good, bad])


def test_cell_checks_are_kept_as_one_line_per_rule():
    checks = [
        Check("2020", "sheet", 1.0, 1.0, 1e-6),
        Check("a", "sheet X, row 4", 2.0, 2.0000001, 1e-6, rule="weighted = gross x weight"),
        Check("b", "sheet X, row 5", 3.0, 3.0, 1e-6, rule="weighted = gross x weight"),
    ]
    out = checks_json(checks)
    assert len(out) == 2
    summary = out[1]
    assert summary["cells"] == 2 and summary["ok"] is True
    assert summary["source"] == "sheet X"
    assert summary["largestDifference"] == pytest.approx(1e-7)


def test_berdata_view_sums_levels_for_complete_years():
    lines = [
        {"code": "A", "name": "A", "amounts": {"2020": {"central": {"counted": 1.5}, "local": {"counted": 2.0}}, "2022": {"central": None, "local": {"counted": 9.0}}}},
    ]
    programs, expenditure = berdata_view(lines, ["2020"], type_of={"A": "environmental"})
    assert programs == [{"code": "A", "name": "A", "description": "", "type": "environmental"}]
    assert expenditure == [{"code": "A", "name": "A", "values": {"2020": 3.5}}]


def test_sumifs_criteria_behave_as_in_excel():
    from build_ber_mongolia import equals, excel_text, not_714

    assert excel_text(71405.0) == "71405"
    assert equals(71405, "71405") and equals("71405 Тусгай", "71405 тусгай")
    # "<>714*": text starting 714 fails; a number never matches a text wildcard.
    assert not not_714("714 Хүрээлэн буй орчин")
    assert not_714("723 Ангилагдаагүй бусад")
    assert not_714(71403)


def test_report_tables_read_each_figure_at_its_own_precision():
    from build_ber_mongolia import published_table

    rows = [
        ["Environmental program name", "2020", "2021", "2022", "2023", "2024"],
        ["71408 Meteorology", "30.4", "30.1", "-", "47", "-"],
        ["71412 R&D Environment", "0.1", "0.0", "-"],  # trailing dashes merged into one cell
        ["Total environmental expenditure", "210", "229", "121", "112", "216"],
    ]
    table = published_table(rows, ["71408", "71412"])
    assert table[("71408", "2020")] == (30.4, pytest.approx(0.05 + 1e-9))
    assert table[("71408", "2023")] == (47.0, pytest.approx(0.5 + 1e-9))
    assert table[("71408", "2022")][0] == 0.0
    assert ("71412", "2020") not in table  # a short row is not read against the wrong years
    assert table[("total", "2024")] == (216.0, pytest.approx(0.5 + 1e-9))
