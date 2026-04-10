"""Shared fixtures for CPC Tracker tests.

All LLM calls are mocked -- no network access or API keys needed.
"""

from __future__ import annotations

import pytest


SAMPLE_TARGETS = [
    {
        "id": "NAP_1",
        "text": "Enhance policies and organizational capacities to support climate change adaptation",
        "sourceDocument": "NAP",
        "sourceLabel": "Target 1",
        "country": "TestCountry",
    },
    {
        "id": "NAP_10",
        "text": "Foster sustainable livestock management that aligns with water and pasture resources",
        "sourceDocument": "NAP",
        "sourceLabel": "Target 10",
        "country": "TestCountry",
    },
    {
        "id": "NDC_Forests_1",
        "text": "Protect natural forests, improve forest health, and enhance forest regeneration capacity",
        "sourceDocument": "NDC",
        "sourceLabel": "Forests 1",
        "country": "TestCountry",
    },
    {
        "id": "NDC_LivestockMitigation",
        "text": "The agricultural sector will reduce 5.277 million tons of CO2 by adhering national livestock herd to 50 million head",
        "sourceDocument": "NDC",
        "sourceLabel": "Livestock mitigation",
        "country": "TestCountry",
    },
    {
        "id": "NBT_1",
        "text": "Ensure 30% of the country is effectively conserved within the National Protected Area Network",
        "sourceDocument": "NBSAP",
        "sourceLabel": "NBT 1",
        "country": "TestCountry",
    },
]

SAMPLE_NBS_CATEGORIES = [
    {"id": "nbs_1", "name": "Agriculture and livestock management", "description": "Climate-smart agriculture and livestock practices"},
    {"id": "nbs_3", "name": "Forest management, restoration, and protection", "description": "Reforestation and forest conservation"},
]

SAMPLE_CLASSIFICATIONS = [
    {"targetId": "NAP_1", "categoryId": "globe_1", "taxonomyType": "globe", "isRelevant": True},
    {"targetId": "NAP_10", "categoryId": "nbs_1", "taxonomyType": "nbs", "isRelevant": True},
    {"targetId": "NAP_10", "categoryId": "globe_1", "taxonomyType": "globe", "isRelevant": True},
    {"targetId": "NDC_Forests_1", "categoryId": "nbs_3", "taxonomyType": "nbs", "isRelevant": True},
    {"targetId": "NDC_Forests_1", "categoryId": "globe_1", "taxonomyType": "globe", "isRelevant": True},
    {"targetId": "NDC_LivestockMitigation", "categoryId": "nbs_1", "taxonomyType": "nbs", "isRelevant": True},
    {"targetId": "NDC_LivestockMitigation", "categoryId": "globe_2", "taxonomyType": "globe", "isRelevant": True},
    {"targetId": "NBT_1", "categoryId": "globe_1", "taxonomyType": "globe", "isRelevant": True},
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
