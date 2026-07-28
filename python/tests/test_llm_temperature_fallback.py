"""Locks the temperature fallback in ``call_llm``.

Some deployments (gpt-5.6-terra, July 2026) accept only their default
temperature and reject an explicit value with a deterministic 400. Retrying
that unchanged spends the whole backoff ladder — twelve attempts, roughly eight
minutes — on an error that can never succeed, so ``call_llm`` learns the model
rejects it, drops the parameter, and retries at once.

These tests pin three things a refactor could silently break: that the
parameter really is dropped on the retry, that the rejection is recognised
across the wordings providers actually use without firing on unrelated errors,
and that a response sampled at the model default is marked in the cache. The
last one matters because temperature is deliberately not part of the cache key,
so nothing else distinguishes a reproducible temperature-0 response from one
sampled at a default (measured churn: ~4% against ~17%).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from src import llm


class _FakeSemaphore:
    async def __aenter__(self) -> "_FakeSemaphore":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None


class _FakeTracker:
    async def record_response(self, *_a: object, **_kw: object) -> None:
        return None

    async def record_cached(self, *_a: object, **_kw: object) -> None:
        return None


class _TemperatureRejectingClient:
    """Rejects any call carrying an explicit temperature, like the real deployment."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if "temperature" in kwargs:
            raise RuntimeError(
                "Error code: 400 - {'error': {'message': \"Unsupported value: "
                "'temperature' does not support 0.0 with this model. Only the "
                "default (1) value is supported.\", 'code': 'unsupported_value'}}"
            )
        message = SimpleNamespace(content="ok")
        return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=None)


@pytest.fixture(autouse=True)
def _forget_learned_models() -> Any:
    """The learned set is module-global; keep it from leaking between tests."""
    llm._models_without_temperature.clear()
    yield
    llm._models_without_temperature.clear()


@pytest.fixture
def rejecting_client(monkeypatch: pytest.MonkeyPatch) -> _TemperatureRejectingClient:
    client = _TemperatureRejectingClient()
    monkeypatch.setattr(llm, "get_client", lambda: client)
    monkeypatch.setattr(llm, "get_semaphore", lambda: _FakeSemaphore())
    monkeypatch.setattr(llm, "get_footprint_tracker", lambda: _FakeTracker())
    monkeypatch.setattr(llm, "read_cache_entry", lambda *_a, **_kw: None)
    return client


@pytest.mark.asyncio
async def test_drops_temperature_and_succeeds(
    rejecting_client: _TemperatureRejectingClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(llm, "write_cache", lambda *_a, **_kw: None)

    content = await llm.call_llm("sys", "usr", model="gpt-5.6-terra", temperature=0.0)

    assert content == "ok"
    assert len(rejecting_client.calls) == 2, "should retry once, immediately"
    assert rejecting_client.calls[0]["temperature"] == 0.0
    assert "temperature" not in rejecting_client.calls[1]
    assert "gpt-5.6-terra" in llm._models_without_temperature


@pytest.mark.asyncio
async def test_later_calls_skip_the_rejected_parameter(
    rejecting_client: _TemperatureRejectingClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The model is learned once, not rediscovered on every call."""
    monkeypatch.setattr(llm, "write_cache", lambda *_a, **_kw: None)

    await llm.call_llm("sys", "usr", model="gpt-5.6-terra", temperature=0.0)
    rejecting_client.calls.clear()
    await llm.call_llm("sys", "other", model="gpt-5.6-terra", temperature=0.0)

    assert len(rejecting_client.calls) == 1
    assert "temperature" not in rejecting_client.calls[0]


@pytest.mark.asyncio
async def test_marks_default_sampled_responses_in_the_cache(
    rejecting_client: _TemperatureRejectingClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    written: list[dict[str, Any] | None] = []
    monkeypatch.setattr(
        llm, "write_cache",
        lambda *_a, meta=None, **_kw: written.append(meta),
    )

    await llm.call_llm("sys", "usr", model="gpt-5.6-terra", temperature=0.0)

    assert written and written[-1] is not None
    assert written[-1].get("samplingDefault") is True, (
        "a response sampled at the model default must be distinguishable from a "
        "temperature-0 one, since temperature is not part of the cache key"
    )


@pytest.mark.parametrize(
    "message, expected",
    [
        # Wordings providers actually use.
        ("Unsupported value: 'temperature' does not support 0.0 with this model.", True),
        ("Unsupported parameter: 'temperature' is not supported with this model.", True),
        ("Temperature parameter is not supported for this model.", True),
        ("'temperature' is not allowed with this model", True),
        # Must not fire on unrelated failures, including ones whose text happens
        # to mention temperature — the corpus is full of climate policy.
        ("Error code: 429 - rate limit exceeded", False),
        ("Unsupported parameter: 'max_tokens' is not supported with this model.", False),
        (
            "This model does not support the 'response_format' parameter. "
            "Note: the 1.5 degree temperature goal.",
            False,
        ),
    ],
)
def test_recognises_provider_wordings(message: str, expected: bool) -> None:
    assert llm._rejects_temperature(RuntimeError(message)) is expected


def test_prefers_the_structured_error_body() -> None:
    """The body names the offending parameter exactly; the message is a fallback."""

    class _BadRequest(Exception):
        def __init__(self, body: dict[str, Any]) -> None:
            super().__init__("400")
            self.body = body

    assert llm._rejects_temperature(
        _BadRequest({"error": {"param": "temperature", "code": "unsupported_value"}})
    )
    assert not llm._rejects_temperature(
        _BadRequest({"error": {"param": "max_tokens", "code": "unsupported_value"}})
    )
