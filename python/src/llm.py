"""
Async LLM client wrapper.

- Uses the OpenAI Python SDK (works with OpenRouter, Azure, HF, Ollama, etc.)
- Semaphore-based concurrency control
- Exponential-backoff retry
- Disk-based result caching (keyed by hash of inputs)
- EcoLogits-based environmental footprint tracking
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import os

import httpx
from openai import AsyncAzureOpenAI, AsyncOpenAI

from .config import CACHE_DIR, LLM_API_KEY, LLM_BASE_URL, LLM_CONCURRENCY, LLM_MODEL, LLM_TEMPERATURE

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# EcoLogits initialisation
# ---------------------------------------------------------------------------
# EcoLogits instruments the OpenAI SDK so that every chat completion response
# gains an `.impacts` attribute. We init once at import time. If the model name
# isn't recognised (e.g. some OpenRouter prefixes), `.impacts` will be absent
# and FootprintTracker.record_response() degrades gracefully.

try:
    from ecologits import EcoLogits  # type: ignore

    EcoLogits.init(providers=["openai"])
    _ECOLOGITS_AVAILABLE = True
except Exception as e:  # pragma: no cover - best-effort
    logger.warning(f"EcoLogits initialisation failed: {e}. Footprint tracking disabled.")
    _ECOLOGITS_AVAILABLE = False


# ---------------------------------------------------------------------------
# Client singleton
# ---------------------------------------------------------------------------

_client: AsyncOpenAI | AsyncAzureOpenAI | None = None


def get_client() -> AsyncOpenAI | AsyncAzureOpenAI:
    global _client
    if _client is None:
        # Explicit httpx.Timeout so the connect timeout stays tight (5s). If we
        # passed `timeout=60.0` as a bare float, it would propagate uniformly
        # to every phase of the request (connect/read/write/pool) and DNS
        # failures would take 60s to detect instead of 5s.
        #
        # The SDK default total timeout is 600s (10 min). A single OpenRouter
        # request that hangs near that limit used to block its concurrency
        # slot through the semaphore: during the Panama alignment run we saw
        # throughput collapse from ~600 calls/min to ~80 calls/min once a
        # handful of requests got stuck. 60s is well above the p99 for a
        # healthy response; anything slower is almost certainly never coming
        # back. Combined with the retry loop now releasing the slot during
        # backoff (see `call_llm`), fast-failing lets other pairs make
        # progress.
        timeout = httpx.Timeout(60.0, connect=5.0)
        azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        if azure_endpoint:
            # Azure OpenAI / AI Foundry path. Uses Managed Identity by default
            # (DefaultAzureCredential walks env → MSI → CLI) and falls back to
            # AZURE_OPENAI_API_KEY if set. The model arg passed to call_llm
            # becomes the Azure deployment name.
            from azure.identity.aio import (
                DefaultAzureCredential,
                get_bearer_token_provider,
            )

            api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21")
            api_key = os.getenv("AZURE_OPENAI_API_KEY")
            if api_key:
                _client = AsyncAzureOpenAI(
                    azure_endpoint=azure_endpoint,
                    api_key=api_key,
                    api_version=api_version,
                    timeout=timeout,
                )
            else:
                token_provider = get_bearer_token_provider(
                    DefaultAzureCredential(),
                    "https://cognitiveservices.azure.com/.default",
                )
                _client = AsyncAzureOpenAI(
                    azure_endpoint=azure_endpoint,
                    azure_ad_token_provider=token_provider,
                    api_version=api_version,
                    timeout=timeout,
                )
        else:
            _client = AsyncOpenAI(
                base_url=LLM_BASE_URL,
                api_key=LLM_API_KEY,
                timeout=timeout,
            )
    return _client


# ---------------------------------------------------------------------------
# Concurrency semaphore
# ---------------------------------------------------------------------------

_semaphore: asyncio.Semaphore | None = None


def get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(LLM_CONCURRENCY)
    return _semaphore


# ---------------------------------------------------------------------------
# Disk cache
# ---------------------------------------------------------------------------


def _cache_key(system: str, user: str, model: str) -> str:
    """Deterministic hash for a given prompt + model."""
    blob = json.dumps({"system": system, "user": user, "model": model}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def _cache_path(namespace: str, key: str) -> Path:
    ns_dir = CACHE_DIR / namespace
    ns_dir.mkdir(parents=True, exist_ok=True)
    return ns_dir / f"{key}.json"


def read_cache(namespace: str, system: str, user: str, model: str) -> str | None:
    key = _cache_key(system, user, model)
    path = _cache_path(namespace, key)
    if path.exists():
        data = json.loads(path.read_text())
        return data.get("content")
    return None


def write_cache(namespace: str, system: str, user: str, model: str, content: str) -> None:
    key = _cache_key(system, user, model)
    path = _cache_path(namespace, key)
    path.write_text(json.dumps({
        "system": system,
        "user": user,
        "model": model,
        "content": content,
    }, indent=2))


# ---------------------------------------------------------------------------
# Footprint tracking
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
        self._lock = asyncio.Lock()
        self._warned_missing = False
        self._warned_fallback = False

    def _add_impacts(self, impacts: Any) -> None:
        # energy: kWh → Wh
        self._totals.energy_wh += _impact_value(getattr(impacts, "energy", None)) * 1000
        # gwp: kgCO2eq → gCO2eq
        self._totals.co2_geq += _impact_value(getattr(impacts, "gwp", None)) * 1000
        # adpe: kgSbeq → ugSbeq
        self._totals.minerals_ugsbeq += _impact_value(getattr(impacts, "adpe", None)) * 1e9
        # water consumption footprint is on the usage phase
        usage = getattr(impacts, "usage", None)
        if usage is not None:
            # wcf: L → mL
            self._totals.water_ml += _impact_value(getattr(usage, "wcf", None)) * 1000

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

            impacts = getattr(response, "impacts", None)
            # Fast path: EcoLogits instrumented the response directly
            if not _impacts_are_empty(impacts):
                try:
                    self._add_impacts(impacts)
                    self._totals.tracked_call_count += 1
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
                self._add_impacts(fallback)
                self._totals.tracked_call_count += 1
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

    def snapshot(self) -> dict[str, Any]:
        """Return a JSON-serialisable snapshot of current totals."""
        data = asdict(self._totals)
        data["available"] = _ECOLOGITS_AVAILABLE and self._totals.tracked_call_count > 0
        data["source"] = "measured" if data["available"] else "unavailable"
        return data

    def reset(self) -> None:
        self._totals = FootprintTotals()
        self._warned_missing = False

    def seed(self, initial: dict[str, Any]) -> None:
        """Seed the tracker with pre-existing footprint totals.

        Used to carry over impact from upstream steps (e.g. document
        extraction) so the final snapshot reflects the full pipeline.
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


