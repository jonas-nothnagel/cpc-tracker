"""Append-only JSONL footprint ledger.

One JSON object per line records a unit of LLM usage (a pipeline run summarised
per model, or a single chat message), tagged with component / model / region /
timestamp. Both the Python pipeline and the TypeScript chat route append here;
the /sustainability page reads and rolls it up. See docs/CARBON_METHODOLOGY.md.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LEDGER_SCHEMA = 1
_FILENAME = "footprint-ledger.jsonl"


def ledger_path() -> Path:
    """Resolve the shared ledger file path.

    Honours ``CPC_LEDGER_DIR`` (set explicitly on Azure to the persistent mount
    so Python and Node agree on one file). Falls back to the repo-relative
    ``python/output`` directory, which the Node side
    (``src/lib/footprint/paths.ts``) also resolves to when run locally.
    """
    root = os.getenv("CPC_LEDGER_DIR")
    if root:
        base = Path(root)
    else:
        base = Path(__file__).resolve().parent.parent.parent / "output"
    base.mkdir(parents=True, exist_ok=True)
    return base / _FILENAME


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def append_event(
    *,
    component: str,
    provider: str,
    model: str,
    region: str,
    run_id: str | None,
    country: str | None,
    call_count: int,
    cached_call_count: int,
    energy_wh: float,
    water_ml: float,
    co2_geq: float,
    minerals_ugsbeq: float,
    source: str,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    ts: str | None = None,
) -> None:
    """Append one usage event as a single JSON line.

    Atomic: a single ``O_APPEND`` write of a line below ``PIPE_BUF`` (4096
    bytes) is POSIX-atomic, so concurrent appends from the pipeline and the
    chat route never interleave. Rows are well under 1 KB.
    """
    row: dict[str, Any] = {
        "ts": ts or _utc_now(),
        "component": component,
        "provider": provider,
        "model": model,
        "region": region,
        "run_id": run_id,
        "country": country,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "call_count": call_count,
        "cached_call_count": cached_call_count,
        "energy_wh": round(energy_wh, 6),
        "water_ml": round(water_ml, 6),
        "co2_geq": round(co2_geq, 6),
        "minerals_ugsbeq": round(minerals_ugsbeq, 6),
        "source": source,
        "schema": LEDGER_SCHEMA,
    }
    line = (json.dumps(row, ensure_ascii=False) + "\n").encode("utf-8")
    fd = os.open(str(ledger_path()), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
    try:
        os.write(fd, line)
    finally:
        os.close(fd)
