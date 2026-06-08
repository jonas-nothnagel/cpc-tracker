"""One-time backfill: seed the footprint ledger from historical per-country runs.

Scans ``python/output/*/footprint.json`` (real past pipeline runs) and appends
one ``dev_pipeline`` ledger row per country, using the file's modification time
as the timestamp, so the /sustainability dashboard is non-empty on day one.

Idempotent: a country already represented by a ``backfill:<country>`` run_id in
the ledger is skipped, so re-running only adds newly-present countries.

Usage:
    cd python && uv run python scripts/backfill_ledger.py

Region is hard-coded to "USA": these historical numbers were computed against
the OpenAI EcoLogits default (USA) electricity mix, so that is their truthful
tag regardless of the current CPC_ELECTRICITY_ZONE.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make the `src` package importable when run as a standalone script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.footprint import append_event, ledger_path  # noqa: E402

_OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"
_HISTORICAL_REGION = "USA"


def _countries_with_pipeline_rows() -> set[str]:
    """Countries already represented by a pipeline run in the ledger.

    Matches either a ``backfill:<country>`` run_id (this script's own rows) or
    any ``dev_pipeline`` row carrying a ``country`` -- so a country fed in by a
    real run (e.g. committed by hand) is not re-added as a duplicate backfill
    row on the next run.
    """
    path = ledger_path()
    countries: set[str] = set()
    if not path.exists():
        return countries
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        run_id = row.get("run_id") or ""
        if run_id.startswith("backfill:"):
            countries.add(run_id.split(":", 1)[1])
        elif row.get("component") == "dev_pipeline" and row.get("country"):
            countries.add(row["country"])
    return countries


def main() -> None:
    already = _countries_with_pipeline_rows()
    seeded = 0
    for fp_path in sorted(_OUTPUT_DIR.glob("*/footprint.json")):
        country = fp_path.parent.name
        if country in already:
            print(f"skip {country}: already backfilled")
            continue
        try:
            fp = json.loads(fp_path.read_text())
        except (json.JSONDecodeError, OSError) as e:
            print(f"skip {country}: cannot read footprint.json ({e})")
            continue
        if not int(fp.get("call_count", 0) or 0):
            print(f"skip {country}: no calls recorded")
            continue
        ts = datetime.fromtimestamp(
            fp_path.stat().st_mtime, tz=timezone.utc
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        append_event(
            component="dev_pipeline",
            provider="openai",
            model=fp.get("model") or "unknown",
            region=_HISTORICAL_REGION,
            run_id=f"backfill:{country}",
            country=country,
            call_count=int(fp.get("call_count", 0) or 0),
            cached_call_count=int(fp.get("cached_call_count", 0) or 0),
            energy_wh=float(fp.get("energy_wh", 0) or 0),
            water_ml=float(fp.get("water_ml", 0) or 0),
            co2_geq=float(fp.get("co2_geq", 0) or 0),
            minerals_ugsbeq=float(fp.get("minerals_ugsbeq", 0) or 0),
            source=fp.get("source", "measured"),
            ts=ts,
        )
        seeded += 1
        print(
            f"seeded {country}: {fp.get('co2_geq', 0):.2f} gCO2eq, "
            f"{fp.get('call_count', 0)} calls (ts {ts})"
        )
    print(f"\nDone. Seeded {seeded} country(ies) into {ledger_path()}")


if __name__ == "__main__":
    main()
