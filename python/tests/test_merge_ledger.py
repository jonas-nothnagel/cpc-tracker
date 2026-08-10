"""Footprint ledger reconcile: seed authoritative, live rows preserved."""

from __future__ import annotations

import json
import sys
from pathlib import Path

# merge_ledger lives in python/scripts (not a package); put it on the path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import merge_ledger  # noqa: E402


def row(**over) -> dict:
    base = dict(
        ts="2026-06-01T00:00:00Z",
        component="chat",
        provider="openai",
        model="gpt-5.4",
        region="USA",
        run_id=None,
        country=None,
        input_tokens=None,
        output_tokens=None,
        call_count=1,
        cached_call_count=0,
        energy_wh=1.0,
        water_ml=2.0,
        co2_geq=3.0,
        minerals_ugsbeq=4.0,
        source="api",
        schema=1,
    )
    base.update(over)
    return base


def test_seed_rows_are_kept():
    seed = [row(run_id="backfill:mongolia", component="dev_pipeline", country="mongolia")]
    assert merge_ledger.merge_rows(seed, []) == seed


def test_live_volume_rows_are_preserved():
    seed = [row(run_id="backfill:mongolia", component="dev_pipeline", country="mongolia")]
    chat = row(ts="2026-06-05T09:00:00Z", run_id=None, component="chat")
    merged = merge_ledger.merge_rows(seed, [chat])
    assert chat in merged
    assert len(merged) == 2


def test_volume_only_backfill_rows_are_dropped():
    # A stale Panama backfill sitting only on the volume must not survive: the
    # seed carries the fresh run, so keeping the volume copy would double-count.
    stale = row(
        ts="2026-05-28T12:33:37Z",
        run_id="backfill:panama",
        component="dev_pipeline",
        country="panama",
        co2_geq=4721.8,
    )
    seed = [
        row(
            ts="2026-06-03T23:24:43Z",
            run_id=None,
            component="dev_pipeline",
            country="panama",
            co2_geq=4558.1,
        )
    ]
    merged = merge_ledger.merge_rows(seed, [stale])
    assert stale not in merged
    assert merged == seed


def test_identical_rows_dedupe():
    r = row(ts="2026-06-02T10:09:22Z", run_id=None, component="chat")
    assert merge_ledger.merge_rows([r], [dict(r)]) == [r]


def test_seed_metadata_correction_supersedes_volume_copy():
    # The seed's country was repaired (model slug -> mongolia); the volume still
    # holds the pre-repair copy. Same event: the corrected seed row must win,
    # never both.
    corrected = row(
        ts="2026-07-04T09:00:00Z",
        run_id=None,
        component="dev_pipeline",
        country="mongolia",
        model="gpt-5.4-mini",
        co2_geq=474.8,
    )
    stale = dict(corrected, country="gpt-5-4-mini")
    merged = merge_ledger.merge_rows([corrected], [stale])
    assert merged == [corrected]


def test_schema_bump_alone_does_not_duplicate():
    v1 = row(ts="2026-06-02T10:09:22Z", run_id=None, schema=1)
    v2 = dict(v1, schema=2)
    assert merge_ledger.merge_rows([v2], [v1]) == [v2]


def test_different_metrics_are_distinct_events():
    a = row(ts="2026-06-02T10:09:22Z", run_id=None, co2_geq=3.0)
    b = dict(a, co2_geq=3.000001)
    merged = merge_ledger.merge_rows([a], [b])
    assert len(merged) == 2


def test_merge_sorts_by_ts():
    seed = [row(ts="2026-06-03T00:00:00Z", run_id=None)]
    vol = [row(ts="2026-06-01T00:00:00Z", run_id=None, co2_geq=9.0)]
    merged = merge_ledger.merge_rows(seed, vol)
    assert [r["ts"] for r in merged] == [
        "2026-06-01T00:00:00Z",
        "2026-06-03T00:00:00Z",
    ]


def test_first_deploy_output_equals_seed(tmp_path):
    seed_p = tmp_path / "seed.jsonl"
    vol_p = tmp_path / "vol" / "footprint-ledger.jsonl"  # parent does not exist yet
    seed_rows = [
        row(run_id="backfill:mongolia", component="dev_pipeline", country="mongolia"),
        row(ts="2026-06-03T23:24:43Z", run_id=None, component="dev_pipeline", country="panama"),
    ]
    seed_p.write_text("".join(json.dumps(x) + "\n" for x in seed_rows))

    assert merge_ledger.main(["merge_ledger.py", str(seed_p), str(vol_p)]) == 0

    written = [json.loads(line) for line in vol_p.read_text().splitlines() if line.strip()]
    assert written == sorted(seed_rows, key=lambda r: r["ts"])
