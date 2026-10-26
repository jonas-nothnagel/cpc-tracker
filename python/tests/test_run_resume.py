"""An analysis that survives a restart: whole cache entries, an unreadable
entry read as a miss, outputs cleared for a resume (cache and BTR input kept),
the interrupted attempt's footprint booked, progress in the status file, and
the two-document check before any call."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

import pytest

from src import llm, run_analysis


SNAPSHOT = {
    "available": True,
    "source": "measured",
    "call_count": 12,
    "cached_call_count": 2,
    "tracked_call_count": 10,
    "energy_wh": 3.0,
    "water_ml": 1.0,
    "co2_geq": 1.2,
    "minerals_ugsbeq": 0.1,
}


@pytest.fixture
def cache(tmp_path, monkeypatch):
    monkeypatch.setattr(llm, "CACHE_DIR", tmp_path / "cache")
    return tmp_path / "cache"


def test_unreadable_cache_entry_is_a_miss(cache):
    llm.write_cache("alignment_v4", "sys", "user", "gpt-5.4", "high")
    entry = next((cache / "alignment_v4").glob("*.json"))
    entry.write_text('{"content": "hi')  # cut short by a kill mid-write
    assert llm.read_cache_entry("alignment_v4", "sys", "user", "gpt-5.4") is None


def test_cache_write_leaves_no_partial_file(cache):
    llm.write_cache("alignment_v4", "sys", "user", "gpt-5.4", "medium", meta={"usage": {"total": 3}})
    files = list((cache / "alignment_v4").iterdir())
    assert len(files) == 1 and files[0].suffix == ".json"
    assert llm.read_cache_entry("alignment_v4", "sys", "user", "gpt-5.4") == ("medium", {"usage": {"total": 3}})


def test_manifest_lists_what_the_run_wrote_and_prunes_only_those(cache, tmp_path, monkeypatch):
    manifest = tmp_path / "cache-manifest.txt"
    llm.write_cache("alignment_v4", "sys", "before", "gpt-5.4", "low")  # another run's entry
    monkeypatch.setenv("CPC_CACHE_MANIFEST", str(manifest))
    llm.write_cache("alignment_v4", "sys", "pair", "gpt-5.4", "high")
    llm.write_cache("decompose", "sys", "target", "gpt-5.4", "parts")
    assert len(manifest.read_text().splitlines()) == 2
    assert llm.prune_manifest(manifest, {"alignment_v4"}) == 1
    assert llm.read_cache_entry("alignment_v4", "sys", "pair", "gpt-5.4") is None
    assert llm.read_cache_entry("alignment_v4", "sys", "before", "gpt-5.4") is not None
    assert llm.read_cache_entry("decompose", "sys", "target", "gpt-5.4") is not None


def test_clear_for_resume_keeps_cache_and_btr_input(tmp_path):
    out = tmp_path / "output"
    (out / ".cache" / "decompose").mkdir(parents=True)
    (out / ".cache" / "decompose" / "k.json").write_text("{}")
    (out / "storylines").mkdir()
    for name in ["alignment.json", "classifications.json", "btr_data.json", "status.json", "cache-manifest.txt"]:
        (out / name).write_text("{}")
    run_analysis.clear_for_resume(out)
    assert sorted(p.name for p in out.iterdir()) == [".cache", "btr_data.json", "cache-manifest.txt", "status.json"]
    assert (out / ".cache" / "decompose" / "k.json").exists()


def test_resume_books_the_previous_attempt_and_keeps_its_start(tmp_path, monkeypatch):
    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path / "ledger"))
    monkeypatch.setenv("CPC_RUN_SOURCE", "user_pipeline")
    monkeypatch.setenv("CPC_RUN_ID", "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13")
    out = tmp_path / "output"
    out.mkdir()
    (out / "status.json").write_text(
        json.dumps({"status": "running", "startedAt": "2026-10-26T09:00:00+00:00", "footprint": SNAPSHOT})
    )
    (out / "alignment.json").write_text("[]")
    started = run_analysis.resume_previous_attempt(out, "targets.json")
    assert started == "2026-10-26T09:00:00+00:00"
    rows = [json.loads(line) for line in (tmp_path / "ledger" / "footprint-ledger.jsonl").read_text().splitlines()]
    assert len(rows) == 1
    assert rows[0]["component"] == "user_pipeline"
    assert rows[0]["call_count"] == 12
    assert not (out / "alignment.json").exists()


def test_alignment_progress_reaches_the_status(tmp_path, monkeypatch):
    monkeypatch.setattr(run_analysis, "OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(run_analysis, "_STATUS", None)
    monkeypatch.setattr(run_analysis, "_PROGRESS", {})
    run_analysis._on_progress("Alignment", 0, 10)
    run_analysis._on_progress("Decomposition", 4, 8)
    run_analysis._on_progress("Alignment", 5, 10)
    run_analysis.write_status(5, "Alignment assessment", "Assessing alignment")
    status = json.loads((tmp_path / "status.json").read_text())
    assert status["progress"]["pairsDone"] == 5
    assert status["progress"]["pairsTotal"] == 10
    assert status["progress"]["startedAt"]
    assert status["heartbeatAt"] and isinstance(status["pid"], int)


def test_one_document_fails_before_any_call(tmp_path, monkeypatch):
    targets = [
        {"id": "NDC_1", "text": "Cut emissions by 20%", "sourceDocument": "NDC", "sourceLabel": "1"},
        {"id": "NDC_2", "text": "Plant 1 billion trees", "sourceDocument": "NDC", "sourceLabel": "2"},
    ]

    async def no_calls(**kwargs):
        raise AssertionError("no LLM call may be made")

    monkeypatch.setattr(llm, "call_llm_detailed", no_calls)
    monkeypatch.setattr(run_analysis, "OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(run_analysis, "_STATUS", None)
    monkeypatch.setattr(run_analysis, "derive_output_dir", lambda *args: tmp_path)
    monkeypatch.setattr(run_analysis, "load_input_data", lambda name: (targets, [], [], [], [], [], []))
    monkeypatch.setattr(
        run_analysis,
        "parse_args",
        lambda: argparse.Namespace(
            targets_file="targets.json",
            language="en",
            model=None,
            skip_target_quality=False,
            nr7_file=None,
            limit_targets=None,
            resume=False,
        ),
    )
    asyncio.run(run_analysis.main())
    status = json.loads((tmp_path / "status.json").read_text())
    assert status["status"] == "failed"
    assert "at least two documents" in status["error"]
