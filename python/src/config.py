"""
LLM provider configuration.

Reads settings from project-root .env (or environment variables).
Provider-agnostic: swap LLM_BASE_URL + LLM_MODEL to change backend.
"""

from __future__ import annotations

import json
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

# ---------------------------------------------------------------------------
# Country registry
# ---------------------------------------------------------------------------

# The default targets file for single-country CLI entry points (run_analysis,
# probe_cache, rerun_measure_alignment). One named constant so "the default
# country is Mongolia" is written down exactly once.
DEFAULT_TARGETS_FILE: str = "mongolia-targets.json"


def all_targets_files() -> list[str]:
    """Every committed country corpus, as targets filenames.

    The `python/data/*-targets.json` glob IS the pipeline's country registry:
    a country exists exactly when its curated corpus does, and output dirs
    derive from the same stem (mongolia-targets.json -> output/mongolia/).
    Scripts that fan out across countries must use this instead of a
    hardcoded list — every such list has gone stale (all four predated
    Country X). Sorted, with the default country first for stable output.
    """
    found = sorted(p.name for p in DATA_DIR.glob("*-targets.json"))
    if DEFAULT_TARGETS_FILE in found:
        return [DEFAULT_TARGETS_FILE, *[f for f in found if f != DEFAULT_TARGETS_FILE]]
    return found


def country_display_name(country: str) -> str:
    """Human-readable country name for synthesis prompts and logs.

    Reads `name` from `{country}-country-config.json`; falls back to a
    title-cased slug ("sri-lanka" -> "Sri Lanka"), never to a placeholder.
    This used to have three divergent fallbacks — run_analysis fell back to
    the literal string "the country", which reached the corpus-synthesis
    prompts for Mongolia and Panama because their configs lacked `name`.
    Prompt-affecting: the name is embedded in the corpus-synthesis user
    prompt, so changing a country's `name` invalidates its corpus-themes
    LLM cache entries.
    """
    config_path = DATA_DIR / f"{country}-country-config.json"
    if config_path.exists():
        try:
            name = json.loads(config_path.read_text()).get("name")
        except (OSError, json.JSONDecodeError):
            name = None
        if name:
            return str(name)
    return country.replace("-", " ").title()
