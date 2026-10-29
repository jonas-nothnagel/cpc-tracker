"""The area a budget line takes (src/ber_areas.py, combine()): Claude Opus
decides at the relevance mark, the pipeline's model is a second opinion
(the project lead's rule, 29 October 2026). The fixtures are Panama readings
as stored in python/output/panama/ber_areas_globe.json."""

from __future__ import annotations

from src.ber_areas import combine, describe_line


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
