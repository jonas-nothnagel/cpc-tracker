"""Characterization tests for the footprint tracker.

Pin the public shape of ``FootprintTracker`` so the extraction out of
``llm.py`` into ``src.footprint`` is provably behaviour-preserving, and so the
existing ``footprint.json`` / ``status.json`` consumers keep working.
"""

from __future__ import annotations

import asyncio

from src.footprint import get_footprint_tracker
from src.footprint.tracker import FootprintTracker, estimate_footprint_from_counts


def test_snapshot_shape_backward_compatible():
    """The flat snapshot keys must stay byte-identical for existing consumers."""
    t = FootprintTracker()
    snap = t.snapshot()
    assert set(snap) >= {
        "energy_wh",
        "water_ml",
        "co2_geq",
        "minerals_ugsbeq",
        "call_count",
        "tracked_call_count",
        "cached_call_count",
        "model",
        "available",
        "source",
    }
    assert snap["source"] == "unavailable"
    assert snap["available"] is False


def test_seed_accumulates():
    t = FootprintTracker()
    t.seed({"energy_wh": 5, "co2_geq": 2, "call_count": 3})
    s = t.snapshot()
    assert s["energy_wh"] == 5
    assert s["co2_geq"] == 2
    assert s["call_count"] == 3


def test_record_cached_counts_without_footprint():
    t = FootprintTracker()
    asyncio.run(t.record_cached("gpt-5.4"))
    s = t.snapshot()
    assert s["call_count"] == 1
    assert s["cached_call_count"] == 1
    assert s["tracked_call_count"] == 0
    assert s["energy_wh"] == 0.0
    assert s["model"] == "gpt-5.4"


def test_singleton_is_stable():
    assert get_footprint_tracker() is get_footprint_tracker()


def test_estimate_from_counts_shape():
    """The estimator always returns the flat snapshot keys, even with no data."""
    out = estimate_footprint_from_counts(
        [{"name": "x", "count": 0, "avg_output_tokens": 10, "avg_latency_s": 1.0}],
        model="gpt-5.4",
    )
    assert set(out) >= {
        "energy_wh",
        "water_ml",
        "co2_geq",
        "minerals_ugsbeq",
        "call_count",
        "tracked_call_count",
        "cached_call_count",
        "model",
        "available",
        "source",
    }
    assert out["model"] == "gpt-5.4"
