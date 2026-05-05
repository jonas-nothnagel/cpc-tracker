"""Unit tests for the extraction pipeline's claim-grounding validator.

The validator is the load-bearing safety net behind the verbatim contract:
if the LLM ever invents a number / year / unit that is not in any source
span, the validator catches it and stamps `_provenanceFlag` so the
dashboard can surface a review badge instead of silently shipping the
fabricated claim.
"""

from __future__ import annotations

from src.extract import (
    _extract_claims,
    _log_unsourced_activities,
    _log_unsourced_claims,
    _normalise_claim,
    _parse_json_array,
    _parse_sources,
    validate_claim_grounding,
)


# ---------------------------------------------------------------------------
# _extract_claims / _normalise_claim
# ---------------------------------------------------------------------------


class TestExtractClaims:
    def test_percent(self):
        assert _extract_claims("reduce by 30%") == {"30%"}
        assert _extract_claims("1.5% increase") >= {"15%"}  # decimal normalises

    def test_year(self):
        assert _extract_claims("by 2030") == {"2030"}
        assert _extract_claims("between 2025 and 2050") == {"2025", "2050"}

    def test_quantity_with_unit(self):
        claims = _extract_claims("5.277 million tons of CO2")
        assert "5277" in claims  # period normalised away
        # The "5.277 million tons" literal also lands in the set
        assert any("milliontons" in c for c in claims)

    def test_thousand_separated_number(self):
        claims = _extract_claims("100,000 ha across 23,500 farms")
        assert "100000ha" in claims
        # bare 23,500 normalises to 23500
        assert "23500" in claims

    def test_no_claims_in_qualitative_text(self):
        assert _extract_claims("strengthen institutional capacity") == set()

    def test_normalisation_collapses_separators(self):
        # The whole point: 5,277 / 5.277 / 5277 must compare equal
        assert _normalise_claim("5,277") == _normalise_claim("5.277") == _normalise_claim("5277")


# ---------------------------------------------------------------------------
# validate_claim_grounding
# ---------------------------------------------------------------------------


class TestValidateClaimGrounding:
    def test_verbatim_grounded(self):
        target = {
            "text": "Reduce emissions by 30% by 2030",
            "sources": [{"sourceText": "Reduce greenhouse gas emissions by 30% by 2030."}],
        }
        assert validate_claim_grounding(target) == []

    def test_synthesis_grounded_across_multiple_sources(self):
        target = {
            "text": "Reduce emissions 30% by 2030 across 5,277 farms",
            "sources": [
                {"sourceText": "Reduce greenhouse gas emissions by 30% by 2030"},
                {"sourceText": "covering 5,277 farms in the agricultural sector"},
            ],
        }
        assert validate_claim_grounding(target) == []

    def test_ungrounded_percent(self):
        target = {
            "text": "Reduce emissions 50% by 2030",
            "sources": [{"sourceText": "Reduce emissions 30% by 2030"}],
        }
        missing = validate_claim_grounding(target)
        assert "50%" in missing

    def test_ungrounded_year(self):
        target = {
            "text": "Reduce emissions by 2050",
            "sources": [{"sourceText": "Reduce emissions by 2030"}],
        }
        missing = validate_claim_grounding(target)
        assert "2050" in missing

    def test_ungrounded_unit(self):
        target = {
            "text": "Restore 200,000 ha of forest",
            "sources": [{"sourceText": "Restore 100,000 ha of forest"}],
        }
        missing = validate_claim_grounding(target)
        # 200,000 ha not in source — flagged
        assert any("200000ha" in m for m in missing)

    def test_no_sources_passes_silently(self):
        # Validator only flags claims, not missing-sources policy. A target
        # with no sources is the caller's problem to flag elsewhere.
        target = {"text": "Reduce 30% by 2030", "sources": []}
        assert validate_claim_grounding(target) == []

    def test_empty_text_returns_empty(self):
        target = {"text": "", "sources": [{"sourceText": "anything"}]}
        assert validate_claim_grounding(target) == []

    def test_period_vs_comma_separator_grounded(self):
        # The locale-fix: source uses "5,277" but LLM emits "5.277" — must
        # not false-flag, since both denote the same quantity.
        target = {
            "text": "Reduce by 5.277 million tons",
            "sources": [{"sourceText": "Reduce by 5,277 million tons"}],
        }
        assert validate_claim_grounding(target) == []


# ---------------------------------------------------------------------------
# _log_unsourced_claims (mutates targets in place)
# ---------------------------------------------------------------------------


