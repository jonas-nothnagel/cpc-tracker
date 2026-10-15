"""Surgically classify a country's own taxonomies into its committed
classifications.json, WITHOUT re-running alignment, decomposition or synthesis.

For each country that ships `{country}-taxonomies.json` (see
src/country_taxonomies.py), classifies policy targets (and, where present, BTR
measure and BER budget pseudo-targets) against each of its taxonomies through
the pipeline's own `rank_classification` (cache namespace `rank_<taxonomyType>`),
then merges the records into classifications.json. Records of the country's
taxonomies and of the global lenses they replace are stripped first, so the
script is idempotent and leaves the file as a full run would write it.

A new taxonomy type is a new cache namespace: a cold run, one live call per item
and taxonomy, and every other lens stays warm.

    cd python
    .venv/bin/python scripts/classify_country_taxonomies.py --targets-file sri-lanka-targets.json

Run with the model and --language that produced the committed outputs (gpt-5.4 /
en). Then scripts/rerun_sector_synthesis_country.py writes the lenses' sector
cards. Appends a footprint-ledger row for the live calls.
"""

import argparse
import asyncio
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.classify import rank_classification  # noqa: E402
from src.config import DATA_DIR, LLM_MODEL, OUTPUT_DIR, all_targets_files  # noqa: E402
from src.country_taxonomies import load_country_taxonomies, replaced_lenses  # noqa: E402
from src.footprint import append_event, electricity_zone  # noqa: E402
from src.footprint.tracker import get_footprint_tracker  # noqa: E402
from src.llm import set_language  # noqa: E402


def stem_for(targets_file: str) -> str:
    """sri-lanka-targets.json -> sri-lanka (matches the output dir layout)."""
    return re.sub(r"-?targets\.json$", "", targets_file)


def _load(path: Path):
    return json.loads(path.read_text()) if path.exists() else None


def record_footprint(stem: str, run_id: str) -> None:
    """One ledger row for this script's live calls (docs/CARBON_METHODOLOGY.md)."""
    snap = get_footprint_tracker().snapshot()
    if not int(snap.get("call_count", 0) or 0):
        return
    append_event(
        component="dev_pipeline",
        provider="openai",
        model=LLM_MODEL,
        region=electricity_zone(),
        run_id=run_id,
        country=stem or None,
        call_count=int(snap.get("call_count", 0) or 0),
        cached_call_count=int(snap.get("cached_call_count", 0) or 0),
        energy_wh=float(snap.get("energy_wh", 0) or 0),
        water_ml=float(snap.get("water_ml", 0) or 0),
        co2_geq=float(snap.get("co2_geq", 0) or 0),
        minerals_ugsbeq=float(snap.get("minerals_ugsbeq", 0) or 0),
        source=snap.get("source", "unavailable"),
        energy_wh_min=snap.get("energy_wh_min"),
        energy_wh_max=snap.get("energy_wh_max"),
        water_ml_min=snap.get("water_ml_min"),
        water_ml_max=snap.get("water_ml_max"),
        co2_geq_min=snap.get("co2_geq_min"),
        co2_geq_max=snap.get("co2_geq_max"),
        minerals_ugsbeq_min=snap.get("minerals_ugsbeq_min"),
        minerals_ugsbeq_max=snap.get("minerals_ugsbeq_max"),
    )
    print(
        f"[{stem}] footprint ledger row: {snap.get('call_count')} calls "
        f"({snap.get('cached_call_count')} cached), {float(snap.get('co2_geq', 0) or 0):.1f} g CO2eq"
    )


async def classify_country(targets_file: str) -> None:
    stem = stem_for(targets_file)
    taxonomies = load_country_taxonomies(DATA_DIR / f"{stem}-taxonomies.json")
    if not taxonomies:
        print(f"[{stem}] no {stem}-taxonomies.json; skipping")
        return
    out_dir = OUTPUT_DIR / stem
    cls_path = out_dir / "classifications.json"
    if not cls_path.exists():
        print(f"[{stem}] no classifications.json at {cls_path}; skipping")
        return

    targets = _load(DATA_DIR / targets_file) or []
    measures = _load(out_dir / "measure_pseudo_targets.json") or []
    budget = _load(out_dir / "budget_pseudo_targets.json") or []
    items = targets + measures + budget

    new_records: list[dict] = []
    for tax in taxonomies:
        ttype = tax["taxonomyType"]
        print(
            f"[{stem}] {ttype}: {len(items)} items x {len(tax['categories'])} categories "
            f"(model={LLM_MODEL}, {len(items)} LLM calls)"
        )
        records = await rank_classification(items, tax["categories"], ttype)
        names = {c["id"]: c["name"] for c in tax["categories"]}
        primaries = Counter(r["categoryId"] for r in records if r["isPrimary"])
        for cid, name in names.items():
            print(f"    {primaries.get(cid, 0):4}  {name}")
        print(f"    {len(items) - sum(primaries.values()):4}  (no primary)")
        new_records += records

    dropped = {t["taxonomyType"] for t in taxonomies} | replaced_lenses(taxonomies)
    existing = json.loads(cls_path.read_text())
    kept = [c for c in existing if c.get("taxonomyType") not in dropped]
    merged = kept + new_records
    cls_path.write_text(json.dumps(merged, indent=2))
    print(
        f"[{stem}] dropped {len(existing) - len(kept)} records of {sorted(dropped)}, "
        f"added {len(new_records)}  (records {len(existing)} -> {len(merged)})"
    )
    record_footprint(stem, run_id="country-taxonomies:classify")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--targets-file",
        default=None,
        help="single country; default = every corpus that ships a taxonomies file",
    )
    parser.add_argument("--language", default="en", choices=["en", "es", "mn", "fr"])
    args = parser.parse_args()
    set_language(args.language)

    files = [args.targets_file] if args.targets_file else all_targets_files()
    for tf in files:
        await classify_country(tf)


if __name__ == "__main__":
    asyncio.run(main())
