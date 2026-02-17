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
# Paths
# ---------------------------------------------------------------------------

_DEFAULT_DATA = Path(__file__).resolve().parent.parent / "data"
_DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "output"

DATA_DIR = Path(os.getenv("CPC_DATA_DIR") or str(_DEFAULT_DATA))
OUTPUT_DIR = Path(os.getenv("CPC_OUTPUT_DIR") or str(_DEFAULT_OUTPUT))

# Cache is always shared across analyses for efficiency
CACHE_DIR = _DEFAULT_OUTPUT / ".cache"

# Ensure directories exist
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)
