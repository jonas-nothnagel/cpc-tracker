"""Unit tests for parsing and logic functions.

These test pure functions with no LLM calls.
"""

import re

from src.align import parse_alignment, parse_decomposition, generate_pairs
from src.classify import parse_classification
from src.quantitative import _parse_response
from src.parse_ctf import _METADATA_PATTERNS, _TABLE_REF_RE, _normalize_sector


# ---------------------------------------------------------------------------
# parse_alignment — positive alignment levels
# ---------------------------------------------------------------------------


class TestParseAlignmentPositive:
    def test_high_alignment(self):
        raw = "High alignment - Both targets focus on the same ecosystem."
        level, explanation, ctype = parse_alignment(raw)
        assert level == "high"
        assert "same ecosystem" in explanation
        assert ctype is None

    def test_medium_alignment(self):
        raw = "Medium alignment - The targets share goals around reforestation."
        level, explanation, ctype = parse_alignment(raw)
        assert level == "medium"
        assert "reforestation" in explanation
        assert ctype is None

    def test_low_alignment(self):
        raw = "Low alignment - Both mention natural ecosystems but differ."
        level, explanation, ctype = parse_alignment(raw)
        assert level == "low"
        assert ctype is None

    def test_no_alignment(self):
        raw = "No alignment - These targets operate in completely different domains."
        level, explanation, ctype = parse_alignment(raw)
        assert level == "none"
        assert "different domains" in explanation
        assert ctype is None


# ---------------------------------------------------------------------------
# parse_alignment — contradiction levels
# ---------------------------------------------------------------------------


class TestParseAlignmentContradiction:
    def test_likely_conflict_with_type(self):
        raw = "Likely conflict (Goal conflict) - These targets have directly opposing objectives for the same land resource."
        level, explanation, ctype = parse_alignment(raw)
        assert level == "likely_conflict"
        assert "opposing objectives" in explanation
        assert ctype == "goal_conflict"

    def test_possible_conflict_with_type(self):
        raw = "Possible conflict (Resource competition) - Both targets place competing demands on the same rangeland."
        level, explanation, ctype = parse_alignment(raw)
        assert level == "possible_conflict"
        assert "competing demands" in explanation
        assert ctype == "resource_competition"

    def test_possible_misalignment_with_type(self):
        raw = "Possible misalignment (Implementation tension) - Rapid irrigation expansion could strain water resources."
        level, explanation, ctype = parse_alignment(raw)
        assert level == "possible_misalignment"
        assert "irrigation" in explanation
        assert ctype == "implementation_tension"

    def test_scale_scope_mismatch_type(self):
        raw = "Likely conflict (Scale/scope mismatch) - National vs local scale conflict."
        level, explanation, ctype = parse_alignment(raw)
        assert level == "likely_conflict"
        assert ctype == "scale_scope_mismatch"

    def test_conflict_without_type_parenthetical(self):
        raw = "Likely conflict - Targets directly conflict."
        level, explanation, ctype = parse_alignment(raw)
        assert level == "likely_conflict"
        assert ctype is None

    def test_case_insensitive(self):
        raw = "LIKELY CONFLICT (GOAL CONFLICT) - Opposing objectives."
        level, explanation, ctype = parse_alignment(raw)
        assert level == "likely_conflict"
        assert ctype == "goal_conflict"

    def test_legacy_high_contradiction_maps_to_likely_conflict(self):
        """Backward-compat: LLM regression to old wording still parses cleanly."""
        raw = "High contradiction (Goal conflict) - Opposing objectives."
        level, _, ctype = parse_alignment(raw)
        assert level == "likely_conflict"
        assert ctype == "goal_conflict"

    def test_legacy_low_tension_maps_to_possible_misalignment(self):
        """Backward-compat: LLM regression to old wording still parses cleanly."""
        raw = "Low tension (Implementation tension) - Irrigation strain."
        level, _, ctype = parse_alignment(raw)
        assert level == "possible_misalignment"
        assert ctype == "implementation_tension"


# ---------------------------------------------------------------------------
# parse_alignment — fallback / edge cases
# ---------------------------------------------------------------------------


