"""Token-usage capture in the LLM client (src/llm.py).

Cost decisions for the NR7 alignment depend on two numbers the content never
shows: prompt tokens served from the provider's prefix cache and hidden
reasoning tokens. These pin the extraction from a chat completion and the
per-namespace totals a run script prints.
"""

from types import SimpleNamespace

import pytest

from src.llm import get_usage_totals, record_usage, reset_usage_totals, usage_from_response


@pytest.fixture(autouse=True)
def _clean_totals():
    reset_usage_totals()
    yield
    reset_usage_totals()


def test_usage_from_response_reads_prompt_completion_cached_and_reasoning():
    resp = SimpleNamespace(
        usage=SimpleNamespace(
            prompt_tokens=5200,
            completion_tokens=900,
            prompt_tokens_details=SimpleNamespace(cached_tokens=4096),
            completion_tokens_details=SimpleNamespace(reasoning_tokens=750),
        )
    )
    assert usage_from_response(resp) == {
        "prompt": 5200,
        "completion": 900,
        "cachedPrompt": 4096,
        "reasoning": 750,
    }


def test_usage_from_response_omits_details_the_provider_does_not_send():
    resp = SimpleNamespace(usage=SimpleNamespace(prompt_tokens=10, completion_tokens=2))
    assert usage_from_response(resp) == {"prompt": 10, "completion": 2}
    assert usage_from_response(SimpleNamespace()) is None
    assert usage_from_response(SimpleNamespace(usage=None)) is None


def test_totals_accumulate_per_namespace():
    record_usage("nr7_alignment_v2", {"prompt": 100, "completion": 10, "cachedPrompt": 80})
    record_usage("nr7_alignment_v2", {"prompt": 100, "completion": 12})
    record_usage("decompose", {"prompt": 7, "completion": 3})
    assert get_usage_totals() == {
        "nr7_alignment_v2": {"calls": 2, "prompt": 200, "completion": 22, "cachedPrompt": 80},
        "decompose": {"calls": 1, "prompt": 7, "completion": 3},
    }
