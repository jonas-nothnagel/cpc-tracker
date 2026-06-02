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

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# EcoLogits initialisation
# ---------------------------------------------------------------------------

try:
    from ecologits import EcoLogits  # type: ignore

    EcoLogits.init(providers=["openai"])
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
    call_count: int = 0  # total call_llm invocations (incl. cached)
    tracked_call_count: int = 0  # non-cached calls where impacts were captured
    cached_call_count: int = 0  # calls served from disk cache (no new footprint)
    model: str | None = None  # last model used — for display purposes


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


def _normalise_model_name(model: str) -> str:
    """Strip OpenRouter-style provider prefixes so EcoLogits can look up the model.

    e.g. "openai/gpt-4o-mini" → "gpt-4o-mini"
    """
    if "/" in model:
        return model.split("/", 1)[1]
    return model


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

    def _bucket(self, model: str) -> FootprintTotals:
        """Return the per-model accumulator, creating it on first use.

        The caller must hold ``self._lock``.
        """
        bucket = self._by_model.get(model)
        if bucket is None:
            bucket = FootprintTotals(model=model)
            self._by_model[model] = bucket
        return bucket

    def _add_impacts(self, impacts: Any, *targets: FootprintTotals) -> None:
        """Add one response's impacts to each target (the flat total + its model bucket)."""
        # energy: kWh → Wh
        energy_wh = _impact_value(getattr(impacts, "energy", None)) * 1000
        # gwp: kgCO2eq → gCO2eq
        co2_geq = _impact_value(getattr(impacts, "gwp", None)) * 1000
        # adpe: kgSbeq → ugSbeq
        minerals_ugsbeq = _impact_value(getattr(impacts, "adpe", None)) * 1e9
        # water consumption footprint is on the usage phase; wcf: L → mL
        usage = getattr(impacts, "usage", None)
        water_ml = (
            _impact_value(getattr(usage, "wcf", None)) * 1000 if usage is not None else 0.0
        )
        for target in targets:
            target.energy_wh += energy_wh
            target.co2_geq += co2_geq
            target.minerals_ugsbeq += minerals_ugsbeq
            target.water_ml += water_ml

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
                )
                if _impacts_are_empty(fallback):
                    if not self._warned_missing:
                        logger.warning(
                            f"EcoLogits fallback returned empty impacts for '{normalised}'. "
                            "Model may not be in the registry."
                        )
                        self._warned_missing = True
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
        """
        data = asdict(self._totals)
        data["available"] = _ECOLOGITS_AVAILABLE and self._totals.tracked_call_count > 0
        data["source"] = "measured" if data["available"] else "unavailable"
        data["by_model"] = [
            {
                **asdict(bucket),
                "available": _ECOLOGITS_AVAILABLE and bucket.tracked_call_count > 0,
            }
            for bucket in self._by_model.values()
        ]
        return data

    def reset(self) -> None:
        self._totals = FootprintTotals()
        self._by_model = {}
        self._warned_missing = False

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
        self._totals.call_count += int(initial.get("call_count", 0) or 0)
        self._totals.tracked_call_count += int(
            initial.get("tracked_call_count", 0) or 0
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
    total_energy_wh = 0.0
    total_water_ml = 0.0
    total_co2_geq = 0.0
    total_minerals_ugsbeq = 0.0
    total_calls = 0

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
            )
        except Exception as e:
            logger.warning(
                f"Estimator failed for group '{group.get('name')}' on '{normalised}': {e}"
            )
            continue
        if _impacts_are_empty(impacts):
            continue
        total_energy_wh += _impact_value(getattr(impacts, "energy", None)) * 1000 * count
        total_co2_geq += _impact_value(getattr(impacts, "gwp", None)) * 1000 * count
        total_minerals_ugsbeq += _impact_value(getattr(impacts, "adpe", None)) * 1e9 * count
        usage = getattr(impacts, "usage", None)
        if usage is not None:
            total_water_ml += _impact_value(getattr(usage, "wcf", None)) * 1000 * count
        total_calls += count

    return {
        "energy_wh": total_energy_wh,
        "water_ml": total_water_ml,
        "co2_geq": total_co2_geq,
        "minerals_ugsbeq": total_minerals_ugsbeq,
        "call_count": total_calls,
        "tracked_call_count": 0,
        "cached_call_count": total_calls,
        "model": model,
        "available": total_calls > 0
        and (total_energy_wh > 0 or total_co2_geq > 0),
        "source": "estimated",
    }
