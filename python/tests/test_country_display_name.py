"""country_display_name reaches the corpus-synthesis prompt (and its LLM
cache key), so its resolution rules are pinned: config `name` first, then a
title-cased slug — never a placeholder. The old three-way fallback fork sent
the literal string "the country" into Mongolia's and Panama's synthesis
prompts because their configs lacked `name`.
"""
from __future__ import annotations

import json

from src.config import DATA_DIR, country_display_name


def test_flagship_configs_declare_names():
    for country, expected in [("mongolia", "Mongolia"), ("panama", "Panama")]:
        cfg = json.loads(
            (DATA_DIR / f"{country}-country-config.json").read_text()
        )
        assert cfg.get("name") == expected


def test_reads_name_from_config():
    assert country_display_name("mongolia") == "Mongolia"
    assert country_display_name("cote-divoire") == "Côte d'Ivoire"


def test_titlecases_slug_when_no_config():
    assert country_display_name("no-such-country") == "No Such Country"


def test_never_returns_a_placeholder():
    for country in ("mongolia", "panama", "sri-lanka", "cote-divoire", "countryx"):
        name = country_display_name(country)
        assert name and name != "the country"
