"""EcoLogits-based environmental footprint accumulator.

Extracted from ``llm.py`` so footprint tracking is a cohesive, reusable module.
All LLM calls funnel through ``call_llm`` (``llm.py``), which records each
response here. The tracker accumulates a single flat total (backward compatible
with the existing ``footprint.json`` / ``status.json`` consumers) plus a
per-model breakdown.

EcoLogits instruments the OpenAI SDK so that every chat completion response
gains an ``.impacts`` attribute. We init once at import time. If the model name
isn't recognised (e.g. some OpenRouter prefixes), ``.impacts`` will be absent
and ``record_response()`` degrades gracefully (falling back to a manual
``llm_impacts()`` computation from the output token count + latency).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict, dataclass
from typing import Any

from .zones import electricity_zone

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# EcoLogits initialisation
# ---------------------------------------------------------------------------

try:
    from ecologits import EcoLogits  # type: ignore

    EcoLogits.init(providers=["openai"], electricity_mix_zone=electricity_zone())
    _ECOLOGITS_AVAILABLE = True
except Exception as e:  # pragma: no cover - best-effort
    logger.warning(f"EcoLogits initialisation failed: {e}. Footprint tracking disabled.")
    _ECOLOGITS_AVAILABLE = False


# ---------------------------------------------------------------------------
# Accumulator
# ---------------------------------------------------------------------------


@dataclass
class FootprintTotals:
    """Accumulated environmental impact across all LLM calls in a run."""

    energy_wh: float = 0.0
    water_ml: float = 0.0
    co2_geq: float = 0.0
    minerals_ugsbeq: float = 0.0
    # Sum of EcoLogits' per-call min/max bounds. The flat values above are
    # midpoints; these keep the modelled uncertainty envelope. Calls without a
    # range (per-token estimates, seeded totals) contribute their midpoint to
    # both bounds, so the envelope understates rather than invents uncertainty.
    energy_wh_min: float = 0.0
    energy_wh_max: float = 0.0
    water_ml_min: float = 0.0
    water_ml_max: float = 0.0
    co2_geq_min: float = 0.0
    co2_geq_max: float = 0.0
    minerals_ugsbeq_min: float = 0.0
    minerals_ugsbeq_max: float = 0.0
    call_count: int = 0  # total call_llm invocations (incl. cached)
    tracked_call_count: int = 0  # non-cached calls where impacts were captured
    estimated_call_count: int = 0  # calls where impacts were approximated via per-token coefficients
    cached_call_count: int = 0  # calls served from disk cache (no new footprint)
    model: str | None = None  # last model used — for display purposes


# Per-1000-output-token coefficients used when EcoLogits has no registry entry
# for the model (e.g. DeepSeek-V4-Pro, Phi-4 freshly released on Azure Foundry).
# Rough "flagship OSS 70B-class" baseline so cross-model footprint comparison
# stays meaningful instead of collapsing to zero. Rows derived from these are
# tagged ``estimated`` in the snapshot so consumers can distinguish them.
_ESTIMATE_ENERGY_WH_PER_KTOK = 1.5
_ESTIMATE_WATER_ML_PER_KTOK = 0.6
_ESTIMATE_CO2_GEQ_PER_KTOK = 0.6
_ESTIMATE_MINERALS_UGSBEQ_PER_KTOK = 0.15


def _impact_value(field: Any) -> float:
    """Extract a numeric value from an EcoLogits impact field.

    The `.value` attribute is either a float or a RangeValue with `.min`/`.max`.
    We return the midpoint for ranges so running totals stay single-valued.
    """
    if field is None:
        return 0.0
    value = getattr(field, "value", None)
    if value is None:
        return 0.0
    if hasattr(value, "min") and hasattr(value, "max"):
        return float((value.min + value.max) / 2)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _impact_range(field: Any) -> tuple[float, float, float]:
    """Extract (midpoint, min, max) from an EcoLogits impact field.

    Scalar values collapse to (v, v, v); missing fields to zeros.
    """
    if field is None:
        return 0.0, 0.0, 0.0
    value = getattr(field, "value", None)
    if value is None:
        return 0.0, 0.0, 0.0
    if hasattr(value, "min") and hasattr(value, "max"):
        lo, hi = float(value.min), float(value.max)
        return (lo + hi) / 2, lo, hi
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0, 0.0, 0.0
    return v, v, v


def _normalise_model_name(model: str) -> str:
    """Strip OpenRouter-style provider prefixes so EcoLogits can look up the model.

    e.g. "openai/gpt-4o-mini" → "gpt-4o-mini"
    """
    if "/" in model:
        return model.split("/", 1)[1]
    return model


def _classify_source(totals: "FootprintTotals") -> str:
    """Classify a totals bucket as measured / estimated / mixed / unavailable."""
    has_tracked = totals.tracked_call_count > 0
    has_estimated = totals.estimated_call_count > 0
    if not _ECOLOGITS_AVAILABLE or (not has_tracked and not has_estimated):
        return "unavailable"
    if has_tracked and has_estimated:
        return "mixed"
    return "measured" if has_tracked else "estimated"


def _impacts_are_empty(impacts: Any) -> bool:
    """Check if an ImpactsOutput has no usable data (all values missing)."""
    if impacts is None:
        return True
    energy = _impact_value(getattr(impacts, "energy", None))
    gwp = _impact_value(getattr(impacts, "gwp", None))
    adpe = _impact_value(getattr(impacts, "adpe", None))
    usage = getattr(impacts, "usage", None)
    water = _impact_value(getattr(usage, "wcf", None)) if usage is not None else 0.0
    return energy == 0.0 and gwp == 0.0 and adpe == 0.0 and water == 0.0


class FootprintTracker:
    """Accumulator for EcoLogits impact data across a pipeline run.

    Tries the fast path first (response.impacts attached by EcoLogits'
    OpenAI instrumentation). If that's missing or empty (common when using
    OpenRouter model names like "openai/gpt-4o-mini" that don't match the
    EcoLogits registry), falls back to computing impacts manually via
    llm_impacts() with a normalised model name.
    """

    def __init__(self) -> None:
        self._totals = FootprintTotals()
        # Per-model breakdown. Same impacts as `_totals`, bucketed by model name,
        # so the ledger and the /sustainability dashboard can disaggregate.
        self._by_model: dict[str, FootprintTotals] = {}
        self._lock = asyncio.Lock()
        self._warned_missing = False
        self._warned_fallback = False
        self._warned_token_estimate = False

    def _bucket(self, model: str) -> FootprintTotals:
        """Return the per-model accumulator, creating it on first use.

        The caller must hold ``self._lock``.
        """
        bucket = self._by_model.get(model)
        if bucket is None:
            bucket = FootprintTotals(model=model)
            self._by_model[model] = bucket
        return bucket

    def _add_token_estimate(
        self, output_tokens: int, *targets: FootprintTotals
    ) -> None:
        """Add coarse per-token impacts to each target.

        Used when EcoLogits has no registry entry for the model, so the only
        signal we have is output token count. Coefficients are documented at
        module top; rows incrementing through here MUST also increment
        estimated_call_count so the snapshot can flag the result.
        """
        ktok = output_tokens / 1000.0
        for target in targets:
            target.energy_wh += _ESTIMATE_ENERGY_WH_PER_KTOK * ktok
            target.water_ml += _ESTIMATE_WATER_ML_PER_KTOK * ktok
            target.co2_geq += _ESTIMATE_CO2_GEQ_PER_KTOK * ktok
            target.minerals_ugsbeq += _ESTIMATE_MINERALS_UGSBEQ_PER_KTOK * ktok
            # No modelled range for coefficient estimates: midpoint on both bounds.
            target.energy_wh_min += _ESTIMATE_ENERGY_WH_PER_KTOK * ktok
            target.energy_wh_max += _ESTIMATE_ENERGY_WH_PER_KTOK * ktok
            target.water_ml_min += _ESTIMATE_WATER_ML_PER_KTOK * ktok
            target.water_ml_max += _ESTIMATE_WATER_ML_PER_KTOK * ktok
            target.co2_geq_min += _ESTIMATE_CO2_GEQ_PER_KTOK * ktok
            target.co2_geq_max += _ESTIMATE_CO2_GEQ_PER_KTOK * ktok
            target.minerals_ugsbeq_min += _ESTIMATE_MINERALS_UGSBEQ_PER_KTOK * ktok
            target.minerals_ugsbeq_max += _ESTIMATE_MINERALS_UGSBEQ_PER_KTOK * ktok

    def _add_impacts(self, impacts: Any, *targets: FootprintTotals) -> None:
        """Add one response's impacts to each target (the flat total + its model bucket)."""
        # energy: kWh → Wh
        energy, energy_lo, energy_hi = _impact_range(getattr(impacts, "energy", None))
        # gwp: kgCO2eq → gCO2eq
        co2, co2_lo, co2_hi = _impact_range(getattr(impacts, "gwp", None))
        # adpe: kgSbeq → ugSbeq
        adpe, adpe_lo, adpe_hi = _impact_range(getattr(impacts, "adpe", None))
        # water consumption footprint is on the usage phase; wcf: L → mL
        usage = getattr(impacts, "usage", None)
        water, water_lo, water_hi = (
            _impact_range(getattr(usage, "wcf", None)) if usage is not None else (0.0, 0.0, 0.0)
        )
        for target in targets:
            target.energy_wh += energy * 1000
            target.energy_wh_min += energy_lo * 1000
            target.energy_wh_max += energy_hi * 1000
            target.co2_geq += co2 * 1000
            target.co2_geq_min += co2_lo * 1000
            target.co2_geq_max += co2_hi * 1000
            target.minerals_ugsbeq += adpe * 1e9
            target.minerals_ugsbeq_min += adpe_lo * 1e9
            target.minerals_ugsbeq_max += adpe_hi * 1e9
            target.water_ml += water * 1000
            target.water_ml_min += water_lo * 1000
            target.water_ml_max += water_hi * 1000

    async def record_response(
        self,
        response: Any,
        model: str,
        latency_s: float | None = None,
    ) -> None:
        """Extract impacts from a chat completion response and add to totals."""
        async with self._lock:
            self._totals.call_count += 1
            self._totals.model = model
            bucket = self._bucket(model)
            bucket.call_count += 1

            impacts = getattr(response, "impacts", None)
            # Fast path: EcoLogits instrumented the response directly
            if not _impacts_are_empty(impacts):
                try:
                    self._add_impacts(impacts, self._totals, bucket)
                    self._totals.tracked_call_count += 1
                    bucket.tracked_call_count += 1
                    return
                except Exception as e:
                    if not self._warned_missing:
                        logger.warning(f"Failed to extract EcoLogits impacts: {e}")
                        self._warned_missing = True
                    return

            # Fallback: compute manually using the normalised model name.
            # Needed when using OpenRouter-style "provider/model" identifiers
            # that don't exist in the EcoLogits model registry.
            if not _ECOLOGITS_AVAILABLE or latency_s is None:
                if not self._warned_missing:
                    logger.warning(
                        f"No impacts on response for model '{model}' and no "
                        "latency measurement — footprint will remain zero."
                    )
                    self._warned_missing = True
                return

            usage = getattr(response, "usage", None)
            output_tokens = getattr(usage, "completion_tokens", None) if usage else None
            if not output_tokens:
                if not self._warned_missing:
                    logger.warning(
                        f"No completion_tokens in response.usage for model '{model}' — "
                        "cannot compute fallback footprint."
                    )
                    self._warned_missing = True
                return

            try:
                from ecologits.tracers.utils import llm_impacts  # type: ignore

                normalised = _normalise_model_name(model)
                fallback = llm_impacts(
                    provider="openai",
                    model_name=normalised,
                    output_token_count=int(output_tokens),
                    request_latency=float(latency_s),
                    electricity_mix_zone=electricity_zone(),
                )
                if _impacts_are_empty(fallback):
                    # Model not in EcoLogits registry. Use a coarse per-token
                    # estimate so cross-model footprint comparison stays
                    # meaningful instead of collapsing to zero. The result is
                    # flagged ``estimated`` in the snapshot.
                    self._add_token_estimate(int(output_tokens), self._totals, bucket)
                    self._totals.estimated_call_count += 1
                    bucket.estimated_call_count += 1
                    if not self._warned_token_estimate:
                        logger.info(
                            f"EcoLogits has no registry entry for '{normalised}'. "
                            "Using generic per-token coefficients; footprint will "
                            "be flagged 'estimated' in output."
                        )
                        self._warned_token_estimate = True
                    return
                self._add_impacts(fallback, self._totals, bucket)
                self._totals.tracked_call_count += 1
                bucket.tracked_call_count += 1
                if not self._warned_fallback:
                    logger.info(
                        f"EcoLogits fallback active: computing footprint for "
                        f"'{model}' via normalised name '{normalised}'"
                    )
                    self._warned_fallback = True
            except Exception as e:
                if not self._warned_missing:
                    logger.warning(f"EcoLogits fallback failed for '{model}': {e}")
                    self._warned_missing = True

    async def record_cached(self, model: str) -> None:
        """Record a cache hit — counts towards call_count but adds no footprint."""
        async with self._lock:
            self._totals.call_count += 1
            self._totals.cached_call_count += 1
            self._totals.model = model
            bucket = self._bucket(model)
            bucket.call_count += 1
            bucket.cached_call_count += 1

    def snapshot(self) -> dict[str, Any]:
        """Return a JSON-serialisable snapshot of current totals.

        The flat top-level keys are unchanged for backward compatibility with
        the existing footprint.json / status.json consumers. The additive
        ``by_model`` list disaggregates the same impacts per model.

        ``source`` is one of: ``measured`` (every footprint-bearing call had
        registry-backed impacts), ``estimated`` (every footprint-bearing call
        fell back to per-token coefficients), ``mixed`` (both), or
        ``unavailable`` (no footprint captured at all).
        """
        data = asdict(self._totals)
        data["available"] = _ECOLOGITS_AVAILABLE and (
            self._totals.tracked_call_count + self._totals.estimated_call_count
        ) > 0
        data["source"] = _classify_source(self._totals)
        data["by_model"] = [
            {
                **asdict(bucket),
                "available": _ECOLOGITS_AVAILABLE and (
                    bucket.tracked_call_count + bucket.estimated_call_count
                ) > 0,
                "source": _classify_source(bucket),
            }
            for bucket in self._by_model.values()
        ]
        return data

    def reset(self) -> None:
        self._totals = FootprintTotals()
        self._by_model = {}
        self._warned_missing = False
        self._warned_fallback = False
        self._warned_token_estimate = False

    def seed(self, initial: dict[str, Any]) -> None:
        """Seed the tracker with pre-existing footprint totals.

        Used to carry over impact from upstream steps (e.g. document
        extraction) so the final flat snapshot reflects the full pipeline.

        Intentionally seeds only the flat total, NOT the per-model buckets:
        the upstream step (e.g. extraction) emits its own ledger row, so
        mirroring its footprint into this run's by_model would double-count it
        in the ledger. The flat snapshot still includes the seed so the
        existing dashboard total is unchanged.
        """
        self._totals.energy_wh += float(initial.get("energy_wh", 0) or 0)
        self._totals.water_ml += float(initial.get("water_ml", 0) or 0)
        self._totals.co2_geq += float(initial.get("co2_geq", 0) or 0)
        self._totals.minerals_ugsbeq += float(initial.get("minerals_ugsbeq", 0) or 0)
        # Older footprint.json files carry no bounds: their flat midpoint feeds
        # both, keeping the envelope conservative rather than inventing width.
        for base in ("energy_wh", "water_ml", "co2_geq", "minerals_ugsbeq"):
            mid = float(initial.get(base, 0) or 0)
            for bound in ("min", "max"):
                key = f"{base}_{bound}"
                current = getattr(self._totals, key)
                setattr(self._totals, key, current + float(initial.get(key, mid) or mid))
        self._totals.call_count += int(initial.get("call_count", 0) or 0)
        self._totals.tracked_call_count += int(
            initial.get("tracked_call_count", 0) or 0
        )
        self._totals.estimated_call_count += int(
            initial.get("estimated_call_count", 0) or 0
        )
        self._totals.cached_call_count += int(
            initial.get("cached_call_count", 0) or 0
        )


