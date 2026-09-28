"""The public contract bake: each contract counted once, record fields normalised."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

# The bake lives in python/scripts (not a package); put it on the path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from build_contracts_layer import dedupe, stage_key, type_key, valid_date  # noqa: E402


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