class TestParseAlignmentFallback:
    def test_json_format_positive(self):
        raw = '{"alignment": "medium alignment", "explanation": "Both share forest goals."}'
        level, explanation, ctype = parse_alignment(raw)
        assert level == "medium"
        assert "forest" in explanation
        assert ctype is None

    def test_json_format_contradiction(self):
        raw = '{"alignment": "likely conflict", "contradiction_type": "goal conflict", "explanation": "Opposing goals."}'
        level, explanation, ctype = parse_alignment(raw)
        assert level == "likely_conflict"

    def test_unknown_defaults_to_none(self):
        raw = "Some completely unexpected LLM response."
        level, explanation, ctype = parse_alignment(raw)
        assert level == "none"
        assert ctype is None

    def test_empty_string(self):
        level, explanation, ctype = parse_alignment("")
        assert level == "none"
        assert ctype is None

    def test_markdown_json_code_block(self):
        raw = '```json\n{"alignment": "low alignment", "explanation": "Weak overlap."}\n```'
        level, explanation, ctype = parse_alignment(raw)
        assert level == "low"


# ---------------------------------------------------------------------------
# parse_decomposition
# ---------------------------------------------------------------------------


class TestParseDecomposition:
    def test_json_format(self):
        raw = '{"Goal/Purpose": "Protect forests", "Action/Intervention": "Afforestation", "Ecosystem/Area": "Forests", "Target Audience": "Government", "Expected Impact/Outcome": "More forest cover"}'
        result = parse_decomposition(raw)
        assert result["Goal/Purpose"] == "Protect forests"
        assert result["Action/Intervention"] == "Afforestation"
        assert result["Ecosystem/Area"] == "Forests"

    def test_json_with_code_fences(self):
        raw = '```json\n{"Goal/Purpose": "Reduce emissions", "Action/Intervention": "Clean tech", "Ecosystem/Area": "Energy", "Target Audience": "Industry", "Expected Impact/Outcome": "Lower CO2"}\n```'
        result = parse_decomposition(raw)
        assert result["Goal/Purpose"] == "Reduce emissions"

    def test_alternative_key_names(self):
        raw = '{"goal_purpose": "Adapt to climate", "action_intervention": "Build defenses", "ecosystem_area": "Coastal", "target_audience": "Communities", "expected_impact": "Less flooding"}'
        result = parse_decomposition(raw)
        assert result["Goal/Purpose"] == "Adapt to climate"

    def test_raw_fallback(self):
        raw = "This is just plain text that is not JSON"
        result = parse_decomposition(raw)
        assert result["Goal/Purpose"] == raw
        assert result["Action/Intervention"] == ""


# ---------------------------------------------------------------------------
# parse_classification
# ---------------------------------------------------------------------------


class TestParseClassification:
    def test_returns_true_for_1(self):
        assert parse_classification("1") is True

    def test_returns_false_for_0(self):
        assert parse_classification("0") is False

    def test_returns_true_for_1_with_whitespace(self):
        assert parse_classification("  1  ") is True

    def test_returns_false_for_0_with_quotes(self):
        assert parse_classification('"0"') is False

    def test_yes_keyword(self):
        assert parse_classification("Yes, the target pertains to this category.") is True

    def test_no_keyword_fallback(self):
        assert parse_classification("No clear connection") is False


# ---------------------------------------------------------------------------
# generate_pairs
# ---------------------------------------------------------------------------


