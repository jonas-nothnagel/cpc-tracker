"""
Async LLM client wrapper.

- Uses the OpenAI Python SDK (works with OpenRouter, Azure, HF, Ollama, etc.)
- Semaphore-based concurrency control
- Exponential-backoff retry
- Disk-based result caching (keyed by hash of inputs)
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

from .config import CACHE_DIR, LLM_API_KEY, LLM_BASE_URL, LLM_CONCURRENCY, LLM_MODEL, LLM_TEMPERATURE

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Client singleton
# ---------------------------------------------------------------------------

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            base_url=LLM_BASE_URL,
            api_key=LLM_API_KEY,
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
# Core call with retry
# ---------------------------------------------------------------------------

MAX_RETRIES = 5
BASE_DELAY = 1.0  # seconds


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

    # Check cache first
    cached = read_cache(cache_namespace, system, user, model)
    if cached is not None:
        return cached

    client = get_client()
    sem = get_semaphore()

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        async with sem:
            try:
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
                    kwargs["max_tokens"] = max_tokens

                response = await client.chat.completions.create(**kwargs)
                content = response.choices[0].message.content or ""

                # Cache the result
                write_cache(cache_namespace, system, user, model, content)
                return content

            except Exception as e:
                last_error = e
                delay = BASE_DELAY * (2 ** attempt)
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
