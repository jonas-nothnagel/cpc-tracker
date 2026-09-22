"""Unit tests for parsing and logic functions.

These test pure functions with no LLM calls.
"""

import re

from src.align import parse_alignment, parse_decomposition, generate_pairs
from src.quantitative import _parse_response
from src.parse_ctf import _METADATA_PATTERNS, _TABLE_REF_RE, _normalize_sector


# ---------------------------------------------------------------------------
# parse_alignment — positive alignment levels
# ---------------------------------------------------------------------------


class TestParseAlignmentPositive:
    def test_high_alignment(self):
        raw = "High alignment - Both targets focus on the same ecosystem."
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "high"
        assert "same ecosystem" in explanation
        assert mech is None and mgmt is None and conf is None

    def test_medium_alignment(self):
        raw = "Medium alignment - The targets share goals around reforestation."
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "medium"
        assert "reforestation" in explanation
        assert mech is None

    def test_low_alignment(self):
        raw = "Low alignment - Both mention natural ecosystems but differ."
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "low"
        assert mech is None

    def test_no_alignment(self):
        raw = "No alignment - These targets operate in completely different domains."
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "none"
        assert "different domains" in explanation
        assert mech is None


# ---------------------------------------------------------------------------
# parse_alignment — flagged levels (v2.1 canonical + v1 legacy backward-compat)
# ---------------------------------------------------------------------------


