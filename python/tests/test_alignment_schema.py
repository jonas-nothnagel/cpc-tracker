"""Unit tests for alignment_schema: parser, label maps, legacy migration."""

from __future__ import annotations

import pytest

from src.alignment_schema import (
    ALIGNMENT_MAP,
    CONFIDENCE_MAP,
    FLAGGED_LEVELS,
    LEGACY_LEVEL_TO_FIELDS,
    LEGACY_TYPE_TO_MECHANISM,
    MANAGEABILITY_MAP,
    MECHANISM_MAP,
    migrate_legacy_record,
    parse_alignment,
)


# ---------------------------------------------------------------------------
# Positive scale (unchanged from v1)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected_level",
    [
        ("No alignment - completely unrelated.", "none"),
        ("Low alignment - tangential overlap only.", "low"),
        ("Medium alignment - compatible priorities.", "medium"),
        ("High alignment - directly support each other.", "high"),
    ],
)
def test_positive_levels_parse(raw, expected_level):
    level, expl, mech, mgmt, conf = parse_alignment(raw)
    assert level == expected_level
    assert mech is None and mgmt is None and conf is None
    assert expl  # explanation extracted


# ---------------------------------------------------------------------------
# v2.1 canonical flagged
# ---------------------------------------------------------------------------


def test_v2_flagged_goal_conflict_fundamental_high():
    raw = (
        "Flagged for review (Goal conflict, Fundamental, Confidence: High) - "
        "Targets contradict each other on the same land base."
    )
    level, expl, mech, mgmt, conf = parse_alignment(raw)
    assert level == "flagged"
    assert mech == "goal_conflict"
    assert mgmt == "fundamental"
    assert conf == "high"
    assert "contradict" in expl.lower()


def test_v2_flagged_resource_competition_manageable_medium():
    raw = (
        "Flagged for review (Resource competition, Manageable, Confidence: Medium) - "
        "Localised competition for the same physical resource."
    )
    level, expl, mech, mgmt, conf = parse_alignment(raw)
    assert level == "flagged"
    assert mech == "resource_competition"
    assert mgmt == "manageable"
    assert conf == "medium"


def test_v2_flagged_delivery_friction_low_confidence():
    raw = (
        "Flagged for review (Delivery friction, Manageable, Confidence: Low) - "
        "Link is two steps removed from the policy text."
    )
    level, expl, mech, mgmt, conf = parse_alignment(raw)
    assert level == "flagged"
    assert mech == "delivery_friction"
    assert mgmt == "manageable"
    assert conf == "low"


def test_v2_flagged_tolerates_attribute_ordering():
    """Order within the parenthetical should not matter."""
    raw = (
        "Flagged for review (Manageable, Confidence: High, Goal conflict) - "
        "Reordered sub-fields."
    )
    level, expl, mech, mgmt, conf = parse_alignment(raw)
    assert level == "flagged"
    assert mech == "goal_conflict"
    assert mgmt == "manageable"
    assert conf == "high"


# ---------------------------------------------------------------------------
# v1 backward-compat (legacy LLM strings still parse)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected_mgmt,expected_conf,expected_mech",
    [
        # possible_misalignment maps to (flagged, manageable, medium)
        (
            "Possible misalignment (Implementation tension) - minor friction.",
            "manageable",
            "medium",
            "delivery_friction",  # implementation_tension → delivery_friction
        ),
        # possible_conflict maps to (flagged, fundamental, medium)
        (
            "Possible conflict (Resource competition) - clear conflict.",
            "fundamental",
            "medium",
            "resource_competition",
        ),
        # likely_conflict maps to (flagged, fundamental, high)
        (
            "Likely conflict (Goal conflict) - directly opposing objectives.",
            "fundamental",
            "high",
            "goal_conflict",
        ),
    ],
)
def test_v1_legacy_severity_levels_back_compat(
    raw, expected_mgmt, expected_conf, expected_mech
):
    level, expl, mech, mgmt, conf = parse_alignment(raw)
    assert level == "flagged"
    assert mech == expected_mech
    assert mgmt == expected_mgmt
    assert conf == expected_conf


@pytest.mark.parametrize(
    "raw,expected_mgmt",
    [
        # pre-v1 vocabulary
        ("Low tension (Implementation tension) - small friction.", "manageable"),
        ("Moderate contradiction (Resource competition) - clear conflict.", "fundamental"),
        ("High contradiction (Goal conflict) - opposing objectives.", "fundamental"),
    ],
)
def test_pre_v1_legacy_vocabulary_still_parses(raw, expected_mgmt):
    level, expl, mech, mgmt, conf = parse_alignment(raw)
    assert level == "flagged"
    assert mgmt == expected_mgmt


# ---------------------------------------------------------------------------
# JSON fallback (older prompt format)
# ---------------------------------------------------------------------------


