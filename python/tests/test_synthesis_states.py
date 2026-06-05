"""Unit tests for the storyline precompute-state helpers."""

from __future__ import annotations

from src.synthesis_states import (
    MAX_PRECOMPUTE_DOCS,
    canonical_hidden_key,
    filter_doc_pair_records,
    filter_targets_alignment,
    precompute_hidden_states,
)


class TestCanonicalHiddenKey:
    def test_empty_is_full_corpus(self):
        assert canonical_hidden_key([]) == ""
        assert canonical_hidden_key(set()) == ""

    def test_single(self):
        assert canonical_hidden_key(["ENR"]) == "ENR"

    def test_sorted_and_joined(self):
        # Order-independent: list and set produce the same canonical key.
        assert canonical_hidden_key(["B", "A"]) == "A+B"
        assert canonical_hidden_key({"B", "A"}) == "A+B"

    def test_dedupes(self):
        assert canonical_hidden_key(["A", "A", "B"]) == "A+B"


class TestPrecomputeHiddenStates:
    def test_no_default_hidden_only_full(self):
        assert precompute_hidden_states([]) == [[]]

    def test_single_default_hidden(self):
        # Panama's case: full corpus + minus-ENR.
        assert precompute_hidden_states(["ENR"]) == [[], ["ENR"]]

    def test_multi_adds_each_and_combined(self):
        states = precompute_hidden_states(["ENR", "HR"])
        assert [] in states
        assert ["ENR"] in states
        assert ["HR"] in states
        assert ["ENR", "HR"] in states

    def test_capped(self):
        states = precompute_hidden_states([f"D{i}" for i in range(10)])
        # full + MAX_PRECOMPUTE_DOCS singles + one combined
        assert len(states) <= 1 + MAX_PRECOMPUTE_DOCS + 1

    def test_keys_unique(self):
        states = precompute_hidden_states(["ENR", "HR"])
        keys = [canonical_hidden_key(s) for s in states]
        assert len(keys) == len(set(keys))


class TestFilterDocPairRecords:
    def test_empty_hidden_returns_all(self):
        recs = [{"doc_a": "NP", "doc_b": "ENR"}]
        assert filter_doc_pair_records(recs, set()) == recs

    def test_drops_pairs_touching_hidden(self):
        recs = [
            {"doc_a": "NP", "doc_b": "ENR"},
            {"doc_a": "NP", "doc_b": "HR"},
            {"doc_a": "ENR", "doc_b": "HR"},
        ]
        out = filter_doc_pair_records(recs, {"ENR"})
        assert out == [{"doc_a": "NP", "doc_b": "HR"}]


class TestFilterTargetsAlignment:
    def test_empty_hidden_returns_all(self):
        tg = [{"id": "1", "sourceDocument": "NP"}]
        al = [{"targetAId": "1", "targetBId": "1"}]
        vt, va = filter_targets_alignment(tg, al, set())
        assert vt == tg and va == al

    def test_drops_hidden_targets_and_orphaned_pairs(self):
        tg = [
            {"id": "1", "sourceDocument": "NP"},
            {"id": "2", "sourceDocument": "ENR"},
        ]
        al = [
            {"targetAId": "1", "targetBId": "2"},  # touches hidden -> dropped
            {"targetAId": "1", "targetBId": "1"},  # both visible -> kept
        ]
        vt, va = filter_targets_alignment(tg, al, {"ENR"})
        assert [t["id"] for t in vt] == ["1"]
        assert va == [{"targetAId": "1", "targetBId": "1"}]