class TestLogUnsourcedClaims:
    def test_clean_targets_unflagged(self):
        targets = [
            {
                "text": "Reduce 30% by 2030",
                "label": "T1",
                "sources": [{"sourceText": "Reduce 30% by 2030"}],
            }
        ]
        _log_unsourced_claims(targets)
        assert "_provenanceFlag" not in targets[0]

    def test_dirty_target_flagged(self):
        targets = [
            {
                "text": "Reduce 50% by 2040",
                "label": "T1",
                "sources": [{"sourceText": "Reduce 30% by 2030"}],
            }
        ]
        _log_unsourced_claims(targets)
        flag = targets[0].get("_provenanceFlag", "")
        assert flag.startswith("UNSOURCED CLAIMS")
        assert "50%" in flag and "2040" in flag


# ---------------------------------------------------------------------------
# _log_unsourced_activities (Phase 3 parity with target validation)
# ---------------------------------------------------------------------------


class TestLogUnsourcedActivities:
    def test_grounded_activity_unflagged(self):
        targets = [
            {
                "label": "T1",
                "activitySources": [
                    {
                        "text": "Plant 100,000 trees by 2030",
                        "sourceText": "The plan is to plant 100,000 trees by 2030",
                    }
                ],
            }
        ]
        _log_unsourced_activities(targets)
        assert "_provenanceFlag" not in targets[0]["activitySources"][0]

    def test_ungrounded_activity_flagged(self):
        targets = [
            {
                "label": "T1",
                "activitySources": [
                    {
                        "text": "Plant 500,000 trees by 2050",
                        "sourceText": "The plan is to plant 100,000 trees by 2030",
                    }
                ],
            }
        ]
        _log_unsourced_activities(targets)
        flag = targets[0]["activitySources"][0].get("_provenanceFlag", "")
        assert flag.startswith("UNSOURCED CLAIMS")

    def test_activity_without_sourcetext_skipped(self):
        # Legacy / string-only activities have no sourceText; validator
        # silently skips them rather than false-flagging.
        targets = [
            {
                "label": "T1",
                "activitySources": [{"text": "Some activity"}],
            }
        ]
        _log_unsourced_activities(targets)
        assert "_provenanceFlag" not in targets[0]["activitySources"][0]


# ---------------------------------------------------------------------------
# _parse_sources / _parse_json_array — schema bridge
# ---------------------------------------------------------------------------


class TestParseSources:
    def test_new_schema_array(self):
        item = {"sources": [{"sourceText": "verbatim quote", "section": "2.1"}]}
        out = _parse_sources(item)
        assert out == [{"sourceText": "verbatim quote", "section": "2.1"}]

    def test_legacy_single_source(self):
        item = {"sourceText": "verbatim quote"}
        assert _parse_sources(item) == [{"sourceText": "verbatim quote"}]

    def test_empty_strings_dropped(self):
        item = {"sources": [{"sourceText": "  "}, {"sourceText": "real"}]}
        assert _parse_sources(item) == [{"sourceText": "real"}]

    def test_section_truncated_to_120(self):
        long_section = "x" * 200
        item = {"sources": [{"sourceText": "q", "section": long_section}]}
        out = _parse_sources(item)
        assert len(out[0]["section"]) == 120


class TestParseJsonArrayCleanupDefault:
    def test_explicit_textcleanup_preserved(self):
        raw = (
            '[{"text": "Reduce 30% by 2030", "label": "T1", '
            '"textCleanup": "synthesis", '
            '"sources": [{"sourceText": "first source"}, '
            '{"sourceText": "second source"}]}]'
        )
        items = _parse_json_array(raw)
        assert items[0]["textCleanup"] == "synthesis"

    def test_invalid_textcleanup_falls_through_to_default(self):
        raw = (
            '[{"text": "Reduce 30% by 2030", "label": "T1", '
            '"textCleanup": "garbage", '
            '"sources": [{"sourceText": "Reduce 30% by 2030"}]}]'
        )
        items = _parse_json_array(raw)
        # "garbage" not valid; default kicks in based on text==source
        assert items[0]["textCleanup"] == "verbatim"

    def test_default_cleaned_when_text_diverges_from_source(self):
        raw = (
            '[{"text": "Reduce 30% by 2030", "label": "T1", '
            '"sources": [{"sourceText": "1. Reduce 30% by 2030."}]}]'
        )
        items = _parse_json_array(raw)
        assert items[0]["textCleanup"] == "cleaned"
