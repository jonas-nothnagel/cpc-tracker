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
    snapshot = {**SNAPSHOT, "by_model": [{**SNAPSHOT, "model": "gpt-5.4"}]}
    (out / "status.json").write_text(
        json.dumps({"status": "running", "startedAt": "2026-10-26T09:00:00+00:00", "footprint": snapshot})
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


def test_status_footprint_follows_every_batch(tmp_path, monkeypatch):
    from src.run_status import StatusFile

    calls = {"n": 0}

    class Tracker:
        def snapshot(self):
            calls["n"] += 1
            return {"call_count": calls["n"], "by_model": []}

    monkeypatch.setattr(run_analysis, "OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(run_analysis, "_STATUS", StatusFile(tmp_path / "status.json", min_interval_s=0))
    monkeypatch.setattr(run_analysis, "_PROGRESS", {})
    monkeypatch.setattr(run_analysis, "get_footprint_tracker", lambda: Tracker())
    run_analysis._on_progress("Ranked classification (globe)", 7, 14)
    first = json.loads((tmp_path / "status.json").read_text())["footprint"]["call_count"]
    run_analysis._on_progress("Alignment", 3, 48)
    status = json.loads((tmp_path / "status.json").read_text())
    assert status["footprint"]["call_count"] > first
    assert status["progress"]["pairsDone"] == 3


def test_resume_books_only_the_attempts_own_calls(tmp_path, monkeypatch):
    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path / "ledger"))
    monkeypatch.setenv("CPC_RUN_SOURCE", "user_pipeline")
    out = tmp_path / "output"
    out.mkdir()
    # The flat totals carry the readings' footprint (the seed); by_model does not.
    seeded = {**SNAPSHOT, "call_count": 60, "co2_geq": 9.0, "by_model": [{**SNAPSHOT, "model": "gpt-5.4"}]}
    (out / "status.json").write_text(json.dumps({"status": "running", "footprint": seeded}))
    run_analysis.resume_previous_attempt(out, "targets.json")
    rows = [json.loads(line) for line in (tmp_path / "ledger" / "footprint-ledger.jsonl").read_text().splitlines()]
    assert [r["call_count"] for r in rows] == [12]


def test_resume_books_nothing_for_an_attempt_that_made_no_calls(tmp_path, monkeypatch):
    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path / "ledger"))
    out = tmp_path / "output"
    out.mkdir()
    (out / "status.json").write_text(json.dumps({"status": "running", "footprint": {**SNAPSHOT, "call_count": 48, "by_model": []}}))
    run_analysis.resume_previous_attempt(out, "targets.json")
    ledger = tmp_path / "ledger" / "footprint-ledger.jsonl"
    assert not ledger.exists() or ledger.read_text().strip() == ""


def test_heartbeat_survives_a_failed_write(tmp_path, monkeypatch):
    import time as _time

    from src import run_status

    status = run_status.StatusFile(tmp_path / "status.json", heartbeat_s=0.05)
    status.write({"state": "reading"})
    real = run_status.write_json_atomic
    failures = {"left": 1}

    def flaky(path, data):
        if failures["left"]:
            failures["left"] -= 1
            raise OSError("the share went away for a moment")
        real(path, data)

    monkeypatch.setattr(run_status, "write_json_atomic", flaky)
    first = json.loads((tmp_path / "status.json").read_text())["heartbeatAt"]
    status.start_heartbeat()
    try:
        _time.sleep(0.4)
    finally:
        status.stop()
    assert failures["left"] == 0
    assert json.loads((tmp_path / "status.json").read_text())["heartbeatAt"] != first


