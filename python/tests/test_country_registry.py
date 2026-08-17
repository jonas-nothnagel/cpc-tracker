"""The python/data/*-targets.json glob is the pipeline's country registry.

Scripts that fan out across countries derive their list from
config.all_targets_files(); these tests pin the helper's contract and keep
it in sync with the frontend registry (src/config/countries.ts), which used
to drift silently (four hardcoded lists all predated Country X).
"""
from __future__ import annotations

import re
from pathlib import Path

from src.config import DATA_DIR, DEFAULT_TARGETS_FILE, all_targets_files

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_lists_every_committed_corpus():
    found = all_targets_files()
    on_disk = {p.name for p in DATA_DIR.glob("*-targets.json")}
    assert set(found) == on_disk
    assert len(found) == len(set(found))


def test_default_country_sorts_first():
    found = all_targets_files()
    assert found, "no corpora found — DATA_DIR misconfigured?"
    assert found[0] == DEFAULT_TARGETS_FILE


def test_matches_frontend_registry():
    """Every canonical id in src/config/countries.ts has a corpus, and every
    corpus has a registry entry. Parsed with a regex on the `id:` fields —
    crude, but the registry validates its own shape at import so the id lines
    are stable."""
    registry = (REPO_ROOT / "src" / "config" / "countries.ts").read_text(
        encoding="utf-8"
    )
    ts_ids = set(re.findall(r'^\s*id:\s*"([a-z][a-z0-9-]{1,30})",\s*$', registry, re.M))
    assert ts_ids, "could not parse any country ids from countries.ts"
    corpus_ids = {re.sub(r"-targets\.json$", "", f) for f in all_targets_files()}
    assert ts_ids == corpus_ids