_tracker: FootprintTracker | None = None


def get_footprint_tracker() -> FootprintTracker:
    global _tracker
    if _tracker is None:
        _tracker = FootprintTracker()
    return _tracker


def estimate_footprint_from_counts(
    call_groups: list[dict[str, Any]],
    model: str,
) -> dict[str, Any]:
    """Estimate cumulative footprint from known call counts.

    Used when a pipeline run is mostly served from the disk cache, so the
    live tracker captured no impacts but we still want to surface a
    meaningful number in the dashboard.

    Each group describes one logical call type:
        {"name": "classification", "count": 2486, "avg_output_tokens": 50, "avg_latency_s": 1.0}
    """
    if not _ECOLOGITS_AVAILABLE:
        return {
            "energy_wh": 0.0,
            "water_ml": 0.0,
            "co2_geq": 0.0,
            "minerals_ugsbeq": 0.0,
            "call_count": sum(g["count"] for g in call_groups),
            "tracked_call_count": 0,
            "cached_call_count": 0,
            "model": model,
            "available": False,
            "source": "unavailable",
        }

    try:
        from ecologits.tracers.utils import llm_impacts  # type: ignore
    except Exception:
        return {
            "energy_wh": 0.0,
            "water_ml": 0.0,
            "co2_geq": 0.0,
            "minerals_ugsbeq": 0.0,
            "call_count": sum(g["count"] for g in call_groups),
            "tracked_call_count": 0,
            "cached_call_count": 0,
            "model": model,
            "available": False,
            "source": "unavailable",
        }

    normalised = _normalise_model_name(model)
    totals = FootprintTotals(model=model)

    for group in call_groups:
        count = int(group.get("count", 0))
        if count <= 0:
            continue
        tokens = int(group.get("avg_output_tokens", 100))
        latency = float(group.get("avg_latency_s", 1.5))
        try:
            impacts = llm_impacts(
                provider="openai",
                model_name=normalised,
                output_token_count=tokens,
                request_latency=latency,
                electricity_mix_zone=electricity_zone(),
            )
        except Exception as e:
            logger.warning(
                f"Estimator failed for group '{group.get('name')}' on '{normalised}': {e}"
            )
            continue
        if _impacts_are_empty(impacts):
            continue
        energy, energy_lo, energy_hi = _impact_range(getattr(impacts, "energy", None))
        co2, co2_lo, co2_hi = _impact_range(getattr(impacts, "gwp", None))
        adpe, adpe_lo, adpe_hi = _impact_range(getattr(impacts, "adpe", None))
        usage = getattr(impacts, "usage", None)
        water, water_lo, water_hi = (
            _impact_range(getattr(usage, "wcf", None)) if usage is not None else (0.0, 0.0, 0.0)
        )
        totals.energy_wh += energy * 1000 * count
        totals.energy_wh_min += energy_lo * 1000 * count
        totals.energy_wh_max += energy_hi * 1000 * count
        totals.co2_geq += co2 * 1000 * count
        totals.co2_geq_min += co2_lo * 1000 * count
        totals.co2_geq_max += co2_hi * 1000 * count
        totals.minerals_ugsbeq += adpe * 1e9 * count
        totals.minerals_ugsbeq_min += adpe_lo * 1e9 * count
        totals.minerals_ugsbeq_max += adpe_hi * 1e9 * count
        totals.water_ml += water * 1000 * count
        totals.water_ml_min += water_lo * 1000 * count
        totals.water_ml_max += water_hi * 1000 * count
        totals.call_count += count

    return {
        **asdict(totals),
        "cached_call_count": totals.call_count,
        "available": totals.call_count > 0
        and (totals.energy_wh > 0 or totals.co2_geq > 0),
        "source": "estimated",
    }
