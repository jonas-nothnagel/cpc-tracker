"""Unit tests for the LLM-judge rationale harness.

Math correctness for the anonymization shuffle, prompt-anonymization
guarantee, robustness of the response parser, and aggregator behaviour
with mocked LLM responses.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from src.judge_rationales import (
    JUDGE_SYSTEM,
    _build_prompt,
    _extract_json,
    _shuffle_map_for_pair,
    aggregate,
    parse_verdict,
    run_judge,
)


# ---------------------------------------------------------------------------
# Shuffle map: deterministic + bijective + pair-varying
# ---------------------------------------------------------------------------

SLUGS = ["gpt-5-4", "gpt-5-4-mini", "deepseek-v4-pro", "llama-4-maverick"]


def test_shuffle_map_deterministic_for_same_pair():
    pair = ("T1", "T2")
    m1 = _shuffle_map_for_pair(pair, SLUGS)
    m2 = _shuffle_map_for_pair(pair, SLUGS)
    assert m1 == m2


def test_shuffle_map_bijective():
    m = _shuffle_map_for_pair(("T1", "T2"), SLUGS)
    assert set(m.keys()) == set(SLUGS)
    assert set(m.values()) == {"A", "B", "C", "D"}


def test_shuffle_map_varies_across_pairs():
    # Across a handful of pair-keys, at least one mapping should differ
    # (no constant-output bug). Probabilistic but very robust with 4! = 24
    # possible permutations and 8 sample pair-keys.
    seen_maps = {
        tuple(sorted(_shuffle_map_for_pair((f"T{i}", f"T{j}"), SLUGS).items()))
        for i in range(4)
        for j in range(4)
    }
    assert len(seen_maps) > 1


def test_shuffle_map_independent_of_slug_input_order():
    # Same pair-key must produce same map regardless of how slugs are
    # passed in (otherwise the mapping leaks input ordering, defeating
    # the point of anonymization).
    m_forward = _shuffle_map_for_pair(("T1", "T2"), SLUGS)
    m_backward = _shuffle_map_for_pair(("T1", "T2"), list(reversed(SLUGS)))
    assert m_forward == m_backward


# ---------------------------------------------------------------------------
# Prompt anonymization
# ---------------------------------------------------------------------------


def test_build_prompt_does_not_leak_slug_names():
    pair = {
        "targetAId": "FSS_1",
        "targetBId": "ILDN_3",
        "labels": {s: "flagged" for s in SLUGS},
        "descriptions": {
            "gpt-5-4": "Flagship rationale text.",
            "gpt-5-4-mini": "Mini rationale text.",
            "deepseek-v4-pro": "DeepSeek rationale text.",
            "llama-4-maverick": "Maverick rationale text.",
        },
    }
    shuffle_map = _shuffle_map_for_pair(("FSS_1", "ILDN_3"), SLUGS)
    _system, user = _build_prompt(pair, shuffle_map)
    for slug in SLUGS:
        assert slug not in user, f"slug {slug} leaked into user prompt"
    # The system prompt also must not name any model
    for slug in SLUGS:
        assert slug not in JUDGE_SYSTEM


def test_build_prompt_includes_every_rationale():
    pair = {
        "targetAId": "T1",
        "targetBId": "T2",
        "labels": {s: "flagged" for s in SLUGS},
        "descriptions": {
            "gpt-5-4": "AAA-RATIONALE",
            "gpt-5-4-mini": "BBB-RATIONALE",
            "deepseek-v4-pro": "CCC-RATIONALE",
            "llama-4-maverick": "DDD-RATIONALE",
        },
    }
    shuffle_map = _shuffle_map_for_pair(("T1", "T2"), SLUGS)
    _system, user = _build_prompt(pair, shuffle_map)
    for sentinel in ("AAA-RATIONALE", "BBB-RATIONALE", "CCC-RATIONALE", "DDD-RATIONALE"):
        assert sentinel in user


# ---------------------------------------------------------------------------
# JSON extraction
# ---------------------------------------------------------------------------


def test_extract_json_plain():
    assert _extract_json('{"a": 1}') == {"a": 1}


def test_extract_json_fenced():
    raw = '```json\n{"a": 1}\n```'
    assert _extract_json(raw) == {"a": 1}


def test_extract_json_with_preamble():
    raw = 'Here is the answer:\n{"a": 1, "b": 2}\nThanks.'
    assert _extract_json(raw) == {"a": 1, "b": 2}


def test_extract_json_bad_returns_none():
    assert _extract_json("not json at all") is None
    assert _extract_json("") is None


# ---------------------------------------------------------------------------
# parse_verdict
# ---------------------------------------------------------------------------


def test_parse_verdict_maps_letters_back_to_slugs():
    pair = {
        "targetAId": "T1",
        "targetBId": "T2",
        "labels": {s: "flagged" for s in SLUGS},
        "descriptions": {s: f"{s} text" for s in SLUGS},
    }
    shuffle_map = _shuffle_map_for_pair(("T1", "T2"), SLUGS)
    # Build a fake JSON that gives A the highest score
    raw = (
        '{"scores": {'
        + ", ".join(
            f'"{letter}": {{"specificity": 4, "reasoning": 4, "useful": 4}}'
            for letter in shuffle_map.values()
        )
        + '}, "winner": "A", "winnerReasoning": "A was best."}'
    )
    verdict = parse_verdict(raw, pair, shuffle_map)
    assert verdict is not None
    # Winner letter "A" should map back to whichever slug got "A"
    letter_to_slug = {v: k for k, v in shuffle_map.items()}
    assert verdict["winnerSlug"] == letter_to_slug["A"]
    # All four slug scores should be present in the unanonymized output
    assert set(verdict["scores"].keys()) == set(SLUGS)


def test_parse_verdict_handles_partial_scores():
    pair = {
        "targetAId": "T1",
        "targetBId": "T2",
        "labels": {s: "flagged" for s in SLUGS},
        "descriptions": {s: f"{s} text" for s in SLUGS},
    }
    shuffle_map = _shuffle_map_for_pair(("T1", "T2"), SLUGS)
    # Judge only scored two of four rationales
    raw = (
        '{"scores": {"A": {"specificity": 5, "reasoning": 5, "useful": 5}, '
        '"B": {"specificity": 3, "reasoning": 3, "useful": 3}}, '
        '"winner": "A", "winnerReasoning": "..."}'
    )
    verdict = parse_verdict(raw, pair, shuffle_map)
    assert verdict is not None
    assert len(verdict["scores"]) == 2


def test_parse_verdict_returns_none_on_bad_json():
    pair = {
        "targetAId": "T1",
        "targetBId": "T2",
        "labels": {s: "flagged" for s in SLUGS},
        "descriptions": {s: "" for s in SLUGS},
    }
    shuffle_map = _shuffle_map_for_pair(("T1", "T2"), SLUGS)
    assert parse_verdict("not json", pair, shuffle_map) is None


def test_parse_verdict_unknown_letter_is_dropped():
    pair = {
        "targetAId": "T1",
        "targetBId": "T2",
        "labels": {s: "flagged" for s in SLUGS},
        "descriptions": {s: "" for s in SLUGS},
    }
    shuffle_map = _shuffle_map_for_pair(("T1", "T2"), SLUGS)
    # Letter Z isn't in the shuffle map → silently ignored
    raw = (
        '{"scores": {"Z": {"specificity": 5, "reasoning": 5, "useful": 5}}, '
        '"winner": "Z", "winnerReasoning": "..."}'
    )
    verdict = parse_verdict(raw, pair, shuffle_map)
    assert verdict is not None
    assert verdict["scores"] == {}
    assert verdict["winnerSlug"] is None


# ---------------------------------------------------------------------------
# aggregate
# ---------------------------------------------------------------------------


def test_aggregate_win_counts_and_averages():
    verdicts = [
        {
            "scores": {
                "m1": {"specificity": 5, "reasoning": 5, "useful": 5},
                "m2": {"specificity": 3, "reasoning": 3, "useful": 3},
            },
            "winnerSlug": "m1",
        },
        {
            "scores": {
                "m1": {"specificity": 4, "reasoning": 4, "useful": 4},
                "m2": {"specificity": 2, "reasoning": 2, "useful": 2},
            },
            "winnerSlug": "m1",
        },
        {
            "scores": {
                "m1": {"specificity": 3, "reasoning": 3, "useful": 3},
                "m2": {"specificity": 4, "reasoning": 4, "useful": 4},
            },
            "winnerSlug": "m2",
        },
    ]
    agg = aggregate(verdicts, ["m1", "m2"])
    # m1 won 2, m2 won 1
    assert agg["m1"]["winCount"] == 2
    assert agg["m2"]["winCount"] == 1
    # winCount totals to sample size
    assert agg["m1"]["winCount"] + agg["m2"]["winCount"] == len(verdicts)
    # avgUseful for m1 = (5+4+3)/3 = 4.0
    assert agg["m1"]["avgUseful"] == pytest.approx(4.0)
    # avgUseful for m2 = (3+2+4)/3 ≈ 3.0
    assert agg["m2"]["avgUseful"] == pytest.approx(3.0)
    assert agg["m1"]["sampleSize"] == 3


def test_aggregate_skips_null_verdicts():
    verdicts = [
        None,
        {
            "scores": {"m1": {"specificity": 5, "reasoning": 5, "useful": 5}},
            "winnerSlug": "m1",
        },
    ]
    agg = aggregate(verdicts, ["m1"])
    assert agg["m1"]["winCount"] == 1
    assert agg["m1"]["sampleSize"] == 1


def test_aggregate_zero_samples_for_unscored_model():
    verdicts = [
        {
            "scores": {"m1": {"specificity": 5, "reasoning": 5, "useful": 5}},
            "winnerSlug": "m1",
        },
    ]
    agg = aggregate(verdicts, ["m1", "ghost-model"])
    assert agg["ghost-model"]["winCount"] == 0
    assert agg["ghost-model"]["sampleSize"] == 0


# ---------------------------------------------------------------------------
# run_judge — end-to-end with mocked LLM
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_judge_end_to_end_with_mock(monkeypatch):
    disagreements = [
        {
            "targetAId": f"T{i}A",
            "targetBId": f"T{i}B",
            "labels": {s: "flagged" for s in SLUGS},
            "descriptions": {s: f"{s} text for pair {i}" for s in SLUGS},
        }
        for i in range(5)
    ]

    async def fake_call_llm_batch(calls, **_kwargs):
        # Always declare the first letter the winner with maxed scores;
        # other letters get neutral scores. This lets us assert that win
        # counts roll up correctly through the shuffle map.
        responses = []
        for call in calls:
            # Recover the letters by scraping the user prompt; the shuffle
            # is per-pair so we can't just hard-code "A".
            user = call["user"]
            letters = sorted(
                set(m for m in ["A", "B", "C", "D"] if f"--- Rationale {m} ---" in user)
            )
            score_block = ", ".join(
                f'"{letter}": {{"specificity": 4, "reasoning": 4, "useful": 4}}'
                for letter in letters
            )
            responses.append(
                f'{{"scores": {{{score_block}}}, "winner": "{letters[0]}", '
                f'"winnerReasoning": "First rationale was best."}}'
            )
        return responses

    monkeypatch.setattr(
        "src.judge_rationales.call_llm_batch", fake_call_llm_batch
    )
    monkeypatch.setenv("LLM_JUDGE_MODEL", "test-judge-model")

    result = await run_judge(disagreements, sample_size=5)
    assert result["judgeModel"] == "test-judge-model"
    assert result["judgeSampleSize"] == 5
    # Aggregates cover every slug appearing in the sample
    assert set(result["judgeAggregates"].keys()) == set(SLUGS)
    # Win counts sum to sample size
    total_wins = sum(a["winCount"] for a in result["judgeAggregates"].values())
    assert total_wins == 5


@pytest.mark.asyncio
async def test_run_judge_empty_disagreements_returns_zero_sample():
    result = await run_judge([], sample_size=10)
    assert result["judgeSampleSize"] == 0
    assert result["judgeVerdicts"] == []
