"""The public contract bake: each contract counted once, record fields normalised."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

# The bake lives in python/scripts (not a package); put it on the path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from build_contracts_layer import dedupe, english_of, place_totals, stage_key, type_key, valid_date  # noqa: E402


def frame(rows):
    cols = ["id", "contract_code", "amount", "client_name", "supplier_name", "status_name", "contract_name"]
    return pd.DataFrame(rows, columns=cols)


def test_same_contract_twice_counts_once_keeping_the_advanced_stage():
    df = frame(
        [
            ["1", "ЭТТХК/202309500", 8.8e11, "ETT", "S1", "Шинэ", "x"],
            ["2", "ЭТТХК/202309500", 8.8e11, "ETT", "S1", "Гүйцэтгэгч рүү илгээсэн", "x"],
        ]
    )
    out, n, v = dedupe(df)
    assert list(out.id) == ["2"] and n == 1 and v == 8.8e11


def test_framework_lots_with_different_suppliers_stay():
    df = frame(
        [
            ["1", "БЕГ/202204150", 85868400.0, "School 1", "S1", "Шинэ", "food"],
            ["2", "БЕГ/202204150", 85868400.0, "School 1", "S2", "Шинэ", "food"],
        ]
    )
    out, n, _ = dedupe(df)
    assert len(out) == 2 and n == 0


def test_trivial_codes_never_merge():
    df = frame([["1", "15", 1.0e6, "A", "S", "Шинэ", "x"], ["2", "15", 1.0e6, "A", "S", "Шинэ", "x"]])
    assert len(dedupe(df)[0]) == 2


def test_dropped_copies_point_to_the_kept_contract():
    df = frame(
        [
            ["1", "ЭТТХК/202309500", 8.8e11, "ETT", "S1", "Шинэ", "x"],
            ["2", "ЭТТХК/202309500", 8.8e11, "ETT", "S1", "Зөвшөөрсөн", "x"],
            ["3", "ЭТТХК/202309500", 8.8e11, "ETT", "S1", "Шинэ", "x"],
        ]
    )
    out, n, _ = dedupe(df)
    assert list(out.id) == ["2"] and n == 2
    assert out.attrs["kept"] == {"1": "2", "3": "2"}


def test_keys():
    assert type_key("Ажил") == "works" and type_key("Ерөнхий гэрээ") == "framework"
    assert stage_key("Гүйцэтгэгч рүү илгээсэн") == "sent" and stage_key("???") == "other"


def test_dates_outside_the_record_are_dropped():
    assert valid_date("2024-05-01 00:00:00") == "2024-05-01"
    assert valid_date("5377-01-01") is None
    assert valid_date(None) is None


def test_places_sum_to_the_record_several_counting_as_none():
    df = pd.DataFrame(
        [
            ["Ховд аймгийн Худалдан авах ажиллагааны газар", "Ундны ус", 3e9],
            ["Ховд аймгийн газар", "Сургууль", 1e9],
            ["Сүхбаатар дүүргийн Засаг даргын Тамгын газар", "Цэцэрлэгт хүрээлэн", 2e9],
            ["Ойн газар", "Ойн цэвэрлэгээнд ашиглагдах машин", 5e9],
            ["Ховд аймгийн газар", "Увс аймгийн ажил", 4e9],
        ],
        columns=["client_name", "contract_name", "amount"],
    )
    rows = place_totals(df)
    assert rows == [
        {"code": "none", "contracts": 2, "value": 9e9},
        {"code": "MN-043", "contracts": 2, "value": 4e9},
        {"code": "MN-1", "contracts": 1, "value": 2e9},
    ]
    assert sum(r["value"] for r in rows) == df["amount"].sum()


def test_english_of_looks_up_mongolian_and_keeps_english_as_it_is():
    lookup = {"Ойн газар": "Forest Agency"}
    assert english_of("Ойн газар", lookup) == "Forest Agency"
    assert english_of(" Ойн газар ", lookup) == "Forest Agency"
    # The purpose screen wrote a few reasons in English already.
    assert english_of("Bio-preparation for pest control.", lookup) == "Bio-preparation for pest control."
    # Never the Mongolian as a stand-in for English.
    assert english_of("Усны газар", lookup) is None
    assert english_of("", lookup) is None
