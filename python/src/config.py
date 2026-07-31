"""
LLM provider configuration.

Reads settings from project-root .env (or environment variables).
Provider-agnostic: swap LLM_BASE_URL + LLM_MODEL to change backend.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (two levels up from python/src/)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(_PROJECT_ROOT / ".env")

# ---------------------------------------------------------------------------
# Provider settings
# ---------------------------------------------------------------------------

LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1")
LLM_API_KEY: str = os.getenv("OPENROUTER_API_KEY") or os.getenv("LLM_API_KEY", "")
LLM_MODEL: str = os.getenv("LLM_MODEL", "openai/gpt-4o-mini")
LLM_CONCURRENCY: int = int(os.getenv("LLM_CONCURRENCY", "20"))
LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0"))

# ---------------------------------------------------------------------------
# Active classification taxonomies
# ---------------------------------------------------------------------------

# Which ranked taxonomies STEP 2 (and BTR/BER pseudo-target classification)
# actually runs. Project decision 2026-07-03: IPCC sectors, GLOBE, and GGA
# only; NBS is paused until the taxonomy strategy is revisited. Category files
# still load (synthesis display names, parser aliases), but no new NBS
# classifications are produced. Restore by adding "nbs" back here.
# 2026-07-31: human rights themes ("hr") added — see the hr_categories entry in
# data/categories.json for provenance and its DRAFT status.
ACTIVE_TAXONOMIES: frozenset[str] = frozenset({"sector", "globe", "gga", "hr"})

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_DEFAULT_DATA = Path(__file__).resolve().parent.parent / "data"
_DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "output"

DATA_DIR = Path(os.getenv("CPC_DATA_DIR") or str(_DEFAULT_DATA))
OUTPUT_DIR = Path(os.getenv("CPC_OUTPUT_DIR") or str(_DEFAULT_OUTPUT))

# Cache is shared across analyses for efficiency. Lives under OUTPUT_DIR so it
# follows CPC_OUTPUT_DIR onto persistent storage (Azure App Service /home mount).
# CPC_CACHE_DIR overrides the location independently of OUTPUT_DIR so worktree
# checkouts can point at the main checkout's warm cache instead of silently
# starting cold (the 2026-05 full-recompute incident). Probe before long runs:
# scripts/probe_cache.py reports expected hit rates without any API call.
CACHE_DIR = Path(os.getenv("CPC_CACHE_DIR") or str(OUTPUT_DIR / ".cache"))

# Ensure directories exist
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)
