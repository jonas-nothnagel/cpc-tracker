"""
Async LLM client wrapper.

- Uses the OpenAI Python SDK (works with OpenRouter, Azure, HF, Ollama, etc.)
- Semaphore-based concurrency control
- Exponential-backoff retry
- Disk-based result caching (keyed by hash of inputs)
- EcoLogits-based environmental footprint tracking (see the `footprint` module)
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import random
import time
from pathlib import Path
from typing import Any

import httpx
from openai import AsyncAzureOpenAI, AsyncOpenAI

from . import config
from .config import (
    CACHE_DIR,
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_CONCURRENCY,
    LLM_TEMPERATURE,
)

# Footprint tracking lives in the cohesive `footprint` module. Importing it here
# triggers EcoLogits.init() (which patches the OpenAI SDK) before any client call,
# and re-exports the tracker API that run_analysis.py / extract.py import from
# `.llm`. `get_footprint_tracker` is used below; `estimate_footprint_from_counts`
# is re-exported only.
from .footprint.tracker import estimate_footprint_from_counts, get_footprint_tracker  # noqa: F401

logger = logging.getLogger(__name__)


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
# Sampling-parameter support
# ---------------------------------------------------------------------------
# Some deployments (gpt-5.6-terra) accept only the default temperature and
# reject an explicit value with a deterministic 400. Learned at the first
# rejection and remembered for the process, so the pipeline drops the parameter
# instead of burning the retry budget on an error that can never succeed.

_models_without_temperature: set[str] = set()


def _rejects_temperature(err_msg: str) -> bool:
    return "temperature" in err_msg and (
        "does not support" in err_msg or "unsupported_value" in err_msg
    )


# ---------------------------------------------------------------------------
# Output language
# ---------------------------------------------------------------------------
# A single pipeline-wide setting drives every LLM call's output language.
# `set_language()` is called once at startup by `run_analysis.py`; `call_llm`
# below appends a "Respond in {name}." directive to every system prompt so all
# 21 generation call sites (align, synthesize_*, classify*, quantitative, etc.)
# inherit without a per-call parameter. The augmented system prompt feeds the
# cache key, so each language gets its own cache namespace automatically.

_LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "es": "Spanish",
    "mn": "Mongolian",
    "fr": "French",
}

_current_language: str | None = None


def set_language(code: str | None) -> None:
    """Set the pipeline-wide output language (ISO 639-1 code)."""
    global _current_language
    _current_language = code


def get_language() -> str | None:
    return _current_language


def _augment_system_with_language(system: str) -> str:
    """Append a language directive to the system prompt when one is set.

    No-op when the language is unset, so existing tests and callers that
    don't go through `run_analysis.py` keep their current behaviour.
    """
    if not _current_language:
        return system
    name = _LANGUAGE_NAMES.get(_current_language, _current_language)
    return f"{system}\n\nRespond in {name}."


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
    entry = read_cache_entry(namespace, system, user, model)
    return entry[0] if entry is not None else None


def read_cache_entry(
    namespace: str, system: str, user: str, model: str
) -> tuple[str, dict[str, Any]] | None:
    """Read a cache record, returning (content, meta).

    `meta` carries per-call outcome markers (currently `contentFilter`).
    Entries written before meta existed return an empty meta dict, so a
    pre-existing cached "" cannot be distinguished from an old cached
    content-filter hit — such entries report status "empty" downstream and
    are re-classifiable only by clearing the cache key.
    """
    key = _cache_key(system, user, model)
    path = _cache_path(namespace, key)
    if path.exists():
        data = json.loads(path.read_text())
        content = data.get("content")
        if content is None:
            return None
        meta = data.get("meta")
        return content, meta if isinstance(meta, dict) else {}
    return None


def write_cache(
    namespace: str,
    system: str,
    user: str,
    model: str,
    content: str,
    meta: dict[str, Any] | None = None,
) -> None:
    key = _cache_key(system, user, model)
    path = _cache_path(namespace, key)
    record: dict[str, Any] = {
        "system": system,
        "user": user,
        "model": model,
        "content": content,
    }
    if meta:
        record["meta"] = meta
    path.write_text(json.dumps(record, indent=2))


# ---------------------------------------------------------------------------
# Core call with retry
# ---------------------------------------------------------------------------

MAX_RETRIES = 12
BASE_DELAY = 2.0  # seconds. Exponential backoff capped at 60s (see line 574). With
# 12 attempts the budget is roughly 2+4+8+16+32+60+60+60+60+60+60+60 ≈ 8 min per
# call before giving up. Sized for gpt-5.4 on Azure where short TPM bursts can
# saturate the deployment quota during long pipelines (Panama: ~50K calls).


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
    content, _ = await call_llm_detailed(
        system,
        user,
        model=model,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        cache_namespace=cache_namespace,
    )
    return content


def _call_status(content: str, meta: dict[str, Any]) -> str:
    if meta.get("contentFilter"):
        return "content_filter"
    return "ok" if content else "empty"


async def call_llm_detailed(
    system: str,
    user: str,
    *,
    model: str | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
    cache_namespace: str = "default",
) -> tuple[str, dict[str, Any]]:
    """call_llm plus a per-call outcome record.

    Returns (content, info) where info = {"status": "ok" | "content_filter"
    | "empty", "cached": bool}. "empty" covers genuinely empty responses AND
    pre-meta cached content-filter hits (see read_cache_entry). Identical
    caching behaviour to call_llm — same keys, same records.
    """
    model = model or config.LLM_MODEL
    temperature = temperature if temperature is not None else LLM_TEMPERATURE
    tracker = get_footprint_tracker()

    system = _augment_system_with_language(system)

    # Check cache first. A response that was truncated at the completion
    # ceiling (finish_reason="length") is only reused while the requested
    # budget is not larger than the one it was produced under — otherwise
    # raising CPC_EXTRACT_MAX_TOKENS and re-running could never recover the
    # lost tail (max_tokens is deliberately not part of the cache key).
    entry = read_cache_entry(cache_namespace, system, user, model)
    if entry is not None:
        cached, meta = entry
        stale_truncation = (
            meta.get("truncated")
            and max_tokens is not None
            and max_tokens > int(meta.get("maxTokens") or 0)
        )
        if not stale_truncation:
            await tracker.record_cached(model)
            return cached, {"status": _call_status(cached, meta), "cached": True}
        logger.info(
            "Cache entry was truncated at %s tokens; re-calling with the "
            "larger budget %s",
            meta.get("maxTokens"), max_tokens,
        )

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
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                }
                if model not in _models_without_temperature:
                    kwargs["temperature"] = temperature
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
                finish = getattr(response.choices[0], "finish_reason", None)

                # Cache the result; mark ceiling-truncated responses so a
                # future call with a larger budget re-runs instead of
                # replaying the cut-off content.
                meta = (
                    {"truncated": True, "maxTokens": max_tokens}
                    if finish == "length"
                    else None
                )
                write_cache(cache_namespace, system, user, model, content, meta=meta)
                info = {"status": _call_status(content, {}), "cached": False}
                if finish == "length":
                    info["truncated"] = True
                return content, info

        except Exception as e:
            last_error = e
            # Azure content-filter rejections are deterministic — retrying the
            # exact same prompt will always fail. Short-circuit with a benign
            # empty result so a single triggered target doesn't kill the whole
            # pipeline. The caller observes "" and treats it as an unparseable
            # response (level=none, no flag).
            err_msg = str(e)
            # A deployment that only allows its default temperature rejects the
            # explicit value every time, so retrying as-is would spend the whole
            # backoff budget. Remember it and retry immediately without the
            # parameter; the run continues at the model's default sampling.
            if _rejects_temperature(err_msg) and model not in _models_without_temperature:
                _models_without_temperature.add(model)
                logger.warning(
                    "Model %s rejects an explicit temperature; dropping the parameter "
                    "for the rest of this run (responses use the model default). "
                    "Detail: %s",
                    model, err_msg[:160],
                )
                continue
            if "content_filter" in err_msg or "ResponsibleAIPolicyViolation" in err_msg:
                logger.warning(
                    f"LLM call rejected by Azure content filter; returning empty "
                    f"result for this call. Detail: {err_msg[:200]}"
                )
                # Cache the empty result (marked, so re-runs can tell a filter
                # hit from a genuinely empty response) and don't re-hit the
                # filter on rerun.
                write_cache(
                    cache_namespace, system, user, model, "",
                    meta={"contentFilter": True},
                )
                return "", {"status": "content_filter", "cached": False}
            # Exponential backoff capped at 60s. Jitter (±25%) avoids thundering-herd
            # retries against bursty rate-limit windows on Azure (where many parallel
            # slots otherwise re-fire at the same instant).
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
    results = await call_llm_batch_detailed(
        calls, cache_namespace=cache_namespace, desc=desc
    )
    return [content for content, _info in results]


async def call_llm_batch_detailed(
    calls: list[dict[str, Any]],
    *,
    cache_namespace: str = "default",
    desc: str = "LLM calls",
) -> list[tuple[str, dict[str, Any]]]:
    """call_llm_batch plus a per-call outcome record (see call_llm_detailed)."""
    total = len(calls)
    completed = 0
    start = time.time()

    async def _run(call: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        nonlocal completed
        result = await call_llm_detailed(
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
