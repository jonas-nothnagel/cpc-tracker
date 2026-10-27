"""Run ONLY run_analysis's reported-action and budget steps for one country.

The two steps a country gains when it gets a Biennial Transparency Report
(BTR) or a Biodiversity Expenditure Review (BER) after its targets were
analysed: each reported action and budget line is classified against the
active taxonomies, then compared with every policy target. The target-to-target
analysis (classifications of the targets, alignment.json, syntheses) is left
untouched, so a country's coherence results do not move.

Mirrors run_analysis.py STEP 6 and STEP 7 call for call (same helpers, same
cache namespaces, same files written), plus the one target step the
adaptation file brings (run_analysis STEP 2: the policy targets classified
against its adaptation goals):
  - <output>/<country>/measure_pseudo_targets.json, measure_alignment.json
    (from <output>/<country>/btr_data.json and <data>/<country>-btr-adaptation.json)
  - <output>/<country>/budget_pseudo_targets.json, budget_alignment.json and
    budget_alignment.meta.json (from <data>/<country>-ber.json): for a review
    rebuilt from its workbook (`record`), every line with reviewed spending,
    read without amounts, the meta marking the basis "ber-record"; the
    earlier per-language overlays of budget_alignment.json are removed
  - the actions' and budget lines' classifications, replacing any earlier rows
    for the same ids in <output>/<country>/classifications.json, and the
    targets' adaptation-goal classifications, replacing the earlier ones (a
    record's lines take their areas from scripts/place_ber_lines.py instead)
  - the AI explanations in the agreed vocabulary (scripts/contract_wording.py)
  - one footprint ledger row for the live calls.
Each target is read from the decomposition its coherence results were built
from (<output>/<country>/decompositions.json), decomposed only where the file
has none.
<output>/<country> is the model's own directory with --model, as in run_analysis.

A smoke run (--limit-targets / --limit-items) writes into --out-dir only and
never touches the country's files; so does a full run given --out-dir.

Run from python/:
    CPC_CACHE_DIR=<main checkout>/python/output/.cache \\
    .venv/bin/python scripts/align_actions_and_budget.py --targets-file countryx-targets.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.align import decompose_targets  # noqa: E402
from src.budget_align import (  # noqa: E402
    assess_budget_alignment,
    budget_items,
    budget_meta,
    decompose_programs,
    drop_stale_translations,
    generate_budget_pairs,
)
from src.classify import rank_classification  # noqa: E402
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
    derive_output_dir,
    load_input_data,
)

from src import config  # noqa: E402
from src.config import CACHE_DIR, DATA_DIR, OUTPUT_DIR  # noqa: E402

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
    parser.add_argument("--model", help="As run_analysis --model: the model and its output dir")
    return parser.parse_args()


def use_model(model: str | None) -> None:
    """run_analysis's --model: the live config and the env both carry it."""
    if model:
        config.LLM_MODEL = model
        os.environ["LLM_MODEL"] = model


def flat(classes: dict[str, list[dict]]) -> list[dict]:
    return [row for key in CLASSIFICATION_KEYS for row in classes.get(key, [])]


async def classify_adaptation_goals(targets: list[dict], adaptation_path: Path) -> list[dict]:
    """run_analysis STEP 2's classification of the policy targets against the
    adaptation goals of `<country>-btr-adaptation.json` (taxonomyType
    adaptation_goal), with the same deterministic `name` it builds from each
    goal's verbatim description. [] without the file or its goals."""
    if not adaptation_path.exists():
        return []
    goals = json.loads(adaptation_path.read_text()).get("adaptationGoals", [])
    if not goals:
        return []
    goals_for_classification = [
        {
            "id": str(g["id"]),
            "name": (
                g["description"][:80].rstrip(",.") + "…"
                if len(g["description"]) > 80
                else g["description"]
            ),
            "description": g["description"],
        }
        for g in goals
    ]
    rows = await rank_classification(targets, goals_for_classification, "adaptation_goal")
    logger.info(f"Classified {len(targets)} policy targets against {len(goals)} adaptation goals")
    return rows


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2))
    logger.info(f"Saved {path}")


