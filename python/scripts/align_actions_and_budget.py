"""Run ONLY run_analysis's reported-action and budget steps for one country.

The two steps a country gains when it gets a Biennial Transparency Report
(BTR) or a Biodiversity Expenditure Review (BER) after its targets were
analysed: each reported action and budget line is classified against the
active taxonomies, then compared with every policy target. The target-to-target
analysis (classifications of the targets, alignment.json, syntheses) is left
untouched, so a country's coherence results do not move.

Mirrors run_analysis.py STEP 6 and STEP 7 call for call (same helpers, same
cache namespaces, same files written):
  - <output>/<country>/measure_pseudo_targets.json, measure_alignment.json
    (from <output>/<country>/btr_data.json and <data>/<country>-btr-adaptation.json)
  - <output>/<country>/budget_pseudo_targets.json, budget_alignment.json
    (from <data>/<country>-ber.json)
  - the actions' and budget lines' classifications, replacing any earlier rows
    for the same ids in <output>/<country>/classifications.json
  - the AI explanations in the agreed vocabulary (scripts/contract_wording.py)
  - one footprint ledger row for the live calls.

A smoke run (--limit-targets / --limit-items) writes into --out-dir only and
never touches the country's files.

Run from python/:
    CPC_CACHE_DIR=<main checkout>/python/output/.cache \\
    .venv/bin/python scripts/align_actions_and_budget.py --targets-file countryx-targets.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config  # noqa: E402
from src.config import CACHE_DIR, DATA_DIR, OUTPUT_DIR  # noqa: E402
from src.align import decompose_targets  # noqa: E402
from src.budget_align import (  # noqa: E402
    assess_budget_alignment,
    decompose_programs,
    generate_budget_pairs,
    programs_to_pseudo_targets,
)
from src.classify_globe import load_few_shot_examples  # noqa: E402
from src.country_taxonomies import load_country_taxonomies  # noqa: E402
from src.footprint import append_event, electricity_zone  # noqa: E402
from src.footprint.tracker import get_footprint_tracker  # noqa: E402
from src.llm import set_language  # noqa: E402
from src.measure_align import (  # noqa: E402
    assess_measure_alignment,
    decompose_measures,
    generate_cross_type_pairs,
    generate_measure_pairs,
    measures_to_pseudo_targets,
)
from src.run_analysis import (  # noqa: E402
    classify_active_taxonomies,
    derive_country_file,
    derive_country_slug,
    load_input_data,
)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from contract_wording import agreed_wording  # noqa: E402

logger = logging.getLogger("align_actions_and_budget")

# The order run_analysis appends classification rows in.
CLASSIFICATION_KEYS = ("nbs", "globe", "sector", "globe_sub", "gga", "hr", "country_taxonomies")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--targets-file", required=True, help="Targets JSON in DATA_DIR, e.g. countryx-targets.json")
    parser.add_argument("--language", default="en", choices=["en", "es", "mn", "fr"])
    parser.add_argument("--only", choices=["actions", "budget"], help="Run one of the two steps only")
    parser.add_argument("--limit-targets", type=int, help="Smoke run: the first N targets")
    parser.add_argument("--limit-items", type=int, help="Smoke run: the first N actions and N budget lines")
    parser.add_argument("--out-dir", type=Path, help="Write here instead (required for a smoke run)")
    parser.add_argument("--run-id", help="Footprint ledger run id (default: actions-and-budget:<country>)")
    return parser.parse_args()


def flat(classes: dict[str, list[dict]]) -> list[dict]:
    return [row for key in CLASSIFICATION_KEYS for row in classes.get(key, [])]


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2))
    logger.info(f"Saved {path}")


def in_agreed_wording(results: list[dict]) -> list[dict]:
    """The explanations in the agreed vocabulary ("possible conflict", never
    "tension", "friction" or "contradiction"; CLAUDE.md), rewritten without a
    model as the contracts bake does (scripts/contract_wording.py)."""
    for r in results:
        if isinstance(r.get("description"), str):
            r["description"] = agreed_wording(r["description"])
    return results


def record_footprint(country: str | None, run_id: str) -> None:
    """One ledger row for this run's live calls (docs/CARBON_METHODOLOGY.md)."""
    snap = get_footprint_tracker().snapshot()
    if not int(snap.get("call_count", 0) or 0):
        logger.info("No LLM calls recorded; no ledger row")
        return
    append_event(
        component="dev_pipeline",
        provider="openai",
        model=config.LLM_MODEL,
        region=electricity_zone(),
        run_id=run_id,
        country=country,
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
    logger.info(
        f"Footprint ledger row: {snap.get('call_count')} calls ({snap.get('cached_call_count')} cached), "
        f"{float(snap.get('co2_geq', 0) or 0):.1f} g CO2e"
    )


async def main() -> None:
    args = parse_args()
    smoke = args.limit_targets is not None or args.limit_items is not None
    if smoke and not args.out_dir:
        raise SystemExit("A smoke run needs --out-dir, so the country's files stay as they are.")
    set_language(args.language)

    country = derive_country_slug(args.targets_file)
    country_dir = OUTPUT_DIR / country if country else OUTPUT_DIR
    out_dir = args.out_dir or country_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Model {config.LLM_MODEL}; cache {CACHE_DIR}; writing to {out_dir}")

    targets, nbs, sectors, globe, globe_sub, gga, hr = load_input_data(args.targets_file)
    if args.limit_targets is not None:
        targets = targets[: args.limit_targets]
    limit = args.limit_items

    examples_path = DATA_DIR / derive_country_file(args.targets_file, "ber-globe-examples")
    few_shot = load_few_shot_examples(str(examples_path)) if examples_path.exists() else []
    config_path = DATA_DIR / derive_country_file(args.targets_file, "country-config")
    doc_type_labels: dict[str, str] | None = None
    if config_path.exists():
        doc_type_labels = {dt["id"]: dt["mediumLabel"] for dt in json.loads(config_path.read_text()).get("documentTypes", [])}
    country_taxonomies = load_country_taxonomies(DATA_DIR / derive_country_file(args.targets_file, "taxonomies"))
    taxonomies = dict(
        nbs_categories=nbs,
        sectors=sectors,
        globe_categories=globe,
        globe_subcategories=globe_sub,
        globe_few_shot_examples=few_shot,
        gga_categories=gga,
        hr_categories=hr,
        country_taxonomies=country_taxonomies,
    )

    decompositions = await decompose_targets(targets)
    new_classifications: list[dict] = []

    # STEP 6: reported actions (mitigation and adaptation) against the targets.
    btr_path = country_dir / "btr_data.json"
    if args.only != "budget" and btr_path.exists():
        btr = json.loads(btr_path.read_text())
        raw_measures = btr.get("mitigationMeasures", [])
        mit = measures_to_pseudo_targets(raw_measures, action_type="mitigation")
        adp_path = DATA_DIR / derive_country_file(args.targets_file, "btr-adaptation")
        adp = (
            measures_to_pseudo_targets(json.loads(adp_path.read_text()).get("actions", []), action_type="adaptation")
            if adp_path.exists()
            else []
        )
        if limit is not None:
            mit, adp = mit[:limit], adp[:limit]
        pseudo = mit + adp
        logger.info(f"{len(mit)} mitigation + {len(adp)} adaptation actions")

        classes = await classify_active_taxonomies(pseudo, **taxonomies, cache_suffix="btr")
        new_classifications += flat(classes)
        # Primary sector onto each action (run_analysis's write-back); the
        # report's own sectors on btr_data.json stay where they exist.
        sector_by_id = {c["targetId"]: c["categoryId"] for c in classes["sector"] if c.get("isPrimary")}
        for pt in pseudo:
            pt["sector"] = sector_by_id.get(pt["id"], "")
        if not smoke:
            label_to_sector = {pt["sourceLabel"]: pt["sector"] for pt in pseudo if pt.get("actionType") == "mitigation" and pt["sector"]}
            for m in raw_measures:
                if (m.get("sector") or "").strip():
                    continue
                name = (m.get("name") or "").strip()
                label = name if len(name) <= 60 else name[:57] + "..."
                if label in label_to_sector:
                    m["sector"] = label_to_sector[label]
            btr_path.write_text(json.dumps(btr, indent=2, ensure_ascii=False) + "\n")

        pairs = generate_measure_pairs(targets, pseudo)
        if mit and adp:
            pairs += generate_cross_type_pairs(pseudo)
        measure_decomps = await decompose_measures(pseudo)
        results = await assess_measure_alignment(pairs, {**decompositions, **measure_decomps}, doc_type_labels)
        write_json(out_dir / "measure_alignment.json", in_agreed_wording(results))
        write_json(out_dir / "measure_pseudo_targets.json", pseudo)

    # STEP 7: budget lines of the expenditure review against the targets.
    ber_path = DATA_DIR / derive_country_file(args.targets_file, "ber")
    if args.only != "actions" and ber_path.exists():
        ber = json.loads(ber_path.read_text())
        pseudo = programs_to_pseudo_targets(
            ber.get("programs", []),
            ber.get("expenditure", []),
            currency=ber.get("currency", ""),
            unit=ber.get("unit", ""),
            period=ber.get("period"),
        )
        if limit is not None:
            pseudo = pseudo[:limit]
        logger.info(f"{len(pseudo)} budget lines")

        classes = await classify_active_taxonomies(pseudo, **taxonomies, cache_suffix="ber")
        new_classifications += flat(classes)
        pairs = generate_budget_pairs(targets, pseudo)
        program_decomps = await decompose_programs(pseudo)
        results = await assess_budget_alignment(pairs, {**decompositions, **program_decomps}, doc_type_labels)
        write_json(out_dir / "budget_alignment.json", in_agreed_wording(results))
        write_json(out_dir / "budget_pseudo_targets.json", pseudo)

    # The new rows replace any earlier ones for the same actions and lines.
    ids = {row["targetId"] for row in new_classifications}
    if smoke:
        write_json(out_dir / "classifications.layers.json", new_classifications)
    elif ids:
        path = country_dir / "classifications.json"
        kept = [row for row in json.loads(path.read_text()) if row["targetId"] not in ids]
        write_json(path, kept + new_classifications)
        logger.info(f"classifications.json: {len(kept)} kept, {len(new_classifications)} for {len(ids)} actions and lines")

    record_footprint(country, args.run_id or f"actions-and-budget:{country}{':smoke' if smoke else ''}")


if __name__ == "__main__":
    asyncio.run(main())
