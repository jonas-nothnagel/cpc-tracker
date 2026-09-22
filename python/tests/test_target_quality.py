"""Tests for the target-definition-elements step.

The behaviour worth protecting is the honesty rule: an element the model claims
but cannot quote from the target must NOT be reported as stated. Everything the
UI says rests on that quote.
"""

import pytest

from src.target_quality import (
    ASSESSED_ELEMENTS,
    _evidence_is_grounded,
    assess_target_quality,
)


TARGET_TEXT = (
    "Restore 5,000 hectares of mangrove in the Gulf of Montijo by 2030 "
    "to increase coastal protection for fishing communities."
)


class TestEvidenceGrounding:
    def test_accepts_a_verbatim_quote(self):
        assert _evidence_is_grounded("5,000 hectares of mangrove", TARGET_TEXT)

    def test_accepts_a_quote_across_a_line_wrap(self):
        # Source documents wrap mid-phrase; only whitespace is normalised.
        wrapped = "Restore 5,000 hectares of\n   mangrove"
        assert _evidence_is_grounded(wrapped, TARGET_TEXT)

    def test_is_case_insensitive(self):
        assert _evidence_is_grounded("GULF OF MONTIJO", TARGET_TEXT)

    def test_rejects_a_paraphrase(self):
        # The whole point: a quote a reader cannot find in the target is worse
        # than no evidence.
        assert not _evidence_is_grounded("restoring mangroves somewhere", TARGET_TEXT)

    def test_rejects_empty(self):
        assert not _evidence_is_grounded("", TARGET_TEXT)


class FakeBatch:
    """Stands in for `call_llm_batch`, returning one canned JSON response."""

    def __init__(self, payload: str):
        self.payload = payload
        self.calls = 0

    async def __call__(self, calls, cache_namespace, desc):  # noqa: ARG002
        self.calls += 1
        return [self.payload] * len(calls)


@pytest.mark.asyncio
async def test_drops_an_element_the_model_could_not_quote(monkeypatch):
    fake = FakeBatch(
        '[{"targetId":"T1","action":true,"actionEvidence":"restore some mangroves",'
        '"scope":true,"scopeEvidence":"in the Gulf of Montijo",'
        '"outcome":false,"outcomeEvidence":"","confidence":"high"}]'
    )
    monkeypatch.setattr("src.target_quality.call_llm_batch", fake)

    [record] = await assess_target_quality([{"id": "T1", "text": TARGET_TEXT}])

    # "restore some mangroves" is a paraphrase → the action claim is dropped.
    assert record["elements"]["action"] is False
    assert record["evidence"]["action"] == ""
    # The quotable one survives.
    assert record["elements"]["scope"] is True
    assert record["evidence"]["scope"] == "in the Gulf of Montijo"


@pytest.mark.asyncio
async def test_reports_every_assessed_element_for_every_target(monkeypatch):
    monkeypatch.setattr("src.target_quality.call_llm_batch", FakeBatch("[]"))

    records = await assess_target_quality(
        [{"id": "T1", "text": TARGET_TEXT}, {"id": "T2", "text": "Promote."}]
    )

    assert [r["targetId"] for r in records] == ["T1", "T2"]
    for record in records:
        assert set(record["elements"]) == set(ASSESSED_ELEMENTS)
        # A target the model said nothing about must not be silently absent.
        assert all(v is False for v in record["elements"].values())


@pytest.mark.asyncio
async def test_a_bare_open_verb_cannot_state_a_specific_action(monkeypatch):
    # "Strengthen coordination." quotes itself, so the grounding check passes;
    # the open-verb guard is what stops it counting as a specific action.
    fake = FakeBatch(
        '[{"targetId":"T1","action":true,"actionEvidence":"Strengthen coordination.",'
        '"scope":false,"scopeEvidence":"","outcome":false,"outcomeEvidence":"",'
        '"confidence":"low"}]'
    )
    monkeypatch.setattr("src.target_quality.call_llm_batch", fake)

    [record] = await assess_target_quality(
        [{"id": "T1", "text": "Strengthen coordination."}]
    )
    assert record["elements"]["action"] is False


@pytest.mark.asyncio
async def test_survives_an_unparseable_response(monkeypatch):
    monkeypatch.setattr("src.target_quality.call_llm_batch", FakeBatch("not json at all"))

    [record] = await assess_target_quality([{"id": "T1", "text": TARGET_TEXT}])

    # Degrades to "nothing stated" rather than raising mid-pipeline.
    assert all(v is False for v in record["elements"].values())
    assert record["confidence"] == "low"


@pytest.mark.asyncio
async def test_empty_input_makes_no_calls(monkeypatch):
    fake = FakeBatch("[]")
    monkeypatch.setattr("src.target_quality.call_llm_batch", fake)
    assert await assess_target_quality([]) == []
    assert fake.calls == 0
