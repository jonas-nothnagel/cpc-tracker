"""Unit tests for the shared synthesis style validator + sanitizer."""

from __future__ import annotations

import pytest

from src.llm import set_language
from src.synthesis_style import (
    check_pathway,
    check_prose,
    check_theme_name,
    sanitize_name,
    sanitize_prose,
)


@pytest.fixture(autouse=True)
def _reset_language():
    """Style checks read the pipeline-wide language; leave it as we found it."""
    set_language(None)
    yield
    set_language(None)


class TestCheckThemeName:
    def test_imperative_verb_fails(self):
        violations = check_theme_name("Review land competition from expansion incentives")
        assert any("imperative" in v for v in violations)

    def test_noun_phrase_passes(self):
        assert check_theme_name("Land requirements of expansion incentives") == []

    def test_use_of_false_positive_passes(self):
        # "Use" is blocklisted but "Use of ..." is a noun phrase.
        assert check_theme_name("Use of governance and monitoring systems across sectors") == []

    def test_balance_and_passes(self):
        assert check_theme_name("Balance and sequencing of land using goals") == []

    def test_too_short(self):
        violations = check_theme_name("Land use themes")
        assert any("4-10 words" in v for v in violations)

    def test_too_long(self):
        name = "A very long theme name that keeps going on and on forever"
        violations = check_theme_name(name)
        assert any("4-10 words" in v for v in violations)

    def test_trailing_period(self):
        violations = check_theme_name("Land requirements of expansion incentives.")
        assert any("trailing period" in v for v in violations)

    def test_empty_name(self):
        assert check_theme_name("") == ["name: missing or empty"]

    def test_language_gate_skips_imperative_check(self):
        set_language("mn")
        assert check_theme_name("Review land competition from expansion incentives") == []
        set_language("en")
        assert check_theme_name("Review land competition from expansion incentives") != []


class TestCheckProse:
    def test_clean_prose_passes(self):
        text = (
            "Both documents anchor delivery in shared monitoring systems, "
            "which may support joint implementation."
        )
        assert check_prose(text, "description") == []

    @pytest.mark.parametrize(
        "word",
        ["tension", "tensions", "contradiction", "contradicts", "contradictory",
         "friction", "frictions", "conflict", "conflicts", "should", "must",
         "reinforces", "reinforcing"],
    )
    def test_banned_words_fail(self, word):
        assert check_prose(f"This text mentions {word} explicitly.", "f") != []

    def test_flagged_for_review_phrase_fails(self):
        assert check_prose("Twelve pairs were flagged  for review.", "f") != []

    def test_flagged_alone_passes(self):
        assert check_prose("Twelve pairs were flagged in this subset.", "f") == []

    def test_word_boundary_mustard(self):
        # "must" must never match inside "mustard".
        assert check_prose("Mustard cultivation expands in the region.", "f") == []

    def test_word_boundary_conflicting(self):
        # \bconflicts?\b does not swallow "conflicting"; documents the boundary.
        assert check_prose("There are conflicting accounts.", "f") == []

    def test_em_dash_fails(self):
        assert check_prose("A pattern — one worth noting.", "f") != []

    def test_en_dash_fails(self):
        assert check_prose("A pattern – one worth noting.", "f") != []

    def test_language_gate_skips_lexical_keeps_dash(self):
        set_language("es")
        assert check_prose("Una tensión evidente.", "f") == []
        assert check_prose("Un patrón — importante.", "f") != []

    def test_empty_passes(self):
        assert check_prose("", "f") == []
        assert check_prose(None, "f") == []


class TestCheckPathway:
    def test_one_hedged_sentence_passes(self):
        assert check_pathway(
            "Joint monitoring between the two plans could offer a starting point."
        ) == []

    def test_two_sentences_fail(self):
        violations = check_pathway("Do this. Then that could help.")
        assert any("one sentence" in v for v in violations)

    def test_missing_hedge_fails(self):
        violations = check_pathway("Joint monitoring offers a starting point.")
        assert any("hedge" in v for v in violations)

    def test_worth_a_closer_look_hedges(self):
        assert check_pathway(
            "Boundary definitions between the two plans are worth a closer look."
        ) == []

    def test_eg_abbreviation_is_not_a_sentence_break(self):
        assert check_pathway(
            "Shared indicators, e.g. land cover baselines, could anchor joint review."
        ) == []

    def test_missing_pathway(self):
        assert check_pathway("") == ["pathway: missing or empty"]

    def test_language_gate_skips_hedge_check(self):
        set_language("mn")
        assert check_pathway("Хамтарсан хяналт эхлэл болж болно.") == []


class TestSanitizeProse:
    def test_substitutions(self):
        assert sanitize_prose("A tension between goals.") == "A potential misalignment between goals."
        assert sanitize_prose("Recurring tensions and conflicts.") == (
            "Recurring potential misalignments and potential misalignments."
        )
        assert sanitize_prose("It reinforces the target.") == "It aligns with the target."
        assert sanitize_prose("They should act; they must decide.") == (
            "They could act; they may decide."
        )
        assert sanitize_prose("Pairs flagged for review here.") == (
            "Pairs identified for review here."
        )

    def test_case_preserved(self):
        assert sanitize_prose("Friction recurs.") == "Potential misalignment recurs."
        assert sanitize_prose("Should both act, both win.") == "Could both act, both win."

    def test_contradict_verb_forms(self):
        assert sanitize_prose("A contradicts B.") == "A may not align with B."
        assert sanitize_prose("Contradictory goals persist.") == "Potentially misaligned goals persist."

    def test_word_boundaries_untouched(self):
        assert sanitize_prose("Mustard fields expand.") == "Mustard fields expand."
        assert sanitize_prose("Conflicting accounts remain.") == "Conflicting accounts remain."

    def test_dashes_replaced(self):
        assert sanitize_prose("A pattern — worth noting — recurs.") == (
            "A pattern, worth noting, recurs."
        )

    def test_non_string_passthrough(self):
        assert sanitize_prose(None) is None
        assert sanitize_prose("") == ""


class TestSanitizeName:
    def test_strips_imperative_prefix(self):
        assert sanitize_name("Review land competition from expansion incentives") == (
            "Land competition from expansion incentives"
        )

    def test_keeps_noun_phrase(self):
        assert sanitize_name("Use of governance and monitoring systems") == (
            "Use of governance and monitoring systems"
        )

    def test_strips_trailing_period(self):
        assert sanitize_name("Land requirements of expansion incentives.") == (
            "Land requirements of expansion incentives"
        )

    def test_language_gate_keeps_prefix(self):
        set_language("mn")
        assert sanitize_name("Review land competition from expansion incentives") == (
            "Review land competition from expansion incentives"
        )
