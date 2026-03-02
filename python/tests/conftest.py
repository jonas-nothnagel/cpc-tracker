"""Shared fixtures for CPC Tracker tests.

All LLM calls are mocked -- no network access or API keys needed.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


SAMPLE_TARGETS = [
    {
        "id": "NAP_1",
        "text": "Enhance policies and organizational capacities to support climate change adaptation",
        "sourceDocument": "NAP",
        "sourceLabel": "Target 1",
        "country": "Mongolia",
    },
    {
        "id": "NAP_10",
        "text": "Foster sustainable livestock management that aligns with water and pasture resources",
        "sourceDocument": "NAP",
        "sourceLabel": "Target 10",
        "country": "Mongolia",
    },
    {
        "id": "NDC_Forests_1",
        "text": "Protect natural forests, improve forest health, and enhance forest regeneration capacity",
        "sourceDocument": "NDC",
        "sourceLabel": "Forests 1",
        "country": "Mongolia",
    },
    {
        "id": "NDC_LivestockMitigation",
        "text": "The agricultural sector will reduce 5.277 million tons of CO2 by adhering national livestock herd to 50 million head",
        "sourceDocument": "NDC",
        "sourceLabel": "Livestock mitigation",
        "country": "Mongolia",
    },
    {
        "id": "NBT_1",
        "text": "Ensure 30% of the country is effectively conserved within the National Protected Area Network",
        "sourceDocument": "NBSAP",
        "sourceLabel": "NBT 1",
        "country": "Mongolia",
    },
]

SAMPLE_NBS_CATEGORIES = [
    {"id": "nbs_1", "name": "Agriculture and livestock management", "description": "Includes climate-smart agriculture..."},
    {"id": "nbs_3", "name": "Forest management, restoration, and protection", "description": "Includes reforestation..."},
]

SAMPLE_THEMES = [
    {"id": "theme_0", "name": "Climate change adaptation", "description": "Actions that help reduce vulnerability..."},
    {"id": "theme_1", "name": "Climate change mitigation", "description": "Actions that prevent global warming..."},
]

SAMPLE_CLASSIFICATIONS = [
    {"targetId": "NAP_1", "categoryId": "theme_0", "taxonomyType": "theme", "isRelevant": True},
    {"targetId": "NAP_10", "categoryId": "nbs_1", "taxonomyType": "nbs", "isRelevant": True},
    {"targetId": "NAP_10", "categoryId": "theme_0", "taxonomyType": "theme", "isRelevant": True},
    {"targetId": "NDC_Forests_1", "categoryId": "nbs_3", "taxonomyType": "nbs", "isRelevant": True},
    {"targetId": "NDC_Forests_1", "categoryId": "theme_0", "taxonomyType": "theme", "isRelevant": True},
    {"targetId": "NDC_LivestockMitigation", "categoryId": "nbs_1", "taxonomyType": "nbs", "isRelevant": True},
    {"targetId": "NDC_LivestockMitigation", "categoryId": "theme_1", "taxonomyType": "theme", "isRelevant": True},
    {"targetId": "NBT_1", "categoryId": "theme_0", "taxonomyType": "theme", "isRelevant": True},
    {"targetId": "NBT_1", "categoryId": "nbs_3", "taxonomyType": "nbs", "isRelevant": False},
]


@pytest.fixture
def sample_targets():
    return [dict(t) for t in SAMPLE_TARGETS]


@pytest.fixture
def sample_classifications():
    return [dict(c) for c in SAMPLE_CLASSIFICATIONS]


@pytest.fixture
def sample_nbs_categories():
    return [dict(c) for c in SAMPLE_NBS_CATEGORIES]


@pytest.fixture
def sample_themes():
    return [dict(t) for t in SAMPLE_THEMES]


@pytest.fixture
def mock_call_llm():
    """Patch call_llm to return a configurable response without network access."""
    with patch("src.llm.call_llm", new_callable=AsyncMock) as mock:
        mock.return_value = ""
        yield mock


@pytest.fixture
def mock_call_llm_batch():
    """Patch call_llm_batch to return configurable responses without network access."""
    with patch("src.llm.call_llm_batch", new_callable=AsyncMock) as mock:
        mock.return_value = []
        yield mock
