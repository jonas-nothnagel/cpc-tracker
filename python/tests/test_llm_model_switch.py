"""Locks the gpt-5.x / o-series model-kwarg switch in ``call_llm``.

GPT-5.x and the o-series reasoning models reject ``max_tokens`` (Azure returns
400 "Unsupported parameter"); the supported field is ``max_completion_tokens``.
Older chat models (gpt-4o-mini, gpt-4-turbo) still expect ``max_tokens``.
``call_llm`` picks the right one by inspecting the model name prefix.

These tests pin that mapping so a future refactor cannot silently regress and
re-trigger the 400s we hit during the Panama gpt-5.4 rollout (May 2026).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from src import llm


class _FakeSemaphore:
    """Drop-in for asyncio.Semaphore that records nothing and never blocks."""

    async def __aenter__(self) -> "_FakeSemaphore":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None


class _FakeTracker:
    """Records nothing — we only care about the kwargs passed to the client."""

    async def record_response(self, *_a: object, **_kw: object) -> None:
        return None

    async def record_cached(self, *_a: object, **_kw: object) -> None:
        return None


class _RecordingClient:
    """Stand-in for AsyncAzureOpenAI / AsyncOpenAI.

    Captures every ``chat.completions.create`` kwargs dict on ``calls`` so the
    test can assert which token-limit field was sent for a given model.
    """

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(create=self._create)
        )

    async def _create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        # Shape just enough of the OpenAI response for call_llm to read content.
        message = SimpleNamespace(content="ok")
        choice = SimpleNamespace(message=message)
        return SimpleNamespace(choices=[choice], usage=None)


@pytest.fixture
def recording_client(monkeypatch: pytest.MonkeyPatch) -> _RecordingClient:
    """Wire a recording client + no-op semaphore/tracker/cache into ``src.llm``."""

    client = _RecordingClient()
    monkeypatch.setattr(llm, "get_client", lambda: client)
    monkeypatch.setattr(llm, "get_semaphore", lambda: _FakeSemaphore())
    monkeypatch.setattr(llm, "get_footprint_tracker", lambda: _FakeTracker())
    # Force cache miss so the call reaches the client every time.
    monkeypatch.setattr(llm, "read_cache", lambda *_a, **_kw: None)
    monkeypatch.setattr(llm, "write_cache", lambda *_a, **_kw: None)
    return client


@pytest.mark.parametrize(
    "model",
    [
        "gpt-5.4",
        "gpt-5-mini",
        "gpt-5-nano",
        "o1-mini",
        "o3",
        "o4-mini",
    ],
)
@pytest.mark.asyncio
async def test_reasoning_models_use_max_completion_tokens(
    recording_client: _RecordingClient, model: str
) -> None:
    """gpt-5.x and o-series must send ``max_completion_tokens``, not ``max_tokens``."""

    await llm.call_llm("sys", "usr", model=model, max_tokens=512)

    assert len(recording_client.calls) == 1
    sent = recording_client.calls[0]
    assert sent.get("max_completion_tokens") == 512
    assert "max_tokens" not in sent, (
        f"{model} must NOT send `max_tokens` — Azure rejects it for this model family"
    )


@pytest.mark.parametrize(
    "model",
    [
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-4",
        "gpt-3.5-turbo",
    ],
)
@pytest.mark.asyncio
async def test_legacy_chat_models_use_max_tokens(
    recording_client: _RecordingClient, model: str
) -> None:
    """Older chat models must send ``max_tokens`` (their supported field)."""

    await llm.call_llm("sys", "usr", model=model, max_tokens=512)

    assert len(recording_client.calls) == 1
    sent = recording_client.calls[0]
    assert sent.get("max_tokens") == 512
    assert "max_completion_tokens" not in sent, (
        f"{model} must NOT send `max_completion_tokens` — it expects the legacy field"
    )


@pytest.mark.asyncio
async def test_no_token_kwarg_when_max_tokens_omitted(
    recording_client: _RecordingClient,
) -> None:
    """When the caller doesn't pass ``max_tokens``, neither field is sent.

    Some pipeline steps deliberately leave the token cap to the model default.
    The switch must not synthesise either kwarg out of thin air.
    """

    await llm.call_llm("sys", "usr", model="gpt-5.4")

    assert len(recording_client.calls) == 1
    sent = recording_client.calls[0]
    assert "max_tokens" not in sent
    assert "max_completion_tokens" not in sent
