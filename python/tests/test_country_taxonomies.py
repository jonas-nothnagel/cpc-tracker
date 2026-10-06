"""Tests for country-defined taxonomies (a country's own lenses).

Covers the loader in src/country_taxonomies.py, the one-area membership rule in
rank_classification, the gating in classify_active_taxonomies, and the shipped
Sri Lanka file (shape and provenance hygiene). The Sri Lanka assertions pin
counts and ids on purpose: a re-ingested document should fail here and force a
conscious update. Regenerate with dev_data_scripts/ingest_sri_lanka_taxonomies_24sep26.py.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from src.classify import RELEVANCE_THRESHOLD, rank_classification
from src.country_taxonomies import (
    RESERVED_TAXONOMY_TYPES,
    load_country_taxonomies,
    replaced_lenses,
)
from src.run_analysis import classify_active_taxonomies

DATA = Path(__file__).resolve().parent.parent / "data"
SRI_LANKA = DATA / "sri-lanka-taxonomies.json"

SL_ADAPTATION_IDS = [
    "lk_agriculture_food",
    "lk_livestock",
    "lk_fisheries",
    "lk_biodiversity",
    "lk_health",
    "lk_tourism",
    "lk_infrastructure_settlements",
    "lk_water",
    "lk_coastal_marine",
]
SL_ADAPTATION_NAMES = [
    "Agriculture and food",
    "Livestock",
    "Fisheries",
    "Biodiversity",
    "Health",
    "Tourism",
    "Infrastructure and human settlements",
    "Water",
    "Coastal and marine",
]
# Sri Lanka categories whose first paragraph the office took from decision 2/CMA.5.
SL_GGA_PARAGRAPHS = {
    "lk_agriculture_food": "gga_agriculture_food",
    "lk_health": "gga_health",
    "lk_infrastructure_settlements": "gga_infrastructure_settlements",
    "lk_water": "gga_water",
}


def _write(tmp_path: Path, payload: dict) -> Path:
    path = tmp_path / "x-taxonomies.json"
    path.write_text(json.dumps(payload))
    return path


def _taxonomy(ttype: str = "adaptation", **extra) -> dict:
    return {
        "taxonomyType": ttype,
        "categories": [
            {"id": f"{ttype}_a", "name": "A", "description": "First."},
            {"id": f"{ttype}_b", "name": "B", "description": "Second."},
        ],
        **extra,
    }


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------


def test_missing_file_means_no_country_taxonomies(tmp_path):
    assert load_country_taxonomies(tmp_path / "absent-taxonomies.json") == []


def test_loads_entries_in_file_order(tmp_path):
    path = _write(tmp_path, {"taxonomies": [_taxonomy("adaptation"), _taxonomy("loss_damage")]})
    loaded = load_country_taxonomies(path)
    assert [t["taxonomyType"] for t in loaded] == ["adaptation", "loss_damage"]
    assert [c["id"] for c in loaded[0]["categories"]] == ["adaptation_a", "adaptation_b"]


@pytest.mark.parametrize("reserved", sorted(RESERVED_TAXONOMY_TYPES))
def test_rejects_a_type_a_global_lens_already_uses(tmp_path, reserved):
    with pytest.raises(ValueError, match="reserved"):
        load_country_taxonomies(_write(tmp_path, {"taxonomies": [_taxonomy(reserved)]}))


def test_rejects_duplicate_types(tmp_path):
    payload = {"taxonomies": [_taxonomy("adaptation"), _taxonomy("adaptation")]}
    with pytest.raises(ValueError, match="twice"):
        load_country_taxonomies(_write(tmp_path, payload))


def test_rejects_duplicate_category_ids_across_taxonomies(tmp_path):
    second = _taxonomy("loss_damage")
    second["categories"][0]["id"] = "adaptation_a"
    with pytest.raises(ValueError, match="adaptation_a"):
        load_country_taxonomies(_write(tmp_path, {"taxonomies": [_taxonomy(), second]}))


def test_rejects_a_category_without_description(tmp_path):
    bad = _taxonomy()
    bad["categories"][1]["description"] = "  "
    with pytest.raises(ValueError, match="description"):
        load_country_taxonomies(_write(tmp_path, {"taxonomies": [bad]}))


def test_rejects_an_empty_taxonomy(tmp_path):
    bad = _taxonomy()
    bad["categories"] = []
    with pytest.raises(ValueError, match="no categories"):
        load_country_taxonomies(_write(tmp_path, {"taxonomies": [bad]}))


def test_replaces_must_name_a_global_lens(tmp_path):
    with pytest.raises(ValueError, match="replaces"):
        load_country_taxonomies(_write(tmp_path, {"taxonomies": [_taxonomy(replaces="nonsense")]}))


def test_replaced_lenses():
    assert replaced_lenses([_taxonomy(replaces="gga"), _taxonomy("loss_damage")]) == {"gga"}
    assert replaced_lenses([]) == set()


# ---------------------------------------------------------------------------
# One-area membership rule
# ---------------------------------------------------------------------------

ONE_AREA = [{"id": "ld", "name": "Loss and damage", "description": "Loss and damage."}]


def _ranked(score: float, cid: str = "ld") -> str:
    return json.dumps({"ranked": [{"id": cid, "score": score, "reasoning": "r"}]})


@pytest.mark.asyncio
async def test_one_area_counts_a_target_only_from_the_relevance_threshold(sample_targets):
    """Nothing to rank against: below the threshold a target stays outside the area."""
    scores = [0.2, RELEVANCE_THRESHOLD - 0.01, RELEVANCE_THRESHOLD, 0.9]
    targets = sample_targets[: len(scores)]
    with patch("src.classify.call_llm_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = [_ranked(s) for s in scores]
        result = await rank_classification(targets, ONE_AREA, "loss_damage")

    assert [r["isPrimary"] for r in result] == [False, False, True, True]
    assert [r["isRelevant"] for r in result] == [False, False, True, True]
    assert [r["score"] for r in result] == [round(s, 3) for s in scores]


@pytest.mark.asyncio
async def test_ranked_taxonomies_keep_their_top_entry_as_primary(sample_targets):
    """The rule is for one-area taxonomies only: a weak top score still ranks first."""
    two = ONE_AREA + [{"id": "x", "name": "X", "description": "X."}]
    with patch("src.classify.call_llm_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = [_ranked(0.2)] * len(sample_targets)
        result = await rank_classification(sample_targets, two, "two_areas")

    primaries = [r for r in result if r["isPrimary"]]
    assert len(primaries) == len(sample_targets)
    assert {r["categoryId"] for r in primaries} == {"ld"}


# ---------------------------------------------------------------------------
# Gating in classify_active_taxonomies
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_country_taxonomy_replaces_its_global_lens(sample_targets):
    calls: list[str] = []

    async def fake_rank(items, categories, taxonomy_type):
        calls.append(taxonomy_type)
        return [{"targetId": items[0]["id"], "categoryId": categories[0]["id"],
                 "taxonomyType": taxonomy_type, "isPrimary": True, "isRelevant": True,
                 "score": 0.9}]

    own = [_taxonomy("adaptation", replaces="gga"), _taxonomy("loss_damage")]
    with patch("src.run_analysis.rank_classification", side_effect=fake_rank):
        out = await classify_active_taxonomies(
            sample_targets,
            nbs_categories=[],
            sectors=[{"id": "s", "name": "S", "description": "S."}],
            globe_categories=[{"id": "g", "name": "G", "description": "G."}],
            globe_subcategories=[],
            globe_few_shot_examples=[],
            gga_categories=[{"id": "gga_water", "name": "Water", "description": "W."}],
            hr_categories=[{"id": "hr_x", "name": "H", "description": "H."}],
            cache_suffix="targets",
            country_taxonomies=own,
        )

    assert "gga" not in calls
    assert out["gga"] == []
    assert calls[-2:] == ["adaptation", "loss_damage"]
    assert [r["taxonomyType"] for r in out["country_taxonomies"]] == ["adaptation", "loss_damage"]


@pytest.mark.asyncio
async def test_without_country_taxonomies_nothing_changes(sample_targets):
    calls: list[str] = []

    async def fake_rank(items, categories, taxonomy_type):
        calls.append(taxonomy_type)
        return []

    with patch("src.run_analysis.rank_classification", side_effect=fake_rank):
        out = await classify_active_taxonomies(
            sample_targets,
            nbs_categories=[],
            sectors=[{"id": "s", "name": "S", "description": "S."}],
            globe_categories=[{"id": "g", "name": "G", "description": "G."}],
            globe_subcategories=[],
            globe_few_shot_examples=[],
            gga_categories=[{"id": "gga_water", "name": "Water", "description": "W."}],
            hr_categories=[{"id": "hr_x", "name": "H", "description": "H."}],
            cache_suffix="targets",
        )

    assert calls == ["sector", "globe", "gga", "hr"]
    assert out["country_taxonomies"] == []


# ---------------------------------------------------------------------------
# The shipped Sri Lanka file
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def sri_lanka() -> list[dict]:
    return load_country_taxonomies(SRI_LANKA)


def test_sri_lanka_lenses(sri_lanka):
    assert [(t["taxonomyType"], t.get("replaces")) for t in sri_lanka] == [
        ("adaptation", "gga"),
        ("loss_damage", None),
    ]
    adaptation, loss_damage = sri_lanka
    assert [c["id"] for c in adaptation["categories"]] == SL_ADAPTATION_IDS
    assert [c["name"] for c in adaptation["categories"]] == SL_ADAPTATION_NAMES
    assert [(c["id"], c["name"]) for c in loss_damage["categories"]] == [
        ("lk_loss_damage", "Loss and damage")
    ]


def test_sri_lanka_provenance_is_recorded(sri_lanka):
    raw = json.loads(SRI_LANKA.read_text(encoding="utf-8"))
    assert "Sectors for Sri Lanka.docx" in raw["_source"]
    for tax in sri_lanka:
        assert tax["_source"].strip()
        assert tax["tooltip"].strip()
        for c in tax["categories"]:
            paragraphs = c["description"].split("\n\n")
            # One source line per paragraph, as the document gives them.
            assert len(c["_sources"]) == len(paragraphs), c["id"]


def test_sri_lanka_descriptions_are_clean(sri_lanka):
    for tax in sri_lanka:
        for c in tax["categories"]:
            d = c["description"]
            assert "Source:" not in d, c["id"]
            assert d == d.strip()
            assert "  " not in d and " " not in d and "​" not in d, c["id"]


def test_sri_lanka_gga_paragraphs_are_verbatim(sri_lanka):
    """The four paragraphs taken from decision 2/CMA.5 equal categories.json
    (the document adds a final full stop to Water)."""
    gga = {
        c["id"]: c["description"]
        for c in json.loads((DATA / "categories.json").read_text(encoding="utf-8"))["gga_categories"]
    }
    by_id = {c["id"]: c for c in sri_lanka[0]["categories"]}
    for lk_id, gga_id in SL_GGA_PARAGRAPHS.items():
        first = by_id[lk_id]["description"].split("\n\n")[0]
        assert first.rstrip(".") == gga[gga_id], lk_id
        assert "cma2023_16a01E.pdf" in by_id[lk_id]["_sources"][0]