async def target_decompositions(targets: list[dict], country_dir: Path) -> tuple[dict[str, str], int]:
    """The decompositions the country's coherence results were built from
    (<country_dir>/decompositions.json), so a target reads the same in every
    comparison; a target the file lacks is decomposed (cached like every
    call). Returns them and how many came from the file."""
    path = country_dir / "decompositions.json"
    stored = json.loads(path.read_text()) if path.exists() else {}
    missing = [t for t in targets if t["id"] not in stored]
    fresh = await decompose_targets(missing) if missing else {}
    kept = {t["id"]: stored[t["id"]] for t in targets if t["id"] in stored}
    logger.info(f"Target decompositions: {len(kept)} from {path}, {len(fresh)} decomposed")
    return {**kept, **fresh}, len(kept)


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
    use_model(args.model)

    country = derive_country_slug(args.targets_file)
    country_dir = derive_output_dir(args.targets_file, OUTPUT_DIR, args.model)
    if not smoke and not (country_dir / "classifications.json").exists():
        # Before any call: a country whose outputs sit in model directories
        # (python/output/<country>/<model>/) needs --model.
        raise SystemExit(
            f"No classifications.json in {country_dir}: run run_analysis first, or pass --model."
        )
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

    decompositions, from_file = await target_decompositions(targets, country_dir)
    new_classifications: list[dict] = []
    goal_classifications: list[dict] = []

    # STEP 6: reported actions (mitigation and adaptation) against the targets.
    adp_path = DATA_DIR / derive_country_file(args.targets_file, "btr-adaptation")
    if args.only != "budget":
        # run_analysis STEP 2 classifies the targets against the adaptation
        # goals whenever the adaptation file exists.
        goal_classifications = await classify_adaptation_goals(targets, adp_path)
    btr_path = country_dir / "btr_data.json"
    if not btr_path.exists() and args.model:
        # A model directory reads the country's shared copy, as run_analysis seeds it.
        btr_path = country_dir.parent / "btr_data.json"
    if args.only != "budget" and btr_path.exists():
        btr = json.loads(btr_path.read_text())
        raw_measures = btr.get("mitigationMeasures", [])
        mit = measures_to_pseudo_targets(raw_measures, action_type="mitigation")
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
            btr_out = out_dir / "btr_data.json"
            btr_out.write_text(json.dumps(btr, indent=2, ensure_ascii=False) + "\n")

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
        pseudo, basis = budget_items(country, json.loads(ber_path.read_text()))
        if limit is not None:
            pseudo = pseudo[:limit]
        logger.info(f"{len(pseudo)} budget lines ({'the review record' if basis else 'programmes'})")

        if basis != "ber-record":
            # A record's lines take their areas from step 2 of the BER plan
            # (scripts/place_ber_lines.py: two models, then a person's check).
            classes = await classify_active_taxonomies(pseudo, **taxonomies, cache_suffix="ber")
            new_classifications += flat(classes)
        pairs = generate_budget_pairs(targets, pseudo)
        program_decomps = await decompose_programs(pseudo)
        results = await assess_budget_alignment(pairs, {**decompositions, **program_decomps}, doc_type_labels)
        write_json(out_dir / "budget_alignment.json", in_agreed_wording(results))
        write_json(out_dir / "budget_pseudo_targets.json", pseudo)
        meta = budget_meta(basis, config.LLM_MODEL, len(pseudo), len(targets), len(pairs))
        meta["targetDecompositions"] = f"{from_file} of {len(targets)} from decompositions.json"
        blank = [t["id"] for t in targets if not str(t.get("text") or "").strip()]
        if blank:
            meta["targetsWithoutText"] = blank
        write_json(out_dir / "budget_alignment.meta.json", meta)
        if not smoke:
            drop_stale_translations(out_dir / "budget_alignment.json")

    # The new rows replace any earlier ones for the same actions and lines,
    # and new adaptation-goal rows replace the targets' earlier ones.
    ids = {row["targetId"] for row in new_classifications}
    fresh = new_classifications + goal_classifications
    if smoke:
        write_json(out_dir / "classifications.layers.json", fresh)
    elif fresh:
        replaced_goals = bool(goal_classifications)
        kept = [
            row
            for row in json.loads((country_dir / "classifications.json").read_text())
            if row["targetId"] not in ids
            and not (replaced_goals and row.get("taxonomyType") == "adaptation_goal")
        ]
        write_json(out_dir / "classifications.json", kept + fresh)
        logger.info(
            f"classifications.json: {len(kept)} kept, {len(new_classifications)} for {len(ids)} "
            f"actions and lines, {len(goal_classifications)} adaptation-goal rows"
        )

    record_footprint(country, args.run_id or f"actions-and-budget:{country}{':smoke' if smoke else ''}")


if __name__ == "__main__":
    asyncio.run(main())
