"""Tests for output-path derivation and the model slug rule.

``derive_output_dir`` namespaces analysis outputs by country (always) and by
model (when --model is passed). The upload flow (CPC_OUTPUT_DIR) bypasses
derivation entirely.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from src.run_analysis import derive_output_dir, slugify_model


# ---------------------------------------------------------------------------
# slugify_model
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("gpt-5.4", "gpt-5-4"),
        ("gpt-5.4-mini", "gpt-5-4-mini"),
        ("DeepSeek-V4-Pro", "deepseek-v4-pro"),
        ("Phi-4", "phi-4"),
        ("openai/gpt-4o-mini", "openai-gpt-4o-mini"),
        ("  gpt-5.4  ", "gpt-5-4"),
    ],
)
def test_slugify_model(raw: str, expected: str) -> None:
    assert slugify_model(raw) == expected


# ---------------------------------------------------------------------------
# derive_output_dir
# ---------------------------------------------------------------------------


def test_derive_country_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CPC_OUTPUT_DIR", raising=False)
    base = Path("/tmp/out")
    assert derive_output_dir("mongolia-targets.json", base) == base / "mongolia"


def test_derive_country_and_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CPC_OUTPUT_DIR", raising=False)
    base = Path("/tmp/out")
    assert (
        derive_output_dir("mongolia-targets.json", base, "gpt-5.4")
        == base / "mongolia" / "gpt-5-4"
    )
    assert (
        derive_output_dir("panama-targets.json", base, "DeepSeek-V4-Pro")
        == base / "panama" / "deepseek-v4-pro"
    )


def test_derive_flat_fallback_no_country(monkeypatch: pytest.MonkeyPatch) -> None:
    """`targets.json` with no country prefix lands at the base flat."""
    monkeypatch.delenv("CPC_OUTPUT_DIR", raising=False)
    base = Path("/tmp/out")
    assert derive_output_dir("targets.json", base) == base


def test_derive_cpc_output_dir_override_skips_derivation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Upload flow: CPC_OUTPUT_DIR points at a per-analysis dir; never append."""
    monkeypatch.setenv("CPC_OUTPUT_DIR", "/uploads/abc/output")
    base = Path("/uploads/abc/output")
    # Even with a country prefix and a model, the env override wins.
    assert derive_output_dir("mongolia-targets.json", base, "gpt-5.4") == base
