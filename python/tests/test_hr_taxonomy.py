"""Tests for the human rights themes taxonomy.

Covers the shipped `hr_categories` block in data/categories.json (shape,
provenance, verbatim hygiene) and its behaviour through the generic ranked
classifier. The taxonomy is a DRAFT under expert review, so these tests are
deliberately assertive about counts: if the source sheet is re-ingested and
the shape changes, the suite should fail and force a conscious update rather
than silently absorbing a different taxonomy.

Regenerate with dev_data_scripts/ingest_hr_taxonomy_31jul26.py.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from src.classify import (
    RELEVANCE_THRESHOLD,
    build_rank_user_message,
    rank_classification,
)
from src.config import ACTIVE_TAXONOMIES

CATEGORIES_JSON = Path(__file__).resolve().parent.parent / "data" / "categories.json"

EXPECTED_IDS = [
    "hr_information_education",
    "hr_participation",
    "hr_access_justice",
    "hr_indigenous_local_communities",
    "hr_gender_equality",
    "hr_children_youth",
    "hr_defenders",
    "hr_business",
    "hr_disabilities",
]
EXPECTED_BULLETS = 40
# Bullets per theme, in sheet order — pins the ingest grouping.
EXPECTED_BULLETS_BY_ID = {
    "hr_information_education": 5,
    "hr_participation": 4,
    "hr_access_justice": 3,
    "hr_indigenous_local_communities": 6,
    "hr_gender_equality": 7,
    "hr_children_youth": 4,
    "hr_defenders": 4,
    "hr_business": 4,
    "hr_disabilities": 3,
}


@pytest.fixture(scope="module")
def hr_categories() -> list[dict]:
    return json.loads(CATEGORIES_JSON.read_text(encoding="utf-8"))["hr_categories"]


@pytest.fixture(scope="module")
def sources() -> dict:
    return json.loads(CATEGORIES_JSON.read_text(encoding="utf-8"))["_sources"]


# ---------------------------------------------------------------------------
# Taxonomy shape
# ---------------------------------------------------------------------------


def test_ids_and_order(hr_categories):
    assert [c["id"] for c in hr_categories] == EXPECTED_IDS


def test_bullet_counts(hr_categories):
    by_id = {c["id"]: c["description"].count("\n- ") for c in hr_categories}
    assert by_id == EXPECTED_BULLETS_BY_ID
    assert sum(by_id.values()) == EXPECTED_BULLETS


def test_every_category_is_well_formed(hr_categories):
    for cat in hr_categories:
        assert cat["name"].strip(), f"{cat['id']} has an empty name"
        assert cat["description"].startswith("Descriptive actions:\n- ")
        assert cat["block"] in {"rights", "groups"}
        assert "updated_human_rights.xlsx" in cat["source"]


def test_block_split_matches_source_document(hr_categories):
    """The source PDF separates rights/issues themes from a "Groups" block."""
    by_block: dict[str, list[str]] = {}
    for cat in hr_categories:
        by_block.setdefault(cat["block"], []).append(cat["id"])
    assert by_block["rights"] == EXPECTED_IDS[:3]
    assert by_block["groups"] == EXPECTED_IDS[3:]


# ---------------------------------------------------------------------------
# Verbatim hygiene — the defects that made docs/hr-terms.csv unusable
# ---------------------------------------------------------------------------


def test_descriptions_are_clean(hr_categories):
    """No mojibake, list separators, or page/footnote artefacts.

    The superseded CSV extraction carried cp1252 mojibake, trailing ";"
    separators, and glued-in footnote markers. Guard against a future ingest
    reintroducing any of them, since this text goes straight into LLM prompts.
    """
    for cat in hr_categories:
        desc = cat["description"]
        assert "�" not in desc, f"{cat['id']}: replacement char (mojibake)"
        assert "Â" not in desc, f"{cat['id']}: cp1252 mojibake"
        for line in desc.split("\n")[1:]:
            bullet = line[2:]
            assert not bullet.endswith(";"), f"{cat['id']}: stray list separator"
            assert bullet == bullet.strip(), f"{cat['id']}: unstripped bullet"
            assert bullet, f"{cat['id']}: empty bullet"


def test_provenance_recorded(sources):
    note = sources["hr_categories"]
    assert "updated_human_rights.xlsx" in note
    assert "Environment Management Group" in note
    # The taxonomy is not final; the caveat must survive re-ingest.
    assert "DRAFT" in note.upper()


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------


def test_block_is_display_only_and_never_reaches_the_prompt(hr_categories):
    """`block` is UI metadata; sending it would be untraced prompt input."""
    message = build_rank_user_message("Some policy target text", hr_categories)
    assert "block" not in message
    assert "groups" not in message.lower().split("descriptive actions")[0]
    # Names and descriptions DO reach it, in full.
    for cat in hr_categories:
        assert cat["name"] in message
        assert cat["id"] in message


def test_hr_is_an_active_taxonomy():
    assert "hr" in ACTIVE_TAXONOMIES


# ---------------------------------------------------------------------------
# Ranked classification
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rank_classification_emits_one_record_per_theme(
    sample_targets, hr_categories
):
    """One record per (target, theme), exactly one primary per target."""
    response = json.dumps(
        {
            "ranked": [
                {"id": "hr_participation", "score": 0.9, "reasoning": "engages participation"},
                {"id": "hr_gender_equality", "score": 0.6, "reasoning": "gender dimension"},
                {"id": "hr_business", "score": 0.2, "reasoning": "marginal"},
            ]
        }
    )

    with patch("src.classify.call_llm_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = [response] * len(sample_targets)
        result = await rank_classification(sample_targets, hr_categories, "hr")

    assert len(result) == len(sample_targets) * len(hr_categories)
    assert {r["taxonomyType"] for r in result} == {"hr"}

    for target in sample_targets:
        records = [r for r in result if r["targetId"] == target["id"]]
        assert len(records) == len(hr_categories)
        primaries = [r for r in records if r["isPrimary"]]
        assert [p["categoryId"] for p in primaries] == ["hr_participation"]

        by_cat = {r["categoryId"]: r for r in records}
        # isRelevant tracks the shared threshold, not the primary flag.
        assert by_cat["hr_gender_equality"]["isRelevant"] is True
        assert by_cat["hr_business"]["isRelevant"] is False
        assert by_cat["hr_business"]["score"] == 0.2
        # Themes the model omitted still get a zero-score record.
        assert by_cat["hr_defenders"]["score"] == 0.0
        assert by_cat["hr_defenders"]["isRelevant"] is False


@pytest.mark.asyncio
async def test_rank_classification_uses_its_own_cache_namespace(
    sample_targets, hr_categories
):
    """A new namespace keeps existing lenses' caches warm."""
    with patch("src.classify.call_llm_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = ['{"ranked": []}'] * len(sample_targets)
        await rank_classification(sample_targets, hr_categories, "hr")

    assert mock_batch.await_args.kwargs["cache_namespace"] == "rank_hr"


@pytest.mark.asyncio
async def test_unparseable_response_yields_no_primary(sample_targets, hr_categories):
    with patch("src.classify.call_llm_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = ["not json at all"] * len(sample_targets)
        result = await rank_classification(sample_targets, hr_categories, "hr")

    assert len(result) == len(sample_targets) * len(hr_categories)
    assert not any(r["isPrimary"] for r in result)
    assert not any(r["isRelevant"] for r in result)
    assert all(r["score"] == 0.0 for r in result)


def test_relevance_threshold_is_shared():
    """HR uses the same threshold as every other ranked lens (no special-casing)."""
    assert RELEVANCE_THRESHOLD == 0.5