class TestParseAlignmentContradiction:
    def test_likely_conflict_with_type(self):
        """v1 'Likely conflict (Goal conflict)' maps to flagged + fundamental + high."""
        raw = "Likely conflict (Goal conflict) - These targets have directly opposing objectives for the same land resource."
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "flagged"
        assert "opposing objectives" in explanation
        assert mech == "goal_conflict"
        assert mgmt == "fundamental"
        assert conf == "high"

    def test_possible_conflict_with_type(self):
        """v1 'Possible conflict (Resource competition)' maps to flagged + fundamental + medium."""
        raw = "Possible conflict (Resource competition) - Both targets place competing demands on the same rangeland."
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "flagged"
        assert "competing demands" in explanation
        assert mech == "resource_competition"
        assert mgmt == "fundamental"
        assert conf == "medium"

    def test_possible_misalignment_with_type(self):
        """v1 'Possible misalignment (Implementation tension)' maps to flagged + delivery_friction + manageable + medium."""
        raw = "Possible misalignment (Implementation tension) - Rapid irrigation expansion could strain water resources."
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "flagged"
        assert "irrigation" in explanation
        assert mech == "delivery_friction"  # implementation_tension → delivery_friction
        assert mgmt == "manageable"
        assert conf == "medium"

    def test_scale_scope_mismatch_absorbs_into_delivery_friction(self):
        """v1 'Scale/scope mismatch' is absorbed into delivery_friction."""
        raw = "Likely conflict (Scale/scope mismatch) - National vs local scale conflict."
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "flagged"
        assert mech == "delivery_friction"

    def test_conflict_without_type_parenthetical(self):
        """v1 label without (Type) — mechanism falls back to delivery_friction default."""
        raw = "Likely conflict - Targets directly conflict."
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "flagged"
        assert mgmt == "fundamental"
        assert conf == "high"

    def test_case_insensitive(self):
        raw = "LIKELY CONFLICT (GOAL CONFLICT) - Opposing objectives."
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "flagged"
        assert mech == "goal_conflict"

    def test_legacy_high_contradiction_maps_to_flagged(self):
        """Pre-v1 backward-compat: 'High contradiction' parses as flagged + fundamental + high."""
        raw = "High contradiction (Goal conflict) - Opposing objectives."
        level, _, mech, mgmt, conf = parse_alignment(raw)
        assert level == "flagged"
        assert mech == "goal_conflict"
        assert mgmt == "fundamental"
        assert conf == "high"

    def test_legacy_low_tension_maps_to_flagged(self):
        """Pre-v1 backward-compat: 'Low tension' parses as flagged + manageable + medium."""
        raw = "Low tension (Implementation tension) - Irrigation strain."
        level, _, mech, mgmt, conf = parse_alignment(raw)
        assert level == "flagged"
        assert mech == "delivery_friction"
        assert mgmt == "manageable"
        assert conf == "medium"

    def test_v2_canonical_flagged_for_review(self):
        """v2.1 canonical: 'Flagged for review (Mechanism, Manageability, Confidence: Level)'."""
        raw = (
            "Flagged for review (Resource competition, Fundamental, Confidence: High) - "
            "Both targets bind the same finite resource."
        )
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "flagged"
        assert mech == "resource_competition"
        assert mgmt == "fundamental"
        assert conf == "high"
        assert "finite resource" in explanation

    def test_leading_label_wins_over_level_named_in_explanation(self):
        """The verdict is the EARLIEST label in the response. DeepSeek-style
        responses open with the correct label but close the explanation with
        hedging that names another level; dict-order matching used to adopt
        that later mention as the verdict and keep only the trailing
        fragment (usually '.') as the explanation."""
        raw = (
            "Flagged for review (Delivery friction, Manageable, Confidence: Medium) - "
            "The NAP target builds adaptation capacity, while the NBSAP target "
            "integrates biodiversity into land-use planning; capacity-building could "
            "intensify land use, so a reviewer might see this as Low alignment."
        )
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "flagged"
        assert mech == "delivery_friction"
        assert mgmt == "manageable"
        assert conf == "medium"
        assert "adaptation capacity" in explanation

    def test_positive_verdict_restating_another_level_keeps_leading_label(self):
        """Same leading-label rule on the positive side."""
        raw = (
            "Medium alignment - Shared reforestation goals, though a stricter "
            "reading could argue for low alignment given the different regions."
        )
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "medium"
        assert "reforestation" in explanation

    def test_reasoning_first_verdict_on_output_line(self):
        """Llama-style: chain-of-thought that names other levels while
        weighing them, verdict stated last as 'Output: Label - explanation'.
        The old dict-order match adopted the reasoning's 'No alignment'
        mention as the verdict."""
        raw = (
            "Let's compare the targets.\n\n"
            'The alignment is not strong enough to be considered "High alignment" '
            'or "Medium alignment". It\'s also not "No alignment" because both '
            "contribute to broader environmental goals.\n\n"
            "Output:\n"
            "Low alignment - The targets share a broad environmental theme but "
            "differ in their specific objectives and actions."
        )
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "low"
        assert "broad environmental theme" in explanation

    def test_reasoning_first_verdict_inline_with_emphasis(self):
        """Llama-style variant: 'The best answer is: **Label** - explanation'."""
        raw = (
            "Considering the differences in goals and audiences, and the lack of "
            "direct overlap, high alignment can be ruled out.\n\n"
            "The best answer is: **No alignment** - These targets operate in "
            "different domains with distinct goals and audiences."
        )
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "none"
        assert "different domains" in explanation

    def test_reasoning_first_flagged_parenthetical_anchored_at_verdict(self):
        """A reasoning-first flagged verdict must take its (Mechanism, …)
        payload from the verdict statement, not from an earlier parenthetical
        in the chain of thought."""
        raw = (
            "The FSS target (agriculture and irrigation) may compete with the "
            "NBSAP target for water.\n\n"
            "Therefore, the classification is: Flagged for review "
            "(Resource competition, Manageable, Confidence: Medium) - The "
            "irrigation expansion could compete with ecosystem water needs."
        )
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "flagged"
        assert mech == "resource_competition"
        assert mgmt == "manageable"
        assert conf == "medium"
        assert "irrigation expansion" in explanation


# ---------------------------------------------------------------------------
# parse_alignment — fallback / edge cases
# ---------------------------------------------------------------------------


class TestParseAlignmentFallback:
    def test_json_format_positive(self):
        raw = '{"alignment": "medium alignment", "explanation": "Both share forest goals."}'
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "medium"
        assert "forest" in explanation
        assert mech is None

    def test_json_format_v1_contradiction(self):
        raw = '{"alignment": "likely conflict", "contradiction_type": "goal conflict", "explanation": "Opposing goals."}'
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "flagged"
        assert mech == "goal_conflict"

    def test_unknown_defaults_to_none(self):
        raw = "Some completely unexpected LLM response."
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
        assert level == "none"
        assert mech is None

    def test_empty_string(self):
        level, explanation, mech, mgmt, conf = parse_alignment("")
        assert level == "none"
        assert mech is None

    def test_markdown_json_code_block(self):
        raw = '```json\n{"alignment": "low alignment", "explanation": "Weak overlap."}\n```'
        level, explanation, mech, mgmt, conf = parse_alignment(raw)
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
