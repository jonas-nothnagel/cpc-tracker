#!/usr/bin/env python3
"""Backfill footprint-ledger rows for LLM work that never reached the ledger.

Why: only ``run_analysis.py`` and ``extract.py`` append ledger rows. Scripts
that call the model through ``src.llm`` (the procurement screening, the
snapshot and page translations) count their footprint in memory and lose it
when they exit. Found on 2026-09-25 by reconciling, day by day, the LLM cache
entries (one per live call) against the ledger's live calls.

What: one row per batch in ``BATCHES``: ``source`` "estimated", ``run_id``
"backfill:<batch>", dated at the batch's last call, ``cached_call_count`` 0
(each cache entry was a live call when it was written).

How:
- Calls: the cache entries written inside the batch's window (UTC) in the
  batch's namespaces, one entry per live call.
- Output tokens per call: o200k tokens of the cached answer + 3. Exact against
  the 10,827 cache entries that carry their recorded usage (no reasoning
  tokens).
- Impacts: EcoLogits through ``estimate_footprint_from_counts``, the
  pipeline's own estimator, one call group per token count, with a 30 s
  latency so that EcoLogits' generation-time model decides (a request latency
  only caps it).
- Calibration: the same estimate for the two measured Sri Lanka runs of 18
  and 23 September lands a few percent high; every metric (and its bounds) is
  scaled by measured / estimated over those runs, so the backfill does not
  overcount.

Out of scope: work before the ledger began (2 June 2026), the model probes
and small extraction batches that also lack a ledger row, and Claude Code
sessions.

Run from the repo's python/ directory (tiktoken is not a project dependency;
the cache is gitignored and lives in the main checkout):

    uv run --no-sync --with tiktoken python scripts/backfill_unrecorded_runs.py --cache PATH
    ... --append    # write the rows; rows already in the ledger are skipped
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.footprint import append_event, electricity_zone, ledger_path  # noqa: E402
from src.footprint.tracker import estimate_footprint_from_counts  # noqa: E402

MODEL = "gpt-5.4"
METRICS = ("energy_wh", "water_ml", "co2_geq", "minerals_ugsbeq")
TOKEN_OFFSET = 3
LATENCY_S = 30.0


@dataclass(frozen=True)
class Batch:
    run_id: str
    country: str | None
    start: str  # UTC, exclusive
    end: str  # UTC, inclusive
    prefixes: tuple[str, ...]
    exclude: tuple[str, ...] = ()


BATCHES = [
    # Mongolia public procurement (NCTP): purpose screen of the tender census,
    # sector ranking, alignment with the 178 targets, completion pass and
    # title translation (branch data/mongolia-nctp-procurement, HANDOFF.md).
    Batch("backfill:nctp-procurement", "mongolia", "2026-08-27T00:00:00Z", "2026-08-28T00:00:00Z", ("tender_", "decompose")),
    Batch("backfill:nctp-procurement", "mongolia", "2026-08-28T00:00:00Z", "2026-08-29T00:00:00Z", ("tender_", "decompose")),
    # Spanish and Mongolian localization of every country's texts and of the
    # method pages (#164); no single country.
    Batch("backfill:translation-2026-06-30-all", None, "2026-06-30T00:00:00Z", "2026-07-01T00:00:00Z", ("snapshot_translation_", "html_block_", "html_label_")),
    Batch("backfill:translation-2026-06-30-mongolia", "mongolia", "2026-06-30T00:00:00Z", "2026-07-01T00:00:00Z", ("mongolia_target_translation",)),
    # Sri Lanka's Spanish snapshots after its run on the final corpus.
    Batch("backfill:translation-2026-07-04-sri-lanka", "sri-lanka", "2026-07-04T00:00:00Z", "2026-07-05T00:00:00Z", ("snapshot_translation_",)),
    # Re-translation after the synthesis re-run for all four countries.
    Batch("backfill:translation-2026-07-06-all", None, "2026-07-06T00:00:00Z", "2026-07-07T00:00:00Z", ("snapshot_translation_",)),
    # Panama, after its theme synthesis was regenerated.
    Batch("backfill:translation-2026-07-07-panama", "panama", "2026-07-07T00:00:00Z", "2026-07-08T00:00:00Z", ("snapshot_translation_",)),
    # Sri Lanka, after its runs of 10 and 28 July (entries after each run's end).
    Batch("backfill:translation-2026-07-10-sri-lanka", "sri-lanka", "2026-07-10T00:00:00Z", "2026-07-11T00:00:00Z", ("snapshot_translation_",)),
    Batch("backfill:translation-2026-07-28-sri-lanka", "sri-lanka", "2026-07-28T00:00:00Z", "2026-07-29T00:00:00Z", ("snapshot_translation_",)),
    # Panama, after its climate-resilience lens was restored.
    Batch("backfill:translation-2026-08-07-panama", "panama", "2026-08-07T00:00:00Z", "2026-08-08T00:00:00Z", ("snapshot_translation_",)),
    # Mongolia's Mongolian snapshots and targets after its 9 August re-run.
    Batch("backfill:translation-2026-08-09-mongolia", "mongolia", "2026-08-09T00:00:00Z", "2026-08-10T00:00:00Z", ("snapshot_translation_", "mongolia_target_translation")),
    # Sri Lanka, after its runs on the new corpus.
    Batch("backfill:translation-2026-09-18-sri-lanka", "sri-lanka", "2026-09-18T00:00:00Z", "2026-09-19T00:00:00Z", ("snapshot_translation_",)),
    Batch("backfill:translation-2026-09-23-sri-lanka", "sri-lanka", "2026-09-23T00:00:00Z", "2026-09-24T00:00:00Z", ("snapshot_translation_",)),
    # English titles for the public contracts page: a sample on 28 September,
    # the rest on 29 September (scripts/translate_contracts.py records its own
    # footprint from then on).
    Batch("backfill:contract-titles", "mongolia", "2026-09-28T00:00:00Z", "2026-09-29T00:00:00Z", ("tender_mt_v1",)),
    Batch("backfill:contract-titles", "mongolia", "2026-09-29T00:00:00Z", "2026-09-29T09:00:00Z", ("tender_mt_v1",)),
    # The pilot of the development-side probe (dev_data_scripts/nctp_mirror/
    # probe_development_side.py, 100 comparisons): its ledger call failed on
    # August's older ledger function. The full run that followed recorded its
    # own measured row (contracts-probe:development-side).
    Batch("backfill:contracts-probe-pilot", "mongolia", "2026-09-29T15:25:00Z", "2026-09-29T15:25:30Z", ("tender_alignment_v1", "decompose")),
]

# The measured Sri Lanka runs the estimate is calibrated against: the window
# of each run's live calls, and the timestamp of its measured ledger row.
CALIBRATION = [
    Batch("2026-09-18T16:32:17Z", "sri-lanka", "2026-09-18T15:35:33Z", "2026-09-18T16:32:17Z", ("",), ("snapshot_translation_",)),
    Batch("2026-09-23T12:56:10Z", "sri-lanka", "2026-09-18T16:32:17Z", "2026-09-23T12:56:10Z", ("",), ("snapshot_translation_",)),
]


def _epoch(iso: str) -> float:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _in(batch: Batch, namespace: str, mtime: float) -> bool:
    return (
        _epoch(batch.start) < mtime <= _epoch(batch.end)
        and any(namespace.startswith(p) for p in batch.prefixes)
        and not any(namespace.startswith(p) for p in batch.exclude)
    )


def token_histograms(cache: Path, batches: list[Batch]) -> list[dict]:
    """Per batch: live calls, their output-token histogram, last call time."""
    import tiktoken

    enc = tiktoken.get_encoding("o200k_base")
    out = [{"hist": Counter(), "calls": 0, "last": 0.0} for _ in batches]
    for ns in sorted(os.listdir(cache)):
        folder = cache / ns
        if not folder.is_dir():
            continue
        for name in os.listdir(folder):
            path = folder / name
            mtime = path.stat().st_mtime
            hits = [i for i, b in enumerate(batches) if _in(b, ns, mtime)]
            if not hits:
                continue
            try:
                content = json.loads(path.read_text()).get("content")
            except (OSError, ValueError):
                continue
            text = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
            tokens = len(enc.encode(text)) + TOKEN_OFFSET
            for i in hits:
                out[i]["hist"][tokens] += 1
                out[i]["calls"] += 1
                out[i]["last"] = max(out[i]["last"], mtime)
    return out


def estimate(hist: Counter) -> dict:
    groups = [
        {"name": f"t{t}", "count": n, "avg_output_tokens": t, "avg_latency_s": LATENCY_S}
        for t, n in sorted(hist.items())
    ]
    return estimate_footprint_from_counts(groups, model=MODEL)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--cache", required=True, type=Path, help="python/output/.cache of the checkout that ran the work")
    parser.add_argument("--append", action="store_true", help="append the rows to the ledger")
    args = parser.parse_args(argv)

    ledger = [json.loads(line) for line in ledger_path().read_text().splitlines() if line.strip()]
    measured = []
    for cal in CALIBRATION:
        row = next((r for r in ledger if r["ts"] == cal.run_id and r.get("country") == cal.country), None)
        if row is None:
            print(f"Measured calibration row {cal.run_id} ({cal.country}) is not in the ledger: add it first.")
            return 1
        measured.append(row)

    hists = token_histograms(args.cache, CALIBRATION + BATCHES)
    cal_hists, batch_hists = hists[: len(CALIBRATION)], hists[len(CALIBRATION):]

    factors = {}
    cal_estimates = [estimate(h["hist"]) for h in cal_hists]
    for m in METRICS:
        est = sum(e[m] for e in cal_estimates)
        factors[m] = sum(r[m] for r in measured) / est if est else 1.0
    print("Calibration against the measured Sri Lanka runs (measured / estimated):")
    for cal, h, row in zip(CALIBRATION, cal_hists, measured):
        live = row["call_count"] - row["cached_call_count"]
        print(f"  {cal.run_id}: {h['calls']} cache entries for {live} recorded live calls")
    print("  " + ", ".join(f"{m} x{factors[m]:.4f}" for m in METRICS))

    existing = {(r.get("run_id"), r["ts"]) for r in ledger}
    rows = []
    for batch, h in zip(BATCHES, batch_hists):
        if not h["calls"]:
            print(f"  {batch.run_id}: no cache entries in its window, skipped")
            continue
        est = estimate(h["hist"])
        row = {
            "ts": _iso(h["last"]),
            "run_id": batch.run_id,
            "country": batch.country,
            "call_count": h["calls"],
        }
        for m in METRICS:
            for suffix in ("", "_min", "_max"):
                row[m + suffix] = est[m + suffix] * factors[m]
        rows.append(row)

    print(f"\n{'run_id':46} {'ts':20} {'calls':>8} {'kg CO2e':>8} {'kWh':>7} {'L':>7}")
    for r in rows:
        print(
            f"{r['run_id']:46} {r['ts']:20} {r['call_count']:8} {r['co2_geq'] / 1000:8.3f}"
            f" {r['energy_wh'] / 1000:7.2f} {r['water_ml'] / 1000:7.1f}"
        )
    print(f"{'total':46} {'':20} {sum(r['call_count'] for r in rows):8}"
          f" {sum(r['co2_geq'] for r in rows) / 1000:8.3f} {sum(r['energy_wh'] for r in rows) / 1000:7.2f}"
          f" {sum(r['water_ml'] for r in rows) / 1000:7.1f}")

    if not args.append:
        print("\nDry run: nothing written. Add --append to write these rows.")
        return 0
    written = 0
    for r in rows:
        if (r["run_id"], r["ts"]) in existing:
            print(f"  already in the ledger: {r['run_id']} {r['ts']}")
            continue
        append_event(
            component="dev_pipeline",
            provider="openai",
            model=MODEL,
            region=electricity_zone(),
            run_id=r["run_id"],
            country=r["country"],
            call_count=r["call_count"],
            cached_call_count=0,
            energy_wh=r["energy_wh"],
            water_ml=r["water_ml"],
            co2_geq=r["co2_geq"],
            minerals_ugsbeq=r["minerals_ugsbeq"],
            source="estimated",
            ts=r["ts"],
            **{m + s: r[m + s] for m in METRICS for s in ("_min", "_max")},
        )
        written += 1
    print(f"\nAppended {written} rows to {ledger_path()}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
