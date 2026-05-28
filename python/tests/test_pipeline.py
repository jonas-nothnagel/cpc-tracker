"""Integration tests for pipeline steps with mocked LLM responses.

Every test patches call_llm / call_llm_batch so no network calls are made.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from src.classify import run_classification
from src.align import decompose_targets, assess_alignment, generate_pairs
from src.quantitative import assess_quantitative_flags


# ---------------------------------------------------------------------------
# Thematic classification
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_classify_with_mock_llm(sample_targets, sample_nbs_categories):
    """run_classification should classify each target × category pair."""
    # 5 targets × 2 nbs categories = 10 calls
    responses = ["1"] * 5 + ["0"] * 5

    with patch("src.classify.call_llm_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = responses
        result = await run_classification(sample_targets, sample_nbs_categories, "nbs")

    assert len(result) == 10
    relevant = [c for c in result if c["isRelevant"]]
    assert len(relevant) == 5

    for c in result:
        assert "targetId" in c
        assert "categoryId" in c
        assert "taxonomyType" in c
        assert c["taxonomyType"] == "nbs"


# ---------------------------------------------------------------------------
# Target decomposition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_decompose_with_mock_llm(sample_targets):
    """decompose_targets should return decomposition for each target."""
    decomp_json = json.dumps({
        "Goal/Purpose": "Protect forests",
        "Action/Intervention": "Reforestation",
        "Ecosystem/Area": "Forest",
        "Target Audience": "Government",
        "Expected Impact/Outcome": "More trees",
    })
    responses = [decomp_json] * len(sample_targets)

    with patch("src.align.call_llm_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = responses
        result = await decompose_targets(sample_targets)

    assert len(result) == len(sample_targets)
    for tid in [t["id"] for t in sample_targets]:
        assert tid in result
        assert isinstance(result[tid], str)


# ---------------------------------------------------------------------------
# Alignment assessment (with contradictions)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_alignment_with_mock_llm(sample_targets):
    """assess_alignment should parse v2 (Flagged for review) AND v1 (Possible misalignment) strings."""
    pairs = generate_pairs(sample_targets)
    assert len(pairs) > 0

    decompositions = {t["id"]: '{"Goal/Purpose": "test"}' for t in sample_targets}

    mock_responses = [
        "High alignment - Both targets share the same goals.",
        # v2 canonical
        "Flagged for review (Resource competition, Manageable, Confidence: Medium) - Competing resource demands.",
        # v1 backward-compat — should parse to flagged + delivery_friction + manageable + medium
        "Possible misalignment (Implementation tension) - Minor friction in approach.",
        "No alignment - Completely unrelated targets.",
        "Medium alignment - Complementary goals with some overlap.",
    ]
    responses = (mock_responses * ((len(pairs) // len(mock_responses)) + 1))[:len(pairs)]

    with patch("src.align.call_llm_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = responses
        results = await assess_alignment(pairs, decompositions)

    assert len(results) == len(pairs)

    for r in results:
        assert "targetAId" in r
        assert "targetBId" in r
        assert "alignment" in r
        assert "description" in r

    flagged = [r for r in results if r["alignment"] == "flagged"]
    assert len(flagged) > 0
    for f in flagged:
        # Every flagged record should carry all three sub-fields (canonical v2 or
        # backward-compat v1 with defaults from LEGACY_LEVEL_TO_FIELDS).
        assert f.get("mechanism") in ("goal_conflict", "resource_competition", "delivery_friction")
        assert f.get("manageability") in ("manageable", "fundamental")
        assert f.get("confidence") in ("low", "medium", "high")


@pytest.mark.asyncio
async def test_alignment_v2_canonical_flagged():
    """v2.1 canonical 'Flagged for review (...)' parses into the three sub-fields."""
    targets = [
        {"id": "A", "sourceDocument": "NAP", "text": "target a"},
        {"id": "B", "sourceDocument": "NDC", "text": "target b"},
    ]
    pairs = [(targets[0], targets[1])]
    decompositions = {"A": '{"Goal/Purpose": "test"}', "B": '{"Goal/Purpose": "other"}'}

    responses = [
        "Flagged for review (Goal conflict, Fundamental, Confidence: High) - "
        "Directly opposing objectives on the same land.",
    ]

    with patch("src.align.call_llm_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = responses
        results = await assess_alignment(pairs, decompositions)

    assert len(results) == 1
    r = results[0]
    assert r["alignment"] == "flagged"
    assert r["mechanism"] == "goal_conflict"
    assert r["manageability"] == "fundamental"
    assert r["confidence"] == "high"
    assert "opposing" in r["description"].lower()


@pytest.mark.asyncio
async def test_alignment_v1_legacy_backward_compat():
    """v1 'Likely conflict (Goal conflict)' still parses, now mapped to flagged + Fundamental/High via legacy table."""
    targets = [
        {"id": "A", "sourceDocument": "NAP", "text": "target a"},
        {"id": "B", "sourceDocument": "NDC", "text": "target b"},
    ]
    pairs = [(targets[0], targets[1])]
    decompositions = {"A": '{"Goal/Purpose": "test"}', "B": '{"Goal/Purpose": "other"}'}

    responses = [
        "Likely conflict (Goal conflict) - Directly opposing objectives on the same land.",
    ]

    with patch("src.align.call_llm_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = responses
        results = await assess_alignment(pairs, decompositions)

    assert len(results) == 1
    r = results[0]
    assert r["alignment"] == "flagged"
    assert r["mechanism"] == "goal_conflict"
    # LEGACY_LEVEL_TO_FIELDS["likely_conflict"] = ("flagged", "fundamental", "high")
    assert r["manageability"] == "fundamental"
    assert r["confidence"] == "high"


# ---------------------------------------------------------------------------
# Quantitative flags
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_quantitative_with_mock_llm():
    """assess_quantitative_flags should parse batched JSON responses."""
    targets = [
        {"id": "NDC_Mitigation", "text": "Reduce CO2 by 5.277 million tons by 2030"},
        {"id": "NAP_1", "text": "Enhance climate adaptation policies"},
    ]

    llm_response = json.dumps([
        {
            "targetId": "NDC_Mitigation",
            "isQuantitative": True,
            "isTimeBound": True,
            "quantitativeDetails": "5.277 million tons",
            "timeBoundDetails": "by 2030",
        },
        {
            "targetId": "NAP_1",
            "isQuantitative": False,
            "isTimeBound": False,
            "quantitativeDetails": "",
            "timeBoundDetails": "",
        },
    ])

    with patch("src.quantitative.call_llm_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = [llm_response]
        result = await assess_quantitative_flags(targets)

    assert len(result) == 2

    quant = next(r for r in result if r["targetId"] == "NDC_Mitigation")
    assert quant["isQuantitative"] is True
    assert quant["isTimeBound"] is True

    non_quant = next(r for r in result if r["targetId"] == "NAP_1")
    assert non_quant["isQuantitative"] is False
    assert non_quant["isTimeBound"] is False


@pytest.mark.asyncio
async def test_quantitative_enforces_number_check():
    """The pipeline should override LLM isQuantitative=true if no numbers in text."""
    targets = [
        {"id": "NAP_1", "text": "Enhance climate adaptation policies"},
    ]

    llm_response = json.dumps([
        {
            "targetId": "NAP_1",
            "isQuantitative": True,
            "isTimeBound": True,
            "quantitativeDetails": "enhanced",
            "timeBoundDetails": "soon",
        },
    ])

    with patch("src.quantitative.call_llm_batch", new_callable=AsyncMock) as mock_batch:
        mock_batch.return_value = [llm_response]
        result = await assess_quantitative_flags(targets)

    assert result[0]["isQuantitative"] is False
    assert result[0]["isTimeBound"] is False
