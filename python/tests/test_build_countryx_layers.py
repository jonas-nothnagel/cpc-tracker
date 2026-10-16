"""Country X's illustrative actions and spending: names replaced, none left behind."""

from __future__ import annotations

import json
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
    build_adaptation,
    build_ber,
    build_btr,
    leaks,
    mask,
)


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


def test_every_record_survives_the_build_without_a_name():
    btr = build_btr(json.loads(SOURCE_BTR.read_text()))
    adaptation = build_adaptation(json.loads(SOURCE_ADAPTATION.read_text()))
    assert len(btr["mitigationMeasures"]) == 15
    assert len(adaptation["actions"]) == 24
    assert leaks(btr) == [] and leaks(adaptation) == []
    # Unconfirmed acronyms are left out, never guessed.
    orgs = {o for a in adaptation["actions"] for o in a["responsibleOrgs"]}
    assert not orgs & {"MON", "MOES"}


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


def test_no_country_x_file_names_the_source_country():
    files = sorted(DATA.glob("countryx-*.json")) + sorted((OUTPUT / "countryx").glob("*.json"))
    assert files
    found = {f.name: leaks(f.read_text()) for f in files}
    assert {name: words for name, words in found.items() if words} == {}
