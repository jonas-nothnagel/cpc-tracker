"""Unit tests for the shared text-matching helpers (src/extract_validation).

These helpers back BOTH the shipped quote-in-document validator and the
evaluation harness's metrics, so their behaviour is load-bearing twice over:
a bug here either lets a hallucinated quote ship unflagged or silently skews
the eval numbers.
"""

from __future__ import annotations

from src.extract_validation import (
    MatchCorpus,
    collapse_whitespace,
    ngram_jaccard,
    normalise_for_matching,
    text_similarity,
    validate_quotes_in_document,
    word_ngrams,
)

DOC = """\
Chapter 3 — National commitments

The Government will increase forest area to 9% by 2030 through re-
forestation activities, and rehabilitate degraded forest areas.

“Reduce bare fallow to 30%” is a stated objective of the crop sector,
alongside the introduction of a crop-rotation system.

Тогтвортой хөгжлийн зорилтууд нь бэлчээрийн доройтлыг бууруулах явдал юм.
"""


class TestNormalisation:
    def test_collapse_whitespace_keeps_content(self):
        assert collapse_whitespace("a  b\n\nc\t d") == "a b c d"

    def test_curly_quotes_and_dashes_unify(self):
        assert normalise_for_matching("“Reduce—bare fallow”") == normalise_for_matching(
            '"Reduce - bare fallow"'
        )

    def test_accents_fold(self):
        assert normalise_for_matching("hectáreas") == normalise_for_matching("hectareas")

    def test_cyrillic_is_consistent(self):
        # NFKD decomposes й into и + combining breve, which the mark-strip
        # removes. Lossy but CONSISTENT: needle and haystack transform the
        # same way, which is all matching needs.
        assert normalise_for_matching("Бэлчээрийн доройтол") == normalise_for_matching(
            "бэлчээрийн доройтол"
        )

    def test_dehyphenation_of_line_breaks(self):
        assert "reforestation" in normalise_for_matching("re-\nforestation")

    def test_soft_hyphen_joins_words(self):
        # PDF text layers break justified words with soft hyphen + newline;
        # both sides must normalise to the joined word.
        assert normalise_for_matching("preven­\ntiva") == "preventiva"
        assert normalise_for_matching("preven­tiva") == "preventiva"


class TestNgrams:
    def test_short_text_yields_whole_phrase(self):
        assert word_ngrams("increase forest area", 8) == {"increase forest area"}

    def test_ngram_jaccard_identical(self):
        a = normalise_for_matching("increase forest area to 9% by 2030 through reforestation")
        assert ngram_jaccard(a, a) == 1.0

    def test_ngram_jaccard_disjoint(self):
        a = normalise_for_matching("one two three four five six seven eight nine")
        b = normalise_for_matching("alpha beta gamma delta epsilon zeta eta theta iota")
        assert ngram_jaccard(a, b) == 0.0


class TestQuoteMatchLevel:
    def setup_method(self):
        self.corpus = MatchCorpus(DOC)

    def test_exact_match(self):
        assert self.corpus.quote_match_level("alongside the introduction of a crop-rotation system.") == "exact"

    def test_whitespace_mangled_is_exact(self):
        assert (
            self.corpus.quote_match_level("alongside the introduction   of a\ncrop-rotation system.")
            == "exact"
        )

    def test_curly_vs_straight_quote_is_normalized(self):
        # Document has curly quotes; the claimed quote uses straight ones.
        assert self.corpus.quote_match_level('"Reduce bare fallow to 30%"') == "normalized"

    def test_hyphenated_line_break_is_normalized(self):
        # "re-\nforestation" in the document; quote has the joined word.
        assert (
            self.corpus.quote_match_level(
                "increase forest area to 9% by 2030 through reforestation activities"
            )
            == "normalized"
        )

    def test_mostly_present_long_quote_is_fuzzy(self):
        # Long quote with a small corruption: most 8-grams still hit.
        quote = (
            "The Government will increase forest area to 9% by 2030 through "
            "reforestation activities, and rehabilitate degraded forest zones"
            # last word differs (zones vs areas)
        )
        assert self.corpus.quote_match_level(quote) in {"fuzzy", "normalized"}

    def test_absent_quote_not_found(self):
        assert (
            self.corpus.quote_match_level("Install 40 GW of offshore wind capacity by 2035")
            == "not_found"
        )

    def test_cyrillic_quote_found(self):
        assert self.corpus.quote_match_level("бэлчээрийн доройтлыг бууруулах") in {
            "exact",
            "normalized",
        }

    def test_empty_quote_not_found(self):
        assert self.corpus.quote_match_level("   ") == "not_found"


class TestValidateQuotesInDocument:
    def test_flags_only_missing_quotes(self):
        corpus = MatchCorpus(DOC)
        targets = [
            {
                "text": "Increase forest area to 9% by 2030",
                "sources": [
                    {"sourceText": "increase forest area to 9% by 2030 through reforestation activities"},
                    {"sourceText": "This sentence does not exist in the document at all."},
                ],
            },
            {
                "text": "Reduce bare fallow",
                "sources": [{"sourceText": "Reduce bare fallow to 30%"}],
                "activitySources": [
                    {"text": "rotate crops", "sourceText": "introduction of a crop-rotation system"}
                ],
            },
        ]
        not_found = validate_quotes_in_document(targets, corpus)

        assert not_found == 1
        assert targets[0]["sources"][0]["_quoteMatch"] == "normalized"
        assert targets[0]["sources"][1]["_quoteMatch"] == "not_found"
        assert "QUOTE NOT FOUND" in targets[0]["_provenanceFlag"]
        assert "sources[1]" in targets[0]["_provenanceFlag"]
        # Second target fully grounded: no flag, activity stamped too
        assert "_provenanceFlag" not in targets[1]
        assert targets[1]["activitySources"][0]["_quoteMatch"] in {"exact", "normalized"}

    def test_appends_to_existing_flag(self):
        corpus = MatchCorpus(DOC)
        targets = [
            {
                "text": "x",
                "_provenanceFlag": "UNSOURCED CLAIMS — 40%",
                "sources": [{"sourceText": "not in the document"}],
            }
        ]
        validate_quotes_in_document(targets, corpus)
        flag = targets[0]["_provenanceFlag"]
        assert flag.startswith("UNSOURCED CLAIMS")
        assert "QUOTE NOT FOUND" in flag


class TestTextSimilarity:
    def test_identical(self):
        assert text_similarity("Increase forest area to 9%", "Increase forest area to 9%") == 1.0

    def test_terse_gold_contained_in_verbose_extraction(self):
        gold = "Increase forest area to 9% by 2030"
        extracted = (
            "Increase forest area to 9% by 2030 through reforestation activities, "
            "rehabilitate degraded forest areas and improve their productivity"
        )
        assert text_similarity(gold, extracted) >= 0.8  # containment-driven

    def test_unrelated_scores_low(self):
        assert (
            text_similarity(
                "Strengthen early warning systems for disasters",
                "Redesign harmful subsidies for biodiversity",
            )
            < 0.3
        )

    def test_empty_is_zero(self):
        assert text_similarity("", "anything") == 0.0