def test_json_fallback_v2_shape():
    raw = (
        '{"alignment": "Flagged for review", "mechanism": "Resource competition", '
        '"manageability": "Fundamental", "confidence": "High", '
        '"description": "Both targets bind the same finite resource."}'
    )
    level, expl, mech, mgmt, conf = parse_alignment(raw)
    assert level == "flagged"
    assert mech == "resource_competition"
    assert mgmt == "fundamental"
    assert conf == "high"
    assert "finite resource" in expl


def test_json_fallback_v1_shape_contradiction_type():
    raw = (
        '{"alignment": "Possible misalignment", '
        '"contradictionType": "implementation_tension", '
        '"description": "minor friction"}'
    )
    level, expl, mech, mgmt, conf = parse_alignment(raw)
    assert level == "flagged"
    assert mech == "delivery_friction"  # legacy alias


# ---------------------------------------------------------------------------
# Garbled / unparseable inputs
# ---------------------------------------------------------------------------


def test_unparseable_falls_back_to_none():
    level, expl, mech, mgmt, conf = parse_alignment(
        "this response does not contain any recognised label"
    )
    assert level == "none"
    assert mech is None
    assert mgmt is None
    assert conf is None


# ---------------------------------------------------------------------------
# Legacy record migration
# ---------------------------------------------------------------------------


def test_migrate_legacy_possible_misalignment():
    legacy = {
        "targetAId": "A",
        "targetBId": "B",
        "alignment": "possible_misalignment",
        "contradictionType": "implementation_tension",
        "description": "minor friction",
    }
    migrated = migrate_legacy_record(legacy)
    assert migrated["alignment"] == "flagged"
    assert migrated["mechanism"] == "delivery_friction"
    assert migrated["manageability"] == "manageable"
    assert migrated["confidence"] == "medium"
    assert "contradictionType" not in migrated
    assert migrated["description"] == "minor friction"


def test_migrate_legacy_likely_conflict_goal_conflict():
    legacy = {
        "targetAId": "A",
        "targetBId": "B",
        "alignment": "likely_conflict",
        "contradictionType": "goal_conflict",
        "description": "direct opposition",
    }
    migrated = migrate_legacy_record(legacy)
    assert migrated["alignment"] == "flagged"
    assert migrated["mechanism"] == "goal_conflict"
    assert migrated["manageability"] == "fundamental"
    assert migrated["confidence"] == "high"


def test_migrate_legacy_possible_conflict_scale_scope_absorbs_into_delivery():
    legacy = {
        "alignment": "possible_conflict",
        "contradictionType": "scale_scope_mismatch",
    }
    migrated = migrate_legacy_record(legacy)
    assert migrated["alignment"] == "flagged"
    assert migrated["mechanism"] == "delivery_friction"  # absorbed
    assert migrated["manageability"] == "fundamental"


def test_migrate_v2_record_passes_through_unchanged():
    v2 = {
        "alignment": "flagged",
        "mechanism": "resource_competition",
        "manageability": "fundamental",
        "confidence": "high",
        "description": "x",
    }
    assert migrate_legacy_record(v2) == v2


def test_migrate_positive_record_passes_through_unchanged():
    pos = {"alignment": "high", "description": "directly support"}
    assert migrate_legacy_record(pos) == pos


def test_migrate_handles_missing_contradiction_type():
    """If an old record has a legacy level but no contradictionType, default to delivery_friction."""
    legacy = {"alignment": "possible_misalignment", "description": "x"}
    migrated = migrate_legacy_record(legacy)
    assert migrated["alignment"] == "flagged"
    assert migrated["mechanism"] == "delivery_friction"


# ---------------------------------------------------------------------------
# Label-map coverage sanity
# ---------------------------------------------------------------------------


def test_all_legacy_levels_have_migration():
    for legacy_key in LEGACY_LEVEL_TO_FIELDS:
        new_level, mgmt, conf = LEGACY_LEVEL_TO_FIELDS[legacy_key]
        assert new_level == "flagged"
        assert mgmt in MANAGEABILITY_MAP.values()
        assert conf in CONFIDENCE_MAP.values()


def test_all_legacy_mechanisms_map_to_canonical():
    for legacy_type, canonical in LEGACY_TYPE_TO_MECHANISM.items():
        assert canonical in {"goal_conflict", "resource_competition", "delivery_friction"}


def test_flagged_levels_is_singleton():
    """v2.1 collapses 3 v1 severity levels into one flagged state."""
    assert FLAGGED_LEVELS == {"flagged"}


def test_no_legacy_label_aliases_remain_in_canonical_set():
    """Sanity check: the v1 'possible_misalignment' enum should NOT appear as an ALIGNMENT_MAP value."""
    values = set(ALIGNMENT_MAP.values())
    assert values == {"none", "low", "medium", "high", "flagged"}
