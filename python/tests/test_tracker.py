"""Characterization tests for the footprint tracker.

Pin the public shape of ``FootprintTracker`` so the extraction out of
``llm.py`` into ``src.footprint`` is provably behaviour-preserving, and so the
existing ``footprint.json`` / ``status.json`` consumers keep working.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from src.footprint import get_footprint_tracker
from src.footprint.tracker import FootprintTracker, estimate_footprint_from_counts


def _fake_response(*, energy_kwh: float, gwp_kg: float, adpe_kg: float, water_l: float):
    """Shape just enough of an EcoLogits-instrumented OpenAI response.

    `_impact_value` reads `field.value`; `_impacts_are_empty`/`_add_impacts`
    read energy/gwp/adpe and usage.wcf. Mirrors the real ImpactsOutput shape.
    """
    impacts = SimpleNamespace(
        energy=SimpleNamespace(value=energy_kwh),
        gwp=SimpleNamespace(value=gwp_kg),
        adpe=SimpleNamespace(value=adpe_kg),
        usage=SimpleNamespace(wcf=SimpleNamespace(value=water_l)),
    )
    return SimpleNamespace(
        impacts=impacts,
        usage=SimpleNamespace(completion_tokens=10),
    )


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
        "estimated_call_count",
        "cached_call_count",
        "model",
        "available",
        "source",
    }
    assert snap["source"] == "unavailable"
    assert snap["available"] is False
    assert snap["estimated_call_count"] == 0


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


def test_by_model_breakdown_cached():
    """Cache hits are bucketed per model; buckets sum to the flat call_count."""
    t = FootprintTracker()
    asyncio.run(t.record_cached("gpt-5.4"))
    asyncio.run(t.record_cached("gpt-4o-mini"))
    asyncio.run(t.record_cached("gpt-5.4"))
    snap = t.snapshot()
    assert "by_model" in snap
    models = {row["model"] for row in snap["by_model"]}
    assert models == {"gpt-5.4", "gpt-4o-mini"}
    assert sum(r["call_count"] for r in snap["by_model"]) == snap["call_count"] == 3
    assert sum(r["cached_call_count"] for r in snap["by_model"]) == snap["cached_call_count"]


def test_unknown_model_fallback_estimates_with_flag():
    """A model EcoLogits has no registry entry for still produces non-zero
    impacts via the per-token estimate, flagged ``estimated`` in the snapshot.
    """
    # Response has no impacts attached AND llm_impacts() returns an empty
    # ImpactsOutput — i.e. the model is unknown to EcoLogits' registry.
    empty_impacts = SimpleNamespace(
        energy=SimpleNamespace(value=0.0),
        gwp=SimpleNamespace(value=0.0),
        adpe=SimpleNamespace(value=0.0),
        usage=SimpleNamespace(wcf=SimpleNamespace(value=0.0)),
    )
    response = SimpleNamespace(
        impacts=None,
        usage=SimpleNamespace(completion_tokens=500),
    )

    t = FootprintTracker()
    with patch(
        "ecologits.tracers.utils.llm_impacts",
        return_value=empty_impacts,
    ):
        asyncio.run(t.record_response(response, "DeepSeek-V4-Pro", latency_s=2.0))

    snap = t.snapshot()
    assert snap["estimated_call_count"] == 1
    assert snap["tracked_call_count"] == 0
    # 500 output tokens × 1.5 Wh/1000tok = 0.75 Wh
    assert snap["energy_wh"] == pytest.approx(0.75)
    assert snap["co2_geq"] == pytest.approx(0.3)  # 0.6 g/ktok × 0.5
    assert snap["source"] == "estimated"

    bucket = snap["by_model"][0]
    assert bucket["model"] == "DeepSeek-V4-Pro"
    assert bucket["source"] == "estimated"
    assert bucket["estimated_call_count"] == 1


def test_mixed_source_when_measured_and_estimated_in_same_run():
    """When one model is measured and another estimated, source is 'mixed'."""
    measured_response = _fake_response(
        energy_kwh=0.001, gwp_kg=0.002, adpe_kg=0.0, water_l=0.005
    )
    empty_impacts = SimpleNamespace(
        energy=SimpleNamespace(value=0.0),
        gwp=SimpleNamespace(value=0.0),
        adpe=SimpleNamespace(value=0.0),
        usage=SimpleNamespace(wcf=SimpleNamespace(value=0.0)),
    )
    estimated_response = SimpleNamespace(
        impacts=None, usage=SimpleNamespace(completion_tokens=200)
    )

    t = FootprintTracker()
    asyncio.run(t.record_response(measured_response, "gpt-5.4"))
    with patch(
        "ecologits.tracers.utils.llm_impacts",
        return_value=empty_impacts,
    ):
        asyncio.run(
            t.record_response(estimated_response, "Phi-4", latency_s=1.0)
        )

    snap = t.snapshot()
    assert snap["source"] == "mixed"
    per_model = {row["model"]: row for row in snap["by_model"]}
    assert per_model["gpt-5.4"]["source"] == "measured"
    assert per_model["Phi-4"]["source"] == "estimated"


def test_by_model_impacts_mirror_flat_total():
    """Measured impacts land in both the flat total and the per-model bucket."""
    t = FootprintTracker()
    resp = _fake_response(energy_kwh=0.001, gwp_kg=0.002, adpe_kg=0.0, water_l=0.005)
    asyncio.run(t.record_response(resp, "gpt-5.4"))
    snap = t.snapshot()
    # Flat total reflects the call.
    assert snap["tracked_call_count"] == 1
    assert snap["co2_geq"] == 2.0  # 0.002 kgCO2eq -> 2 gCO2eq
    assert snap["energy_wh"] == 1.0  # 0.001 kWh -> 1 Wh
    assert snap["water_ml"] == 5.0  # 0.005 L -> 5 mL
    # The single model's bucket equals the flat total.
    assert len(snap["by_model"]) == 1
    bucket = snap["by_model"][0]
    assert bucket["model"] == "gpt-5.4"
    assert bucket["co2_geq"] == snap["co2_geq"]
    assert bucket["energy_wh"] == snap["energy_wh"]
    assert bucket["tracked_call_count"] == 1
    assert bucket["available"] is True
