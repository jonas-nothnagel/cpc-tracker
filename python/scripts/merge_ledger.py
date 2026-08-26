#!/usr/bin/env python3
"""Merge a committed JSONL ledger seed into the persistent volume copy.

Run at container start (see ``start.sh``) for BOTH ledgers: the footprint
ledger and the ratings ledger. The committed seed (baked into the image) is
the source of truth for curated / backfilled / pipeline rows; the persistent
volume copy additionally carries rows recorded live on the host (chat, ratings
clicks, and any analyses run on the deployed instance).

A plain copy-if-absent only ever seeds on the first deploy, so rows committed
later never reach the host and it falls behind localhost. This reconcile fixes
that on every deploy while keeping live rows:

  1. Take every row from SEED (authoritative).
  2. Add VOLUME rows not matched by SEED, EXCEPT rows whose ``run_id`` starts
     with ``backfill:`` -- those are derived solely from committed
     ``footprint.json`` files, so SEED owns them and a volume-only backfill row
     is by definition stale (this drops a previously-seeded duplicate, e.g. an
     old Panama backfill superseded by a fresh run).
  3. Match volume rows against SEED on row IDENTITY. For footprint rows
     (recognised by their ``schema`` key) identity is a fixed whitelist of
     event-defining fields -- timestamp, component, provider, model, region,
     token/call counts, the four impact midpoints, and source. Everything
     outside the whitelist (``country``, ``run_id``, ``schema``, the optional
     ``*_min``/``*_max`` bounds, and any future field) is metadata the seed
     may retroactively correct or enrich without the row becoming a different
     event (e.g. the 2026-08 repair of model-comparison rows whose ``country``
     held a model slug, or a historical row regaining bounds) -- the seed
     version wins. Rows of other ledgers (ratings rows carry no ``schema``)
     use exact-row identity: there, fields like ``country`` ARE identity and
     must never be treated as curated metadata.
  4. De-duplicate VOLUME rows against each other on exact row content only.
     Distinct live events can legitimately collide on the footprint identity
     whitelist (fully-cached runs have coefficient-deterministic metrics and
     ``ts`` is second-granular), so a looser volume-vs-volume match could
     silently delete a real event.
  5. Sort by timestamp and write VOLUME.

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


# Event-defining fields of a footprint row. A volume row agreeing with a seed
# row on all of these is the same recorded event; everything else (country,
# run_id, schema, optional bounds, future additions) is correctable metadata.
_FOOTPRINT_IDENTITY_FIELDS = (
    "ts",
    "component",
    "provider",
    "model",
    "region",
    "input_tokens",
    "output_tokens",
    "call_count",
    "cached_call_count",
    "energy_wh",
    "water_ml",
    "co2_geq",
    "minerals_ugsbeq",
    "source",
)


def _canonical(row: dict) -> str:
    return json.dumps(row, sort_keys=True)


def _identity(row: dict) -> str:
    """Event identity used to match VOLUME rows against SEED rows.

    Footprint rows (they carry ``schema``) reduce to the whitelist above.
    Any other ledger's rows (ratings rows: {country, pairKey, rating, note,
    ts}) keep exact-row identity -- their fields are all load-bearing.
    """
    if "schema" in row:
        return json.dumps(
            {k: row.get(k) for k in _FOOTPRINT_IDENTITY_FIELDS}, sort_keys=True
        )
    return _canonical(row)


def merge_rows(seed: list[dict], volume: list[dict]) -> list[dict]:
    """Reconcile per the module docstring. Pure, so it is unit-testable."""
    merged: list[dict] = list(seed)
    seed_ids = {_identity(r) for r in seed}
    volume_seen: set[str] = set()
    for row in volume:
        run_id = row.get("run_id") or ""
        if run_id.startswith("backfill:"):
            # Seed is authoritative for backfill rows; drop volume-only stale ones.
            continue
        if _identity(row) in seed_ids:
            # Same event already in the merge: an identical row, or a seed row
            # whose corrected/enriched metadata supersedes this copy.
            continue
        canonical = _canonical(row)
        if canonical in volume_seen:
            # Exact duplicate within the volume itself.
            continue
        volume_seen.add(canonical)
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