def test_resume_refuses_outside_the_upload_flow(tmp_path, monkeypatch):
    async def no_calls(**kwargs):
        raise AssertionError("no LLM call may be made")

    # Whatever the code does, this test can reach neither the model, the real
    # targets nor the tracked ledger.
    monkeypatch.setattr(llm, "call_llm_detailed", no_calls)
    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path / "ledger"))
    monkeypatch.setattr(run_analysis, "load_input_data", lambda name: ([], [], [], [], [], [], []))
    monkeypatch.delenv("CPC_OUTPUT_DIR", raising=False)
    (tmp_path / "alignment.json").write_text("[]")
    monkeypatch.setattr(run_analysis, "OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(run_analysis, "_STATUS", None)
    monkeypatch.setattr(run_analysis, "derive_output_dir", lambda *args: tmp_path)
    monkeypatch.setattr(
        run_analysis,
        "parse_args",
        lambda: argparse.Namespace(
            targets_file="mongolia-targets.json",
            language="en",
            model=None,
            skip_target_quality=False,
            nr7_file=None,
            limit_targets=None,
            resume=True,
        ),
    )
    with pytest.raises(SystemExit):
        asyncio.run(run_analysis.main())
    assert (tmp_path / "alignment.json").exists()


def _ledger_rows(tmp_path):
    ledger = tmp_path / "ledger" / "footprint-ledger.jsonl"
    return [json.loads(line) for line in ledger.read_text().splitlines()] if ledger.exists() else []


def test_resume_says_the_attempt_is_booked_before_it_clears_so_a_kill_cannot_book_it_twice(tmp_path, monkeypatch):
    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path / "ledger"))
    monkeypatch.setenv("CPC_RUN_SOURCE", "user_pipeline")
    out = tmp_path / "output"
    out.mkdir()
    snapshot = {**SNAPSHOT, "by_model": [{**SNAPSHOT, "model": "gpt-5.4"}]}
    (out / "status.json").write_text(json.dumps({"status": "running", "footprint": snapshot}))

    def killed(output_dir):
        raise KeyboardInterrupt("the server restarts while the outputs are cleared")

    real_clear = run_analysis.clear_for_resume
    monkeypatch.setattr(run_analysis, "clear_for_resume", killed)
    with pytest.raises(KeyboardInterrupt):
        run_analysis.resume_previous_attempt(out, "targets.json")
    assert json.loads((out / "status.json").read_text())["footprintBooked"] is True
    monkeypatch.setattr(run_analysis, "clear_for_resume", real_clear)
    run_analysis.resume_previous_attempt(out, "targets.json")
    assert [r["call_count"] for r in _ledger_rows(tmp_path)] == [12]


def test_resume_books_nothing_for_an_attempt_already_booked(tmp_path, monkeypatch):
    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path / "ledger"))
    out = tmp_path / "output"
    out.mkdir()
    snapshot = {**SNAPSHOT, "by_model": [{**SNAPSHOT, "model": "gpt-5.4"}]}
    (out / "status.json").write_text(json.dumps({"status": "failed", "footprint": snapshot, "footprintBooked": True}))
    run_analysis.resume_previous_attempt(out, "targets.json")
    assert _ledger_rows(tmp_path) == []


def test_booking_happens_once_and_the_status_says_so_at_once(tmp_path, monkeypatch):
    from src.run_status import StatusFile

    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path / "ledger"))
    monkeypatch.setattr(run_analysis, "OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(run_analysis, "_STATUS", StatusFile(tmp_path / "status.json", min_interval_s=60))
    monkeypatch.setattr(run_analysis, "_FOOTPRINT_BOOKED", False)
    footprint = {**SNAPSHOT, "by_model": [{**SNAPSHOT, "model": "gpt-5.4"}]}
    run_analysis._book_once(footprint, "targets.json")
    run_analysis._book_once(footprint, "targets.json")
    assert [r["call_count"] for r in _ledger_rows(tmp_path)] == [12]
    assert json.loads((tmp_path / "status.json").read_text())["footprintBooked"] is True


def test_a_failed_run_books_the_calls_it_made(tmp_path, monkeypatch):
    async def no_calls(**kwargs):
        raise AssertionError("no LLM call may be made")

    class Tracker:
        """Seven calls made before the failure; the flat totals also carry the readings' seed."""

        def snapshot(self):
            return {**SNAPSHOT, "call_count": 40, "by_model": [{**SNAPSHOT, "call_count": 7, "model": "gpt-5.4"}]}

    def failing_load(name):
        raise RuntimeError("the targets could not be loaded")

    monkeypatch.setattr(llm, "call_llm_detailed", no_calls)
    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path / "ledger"))
    monkeypatch.setenv("CPC_RUN_SOURCE", "user_pipeline")
    monkeypatch.setattr(run_analysis, "OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(run_analysis, "_STATUS", None)
    monkeypatch.setattr(run_analysis, "_FOOTPRINT_BOOKED", False)
    monkeypatch.setattr(run_analysis, "get_footprint_tracker", lambda: Tracker())
    monkeypatch.setattr(run_analysis, "derive_output_dir", lambda *args: tmp_path)
    monkeypatch.setattr(run_analysis, "load_input_data", failing_load)
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
    assert status["footprintBooked"] is True
    # The per-model rows only: the seed is in the extract rows already.
    assert [r["call_count"] for r in _ledger_rows(tmp_path)] == [7]
