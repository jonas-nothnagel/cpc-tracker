"""Country X's illustrative actions and spending: names replaced, none left behind."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# The build lives in python/scripts (not a package); put it on the path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from build_countryx_layers import (  # noqa: E402
    DATA,
    OUTPUT,
    SOURCE_ADAPTATION,
    SOURCE_BER,
    SOURCE_BTR,
    SOURCE_TARGETS,
    build_adaptation,
    build_ber,
    build_btr,
    build_food_security,
    leaks,
    mask,
    with_food_security,
)
from contract_wording import BANNED  # noqa: E402
from place_names import place_names  # noqa: E402


def test_names_become_generic_terms_and_sentences_keep_their_capital():
    assert mask("Mongolia is shifting coal export.") == "The country is shifting coal export."
    assert mask("in line with Mongolia’s 30% target") == "in line with the country’s 30% target"
    assert mask("Insulate buildings in Ulaanbaatar city") == "Insulate buildings in the capital city"
    assert mask("heating in 10 aimag centers and each soum") == "heating in 10 provincial centers and each district"
    assert mask("NEMA conducts regular training") == "The national emergency management agency conducts regular training"


def test_dashes_follow_the_house_style():
    assert mask("environmental governance — legal framework") == "environmental governance: legal framework"
    assert mask("fly ash—a byproduct—into cement") == "fly ash, a byproduct, into cement"


def test_the_scan_catches_names_in_any_case_and_acronyms_as_written():
    assert leaks("near the mongolian border") == ["mongolian"]
    assert leaks("MET and MOFALI report") == ["MET", "MOFALI"]
    assert leaks("Targets met on time; a stream of light industry jobs") == []


def test_the_scan_sees_names_inside_compounds_and_after_escapes():
    assert leaks("the China-Mongolia-Russia economic corridor") == ["China", "Mongolia", "Russia"]
    assert leaks("a UB-based office; fees of 5,000₮ per hectare") == ["UB", "₮"]
    # A payload is scanned string by string, so a name after a newline, or
    # one the pipeline wrote as a \u escape, is still found.
    assert leaks({"t": "First line\nKenya plan"}) == ["Kenya"]
    written = json.dumps([{"description": "as in the “Kenya” plan and Panamá"}], indent=2)
    assert leaks(json.loads(written)) == ["Kenya", "Panamá"]


def test_any_real_country_capital_people_or_currency_is_found():
    assert place_names("Mangroves along the Mekong, as in Cambodia's plan") == ["Mekong", "Cambodia"]
    assert place_names("Kenyan herders paid in shillings near Nairobi") == ["Kenyan", "shillings", "Nairobi"]
    assert place_names("Caritas Czech Republic and the Ivory Coast office") == ["Czech Republic", "Ivory Coast"]


def test_treaty_names_and_plain_words_are_not_places():
    assert place_names("In line with the Paris Agreement and the Kunming-Montreal Global Biodiversity Framework") == []
    assert place_names("Sendai Framework targets; Ramsar sites; Euro-5 fuel; US$12 million") == []
    assert place_names("the UAE Framework for Global Climate Resilience") == []
    assert place_names("roast turkey, a chad of paper, guinea fowl, the china cabinet") == []
    assert place_names("the Paris agreement, the Aichi targets, at COP 16, GHS labels") == []
    assert place_names("cardamom exports, polish the surface, Paris-aligned finance") == []
    # The same words as places are still found.
    places = place_names("a meeting in Paris, Polish farmers, the Cardamom Mountains")
    assert places == ["Paris", "Polish", "Cardamom"]
    places = place_names("talks in Sharm el-Sheikh and in Victoria")
    assert places == ["Sharm el-Sheikh", "Victoria"]


def test_every_record_survives_the_build_without_a_name():
    btr = build_btr(json.loads(SOURCE_BTR.read_text()))
    adaptation = build_adaptation(json.loads(SOURCE_ADAPTATION.read_text()))
    assert len(btr["mitigationMeasures"]) == 15
    assert len(adaptation["actions"]) == 24
    assert leaks(btr) == [] and leaks(adaptation) == []
    # The dashboard's BtrData shape: the report's other tables, empty.
    tables = {
        "progressIndicators", "projections", "technologySupport",
        "capacityBuilding", "supportProjects",
    }
    assert tables <= btr.keys()
    assert btr["sectorEmissions"] == {"bySector": []}
    # Unconfirmed acronyms are left out, never guessed.
    orgs = {o for a in adaptation["actions"] for o in a["responsibleOrgs"]}
    assert not orgs & {"MON", "MOES"}


def test_the_food_security_programme_joins_after_the_five_plans_in_its_own_words():
    source = json.loads(SOURCE_TARGETS.read_text())
    food = build_food_security(source)
    assert len(food) == 41 and food[0]["id"] == "FSP_1" and food[0]["sourceDocument"] == "FSP"
    assert all(t["country"] == "Country X" and "textOriginal" not in t for t in food)
    assert "submit the draft law to Parliament" in food[0]["text"]
    assert leaks(food) == []
    # Every word but the replaced names is the source's own.
    original = {t["id"].split("_")[1]: t["text"] for t in source if t["sourceDocument"] == "FSS"}
    unchanged = [t for t in food if t["text"] == original[t["id"].split("_")[1]]]
    assert len(unchanged) >= 35
    corpus = [{"id": "NDC_1", "sourceDocument": "NDC"}, {"id": "FSP_1", "sourceDocument": "FSP"}]
    assert [t["id"] for t in with_food_security(corpus, food[:2])] == ["NDC_1", "FSP_1", "FSP_2"]


def test_spending_keeps_the_two_complete_years_in_us_dollars():
    ber = build_ber(json.loads(SOURCE_BER.read_text()))
    assert ber["currency"] == "US$" and ber["unit"] == "million"
    assert ber["period"] == {"start": 2020, "end": 2021}
    # Lines with no spending in those years are dropped; codes are renumbered.
    assert [p["code"] for p in ber["programs"]][:2] == ["P01", "P02"]
    assert all(any(v for v in e["values"].values()) for e in ber["expenditure"])
    total_2020 = sum(e["values"]["2020"] or 0 for e in ber["expenditure"])
    # 209.6 bn MNT at 3,450 MNT per US$, within rounding.
    assert abs(total_2020 - 60.8) < 0.1
    # Out of all public spending in the same years: 1.51% in 2020.
    assert round(total_2020 / ber["scope"]["publicSpending"]["2020"] * 100, 2) == 1.51
    assert ber["scope"]["illustrative"] is True


def test_no_country_x_file_names_any_real_country():
    files = sorted(DATA.glob("countryx-*.json")) + sorted((OUTPUT / "countryx").glob("*.json"))
    assert files
    # Parsed, not raw: the pipeline writes non-ASCII as \u escapes.
    found = {f.name: leaks(json.loads(f.read_text())) for f in files}
    assert {name: words for name, words in found.items() if words} == {}


def test_no_country_x_explanation_uses_a_retired_term():
    banned = re.compile(BANNED)
    for name in ("alignment.json", "measure_alignment.json", "budget_alignment.json"):
        rows = json.loads((OUTPUT / "countryx" / name).read_text())
        assert [r for r in rows if banned.search(r.get("description") or "")] == [], name
