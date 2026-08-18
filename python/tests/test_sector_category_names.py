"""build_sector_category_names is the single source of the
(taxonomyType, categoryId) -> display-name map for sector synthesis.
run_analysis and the synthesize_by_sector CLI used to build divergent maps —
the CLI path had no gga/hr entries, so CLI-produced sector syntheses rendered
raw GGA/HR category ids instead of names.
"""
from __future__ import annotations

from src.synthesize_by_sector import (
    DEFAULT_TAXONOMY_ALLOWLIST,
    build_sector_category_names,
)


def test_names_every_supplied_taxonomy():
    names = build_sector_category_names(
        category_lists={
            "sector": [{"id": "energy", "name": "Energy"}],
            "gga": [{"id": "gga_water", "name": "Water"}],
            "hr": [{"id": "hr_health", "name": "Right to health"}],
        },
    )
    assert names[("sector", "energy")] == "Energy"
    assert names[("gga", "gga_water")] == "Water"
    assert names[("hr", "hr_health")] == "Right to health"


def test_country_and_adaptation_lenses():
    names = build_sector_category_names(
        category_lists={},
        country_config={"countrySectors": [{"id": "Bosques", "name": "Forests"}]},
        adaptation_data={
            "adaptationGoals": [{"id": 1, "description": "x" * 100}]
        },
    )
    assert names[("country", "Bosques")] == "Forests"
    goal = names[("adaptation_goal", "1")]
    assert goal.endswith("…") and len(goal) == 81


def test_falls_back_to_id_when_name_missing():
    names = build_sector_category_names(
        category_lists={"globe": [{"id": "globe_1"}]},
    )
    assert names[("globe", "globe_1")] == "globe_1"


def test_allowlist_taxonomies_are_all_nameable():
    """Every allowlisted taxonomy must be resolvable through the builder:
    ranked lenses via category_lists, country/adaptation via their args.
    nbs is paused and deliberately absent from the allowlist."""
    ranked = {"sector", "globe", "gga", "hr"}
    special = {"country", "adaptation_goal"}
    assert set(DEFAULT_TAXONOMY_ALLOWLIST) == ranked | special
    assert "nbs" not in DEFAULT_TAXONOMY_ALLOWLIST
