"""Status files read by the web server while a job runs (src/run_status.py),
and the progress every batch of LLM calls reports to them (src/llm.py)."""

from __future__ import annotations

import asyncio
import json
import time

from src import llm
from src.run_status import StatusFile, write_json_atomic


def test_write_json_atomic_leaves_only_the_file(tmp_path):
    target = tmp_path / "status.json"
    write_json_atomic(target, {"state": "reading", "name": "Política"})
    assert [p.name for p in tmp_path.iterdir()] == ["status.json"]
    assert json.loads(target.read_text()) == {"state": "reading", "name": "Política"}


def test_status_file_stamps_heartbeat_process_and_boot(tmp_path, monkeypatch):
    monkeypatch.setenv("CPC_BOOT_ID", "boot-1")
    status = StatusFile(tmp_path / "status.json")
    status.write({"state": "reading"})
    written = json.loads((tmp_path / "status.json").read_text())
    assert written["state"] == "reading"
    assert written["bootId"] == "boot-1"
    assert isinstance(written["pid"], int)
    assert written["heartbeatAt"]


def test_heartbeat_rewrites_the_file_while_the_job_runs(tmp_path):
    status = StatusFile(tmp_path / "status.json", heartbeat_s=0.05)
    status.write({"state": "reading"})
    first = json.loads((tmp_path / "status.json").read_text())["heartbeatAt"]
    status.start_heartbeat()
    try:
        time.sleep(0.3)
    finally:
        status.stop()
    assert json.loads((tmp_path / "status.json").read_text())["heartbeatAt"] != first


def test_updates_are_throttled_unless_forced(tmp_path):
    status = StatusFile(tmp_path / "status.json", min_interval_s=60)
    status.write({"state": "reading"})
    status.update(part=1, parts=9)
    assert "part" not in json.loads((tmp_path / "status.json").read_text())
    status.update(force=True, part=2, parts=9)
    assert json.loads((tmp_path / "status.json").read_text())["part"] == 2


def test_progress_listener_sees_every_call(monkeypatch):
    async def fake_call(**kwargs):
        return "ok", {}

    monkeypatch.setattr(llm, "call_llm_detailed", fake_call)
    seen: list[tuple[str, int, int]] = []
    llm.set_progress_listener(lambda desc, done, total: seen.append((desc, done, total)))
    try:
        asyncio.run(llm.call_llm_batch_detailed([{"system": "s", "user": "u"}] * 3, desc="Alignment"))
    finally:
        llm.set_progress_listener(None)
    assert seen == [("Alignment", 0, 3), ("Alignment", 1, 3), ("Alignment", 2, 3), ("Alignment", 3, 3)]


def test_a_failing_listener_never_stops_the_batch(monkeypatch):
    async def fake_call(**kwargs):
        return "ok", {}

    def broken(desc, done, total):
        raise RuntimeError("listener bug")

    monkeypatch.setattr(llm, "call_llm_detailed", fake_call)
    llm.set_progress_listener(broken)
    try:
        results = asyncio.run(llm.call_llm_batch_detailed([{"system": "s", "user": "u"}] * 2, desc="d"))
    finally:
        llm.set_progress_listener(None)
    assert [content for content, _ in results] == ["ok", "ok"]
