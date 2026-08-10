#!/usr/bin/env python3
"""Merge the committed footprint-ledger seed into the persistent volume copy.

Run at container start (see ``start.sh``). The committed ledger
(``python/output/footprint-ledger.jsonl``, baked into the image) is the source
of truth for curated / backfilled / pipeline rows; the persistent volume copy
additionally carries rows recorded live on the host (chat, and any analyses run
on the deployed instance).

A plain copy-if-absent only ever seeds on the first deploy, so rows committed
later never reach the host and it falls behind localhost. This reconcile fixes
that on every deploy while keeping live rows:

  1. Take every row from SEED (authoritative).
  2. Add VOLUME rows not already in SEED, EXCEPT rows whose ``run_id`` starts
     with ``backfill:`` -- those are derived solely from committed
     ``footprint.json`` files, so SEED owns them and a volume-only backfill row
     is by definition stale (this drops a previously-seeded duplicate, e.g. an
     old Panama backfill superseded by a fresh run).
  3. De-duplicate on row IDENTITY: everything except curated metadata
     (``country``, ``run_id``) and ``schema``. A volume row matching a seed
     row on identity is the same recorded event, possibly carrying metadata
     the seed has since corrected (e.g. the 2026-08 repair of model-comparison
     rows whose ``country`` held a model slug) -- the seed version wins.
     Metrics are 6-decimal floats, so two genuinely different events never
     collide on identity in practice.
  4. Sort by timestamp and write VOLUME.

First deploy (no VOLUME yet) => output == SEED, matching the old behaviour.
Stdlib-only and best-effort.

Usage:
    python3 merge_ledger.py SEED VOLUME
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def _read_rows(path: Path) -> list[dict]:
    """Parse a JSONL ledger, skipping blank and malformed lines."""
    rows: list[dict] = []
    try:
        text = path.read_text()
    except OSError:
        return rows
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    return rows


# Fields the seed may retroactively correct (curation) without the row becoming
# a different event. ``schema`` is included so a schema bump alone never
# duplicates an otherwise-identical row.
_CURATED_FIELDS = ("country", "run_id", "schema")


def _identity(row: dict) -> str:
    return json.dumps(
        {k: v for k, v in row.items() if k not in _CURATED_FIELDS}, sort_keys=True
    )


def merge_rows(seed: list[dict], volume: list[dict]) -> list[dict]:
    """Reconcile per the module docstring. Pure, so it is unit-testable."""
    merged: list[dict] = list(seed)
    seen = {_identity(r) for r in seed}
    for row in volume:
        run_id = row.get("run_id") or ""
        if run_id.startswith("backfill:"):
            # Seed is authoritative for backfill rows; drop volume-only stale ones.
            continue
        key = _identity(row)
        if key in seen:
            # Same event already in the merge (identical row, or a seed row
            # whose curated metadata supersedes this copy).
            continue
        seen.add(key)
        merged.append(row)
    merged.sort(key=lambda r: r.get("ts") or "")
    return merged


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: merge_ledger.py SEED VOLUME", file=sys.stderr)
        return 2
    seed_path, volume_path = Path(argv[1]), Path(argv[2])
    merged = merge_rows(_read_rows(seed_path), _read_rows(volume_path))
    volume_path.parent.mkdir(parents=True, exist_ok=True)
    volume_path.write_text("".join(json.dumps(r) + "\n" for r in merged))
    print(f"merged {len(merged)} rows into {volume_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
