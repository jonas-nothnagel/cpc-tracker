"""Append-only JSONL footprint ledger: path resolution + atomic append."""

from __future__ import annotations

import json

from src.footprint.ledger import LEDGER_SCHEMA, append_event, ledger_path


def _append(**over):
    base = dict(
        component="dev_pipeline",
        provider="openai",
        model="gpt-5.4",
        region="USA",
        run_id=None,
        country="mongolia",
        call_count=10,
        cached_call_count=1,
        energy_wh=1.5,
        water_ml=2.0,
        co2_geq=0.5,
        minerals_ugsbeq=0.1,
        source="measured",
    )
    base.update(over)
    append_event(**base)


def test_ledger_dir_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path))
    assert ledger_path().parent == tmp_path
    assert ledger_path().name == "footprint-ledger.jsonl"


def test_append_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path))
    _append()
    lines = ledger_path().read_text().strip().splitlines()
    assert len(lines) == 1
    row = json.loads(lines[0])
    assert row["schema"] == LEDGER_SCHEMA
    assert row["component"] == "dev_pipeline"
    assert row["model"] == "gpt-5.4"
    assert row["co2_geq"] == 0.5
    assert "ts" in row and row["ts"].endswith("Z")
    # Token fields default to null (chat fills them; pipeline leaves them null).
    assert row["input_tokens"] is None
    assert row["output_tokens"] is None


def test_multiple_appends_are_separate_lines(monkeypatch, tmp_path):
    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path))
    _append(model="gpt-5.4")
    _append(model="gpt-4o-mini")
    lines = ledger_path().read_text().strip().splitlines()
    assert len(lines) == 2
    models = {json.loads(line)["model"] for line in lines}
    assert models == {"gpt-5.4", "gpt-4o-mini"}


def test_ts_override(monkeypatch, tmp_path):
    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path))
    _append(ts="2024-01-02T03:04:05Z")
    row = json.loads(ledger_path().read_text().strip())
    assert row["ts"] == "2024-01-02T03:04:05Z"
