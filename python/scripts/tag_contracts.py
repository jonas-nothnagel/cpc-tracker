"""Tag every public contract with its instrument, then re-check each strong match against it.

Two steps over the NCTP mirror (main checkout, dev_data_scripts/nctp_mirror/data, gitignored), with
the approved prompts in contract_prompts.py:

  instrument  every contract's kind of spending, from its title, buyer and portal type
              -> contract_instrument.parquet (id, instrument, clear)
  recheck     every strongly matching contract-target pair (August's comparisons and the later
              probe_alignment*.parquet), asked whether the contract carries out or directly
              prepares what the target commits to
              -> contract_recheck.parquet (tender_id, target_id, verdict, reason)

Identical prompts are sent once (the cache answers the rest); each run appends its measured
footprint to the ledger. From the worktree, with the main checkout's venv and cache:

  cd python && CPC_CACHE_DIR=/path/to/main/python/output/.cache CPC_LEDGER_DIR=$PWD/output \\
      /path/to/main/python/.venv/bin/python scripts/tag_contracts.py instrument --mirror /path/to/mirror/data
  ... recheck --mirror /path/to/mirror/data
  --sample N runs a seeded sample first, for a check before the full run.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from contract_prompts import (  # noqa: E402
    DELIVERS_SYSTEM,
    DELIVERS_USER,
    INSTRUMENT_NAMESPACE,
    INSTRUMENT_SYSTEM,
    INSTRUMENT_USER,
    RECHECK_NAMESPACE,
    instrument_of,
    verdict_of,
)

REPO = HERE.parents[1]
ACTIVITIES_CHARS = 900


def record_footprint(run_id: str, country: str = "mongolia") -> None:
    from src.footprint import append_event, electricity_zone
    from src.llm import get_footprint_tracker

    for row in get_footprint_tracker().snapshot().get("by_model") or []:
        if int(row.get("call_count", 0) or 0) <= int(row.get("cached_call_count", 0) or 0):
            continue
        append_event(
            component="dev_pipeline", provider="openai", model=row["model"], region=electricity_zone(),
            run_id=run_id, country=country,
            call_count=int(row.get("call_count", 0) or 0),
            cached_call_count=int(row.get("cached_call_count", 0) or 0),
            energy_wh=float(row.get("energy_wh", 0) or 0), water_ml=float(row.get("water_ml", 0) or 0),
            co2_geq=float(row.get("co2_geq", 0) or 0), minerals_ugsbeq=float(row.get("minerals_ugsbeq", 0) or 0),
            source=row.get("source") or "unavailable",
            **{f"{m}_{e}": row.get(f"{m}_{e}") for m in ("energy_wh", "water_ml", "co2_geq", "minerals_ugsbeq") for e in ("min", "max")},
        )
        print(f"footprint: {run_id}: {row.get('call_count')} calls ({row.get('cached_call_count')} cached), "
              f"{float(row.get('co2_geq') or 0):.1f} g CO2e")


def contracts(mirror: Path) -> pd.DataFrame:
    t = pd.read_parquet(mirror / "tenders.parquet", columns=["id", "contract_name", "client_name", "contract_type_name"])
    t["id"] = t["id"].astype(str)
    t["title"] = t["contract_name"].fillna("").str.strip()
    t["buyer"] = t["client_name"].fillna("").str.strip()
    t["ctype"] = t["contract_type_name"].fillna("").str.strip()
    return t[t["title"] != ""].drop_duplicates("id")


async def run_instrument(mirror: Path, sample: int | None) -> None:
    from src.llm import call_llm_batch

    t = contracts(mirror)
    if sample:
        t = t.sample(min(sample, len(t)), random_state=20260930)
    keys = sorted(set(zip(t["title"], t["buyer"], t["ctype"])))
    print(f"instrument: {len(t):,} contracts, {len(keys):,} distinct prompts")
    calls = [{"system": INSTRUMENT_SYSTEM, "user": INSTRUMENT_USER.format(title=a, buyer=b, ctype=c)} for a, b, c in keys]
    answers = dict(zip(keys, await call_llm_batch(calls, cache_namespace=INSTRUMENT_NAMESPACE, desc="instrument")))
    got = [instrument_of(answers[(r.title, r.buyer, r.ctype)]) for r in t.itertuples()]
    out = pd.DataFrame({"id": t["id"].values, "instrument": [g[0] for g in got], "clear": [g[1] for g in got]})
    name = "contract_instrument_sample.parquet" if sample else "contract_instrument.parquet"
    out.to_parquet(mirror / name, index=False)
    print(f"wrote {mirror / name}")
    print(out["instrument"].value_counts().to_string())
    record_footprint("contracts-instrument:sample" if sample else "contracts-instrument:census")


def strong_pairs(mirror: Path) -> pd.DataFrame:
    cols = ["tender_id", "target_id", "alignment"]
    files = [mirror / "alignment_consolidated.parquet", *sorted(mirror.glob("probe_alignment*.parquet"))]
    pairs = pd.concat([pd.read_parquet(f, columns=cols) for f in files], ignore_index=True)
    pairs["tender_id"] = pairs["tender_id"].astype(str)
    return pairs[pairs["alignment"] == "high"].drop_duplicates(["tender_id", "target_id"])


async def run_recheck(mirror: Path, sample: int | None) -> None:
    from src.llm import call_llm_batch

    targets = {x["id"]: x for x in json.loads((REPO / "python/data/mongolia-targets.json").read_text())}
    t = contracts(mirror).set_index("id")
    instrument = pd.read_parquet(mirror / "contract_instrument.parquet").set_index("id")["instrument"].to_dict()
    english: dict[str, str] = json.loads((mirror / "mt_lookup.json").read_text())
    en_file = REPO / "python/output/mongolia/gpt-5-4/contract-titles.en.json"
    if en_file.exists():
        english.update(json.loads(en_file.read_text()))
    pairs = strong_pairs(mirror)
    pairs = pairs[pairs["tender_id"].isin(t.index) & pairs["target_id"].isin(targets)]
    if sample:
        pairs = pairs.sample(min(sample, len(pairs)), random_state=20260930)

    def key(r) -> tuple:
        c = t.loc[r.tender_id]
        return (r.target_id, c["title"], c["buyer"], instrument.get(r.tender_id, "other"))

    keys = [key(r) for r in pairs.itertuples()]
    distinct = sorted(set(keys))
    print(f"recheck: {len(pairs):,} strong pairs, {len(distinct):,} distinct prompts")
    calls = []
    for tid, title, buyer, instr in distinct:
        x = targets[tid]
        calls.append({"system": DELIVERS_SYSTEM, "user": DELIVERS_USER.format(
            doc=x["sourceDocument"], target=x["text"],
            activities=(x.get("activities") or "none stated")[:ACTIVITIES_CHARS],
            title_mn=title, title_en=english.get(title) or "(none)", buyer=buyer, instrument=instr)})
    answers = dict(zip(distinct, await call_llm_batch(calls, cache_namespace=RECHECK_NAMESPACE, desc="recheck")))
    got = [verdict_of(answers[k]) for k in keys]
    out = pd.DataFrame({"tender_id": pairs["tender_id"].values, "target_id": pairs["target_id"].values,
                        "verdict": [g[0] for g in got], "reason": [g[1] for g in got]})
    name = "contract_recheck_sample.parquet" if sample else "contract_recheck.parquet"
    out.to_parquet(mirror / name, index=False)
    print(f"wrote {mirror / name}")
    print(out["verdict"].value_counts().to_string())
    record_footprint("contracts-recheck:sample" if sample else "contracts-recheck:strong-matches")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["instrument", "recheck"])
    ap.add_argument("--mirror", type=Path, default=REPO / "dev_data_scripts/nctp_mirror/data")
    ap.add_argument("--sample", type=int)
    args = ap.parse_args()
    run = run_instrument if args.step == "instrument" else run_recheck
    asyncio.run(run(args.mirror, args.sample))


if __name__ == "__main__":
    main()
