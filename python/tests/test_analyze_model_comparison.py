"""Unit tests for the cross-model analyzer.

Math correctness on small synthetic fixtures, plus stability tests for the
ranking + tiebreak rules that aren't otherwise observable from headline
metrics.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from src.analyze_model_comparison import (
    _build_doc_marker_regex,
    _seeded_sample,
    agreement_rate,
    analyze,
    bias_signature,
    cohens_kappa,
    confusion_matrix,
    consensus_flagged_random_sample,
    consensus_label,
    flagging_overlap,
    list_model_slugs,
    rationale_character,
    top_disagreement_pairs,
    unique_signal,
    unique_signal_random_sample,
    vocab_compliance,
)


def _idx(records: list[dict]) -> dict[tuple[str, str], dict]:
    """Mimic compare_alignments.index_by_pair (canonical sorted-pair key)."""
    return {tuple(sorted([r["targetAId"], r["targetBId"]])): r for r in records}


# ---------------------------------------------------------------------------
# agreement_rate
# ---------------------------------------------------------------------------


def test_agreement_perfect():
    a = _idx([
        {"targetAId": "A", "targetBId": "B", "alignment": "high"},
        {"targetAId": "C", "targetBId": "D", "alignment": "medium"},
        {"targetAId": "E", "targetBId": "F", "alignment": "low"},
    ])
    b = _idx([
        {"targetAId": "A", "targetBId": "B", "alignment": "high"},
        {"targetAId": "C", "targetBId": "D", "alignment": "medium"},
        {"targetAId": "E", "targetBId": "F", "alignment": "low"},
    ])
    assert agreement_rate(a, b, set(a)) == 1.0


def test_agreement_partial():
    a = _idx([
        {"targetAId": "A", "targetBId": "B", "alignment": "high"},
        {"targetAId": "C", "targetBId": "D", "alignment": "medium"},
        {"targetAId": "E", "targetBId": "F", "alignment": "low"},
        {"targetAId": "G", "targetBId": "H", "alignment": "flagged"},
    ])
    b = _idx([
        {"targetAId": "A", "targetBId": "B", "alignment": "high"},
        {"targetAId": "C", "targetBId": "D", "alignment": "low"},
        {"targetAId": "E", "targetBId": "F", "alignment": "low"},
        {"targetAId": "G", "targetBId": "H", "alignment": "high"},
    ])
    assert agreement_rate(a, b, set(a)) == 0.5


# ---------------------------------------------------------------------------
# cohens_kappa
# ---------------------------------------------------------------------------


def test_kappa_perfect_agreement_is_one():
    a = _idx([
        {"targetAId": "A", "targetBId": "B", "alignment": "high"},
        {"targetAId": "C", "targetBId": "D", "alignment": "low"},
    ])
    assert cohens_kappa(a, a, set(a)) == pytest.approx(1.0)


def test_kappa_chance_level_is_near_zero():
    a = _idx([
        {"targetAId": "A", "targetBId": "B", "alignment": "low"},
        {"targetAId": "C", "targetBId": "D", "alignment": "high"},
        {"targetAId": "E", "targetBId": "F", "alignment": "low"},
        {"targetAId": "G", "targetBId": "H", "alignment": "high"},
    ])
    b = _idx([
        {"targetAId": "A", "targetBId": "B", "alignment": "high"},
        {"targetAId": "C", "targetBId": "D", "alignment": "low"},
        {"targetAId": "E", "targetBId": "F", "alignment": "low"},
        {"targetAId": "G", "targetBId": "H", "alignment": "high"},
    ])
    assert cohens_kappa(a, b, set(a)) == pytest.approx(0.0)


def test_kappa_complete_disagreement_is_negative():
    a = _idx([
        {"targetAId": "A", "targetBId": "B", "alignment": "low"},
        {"targetAId": "C", "targetBId": "D", "alignment": "low"},
        {"targetAId": "E", "targetBId": "F", "alignment": "high"},
        {"targetAId": "G", "targetBId": "H", "alignment": "high"},
    ])
    b = _idx([
        {"targetAId": "A", "targetBId": "B", "alignment": "high"},
        {"targetAId": "C", "targetBId": "D", "alignment": "high"},
        {"targetAId": "E", "targetBId": "F", "alignment": "low"},
        {"targetAId": "G", "targetBId": "H", "alignment": "low"},
    ])
    assert cohens_kappa(a, b, set(a)) < 0


# ---------------------------------------------------------------------------
# confusion_matrix
# ---------------------------------------------------------------------------


def test_confusion_matrix_all_into_flagged():
    ref = _idx([
        {"targetAId": "1", "targetBId": "2", "alignment": "none"},
        {"targetAId": "3", "targetBId": "4", "alignment": "low"},
        {"targetAId": "5", "targetBId": "6", "alignment": "medium"},
        {"targetAId": "7", "targetBId": "8", "alignment": "high"},
        {"targetAId": "9", "targetBId": "0", "alignment": "flagged"},
    ])
    other = _idx([
        {"targetAId": k_a, "targetBId": k_b, "alignment": "flagged"}
        for k_a, k_b in [("1", "2"), ("3", "4"), ("5", "6"), ("7", "8"), ("9", "0")]
    ])
    mat = confusion_matrix(ref, other, set(ref))
    assert len(mat) == 5
    assert all(len(row) == 5 for row in mat)
    for i in range(5):
        for j in range(5):
            assert mat[i][j] == (1 if j == 4 else 0)


# ---------------------------------------------------------------------------
# consensus_label
# ---------------------------------------------------------------------------


def test_consensus_unanimous():
    labels = {"a": "medium", "b": "medium", "c": "medium", "d": "medium"}
    assert consensus_label(labels, "a") == "medium"


def test_consensus_majority():
    labels = {"a": "high", "b": "medium", "c": "medium", "d": "medium"}
    assert consensus_label(labels, "a") == "medium"


def test_consensus_tie_flagship_wins():
    labels = {"flagship": "high", "b": "high", "c": "low", "d": "low"}
    assert consensus_label(labels, "flagship") == "high"


def test_consensus_tie_without_flagship_in_winners():
    # 4 raters, tie between low (2) and medium (2); flagship picked "flagged"
    # which isn't in the tied set → fall back to lexicographic smallest.
    labels = {
        "flagship": "flagged",
        "b": "low",
        "c": "low",
        "d": "medium",
        "e": "medium",
    }
    assert consensus_label(labels, "flagship") == "low"


# ---------------------------------------------------------------------------
# bias_signature
# ---------------------------------------------------------------------------


def test_bias_signature_signs():
    # Consensus keys must match the canonical sorted-tuple form produced by
    # _idx — see index_by_pair in src/compare_alignments.py.
    consensus = {
        tuple(sorted(("1", "2"))): "none",
        tuple(sorted(("3", "4"))): "low",
        tuple(sorted(("5", "6"))): "medium",
        tuple(sorted(("7", "8"))): "high",
        tuple(sorted(("9", "0"))): "flagged",
    }
    idx = _idx([
        {"targetAId": "1", "targetBId": "2", "alignment": "none"},
        {"targetAId": "3", "targetBId": "4", "alignment": "low"},
        {"targetAId": "5", "targetBId": "6", "alignment": "medium"},
        {"targetAId": "7", "targetBId": "8", "alignment": "flagged"},
        {"targetAId": "9", "targetBId": "0", "alignment": "flagged"},
    ])
    bias = bias_signature(idx, consensus)
    assert bias == {
        "none": 0,
        "low": 0,
        "medium": 0,
        "high": -1,
        "flagged": 1,
    }


# ---------------------------------------------------------------------------
# top_disagreement_pairs
# ---------------------------------------------------------------------------


def test_disagreement_ranking_orders_by_distinct_then_spread():
    all_idx = {
        "m1": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "none"},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "low"},
            {"targetAId": "P3A", "targetBId": "P3B", "alignment": "low"},
        ]),
        "m2": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "medium"},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "flagged"},
            {"targetAId": "P3A", "targetBId": "P3B", "alignment": "low"},
        ]),
        "m3": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "high"},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "flagged"},
            {"targetAId": "P3A", "targetBId": "P3B", "alignment": "low"},
        ]),
    }
    common = set(all_idx["m1"])
    rows = top_disagreement_pairs(all_idx, common, top_n=10)
    assert len(rows) == 2  # P3 (unanimous) dropped
    assert (rows[0]["targetAId"], rows[0]["targetBId"]) == ("P1A", "P1B")
    assert rows[0]["distinctLabelCount"] == 3
    assert (rows[1]["targetAId"], rows[1]["targetBId"]) == ("P2A", "P2B")
    assert rows[1]["distinctLabelCount"] == 2


def test_disagreement_ranking_stable_under_model_order_permutation():
    fixture_records = {
        "m1": [
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "none"},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "low"},
        ],
        "m2": [
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "medium"},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "flagged"},
        ],
        "m3": [
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "high"},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "flagged"},
        ],
    }
    forward = {k: _idx(v) for k, v in fixture_records.items()}
    backward = {k: _idx(v) for k, v in reversed(list(fixture_records.items()))}
    common = set(forward["m1"])
    rows_fwd = top_disagreement_pairs(forward, common, top_n=10)
    rows_bwd = top_disagreement_pairs(backward, common, top_n=10)
    keys_fwd = [(r["targetAId"], r["targetBId"]) for r in rows_fwd]
    keys_bwd = [(r["targetAId"], r["targetBId"]) for r in rows_bwd]
    assert keys_fwd == keys_bwd


# ---------------------------------------------------------------------------
# vocab_compliance
# ---------------------------------------------------------------------------


def test_vocab_compliance_counts_words_and_pairs():
    idx = _idx([
        {
            "targetAId": "A",
            "targetBId": "B",
            "alignment": "flagged",
            "description": "There is a tension and a tension here, plus a contradiction.",
        },
        {
            "targetAId": "C",
            "targetBId": "D",
            "alignment": "high",
            "description": "Complementary goals; tensions inevitable across sectors.",
        },
        {
            "targetAId": "E",
            "targetBId": "F",
            "alignment": "medium",
            "description": "No banned words here.",
        },
    ])
    v = vocab_compliance(idx)
    assert v["tensionWordHits"] == 3
    assert v["contradictionWordHits"] == 1
    assert v["pairsWithViolation"] == 2
    assert v["violationRate"] == pytest.approx(2 / 3)


# ---------------------------------------------------------------------------
# list_model_slugs — flagship-first ordering
# ---------------------------------------------------------------------------


def test_list_model_slugs_promotes_flagship(tmp_path: Path):
    country_dir = tmp_path / "x"
    for slug in ["aardvark-model", "gpt-5-4", "zebra-7b"]:
        sub = country_dir / slug
        sub.mkdir(parents=True)
        (sub / "alignment.json").write_text("[]")
    slugs = list_model_slugs(country_dir)
    assert slugs[0] == "gpt-5-4"
    assert set(slugs) == {"gpt-5-4", "aardvark-model", "zebra-7b"}


def test_list_model_slugs_alphabetical_when_no_preferred(tmp_path: Path):
    country_dir = tmp_path / "x"
    for slug in ["zebra-7b", "aardvark-model"]:
        sub = country_dir / slug
        sub.mkdir(parents=True)
        (sub / "alignment.json").write_text("[]")
    slugs = list_model_slugs(country_dir)
    assert slugs == ["aardvark-model", "zebra-7b"]


# ---------------------------------------------------------------------------
# End-to-end
# ---------------------------------------------------------------------------


def test_analyze_end_to_end(tmp_path: Path):
    country = "smalltestland"
    base = tmp_path
    country_dir = base / country
    (country_dir / "gpt-5-4").mkdir(parents=True)
    (country_dir / "challenger-mini").mkdir(parents=True)

    (country_dir / "gpt-5-4" / "alignment.json").write_text(
        '[{"targetAId":"A","targetBId":"B","alignment":"high","description":"shared goal"},'
        '{"targetAId":"C","targetBId":"D","alignment":"flagged","description":"some tension here"}]'
    )
    (country_dir / "challenger-mini" / "alignment.json").write_text(
        '[{"targetAId":"A","targetBId":"B","alignment":"medium","description":"partial overlap"},'
        '{"targetAId":"C","targetBId":"D","alignment":"flagged","description":"clean rationale"}]'
    )

    report = analyze(country, base)
    assert report["country"] == country
    assert report["flagship"] == "gpt-5-4"
    assert report["models"] == ["gpt-5-4", "challenger-mini"]
    assert report["pairCount"] == 2
    assert report["agreementMatrix"]["gpt-5-4"]["challenger-mini"] == pytest.approx(0.5)
    assert report["vocabCompliance"]["gpt-5-4"]["tensionWordHits"] == 1
    assert report["vocabCompliance"]["challenger-mini"]["tensionWordHits"] == 0
    # New insight-driven fields are present
    assert "flaggingOverlap" in report
    assert "uniqueSignal" in report
    assert "rationaleCharacter" in report
    # Flagship-as-truth fields are gone
    assert "confusionVsFlagship" not in report
    assert "biases" not in report
    # Judge fields present but null when --with-judge is not used
    assert report["judgeModel"] is None
    assert report["judgeAggregates"] is None


# ---------------------------------------------------------------------------
# flagging_overlap
# ---------------------------------------------------------------------------


def test_flagging_overlap_buckets_by_n_models():
    # Three models, four pairs:
    #   P1: flagged by 3 (consensus)
    #   P2: flagged by 2
    #   P3: flagged by 1
    #   P4: flagged by 0 (not in any bucket)
    all_idx = {
        "m1": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "flagged"},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "flagged"},
            {"targetAId": "P3A", "targetBId": "P3B", "alignment": "flagged"},
            {"targetAId": "P4A", "targetBId": "P4B", "alignment": "medium"},
        ]),
        "m2": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "flagged"},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "flagged"},
            {"targetAId": "P3A", "targetBId": "P3B", "alignment": "medium"},
            {"targetAId": "P4A", "targetBId": "P4B", "alignment": "low"},
        ]),
        "m3": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "flagged"},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "low"},
            {"targetAId": "P3A", "targetBId": "P3B", "alignment": "none"},
            {"targetAId": "P4A", "targetBId": "P4B", "alignment": "low"},
        ]),
    }
    common = set(all_idx["m1"])
    overlap = flagging_overlap(all_idx, common)
    assert overlap["flaggedByCount"] == {"1": 1, "2": 1, "3": 1}
    assert overlap["consensusFlaggedCount"] == 1
    assert overlap["unionFlaggedCount"] == 3


def test_flagging_overlap_empty():
    all_idx = {
        "m1": _idx([{"targetAId": "A", "targetBId": "B", "alignment": "low"}]),
        "m2": _idx([{"targetAId": "A", "targetBId": "B", "alignment": "medium"}]),
    }
    overlap = flagging_overlap(all_idx, set(all_idx["m1"]))
    assert overlap["unionFlaggedCount"] == 0
    assert overlap["consensusFlaggedCount"] == 0


# ---------------------------------------------------------------------------
# unique_signal
# ---------------------------------------------------------------------------


def test_unique_signal_returns_only_solo_flags():
    # m1 solo-flags P1; everyone else gave it low.
    # P2 is flagged by m1 AND m2 — must NOT appear in m1's unique signal.
    all_idx = {
        "m1": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "flagged", "description": ""},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "flagged", "description": ""},
        ]),
        "m2": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "low", "description": ""},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "flagged", "description": ""},
        ]),
        "m3": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "low", "description": ""},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "low", "description": ""},
        ]),
    }
    common = set(all_idx["m1"])
    rows = unique_signal(all_idx, "m1", common, top_n=10)
    assert len(rows) == 1
    assert (rows[0]["targetAId"], rows[0]["targetBId"]) == ("P1A", "P1B")
    assert rows[0]["labels"]["m1"] == "flagged"


def test_unique_signal_ranks_lowest_other_ordinal_first():
    # m1 flags both. Other models gave P1 = "none", P2 = "medium".
    # Lower-other-mean (none) ranks first because the disagreement is sharper.
    all_idx = {
        "m1": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "flagged", "description": ""},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "flagged", "description": ""},
        ]),
        "m2": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "none", "description": ""},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "medium", "description": ""},
        ]),
    }
    common = set(all_idx["m1"])
    rows = unique_signal(all_idx, "m1", common, top_n=10)
    assert len(rows) == 2
    assert (rows[0]["targetAId"], rows[0]["targetBId"]) == ("P1A", "P1B")
    assert (rows[1]["targetAId"], rows[1]["targetBId"]) == ("P2A", "P2B")


def test_unique_signal_returns_disagreement_row_shape():
    all_idx = {
        "m1": _idx([
            {"targetAId": "A", "targetBId": "B", "alignment": "flagged", "description": "m1 says X"},
        ]),
        "m2": _idx([
            {"targetAId": "A", "targetBId": "B", "alignment": "low", "description": "m2 says Y"},
        ]),
    }
    common = set(all_idx["m1"])
    rows = unique_signal(all_idx, "m1", common, top_n=10)
    assert rows[0]["descriptions"]["m1"] == "m1 says X"
    assert rows[0]["descriptions"]["m2"] == "m2 says Y"
    assert "distinctLabelCount" in rows[0]
    assert "ordinalSpread" in rows[0]


# ---------------------------------------------------------------------------
# rationale_character
# ---------------------------------------------------------------------------


def test_rationale_character_word_counts_and_numeric():
    idx = _idx([
        {"targetAId": "A", "targetBId": "B", "alignment": "low",
         "description": "Two words."},
        {"targetAId": "C", "targetBId": "D", "alignment": "medium",
         "description": "Four words here total."},
        {"targetAId": "E", "targetBId": "F", "alignment": "high",
         "description": "A rationale citing 1500 hectares."},
    ])
    char = rationale_character(idx, None)
    # word counts: 2, 4, 5 → avg 3.67, median 4
    assert char["avgWords"] == pytest.approx(11 / 3, rel=1e-2)
    assert char["medianWords"] == 4.0
    # Only the third rationale has a digit (rounded to 3 decimals in impl)
    assert char["pctNumeric"] == pytest.approx(1 / 3, abs=1e-3)
    # No regex provided → 0
    assert char["pctPolicyCitation"] == 0.0


def test_rationale_character_doc_citation_regex():
    common = {("NDC_1", "FSS_2"), ("ILDN_3", "BTR_4")}
    doc_re = _build_doc_marker_regex(common)
    assert doc_re is not None
    idx = _idx([
        {"targetAId": "A", "targetBId": "B", "alignment": "low",
         "description": "The NDC target requires action."},
        {"targetAId": "C", "targetBId": "D", "alignment": "medium",
         "description": "Generic rationale, no markers."},
        {"targetAId": "E", "targetBId": "F", "alignment": "high",
         "description": "Both ILDN and BTR programs apply."},
    ])
    char = rationale_character(idx, doc_re)
    # 2 of 3 rationales cite at least one observed prefix
    assert char["pctPolicyCitation"] == pytest.approx(2 / 3, abs=1e-3)


def test_rationale_character_handles_empty_index():
    char = rationale_character({}, None)
    assert char["avgWords"] == 0.0
    assert char["medianWords"] == 0.0
    assert char["pctNumeric"] == 0.0
    assert char["pctPolicyCitation"] == 0.0


def test_build_doc_marker_regex_extracts_uppercase_prefixes():
    common = {("FSS_1", "ILDN_2"), ("NDC_3", "BTR_4"), ("lowercase_5", "x_6")}
    doc_re = _build_doc_marker_regex(common)
    assert doc_re is not None
    # Only uppercase prefixes get into the alternation
    assert doc_re.search("Reference to FSS guidance.")
    assert doc_re.search("NDC alignment is strong.")
    assert not doc_re.search("lowercase prefixes ignored.")


def test_build_doc_marker_regex_none_when_no_prefixes():
    doc_re = _build_doc_marker_regex({("lowercase_1", "x_2")})
    assert doc_re is None


# ---------------------------------------------------------------------------
# _seeded_sample — determinism + order-invariance
# ---------------------------------------------------------------------------


def test_seeded_sample_is_deterministic():
    pool = [(f"A{i}", f"B{i}") for i in range(20)]
    s1 = _seeded_sample(pool, "mongolia|unique|deepseek-v4-pro", 5)
    s2 = _seeded_sample(pool, "mongolia|unique|deepseek-v4-pro", 5)
    assert s1 == s2
    assert len(s1) == 5


def test_seeded_sample_varies_with_seed_key():
    pool = [(f"A{i}", f"B{i}") for i in range(20)]
    a = _seeded_sample(pool, "mongolia|unique|deepseek-v4-pro", 5)
    b = _seeded_sample(pool, "mongolia|unique|gpt-5-4", 5)
    c = _seeded_sample(pool, "panama|unique|deepseek-v4-pro", 5)
    # All three should differ from each other (extremely unlikely to collide)
    assert a != b
    assert a != c
    assert b != c


def test_seeded_sample_invariant_to_pool_input_order():
    pool_fwd = [(f"A{i}", f"B{i}") for i in range(10)]
    pool_bwd = list(reversed(pool_fwd))
    s_fwd = _seeded_sample(pool_fwd, "test|seed", 5)
    s_bwd = _seeded_sample(pool_bwd, "test|seed", 5)
    assert sorted(s_fwd) == sorted(s_bwd)


def test_seeded_sample_caps_at_pool_size():
    pool = [(f"A{i}", f"B{i}") for i in range(3)]
    s = _seeded_sample(pool, "test|seed", 30)
    assert len(s) == 3


def test_seeded_sample_empty_pool_or_zero_k():
    assert _seeded_sample([], "test", 5) == []
    assert _seeded_sample([("A", "B")], "test", 0) == []


# ---------------------------------------------------------------------------
# unique_signal_random_sample
# ---------------------------------------------------------------------------


def test_unique_signal_random_sample_returns_total_and_rows():
    # 4 pairs: P1 is m1's solo flag, P2 is m1+m2 (not solo), P3 is m2's solo,
    # P4 is m1's solo. Expect m1's solo set = {P1, P4}; sample of k=10 returns 2.
    all_idx = {
        "m1": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "flagged", "description": ""},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "flagged", "description": ""},
            {"targetAId": "P3A", "targetBId": "P3B", "alignment": "low", "description": ""},
            {"targetAId": "P4A", "targetBId": "P4B", "alignment": "flagged", "description": ""},
        ]),
        "m2": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "low", "description": ""},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "flagged", "description": ""},
            {"targetAId": "P3A", "targetBId": "P3B", "alignment": "flagged", "description": ""},
            {"targetAId": "P4A", "targetBId": "P4B", "alignment": "low", "description": ""},
        ]),
    }
    common = set(all_idx["m1"])
    rows, total = unique_signal_random_sample(all_idx, "m1", common, "mongolia", k=10)
    assert total == 2  # P1 and P4
    assert len(rows) == 2
    pair_ids = {(r["targetAId"], r["targetBId"]) for r in rows}
    assert pair_ids == {("P1A", "P1B"), ("P4A", "P4B")}


def test_unique_signal_random_sample_deterministic_across_runs():
    # Construct a pool of 50 m1-solo flags so sampling matters
    fixture_m1 = [
        {"targetAId": f"P{i}A", "targetBId": f"P{i}B", "alignment": "flagged", "description": ""}
        for i in range(50)
    ]
    fixture_m2 = [
        {"targetAId": f"P{i}A", "targetBId": f"P{i}B", "alignment": "low", "description": ""}
        for i in range(50)
    ]
    all_idx = {"m1": _idx(fixture_m1), "m2": _idx(fixture_m2)}
    common = set(all_idx["m1"])
    rows_1, _ = unique_signal_random_sample(all_idx, "m1", common, "mongolia", k=10)
    rows_2, _ = unique_signal_random_sample(all_idx, "m1", common, "mongolia", k=10)
    keys_1 = [(r["targetAId"], r["targetBId"]) for r in rows_1]
    keys_2 = [(r["targetAId"], r["targetBId"]) for r in rows_2]
    assert keys_1 == keys_2


def test_unique_signal_random_sample_varies_with_country():
    fixture_m1 = [
        {"targetAId": f"P{i}A", "targetBId": f"P{i}B", "alignment": "flagged", "description": ""}
        for i in range(50)
    ]
    fixture_m2 = [
        {"targetAId": f"P{i}A", "targetBId": f"P{i}B", "alignment": "low", "description": ""}
        for i in range(50)
    ]
    all_idx = {"m1": _idx(fixture_m1), "m2": _idx(fixture_m2)}
    common = set(all_idx["m1"])
    rows_mn, _ = unique_signal_random_sample(all_idx, "m1", common, "mongolia", k=10)
    rows_pa, _ = unique_signal_random_sample(all_idx, "m1", common, "panama", k=10)
    keys_mn = [(r["targetAId"], r["targetBId"]) for r in rows_mn]
    keys_pa = [(r["targetAId"], r["targetBId"]) for r in rows_pa]
    assert keys_mn != keys_pa


def test_unique_signal_random_sample_empty_when_no_solo_flags():
    all_idx = {
        "m1": _idx([{"targetAId": "A", "targetBId": "B", "alignment": "low", "description": ""}]),
        "m2": _idx([{"targetAId": "A", "targetBId": "B", "alignment": "low", "description": ""}]),
    }
    rows, total = unique_signal_random_sample(
        all_idx, "m1", set(all_idx["m1"]), "mongolia", k=10
    )
    assert rows == []
    assert total == 0


# ---------------------------------------------------------------------------
# consensus_flagged_random_sample
# ---------------------------------------------------------------------------


def test_consensus_flagged_random_sample_only_includes_all_flagged():
    # P1 flagged by both = consensus; P2 flagged by only m1 = not consensus.
    all_idx = {
        "m1": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "flagged", "description": ""},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "flagged", "description": ""},
        ]),
        "m2": _idx([
            {"targetAId": "P1A", "targetBId": "P1B", "alignment": "flagged", "description": ""},
            {"targetAId": "P2A", "targetBId": "P2B", "alignment": "low", "description": ""},
        ]),
    }
    common = set(all_idx["m1"])
    rows = consensus_flagged_random_sample(all_idx, common, "mongolia", k=10)
    assert len(rows) == 1
    assert (rows[0]["targetAId"], rows[0]["targetBId"]) == ("P1A", "P1B")


def test_consensus_flagged_random_sample_deterministic():
    # 50 pairs all flagged by both models = 50-element consensus pool
    fixture_m1 = [
        {"targetAId": f"P{i}A", "targetBId": f"P{i}B", "alignment": "flagged", "description": ""}
        for i in range(50)
    ]
    fixture_m2 = list(fixture_m1)  # copy each dict shape; same labels
    all_idx = {"m1": _idx(fixture_m1), "m2": _idx(fixture_m2)}
    common = set(all_idx["m1"])
    rows_1 = consensus_flagged_random_sample(all_idx, common, "mongolia", k=10)
    rows_2 = consensus_flagged_random_sample(all_idx, common, "mongolia", k=10)
    keys_1 = [(r["targetAId"], r["targetBId"]) for r in rows_1]
    keys_2 = [(r["targetAId"], r["targetBId"]) for r in rows_2]
    assert keys_1 == keys_2
