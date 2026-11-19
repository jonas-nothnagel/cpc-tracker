"""The area a budget line takes (src/ber_areas.py, combine()): Claude Opus
decides at the relevance mark, the pipeline's model is a second opinion
(the project lead's rule, 29 October 2026). The fixtures are Panama readings
as stored in python/output/panama/ber_areas_globe.json."""

from __future__ import annotations

import hashlib
import json

import pytest

from src.ber_areas import (
    BER_LENSES,
    SYSTEM_TEMPLATE,
    combine,
    describe_line,
    lens_categories,
    system_prompt,
)
from src.config import DATA_DIR

GLOBE_NAME = "GLOBE (BIOFIN's Global Biodiversity Expenditure taxonomy)"


def reading(area: str | None, score: float) -> dict:
    return {"model": "m", "area": area, "score": score, "ranked": [{"id": area, "score": score, "reasoning": "r"}] if area else []}


def test_opus_decides_when_the_pipeline_model_reads_another_area():
    # Equipamiento Planta Productora de Moscas Esteriles: GPT Sustainable use 0.3, Opus Biosafety 0.5.
    assert combine(reading("globe_9", 0.3), reading("globe_3", 0.5)) == {"area": "globe_3", "status": "second-differs"}


def test_a_second_opinion_below_the_mark_does_not_hold_a_line_back():
    # Sanidad Animal: both Sustainable use, GPT 0.3, Opus 0.5. No averaging.
    assert combine(reading("globe_9", 0.3), reading("globe_9", 0.5)) == {"area": "globe_9", "status": "second-differs"}


def test_both_at_the_mark_on_one_area_agree():
    assert combine(reading("globe_7", 0.8), reading("globe_7", 0.9)) == {"area": "globe_7", "status": "second-agrees"}


def test_opus_below_the_mark_leaves_no_specific_area_whatever_the_second_opinion():
    # Conservacion de las Areas Verdes de los Aeropuertos: GPT Green economy 0.6, Opus 0.3.
    assert combine(reading("globe_4", 0.6), reading("globe_4", 0.3)) == {"area": None, "status": "no-clear-area"}
    assert combine(reading("globe_5", 0.9), reading(None, 0.0)) == {"area": None, "status": "no-clear-area"}


def test_without_an_opus_reading_the_pipeline_model_never_places_a_line():
    assert combine(reading("globe_7", 0.9), None) == {"area": None, "status": "no-reading"}
    declined = reading(None, 0.0) | {"declined": True}
    assert combine(reading("globe_7", 0.9), declined) == {"area": None, "status": "no-reading"}


PANAMA_LINE = {
    "code": "0-10-1-3-1-6",
    "kind": "activity",
    "name": "Equipamiento Planta Productora de Moscas Estériles",
    "institution": "Ministerio de Desarrollo Agropecuario",
    "programmeName": "Sanidad Agropecuaria",
    "subprogramme": "FORTALEC. DE LA SANIDAD AGROPECUARIA",
    "budgetType": "INVERSION",
    "sector": {"group": "DESARROLLO Y FOMENTO DE LA PRODUCCIÓN", "account": "AGROPECUARIO", "sector": "Desarrollo Ganadero"},
    "tags": {"2016": "Indirecto"},
    "payments": [],
    "reviewDescription": {"en": "Infrastructure, equipment, habilitation or maintenance line.", "es": "Línea de infraestructura."},
}


def test_the_review_teams_description_is_read_only_when_asked():
    plain = describe_line("panama", {}, PANAMA_LINE)
    assert "review team's description" not in plain
    described = describe_line("panama", {}, PANAMA_LINE, review_description=True)
    assert "What it is for (the review team's description): Infrastructure, equipment, habilitation or maintenance line." in described
    # The row sits after the review's tag and before the budget's own fields.
    assert described.index("Kind:") < described.index("What it is for") < described.index("Programme:")


# ---------------------------------------------------------------------------
# The lenses a line is placed in (18 November 2026: the two climate lenses)
# ---------------------------------------------------------------------------


def test_the_approved_framing_stays_word_for_word():
    # SYSTEM_TEMPLATE as approved on 23 October 2026.
    digest = hashlib.sha256(SYSTEM_TEMPLATE.encode()).hexdigest()
    assert digest == "eaa14fa3e6b83b231abd16bcef05aa6c04c692b9264317d8eb9d2ad64036eeec"


def test_globe_reads_as_it_did_so_its_answers_stay_cached():
    prompt = system_prompt(BER_LENSES["globe"]["name"], lens_categories("globe", "panama"))
    assert BER_LENSES["globe"]["name"] == GLOBE_NAME
    digest = hashlib.sha256(prompt.encode()).hexdigest()
    assert digest == "3fbeaaf6bd8334ce43cb1acf65de83717a3b39ebd415680567f823261eaaa0b7"


def test_each_lens_reads_its_own_catalogue_for_the_countries_it_serves():
    ids = lambda lens, country: [c["id"] for c in lens_categories(lens, country)]  # noqa: E731
    assert ids("sector", "mongolia")[:2] == ["sector_energy", "sector_transport"]
    assert len(lens_categories("sector", "sri-lanka")) == 7
    assert [c["id"] for c in lens_categories("gga", "panama")][0] == "gga_water"
    assert ids("adaptation", "sri-lanka")[:2] == ["lk_agriculture_food", "lk_livestock"]
    assert BER_LENSES["sector"]["countries"] == ("mongolia", "panama", "sri-lanka")
    assert BER_LENSES["gga"]["countries"] == ("mongolia", "panama")
    assert BER_LENSES["adaptation"]["countries"] == ("sri-lanka",)
    # Sri Lanka's own adaptation lens replaces the GGA there.
    with pytest.raises(ValueError):
        lens_categories("gga", "sri-lanka")
    with pytest.raises(ValueError):
        lens_categories("adaptation", "panama")


def test_every_lens_name_reads_in_the_framing_and_traces_to_its_source():
    sources = json.loads((DATA_DIR / "categories.json").read_text())["_sources"]
    own = json.loads((DATA_DIR / "sri-lanka-taxonomies.json").read_text())["taxonomies"]
    sri_lanka = next(t for t in own if t["taxonomyType"] == "adaptation")
    traced = {
        "sector": ("IPCC 2006 Guidelines for National GHG Inventories", sources["ipcc_sectors"]),
        "gga": ("UAE Framework for Global Climate Resilience", sources["gga_categories"]),
        "adaptation": (
            "Sri Lanka's adaptation sectors, as set by the UNDP country office",
            sri_lanka["tooltip"],
        ),
    }
    for lens, (words, source) in traced.items():
        name = BER_LENSES[lens]["name"]
        assert words in name and words in source
        # "in a {lens} taxonomy": the project's own lens name leads, so the article reads.
        assert name.startswith("climate ")
        spec = BER_LENSES[lens]
        prompt = system_prompt(name, lens_categories(lens, spec["countries"][0]))
        assert prompt.startswith(f"You place one line of a government budget in a {name} taxonomy.")