class TestGeneratePairs:
    def test_cross_document_only(self, sample_targets):
        pairs = generate_pairs(sample_targets)
        for ta, tb in pairs:
            assert ta["sourceDocument"] != tb["sourceDocument"], \
                f"Same-document pair found: {ta['id']} and {tb['id']}"

    def test_cross_document_pair_present(self, sample_targets):
        pairs = generate_pairs(sample_targets)
        assert len(pairs) > 0

        # NAP_1 and NDC_Forests_1 are in different documents, so they should pair
        # regardless of taxonomy overlap (classification pre-filter was removed
        # in ae00da0).
        pair_ids = {tuple(sorted([ta["id"], tb["id"]])) for ta, tb in pairs}
        assert ("NAP_1", "NDC_Forests_1") in pair_ids or ("NDC_Forests_1", "NAP_1") in pair_ids

    def test_pairs_cross_doc_regardless_of_categories(self):
        # Two targets in different documents with non-overlapping categories
        # are still paired; relevance is judged by the alignment LLM itself,
        # not by classification overlap.
        targets = [
            {"id": "A", "sourceDocument": "NAP", "text": "target a"},
            {"id": "B", "sourceDocument": "NDC", "text": "target b"},
        ]
        pairs = generate_pairs(targets)
        assert len(pairs) == 1

    def test_empty_targets(self):
        pairs = generate_pairs([])
        assert len(pairs) == 0

    def test_single_document_type(self):
        targets = [
            {"id": "A", "sourceDocument": "NAP", "text": "a"},
            {"id": "B", "sourceDocument": "NAP", "text": "b"},
        ]
        pairs = generate_pairs(targets)
        assert len(pairs) == 0


# ---------------------------------------------------------------------------
# quantitative response parsing
# ---------------------------------------------------------------------------


class TestQuantitativeParsing:
    def test_parse_json_array(self):
        raw = '[{"targetId":"NAP_1","isQuantitative":false,"isTimeBound":false,"quantitativeDetails":"","timeBoundDetails":""}]'
        result = _parse_response(raw)
        assert len(result) == 1
        assert result[0]["targetId"] == "NAP_1"
        assert result[0]["isQuantitative"] is False

    def test_parse_markdown_code_block(self):
        raw = '```json\n[{"targetId":"NAP_1","isQuantitative":true,"isTimeBound":true,"quantitativeDetails":"30%","timeBoundDetails":"by 2030"}]\n```'
        result = _parse_response(raw)
        assert len(result) == 1
        assert result[0]["isQuantitative"] is True
        assert result[0]["quantitativeDetails"] == "30%"

    def test_parse_multiple_targets(self):
        raw = '[{"targetId":"A","isQuantitative":true,"isTimeBound":false,"quantitativeDetails":"50%","timeBoundDetails":""},{"targetId":"B","isQuantitative":false,"isTimeBound":true,"quantitativeDetails":"","timeBoundDetails":"by 2035"}]'
        result = _parse_response(raw)
        assert len(result) == 2


# ---------------------------------------------------------------------------
# CTF support table metadata filtering
# ---------------------------------------------------------------------------


class TestSupportTableFiltering:
    def test_notation_key_is_metadata(self):
        title = "Notation keys: NA = not applicable; UA = information not available"
        assert any(pat.match(title) for pat in _METADATA_PATTERNS)

    def test_custom_footnotes_is_metadata(self):
        title = "Custom footnotes:"
        assert any(pat.match(title) for pat in _METADATA_PATTERNS)

    def test_numbered_footnote_is_metadata(self):
        title = "(1) The underlying assumptions, definitions and methodologies"
        assert any(pat.match(title) for pat in _METADATA_PATTERNS)

    def test_letter_footnote_is_metadata(self):
        title = "a  This column should contain information"
        assert any(pat.match(title) for pat in _METADATA_PATTERNS)

    def test_real_project_title_passes(self):
        title = "ADB- Promotion of the Northeast Asia Power System Interconnection"
        assert not any(pat.match(title) for pat in _METADATA_PATTERNS)

    def test_table_suffix_stripped(self):
        raw = "ADB- Promotion of Power System - TableIII.7"
        cleaned = _TABLE_REF_RE.sub("", raw).strip()
        assert cleaned == "ADB- Promotion of Power System"

    def test_table_suffix_different_number(self):
        raw = "Some project - TableII.5"
        cleaned = _TABLE_REF_RE.sub("", raw).strip()
        assert cleaned == "Some project"

    def test_no_table_suffix_unchanged(self):
        raw = "ADB- Supporting renewable energy development"
        cleaned = _TABLE_REF_RE.sub("", raw).strip()
        assert cleaned == raw


class TestNormalizeSectorEmpty:
    def test_empty_string_returns_other(self):
        assert _normalize_sector("") == "sector_other"

    def test_whitespace_returns_other(self):
        assert _normalize_sector("   ") == "sector_other"

    def test_energy_still_works(self):
        assert _normalize_sector("Energy") == "sector_energy"