# ---------------------------------------------------------------------------
# Core call with retry
# ---------------------------------------------------------------------------

MAX_RETRIES = 8
BASE_DELAY = 2.0  # seconds — exponential backoff: 2, 4, 8, 16, 32, 64, 128, 256s (cap)


async def call_llm(
    system: str,
    user: str,
    *,
    model: str | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
    cache_namespace: str = "default",
) -> str:
    """
    Call the LLM with retry and caching.

    Returns the assistant message content as a string.
    """
    model = model or LLM_MODEL
    temperature = temperature if temperature is not None else LLM_TEMPERATURE
    tracker = get_footprint_tracker()

    # Check cache first
    cached = read_cache(cache_namespace, system, user, model)
    if cached is not None:
        await tracker.record_cached(model)
        return cached

    client = get_client()
    sem = get_semaphore()

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        # The sem block wraps only the in-flight call. When a call fails, the
        # `async with sem:` context exits on exception, the slot is released,
        # and the backoff sleep below runs without holding the slot so other
        # concurrent calls can use it. This is the fix for the slot-starvation
        # stall observed during the Panama alignment run — the earlier fix
        # only tightened the per-request timeout but kept the slot held
        # through every retry's backoff.
        try:
            async with sem:
                kwargs: dict[str, Any] = {
                    "model": model,
                    "temperature": temperature,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                }
                if top_p is not None:
                    kwargs["top_p"] = top_p
                if max_tokens is not None:
                    # gpt-5.x and o-series reasoning models reject `max_tokens` (Azure 400);
                    # the supported field is `max_completion_tokens`. Older chat models still
                    # use `max_tokens`. Switch by model name so both work.
                    use_completion_tokens = bool(model) and (
                        model.startswith("gpt-5")
                        or model.startswith("o1")
                        or model.startswith("o3")
                        or model.startswith("o4")
                    )
                    if use_completion_tokens:
                        kwargs["max_completion_tokens"] = max_tokens
                    else:
                        kwargs["max_tokens"] = max_tokens

                call_start = time.perf_counter()
                response = await client.chat.completions.create(**kwargs)
                latency_s = time.perf_counter() - call_start
                await tracker.record_response(response, model, latency_s=latency_s)
                content = response.choices[0].message.content or ""

                # Cache the result
                write_cache(cache_namespace, system, user, model, content)
                return content

        except Exception as e:
            last_error = e
            # Exponential backoff capped at 60s. Jitter (±25%) avoids thundering-herd
            # retries against bursty rate-limit windows on Azure (where many parallel
            # slots otherwise re-fire at the same instant).
            import random
            base = min(BASE_DELAY * (2 ** attempt), 60.0)
            delay = base * (0.75 + random.random() * 0.5)
            logger.warning(
                f"LLM call failed (attempt {attempt + 1}/{MAX_RETRIES}): {e}. "
                f"Retrying in {delay:.1f}s..."
            )
            await asyncio.sleep(delay)

    raise RuntimeError(f"LLM call failed after {MAX_RETRIES} retries: {last_error}")


# ---------------------------------------------------------------------------
# Batch helper
# ---------------------------------------------------------------------------


async def call_llm_batch(
    calls: list[dict[str, Any]],
    *,
    cache_namespace: str = "default",
    desc: str = "LLM calls",
) -> list[str]:
    """
    Run multiple LLM calls concurrently (bounded by semaphore).

    Each item in `calls` should have keys: system, user
    Optional keys: model, temperature
    """
    total = len(calls)
    completed = 0
    start = time.time()

    async def _run(call: dict[str, Any]) -> str:
        nonlocal completed
        result = await call_llm(
            system=call["system"],
            user=call["user"],
            model=call.get("model"),
            temperature=call.get("temperature"),
            top_p=call.get("top_p"),
            max_tokens=call.get("max_tokens"),
            cache_namespace=cache_namespace,
        )
        completed += 1
        if completed % 50 == 0 or completed == total:
            elapsed = time.time() - start
            rate = completed / elapsed if elapsed > 0 else 0
            logger.info(f"  {desc}: {completed}/{total} ({rate:.1f}/s)")
        return result

    tasks = [_run(c) for c in calls]
    return await asyncio.gather(*tasks)
