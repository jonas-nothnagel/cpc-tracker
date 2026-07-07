"""Unit tests for doc-pair synthesis style enforcement and determinism."""

from __future__ import annotations

import json

import pytest

import src.synthesize_doc_pairs as sdp
from src.synthesize_doc_pairs import synthesize_doc_pairs


def _target(tid: str, doc: str) -> dict:
    return {
        "id": tid,
        "sourceDocument": doc,
        "sourceLabel": f"Target {tid}",
        "text": f"Verbatim text for {tid}.",
    }


@pytest.fixture
def targets() -> list[dict]:
    return [
        _target("A_1", "DOCA"), _target("A_2", "DOCA"),
        _target("B_1", "DOCB"), _target("B_2", "DOCB"),
    ]


@pytest.fixture
def alignment() -> list[dict]:
    return [
        {"targetAId": "A_1", "targetBId": "B_1", "alignment": "high",
         "description": "shared instruments"},
        {"targetAId": "A_2", "targetBId": "B_1", "alignment": "medium",
         "description": "same direction"},
        {"targetAId": "A_1", "targetBId": "B_2", "alignment": "flagged",
         "mechanism": "resource_competition", "description": "same land base"},
    ]


GOOD = {
    "storyline_name": "Shared land governance across planning instruments",
    "reinforce": "Both documents anchor land governance in shared planning instruments.",
    "clash": "Possible misalignment recurs around land allocation.",
    "coordination_hint": "Joint land-use planning could help.",
    "confidence": "medium",
}

BAD = {
    "storyline_name": "Review mining and conservation overlaps now",
    "reinforce": "They reinforce each other strongly.",
    "clash": "A clear contradiction over land.",
    "coordination_hint": "They must coordinate.",
    "confidence": "low",
}


class StubBatch:
    """Plays back one response list per call_llm_batch invocation."""

    def __init__(self, batches: list[list[dict]]):
        self.batches = [[json.dumps(r) for r in batch] for batch in batches]
        self.calls: list[list[dict]] = []

    async def __call__(self, calls, **kwargs):
        self.calls.append(list(calls))
        return self.batches.pop(0)


async def test_corrective_retry_fixes_style(monkeypatch, targets, alignment):
    stub = StubBatch([[BAD], [GOOD]])
    monkeypatch.setattr(sdp, "call_llm_batch", stub)
    results = await synthesize_doc_pairs(targets, alignment)
    assert len(stub.calls) == 2
    retry_user = stub.calls[1][0]["user"]
    assert "CORRECTIONS REQUIRED" in retry_user
    assert retry_user.startswith(stub.calls[0][0]["user"])
    assert results[0]["synthesis"]["storyline_name"] == GOOD["storyline_name"]


async def test_stubborn_model_gets_sanitized(monkeypatch, targets, alignment):
    stub = StubBatch([[BAD], [BAD]])
    monkeypatch.setattr(sdp, "call_llm_batch", stub)
    results = await synthesize_doc_pairs(targets, alignment)
    syn = results[0]["synthesis"]
    assert syn["storyline_name"] == "Mining and conservation overlaps now"
    assert syn["reinforce"] == "They align with each other strongly."
    assert syn["clash"] == "A clear potential misalignment over land."
    assert syn["coordination_hint"] == "They may coordinate."


async def test_clean_answer_single_batch(monkeypatch, targets, alignment):
    stub = StubBatch([[GOOD]])
    monkeypatch.setattr(sdp, "call_llm_batch", stub)
    results = await synthesize_doc_pairs(targets, alignment)
    assert len(stub.calls) == 1
    assert results[0]["synthesis"] == GOOD
    assert results[0]["aligned_count"] == 2
    assert results[0]["flagged_count"] == 1


async def test_prompt_deterministic_across_runs_with_sampling(monkeypatch):
    """Oversized pair pools sample with a process-stable seed, so two runs
    build byte-identical prompts and the disk cache can hit."""
    targets = [_target(f"A_{i}", "DOCA") for i in range(40)] + [
        _target(f"B_{i}", "DOCB") for i in range(40)
    ]
    alignment = [
        {"targetAId": f"A_{i}", "targetBId": f"B_{i}", "alignment": "high",
         "description": "d"}
        for i in range(40)
    ]
    prompts: list[str] = []
    for _ in range(2):
        stub = StubBatch([[GOOD]])
        monkeypatch.setattr(sdp, "call_llm_batch", stub)
        await synthesize_doc_pairs(targets, alignment)
        prompts.append(stub.calls[0][0]["user"])
    assert prompts[0] == prompts[1]
    assert "sample of 25 of 40" in prompts[0]
