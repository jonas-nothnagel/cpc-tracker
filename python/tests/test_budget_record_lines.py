"""The budget lines step 7 compares with the targets, from a review's record
(step 3 of the BER plan): the lines the review decided on that hold reviewed
spending, read by the models without amounts."""

import re

from src.budget_align import (
    BUDGET_CACHE_NAMESPACE,
    BUDGET_INTRO_FRAMING,
    budget_items,
    budget_meta,
    programs_to_pseudo_targets,
    record_lines_to_pseudo_targets,
)


def _cells(**by_level):
    return {level: {"counted": value} for level, value in by_level.items()}


MONGOLIA = {
    "years": [
        {"year": "2020", "complete": True},
        {"year": "2021", "complete": True},
        {"year": "2022", "complete": False},
    ],
    "lines": [
        {
            "code": "71405",
            "kind": "programme",
            "name": "Security of protected areas",
            "description": "Protection regimes for protected areas.",
            "source": "BER [ENG] v1.2.docx, Table 1",
            "payments": [{"name": "Wages", "share": 0.61}],
            "amounts": {"2020": _cells(central=10.45), "2021": _cells(central=11.31, local=0.52)},
        },
        {
            "code": "82207",
            "kind": "purpose",
            "name": "A purpose code with nothing counted",
            "source": "BER [ENG] v1.2.docx, Table 2",
            "amounts": {"2020": _cells(central=0.0)},
        },
        {
            "code": "71499",
            "kind": "purpose",
            "name": "Spent in 2022 only",
            "source": "BER [ENG] v1.2.docx, Table 2",
            "amounts": {"2022": _cells(local=3.2)},
        },
    ],
}


def test_record_lines_hold_reviewed_spending_only():
    pseudo = record_lines_to_pseudo_targets("mongolia", MONGOLIA)
    assert [p["id"] for p in pseudo] == ["BER_71405", "BER_71499"]
    first = pseudo[0]
    assert first["sourceDocument"] == "BER"
    assert first["sourceLabel"] == "71405 Security of protected areas"
    assert first["text"] == "Protection regimes for protected areas."
    assert first["expenditure"] == {"2020": 10.45, "2021": 11.31 + 0.52, "2022": None}


def test_models_read_the_line_without_amounts():
    for p in record_lines_to_pseudo_targets("mongolia", MONGOLIA):
        assert p["analysisText"].startswith("Name: ")
        assert not re.search(r"10\.45|11\.31|0\.52|3\.2\b", p["analysisText"])


def test_panama_and_sri_lanka_lines_read_where_they_sit():
    panama = {
        "years": [{"year": "2016", "complete": True}],
        "lines": [
            {
                "code": "0-10-1-3-1-6",
                "kind": "activity",
                "name": "Equipamiento Planta Productora de Moscas Estériles",
                "description": "",
                "institution": "Ministerio de Desarrollo Agropecuario",
                "programmeName": "Sanidad Agropecuaria",
                "subprogramme": "FORTALEC. DE LA SANIDAD AGROPECUARIA",
                "budgetType": "INVERSION",
                "sector": {},
                "tags": {"2016": "Indirecto"},
                "amounts": {"2016": _cells(all=1.25)},
            }
        ],
    }
    [line] = record_lines_to_pseudo_targets("panama", panama)
    assert line["text"] == "Sanidad Agropecuaria · Ministerio de Desarrollo Agropecuario"
    assert "Indirecto (indirect)" in line["analysisText"]

    sri_lanka = {
        "years": [{"year": "2015", "complete": True}],
        "lines": [
            {"code": "INS1", "kind": "institution", "name": "A ministry", "amounts": {"2015": _cells(all=9.0)}},
            {
                "code": "P071",
                "kind": "project",
                "name": "Ecosystem Conservation & Management Project",
                "description": "",
                "ministry": "Ministry of Environment",
                "tags": ["Protected areas"],
                "tier": "Principal",
                "weight": 1.0,
                "amounts": {"2015": _cells(all=2.5)},
            },
        ],
    }
    [project] = record_lines_to_pseudo_targets("sri-lanka", sri_lanka)
    assert project["id"] == "BER_P071"
    assert project["text"] == "Ministry of Environment · Protected areas"


def test_budget_items_basis():
    pseudo, basis = budget_items("mongolia", {"record": MONGOLIA, "programs": [{"code": "x", "name": "y"}]})
    assert basis == "ber-record" and len(pseudo) == 2
    legacy, none = budget_items(
        "countryx",
        {"programs": [{"code": "P1", "name": "Forests", "description": "Forest care"}], "expenditure": [{"code": "P1", "values": {"2020": 4.0}}]},
    )
    assert none is None
    assert legacy[0]["text"].endswith("Total: 4.0.")
    # The earlier file's programmes are read without amounts too.
    assert legacy[0]["analysisText"] == "Forests. Forest care"


def test_meta_marks_the_basis():
    meta = budget_meta("ber-record", "gpt-5.4", 15, 178, 2670)
    assert meta["basis"] == "ber-record"
    assert meta["cacheNamespace"] == BUDGET_CACHE_NAMESPACE
    assert meta["framing"] == BUDGET_INTRO_FRAMING.strip()


def test_framing_keeps_fund_out_of_the_explanations():
    # The decision of 23 October: a new prompt without "fund" (it ran through
    # 68% of Mongolia's earlier explanations). Dropping the word alone left it
    # in 73% of a test run's explanations, so the framing names it once, as a
    # word the explanation does not use, and never as a reading of a line.
    assert re.findall(r"\bfund\w*", BUDGET_INTRO_FRAMING, re.IGNORECASE) == ["fund"]
    assert 'without the words "fund" or "finance"' in BUDGET_INTRO_FRAMING
    assert "—" not in BUDGET_INTRO_FRAMING


def test_programs_to_pseudo_targets_unchanged_text():
    [p] = programs_to_pseudo_targets(
        [{"code": "71401", "name": "Waste management", "description": "Waste"}],
        [{"code": "71401", "values": {"2020": 1.5, "2021": None}}],
        currency="MNT",
        unit="billion",
    )
    assert p["text"] == "Waste management. Waste. Expenditure: 2020: 1.5 billion MNT, 2021: no data. Total: 1.5 billion MNT."
