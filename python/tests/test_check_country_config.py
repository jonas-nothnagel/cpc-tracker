"""A document's `publishedOn` restates its `published` text, never a guess."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# The check lives in python/scripts (not a package); put it on the path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from check_country_config import DATA_DIR, published_on_problem  # noqa: E402


@pytest.mark.parametrize(
    ("published", "published_on"),
    [
        ("September 2025", "2025-09"),
        ("2022", "2022"),
        ("2025-2029 (published December 2024)", "2024-12"),
        ("2015-2050 (adopted 2016)", "2016"),
        ("2021-2025 (adopted May 2021)", "2021-05"),
    ],
)
def test_a_date_the_text_states_holds(published: str, published_on: str) -> None:
    assert published_on_problem({"published": published, "publishedOn": published_on}) is None


def test_an_entry_without_the_field_holds() -> None:
    assert published_on_problem({"published": "2025-2029"}) is None
    assert published_on_problem({}) is None


@pytest.mark.parametrize(
    ("entry", "why"),
    [
        ({"published": "September 2025", "publishedOn": "2025-9"}, "not YYYY or YYYY-MM"),
        ({"published": "September 2025", "publishedOn": "2025-13"}, "not YYYY or YYYY-MM"),
        ({"published": "September 2025", "publishedOn": "2025-09-01"}, "not YYYY or YYYY-MM"),
        ({"published": "2022", "publishedOn": 2022}, "not YYYY or YYYY-MM"),
        ({"publishedOn": "2024"}, "no `published` text"),
        # A period says what a document covers, not when it came out.
        ({"published": "2025-2029", "publishedOn": "2025"}, "period alone"),
        ({"published": "2025–2029", "publishedOn": "2029"}, "period alone"),
        ({"published": "2025-2029 (published December 2024)", "publishedOn": "2025"}, "year 2025"),
        ({"published": "September 2025", "publishedOn": "2024-09"}, "year 2024"),
        ({"published": "September 2025", "publishedOn": "2025-08"}, "month 08"),
        ({"published": "2022", "publishedOn": "2022-06"}, "month 06"),
        # A month name inside another word states no month.
        ({"published": "Maybe adopted 2021", "publishedOn": "2021-05"}, "month 05"),
    ],
)
def test_a_date_the_text_does_not_state_is_named(entry: dict, why: str) -> None:
    problem = published_on_problem(entry)
    assert problem is not None and why in problem


def test_every_country_config_holds() -> None:
    for path in sorted(DATA_DIR.glob("*-country-config.json")):
        config = json.loads(path.read_text(encoding="utf-8"))
        for entry in config.get("documentTypes", []):
            assert published_on_problem(entry) is None, f"{path.name}: {entry.get('id')}"
