"""Drift guard: scripts/probe_cache.py must reconstruct the pipeline's prompts
byte-for-byte, or its WARM/COLD verdicts are meaningless. We capture the calls
the real pipeline functions would make (call_llm_batch monkeypatched, no API)
and compare against the probe's builders."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import src.llm  # noqa: E402
import src.align as align  # noqa: E402
import src.measure_align as measure_align  # noqa: E402
from scripts.probe_cache import (  # noqa: E402
    advisor_call,
    analyst_call,
    measure_advisor_call,
    measure_analyst_call,
)

TARGETS = [
    {
        "id": "NDC_1",
        "text": "Reduce livestock emissions by 20%",
        "sourceDocument": "NDC",
        "activities": "herd monitoring",
        "actions": "",
    },
    {
        "id": "NBSAP_1",
        "text": "Protect 30% of land",
        "sourceDocument": "NBSAP",
        "activities": "",
        "actions": "",
    },
]
MEASURES = [
    {"name": "Wind farms", "status": "Adopted", "description": "Build 5 farms", "objectives": ""},
]
ADAPTATION = [
    {"id": "ADP_1", "name": "Pasture management", "status": "Ongoing", "description": "", "objectives": ""},
]


def _capture(monkeypatch):
    captured: list[dict] = []

    async def fake_batch(calls, **kwargs):
        captured.extend(calls)
        return ["DECOMP" for _ in calls]

    monkeypatch.setattr(src.llm, "call_llm_batch", fake_batch)
    monkeypatch.setattr(align, "call_llm_batch", fake_batch)
    monkeypatch.setattr(measure_align, "call_llm_batch", fake_batch)
    return captured


def test_analyst_call_matches_decompose_targets(monkeypatch):
    captured = _capture(monkeypatch)
    asyncio.run(align.decompose_targets(TARGETS))
    assert len(captured) == 2
    for t, call in zip(TARGETS, captured):
        system, user = analyst_call(t)
        assert call["system"] == system
        assert call["user"] == user


def test_advisor_call_matches_assess_alignment(monkeypatch):
    captured = _capture(monkeypatch)
    decomps = {"NDC_1": "D1", "NBSAP_1": "D2"}
    pairs = [(TARGETS[0], TARGETS[1])]
    asyncio.run(align.assess_alignment(pairs, decomps))
    system, user = advisor_call(TARGETS[0], TARGETS[1], "D1", "D2", align.DOC_TYPE_LABELS)
    assert captured[0]["system"] == system
    assert captured[0]["user"] == user


def test_measure_calls_match_pipeline(monkeypatch):
    captured = _capture(monkeypatch)
    pseudo = measure_align.measures_to_pseudo_targets(MEASURES, action_type="mitigation")
    pseudo += measure_align.measures_to_pseudo_targets(ADAPTATION, action_type="adaptation")
    asyncio.run(measure_align.decompose_measures(pseudo))
    assert len(captured) == 2
    for pt, call in zip(pseudo, captured):
        system, user = measure_analyst_call(pt)
        assert call["system"] == system
        assert call["user"] == user

    captured.clear()
    decomps = {pt["id"]: f"D_{pt['id']}" for pt in pseudo}
    decomps["NDC_1"] = "D_T"
    pairs = [(TARGETS[0], pseudo[1]), (pseudo[0], pseudo[1])]  # target x adp, cross-type
    asyncio.run(measure_align.assess_measure_alignment(pairs, decomps))
    for (ta, m), call in zip(pairs, captured):
        system, user = measure_advisor_call(
            ta, m, decomps[ta["id"]], decomps[m["id"]], align.DOC_TYPE_LABELS
        )
        assert call["system"] == system
        assert call["user"] == user
