"""
Main orchestrator: runs the full analysis pipeline.

Usage:
    cd python
    uv run python -m src.run_analysis

Or with plain Python:
    cd python
    python -m src.run_analysis

Steps:
    1. Quantitative flag detection
    2. Run thematic classification (NBS + sectors + GLOBE)
    3. Generate all cross-document pairs
    4. Decompose targets (Agent 1)
    5. Assess alignment (Agent 2)
    6. BTR measure alignment (if available)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from .config import DATA_DIR, LLM_MODEL, OUTPUT_DIR
from .classify import rank_classification
from .classify_globe import (
    classify_globe_subcategories,
    derive_globe_top_level_classifications,
    load_few_shot_examples,
)
from .align import decompose_targets, generate_pairs, assess_alignment
from .llm import estimate_footprint_from_counts, get_footprint_tracker
from .quantitative import assess_quantitative_flags
from .measure_align import (
    measures_to_pseudo_targets,
    generate_measure_pairs,
    generate_cross_type_pairs,
    decompose_measures,
    assess_measure_alignment,
)
from .budget_align import (
    programs_to_pseudo_targets,
    generate_budget_pairs,
    decompose_programs,
    assess_budget_alignment,
)
from .synthesize_doc_pairs import synthesize_doc_pairs
from .synthesize_corpus import synthesize_corpus
from .synthesize_by_sector import synthesize_by_sector

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

TOTAL_STEPS = 8


def write_status(
    step: int,
    label: str,
    message: str,
    *,
    status: str = "running",
    started_at: str | None = None,
    error: str | None = None,
    summary: dict | None = None,
) -> None:
    """Write a status.json file to OUTPUT_DIR for progress tracking."""
    payload = {
        "status": status,
        "step": step,
        "totalSteps": TOTAL_STEPS,
        "currentStep": label,
        "message": message,
        "startedAt": started_at or datetime.now(timezone.utc).isoformat(),
        "completedAt": datetime.now(timezone.utc).isoformat() if status in ("completed", "failed") else None,
        "error": error,
        "summary": summary,
        "footprint": get_footprint_tracker().snapshot(),
    }
    (OUTPUT_DIR / "status.json").write_text(json.dumps(payload, indent=2))


def load_input_data(targets_file: str = "mongolia-targets.json") -> tuple[list, list, list, list, list]:
    """Load targets and categories from JSON files."""
    targets = json.loads((DATA_DIR / targets_file).read_text())
    cats = json.loads((DATA_DIR / "categories.json").read_text())
    nbs = cats["nbs_categories"]
    sectors = cats["ipcc_sectors"]
    globe = cats.get("globe_categories", [])
    globe_sub = cats.get("globe_subcategories", [])
    logger.info(
        f"Loaded {len(targets)} targets, "
        f"{len(nbs)} NBS + {len(sectors)} IPCC sectors + "
        f"{len(globe)} GLOBE categories ({len(globe_sub)} subcategories)"
    )
    return targets, nbs, sectors, globe, globe_sub


def derive_country_file(targets_file: str, suffix: str) -> str:
    """Derive a country-specific data filename from the targets filename.

    mongolia-targets.json → mongolia-btr-adaptation.json (suffix "btr-adaptation")
    targets.json         → btr-adaptation.json (upload wizard path, no prefix)
    """
    stem = targets_file[:-5] if targets_file.endswith(".json") else targets_file
    prefix = re.sub(r"-?targets$", "", stem)
    return f"{prefix}-{suffix}.json" if prefix else f"{suffix}.json"


def derive_output_dir(targets_file: str, base_output_dir: Path) -> Path:
    """Derive the per-country output dir from the targets filename.

    mongolia-targets.json → <base>/mongolia/
    panama-targets.json   → <base>/panama/
    targets.json          → <base>/                 (no prefix, flat fallback)

    When CPC_OUTPUT_DIR env var is set (upload flow via /api/analyze), we skip
    this derivation entirely and honor the env var path as-is, because uploads
    write to python/analyses/{id}/output/ which is already a per-analysis dir.

    .cache/ is managed separately by python/src/config.py and stays shared
    across countries at python/output/.cache/. We never touch it from here.
    """
    if os.getenv("CPC_OUTPUT_DIR"):
        # Upload flow: env var already points at the correct per-analysis path.
        return base_output_dir
    stem = targets_file[:-5] if targets_file.endswith(".json") else targets_file
    country_stem = re.sub(r"-?targets$", "", stem)
    return base_output_dir / country_stem if country_stem else base_output_dir


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run CPC analysis pipeline")
    parser.add_argument(
        "--targets-file",
        default="mongolia-targets.json",
        help="Name of the targets JSON file in DATA_DIR (default: mongolia-targets.json)",
    )
    return parser.parse_args()


async def main() -> None:
    global OUTPUT_DIR
    args = parse_args()
    # Derive the per-country output dir from the targets filename so multiple
    # countries can coexist under python/output/{country}/. Upload flow is
    # unaffected: when CPC_OUTPUT_DIR is set, derivation is skipped.
    OUTPUT_DIR = derive_output_dir(args.targets_file, OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    start = time.time()
    started_at = datetime.now(timezone.utc).isoformat()
    logger.info(f"Starting analysis pipeline (model: {LLM_MODEL})")
    logger.info(f"Output dir: {OUTPUT_DIR}")
    logger.info("=" * 60)

    # Seed tracker with any pre-analysis footprint (e.g. from document
    # extraction runs in the upload wizard) so the final dashboard total
    # reflects the full upload → analysis journey.
    initial_fp_path = DATA_DIR / "initial_footprint.json"
    if initial_fp_path.exists():
        try:
            initial_fp = json.loads(initial_fp_path.read_text())
            get_footprint_tracker().seed(initial_fp)
            logger.info(
                f"Seeded footprint from extraction: "
                f"{initial_fp.get('energy_wh', 0):.4f} Wh, "
                f"{initial_fp.get('co2_geq', 0):.4f} gCO2eq "
                f"({initial_fp.get('call_count', 0)} calls)"
            )
        except Exception as e:
            logger.warning(f"Could not seed initial footprint: {e}")

    try:
        # 1. Load data
        targets, nbs_categories, sectors, globe_categories, globe_subcategories = load_input_data(args.targets_file)

        # Load country-specific GLOBE few-shot examples if available.
        # Mongolia ships `mongolia-ber-globe-examples.json` with 138 expert-curated
        # mappings from the BER Excel sheet 5. Other countries can drop their own
        # equivalent file in the same pattern to enable subcategory classification.
        globe_examples_filename = derive_country_file(args.targets_file, "ber-globe-examples")
        globe_examples_path = DATA_DIR / globe_examples_filename
        globe_few_shot_examples: list[dict] = []
        if globe_examples_path.exists():
            globe_few_shot_examples = load_few_shot_examples(str(globe_examples_path))
            logger.info(
                f"Loaded {len(globe_few_shot_examples)} GLOBE few-shot examples "
                f"from {globe_examples_filename}"
            )

        # Load country config for data-driven doc-type labels (e.g. NP →
        # "NP (Nature Pledge)") so the alignment LLM sees human-readable
        # document names instead of raw codes.
        config_filename = derive_country_file(args.targets_file, "country-config")
        config_path = DATA_DIR / config_filename
        doc_type_labels: dict[str, str] | None = None
        if config_path.exists():
            country_config = json.loads(config_path.read_text())
            doc_type_labels = {
                dt["id"]: dt["mediumLabel"]
                for dt in country_config.get("documentTypes", [])
            }
            logger.info(
                f"Loaded doc-type labels from {config_filename}: "
                f"{list(doc_type_labels.values())}"
            )

        # Load the country's hand-curated BTR adaptation file once if present.
        # Filename is derived from the targets file so a second country only
        # needs to drop `{prefix}-btr-adaptation.json` alongside their targets.
        adaptation_filename = derive_country_file(args.targets_file, "btr-adaptation")
        adaptation_path = DATA_DIR / adaptation_filename
        adp_data: dict | None = None
        if adaptation_path.exists():
            adp_data = json.loads(adaptation_path.read_text())
            logger.info(
                f"Loaded adaptation file {adaptation_filename}: "
                f"{len(adp_data.get('actions', []))} actions, "
                f"{len(adp_data.get('adaptationGoals', []))} goals"
            )

        # 2. Quantitative and time-bound detection
        write_status(1, "Quantitative detection", f"Analysing {len(targets)} targets for quantitative and time-bound phrases", started_at=started_at)
        logger.info("STEP 1: Quantitative and time-bound detection")
        logger.info("-" * 40)
        quant_flags = await assess_quantitative_flags(targets)
        quant_path = OUTPUT_DIR / "quantitative_flags.json"
        quant_path.write_text(json.dumps(quant_flags, indent=2))
        q_count = sum(1 for q in quant_flags if q.get("isQuantitative"))
        t_count = sum(1 for q in quant_flags if q.get("isTimeBound"))
        logger.info(f"Saved quantitative flags: {q_count} quantitative, {t_count} time-bound")

        # 3. Thematic classification (NBS + IPCC sectors)
        write_status(2, "Thematic classification", f"Classifying {len(targets)} targets against NBS categories, IPCC sectors, and GLOBE biodiversity categories", started_at=started_at)
        logger.info("")
        logger.info("STEP 2: Thematic classification")
        logger.info("-" * 40)

        # Ranked classification: one LLM call per target returns scored
        # categories. The top-ranked entry per (target, taxonomy) becomes the
        # primary (single-label); lower-scored entries above the relevance
        # threshold are also kept as multi-label data.
        nbs_classifications = await rank_classification(targets, nbs_categories, "nbs")
        sector_classifications = await rank_classification(targets, sectors, "sector")

        # GLOBE: prefer the fine-grained subcategory classifier (calibrated
        # on BIOFIN expert examples) when available. Top-level `globe`
        # records are derived from the subcategory output so the same
        # primary assignment flows through every visualization. When no
        # few-shot examples exist (e.g. Panama today), fall back to the
        # generic ranked classifier on the 9 top-level categories.
        globe_sub_classifications: list[dict] = []
        if globe_subcategories and globe_few_shot_examples:
            globe_sub_classifications = await classify_globe_subcategories(
                targets,
                globe_subcategories,
                globe_categories,
                globe_few_shot_examples,
                cache_suffix="targets",
            )
            globe_classifications = derive_globe_top_level_classifications(
                globe_sub_classifications,
                globe_subcategories,
                globe_categories,
            )
        else:
            globe_classifications = await rank_classification(
                targets, globe_categories, "globe"
            )

        all_classifications = (
            nbs_classifications
            + sector_classifications
            + globe_classifications
            + globe_sub_classifications
        )

        # Country-specific adaptation-goal classification (e.g. Mongolia APNDC).
        # When a `{country}-btr-adaptation.json` file is loaded, classify policy
        # targets against its goals so the Reporting & Implementation Coverage
        # view can show per-goal policy commitment vs reported action imbalances.
        if adp_data:
            adp_goals = adp_data.get("adaptationGoals", [])
            if adp_goals:
                # `rank_classification` expects {id, name, description}. The
                # data file only carries verbatim {id, description} (no
                # authoritative short label exists in BTR1 or APNDC), so
                # synthesise a `name` by deterministic-truncating the first
                # ~80 chars of the description. Every character traces back
                # to verbatim BTR text -- not a paraphrase.
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
                    for g in adp_goals
                ]
                adp_goal_classifications = await rank_classification(
                    targets, goals_for_classification, "adaptation_goal"
                )
                all_classifications = all_classifications + adp_goal_classifications
                logger.info(
                    f"Classified {len(targets)} policy targets against "
                    f"{len(adp_goals)} adaptation goals"
                )

        # Save classifications
        out_path = OUTPUT_DIR / "classifications.json"
        out_path.write_text(json.dumps(all_classifications, indent=2))
        logger.info(f"Saved {len(all_classifications)} classifications to {out_path}")

        # 4. Generate cross-document pairs
        write_status(3, "Generating pairs", "Generating all cross-document target pairs", started_at=started_at)
        logger.info("")
        logger.info("STEP 3: Generate cross-document pairs")
        logger.info("-" * 40)

        pairs = generate_pairs(targets)
        logger.info(f"Total cross-document pairs to assess: {len(pairs)}")

        if not pairs:
            logger.warning("No pairs generated! Check input data — need targets from at least 2 document types.")
            write_status(3, "Generating pairs", "No pairs generated — need targets from at least 2 document types", status="failed", started_at=started_at, error="No cross-document pairs found")
            return

        # 5. Decompose targets
        write_status(4, "Target decomposition", f"Decomposing {len(targets)} targets with Agent 1", started_at=started_at)
        logger.info("")
        logger.info("STEP 4: Decompose targets (Agent 1)")
        logger.info("-" * 40)

        decompositions = await decompose_targets(targets)

        # Save decompositions
        out_path = OUTPUT_DIR / "decompositions.json"
        out_path.write_text(json.dumps(decompositions, indent=2))
        logger.info(f"Saved {len(decompositions)} decompositions to {out_path}")

        # 6. Assess alignment
        write_status(5, "Alignment assessment", f"Assessing alignment for {len(pairs)} target pairs with Agent 2", started_at=started_at)
        logger.info("")
        logger.info("STEP 5: Assess alignment (Agent 2)")
        logger.info("-" * 40)

        alignment_results = await assess_alignment(pairs, decompositions, doc_type_labels)

        # Save alignment results
        out_path = OUTPUT_DIR / "alignment.json"
        out_path.write_text(json.dumps(alignment_results, indent=2))
        logger.info(f"Saved {len(alignment_results)} alignment results to {out_path}")

        # 7. Target-to-Measure alignment (if BTR data exists)
        btr_path = OUTPUT_DIR / "btr_data.json"
        measure_alignment_results: list[dict] = []
        measure_pseudo_targets: list[dict] = []
        if btr_path.exists():
            write_status(6, "Measure alignment", "Assessing alignment between targets and BTR measures", started_at=started_at)
            logger.info("")
            logger.info("STEP 6: Target-to-Measure alignment")
            logger.info("-" * 40)

            btr = json.loads(btr_path.read_text())
            raw_measures = btr.get("mitigationMeasures", [])
            mit_pseudo_targets = measures_to_pseudo_targets(raw_measures, action_type="mitigation")
            logger.info(f"  {len(raw_measures)} raw mitigation measures → {len(mit_pseudo_targets)} valid pseudo-targets")

            # Reuse the hand-curated BTR adaptation file loaded at the top of
            # main(). File is optional so runs without adaptation data stay
            # unaffected.
            adp_pseudo_targets: list[dict] = []
            if adp_data:
                raw_adaptation = adp_data.get("actions", [])
                adp_pseudo_targets = measures_to_pseudo_targets(
                    raw_adaptation, action_type="adaptation"
                )
                logger.info(
                    f"  {len(raw_adaptation)} raw adaptation actions → "
                    f"{len(adp_pseudo_targets)} valid pseudo-targets "
                    f"(source: {adp_data.get('sourceRef', {}).get('table', 'unknown')})"
                )

            measure_pseudo_targets = mit_pseudo_targets + adp_pseudo_targets

            if measure_pseudo_targets:
                # Ranked classification of BTR actions against NBS and IPCC
                # sectors. GLOBE follows the same primary-from-subcategory
                # rule used for policy targets.
                btr_nbs = await rank_classification(measure_pseudo_targets, nbs_categories, "nbs")
                btr_sectors = await rank_classification(measure_pseudo_targets, sectors, "sector")

                btr_globe_sub: list[dict] = []
                if globe_subcategories and globe_few_shot_examples:
                    btr_globe_sub = await classify_globe_subcategories(
                        measure_pseudo_targets,
                        globe_subcategories,
                        globe_categories,
                        globe_few_shot_examples,
                        cache_suffix="btr",
                    )
                    btr_globe = derive_globe_top_level_classifications(
                        btr_globe_sub,
                        globe_subcategories,
                        globe_categories,
                    )
                else:
                    btr_globe = await rank_classification(
                        measure_pseudo_targets, globe_categories, "globe"
                    )

                all_classifications.extend(
                    btr_nbs + btr_globe + btr_sectors + btr_globe_sub
                )

                # Write back the primary sector onto pseudo-targets and
                # btr_data.json so the implementation-coverage view can group
                # by IPCC sector. Each measure now has exactly one primary
                # sector (no first-match-wins arbitrariness).
                sector_by_id: dict[str, str] = {}
                for c in btr_sectors:
                    if c.get("isPrimary"):
                        sector_by_id[c["targetId"]] = c["categoryId"]

                for pt in measure_pseudo_targets:
                    # Pseudo-target sector is internal pipeline metadata, kept
                    # as the LLM primary so downstream measure-alignment uses
                    # the canonical id.
                    pt["sector"] = sector_by_id.get(pt["id"], "")

                # Fill `m.sector` on btr_data.json mitigation measures from the
                # LLM only when the measure has no existing sector. Existing
                # values come either from a hand-curated initial commit
                # (Mongolia) or from the BTR document's own sector column
                # canonicalised at ingestion (Panama). Preserving them keeps
                # the "Reporting Gaps" callout stable across pipeline re-runs.
                label_to_sector: dict[str, str] = {}
                for pt in measure_pseudo_targets:
                    if pt.get("actionType") == "mitigation" and pt["sector"]:
                        label_to_sector[pt["sourceLabel"]] = pt["sector"]

                filled = 0
                preserved = 0
                for m in raw_measures:
                    if (m.get("sector") or "").strip():
                        preserved += 1
                        continue
                    name = (m.get("name") or "").strip()
                    label = name if len(name) <= 60 else name[:57] + "..."
                    if label in label_to_sector:
                        m["sector"] = label_to_sector[label]
                        filled += 1

                btr_path.write_text(json.dumps(btr, indent=2, ensure_ascii=False))
                logger.info(
                    f"BTR sector write-back: filled {filled} missing, preserved {preserved} existing"
                )

                # Re-save classifications with BTR entries included
                out_path = OUTPUT_DIR / "classifications.json"
                out_path.write_text(json.dumps(all_classifications, indent=2))
                logger.info(
                    f"Updated classifications with BTR entries "
                    f"({len(btr_nbs)} NBS + {len(btr_globe)} GLOBE + "
                    f"{len(btr_sectors)} sectors + {len(btr_globe_sub)} GLOBE subcategories)"
                )

                # Policy target × BTR action pairs (both mitigation and adaptation).
                m_pairs = generate_measure_pairs(targets, measure_pseudo_targets)

                # BTR mitigation × BTR adaptation cross-type pairs. These surface the
                # "reported mitigation vs reported adaptation" tensions that no existing
                # pairing catches (e.g. reduce livestock vs build fodder irrigation).
                if mit_pseudo_targets and adp_pseudo_targets:
                    cross_pairs = generate_cross_type_pairs(measure_pseudo_targets)
                    m_pairs = m_pairs + cross_pairs

                if m_pairs:
                    measure_decomps = await decompose_measures(measure_pseudo_targets)
                    all_decomps = {**decompositions, **measure_decomps}
                    measure_alignment_results = await assess_measure_alignment(m_pairs, all_decomps, doc_type_labels)

                    out_path = OUTPUT_DIR / "measure_alignment.json"
                    out_path.write_text(json.dumps(measure_alignment_results, indent=2))
                    logger.info(f"Saved {len(measure_alignment_results)} measure alignment results")

                    out_path = OUTPUT_DIR / "measure_pseudo_targets.json"
                    out_path.write_text(json.dumps(measure_pseudo_targets, indent=2))
                    logger.info(f"Saved {len(measure_pseudo_targets)} pseudo-targets")
        else:
            logger.info("")
            logger.info("STEP 6: Skipped (no btr_data.json)")

        # 8. Budget-to-Target alignment (if BER data exists)
        ber_filename = derive_country_file(args.targets_file, "ber")
        ber_path = DATA_DIR / ber_filename
        budget_alignment_results: list[dict] = []
        budget_pseudo_targets: list[dict] = []
        if ber_path.exists():
            write_status(7, "Budget alignment", "Assessing alignment between targets and budget programs", started_at=started_at)
            logger.info("")
            logger.info("STEP 7: Budget-to-Target alignment")
            logger.info("-" * 40)

            ber = json.loads(ber_path.read_text())
            raw_programs = ber.get("programs", [])
            raw_expenditure = ber.get("expenditure", [])
            budget_pseudo_targets = programs_to_pseudo_targets(
                raw_programs, raw_expenditure,
                currency=ber.get("currency", ""),
                unit=ber.get("unit", ""),
                period=ber.get("period"),
            )
            logger.info(f"  {len(raw_programs)} raw programs -> {len(budget_pseudo_targets)} valid pseudo-targets")

            if budget_pseudo_targets:
                # Ranked classification of BER programs against NBS and IPCC
                # sectors. GLOBE follows the same primary-from-subcategory
                # rule used elsewhere.
                ber_nbs = await rank_classification(budget_pseudo_targets, nbs_categories, "nbs")
                ber_sectors = await rank_classification(budget_pseudo_targets, sectors, "sector")

                ber_globe_sub: list[dict] = []
                if globe_subcategories and globe_few_shot_examples:
                    ber_globe_sub = await classify_globe_subcategories(
                        budget_pseudo_targets,
                        globe_subcategories,
                        globe_categories,
                        globe_few_shot_examples,
                        cache_suffix="ber",
                    )
                    ber_globe = derive_globe_top_level_classifications(
                        ber_globe_sub,
                        globe_subcategories,
                        globe_categories,
                    )
                else:
                    ber_globe = await rank_classification(
                        budget_pseudo_targets, globe_categories, "globe"
                    )

                all_classifications.extend(
                    ber_nbs + ber_globe + ber_sectors + ber_globe_sub
                )

                # Re-save classifications with BER entries included
                out_path = OUTPUT_DIR / "classifications.json"
                out_path.write_text(json.dumps(all_classifications, indent=2))
                logger.info(
                    f"Updated classifications with BER entries "
                    f"({len(ber_nbs)} NBS + {len(ber_globe)} GLOBE + "
                    f"{len(ber_sectors)} sectors + "
                    f"{len(ber_globe_sub)} GLOBE subcategories)"
                )

                b_pairs = generate_budget_pairs(targets, budget_pseudo_targets)

                if b_pairs:
                    budget_decomps = await decompose_programs(budget_pseudo_targets)
                    all_decomps_budget = {**decompositions, **budget_decomps}
                    budget_alignment_results = await assess_budget_alignment(
                        b_pairs, all_decomps_budget, doc_type_labels
                    )

                    out_path = OUTPUT_DIR / "budget_alignment.json"
                    out_path.write_text(json.dumps(budget_alignment_results, indent=2))
                    logger.info(f"Saved {len(budget_alignment_results)} budget alignment results")

                    out_path = OUTPUT_DIR / "budget_pseudo_targets.json"
                    out_path.write_text(json.dumps(budget_pseudo_targets, indent=2))
                    logger.info(f"Saved {len(budget_pseudo_targets)} budget pseudo-targets")
        else:
            logger.info("")
            logger.info("STEP 7: Skipped (no BER data)")

        # 9. Synthesis layer — doc-pair, corpus, and per-sector storylines.
        # Reads existing alignment.json + classifications.json (no re-compute);
        # writes three new artifacts the findings-home frontend consumes. All
        # three steps are country-agnostic and taxonomy-agnostic.
        write_status(8, "Synthesis", "Generating doc-pair, corpus, and sector storylines", started_at=started_at)
        logger.info("")
        logger.info("STEP 8: Synthesis (doc-pair, corpus, sector)")
        logger.info("-" * 40)

        doc_pair_records = await synthesize_doc_pairs(
            targets, alignment_results, doc_type_labels,
        )
        out_path = OUTPUT_DIR / "doc_pair_synthesis.json"
        out_path.write_text(json.dumps(doc_pair_records, indent=2, ensure_ascii=False))
        logger.info(f"  Saved {len(doc_pair_records)} doc-pair syntheses to {out_path}")

        country_name = "the country"
        if config_path.exists():
            cfg_for_name = json.loads(config_path.read_text())
            country_name = cfg_for_name.get("name") or country_name
        corpus_record = await synthesize_corpus(doc_pair_records, country_name)
        out_path = OUTPUT_DIR / "corpus_themes.json"
        out_path.write_text(json.dumps(corpus_record, indent=2, ensure_ascii=False))
        logger.info(
            f"  Saved corpus themes ({len(corpus_record.get('storylines', []) or [])} "
            f"storylines) to {out_path}"
        )

        # Sector synthesis needs category-name resolution. Build it from the
        # taxonomies already loaded in this run plus country-specific files.
        sector_category_names: dict[tuple[str, str], str] = {}
        for cat in nbs_categories:
            sector_category_names[("nbs", cat["id"])] = cat.get("name", cat["id"])
        for cat in sectors:
            sector_category_names[("sector", cat["id"])] = cat.get("name", cat["id"])
        for cat in globe_categories:
            sector_category_names[("globe", cat["id"])] = cat.get("name", cat["id"])
        if config_path.exists():
            cfg = json.loads(config_path.read_text())
            for cat in cfg.get("countrySectors", []):
                sector_category_names[("country", cat["id"])] = cat.get(
                    "name", cat["id"]
                )
        if adp_data:
            for g in adp_data.get("adaptationGoals", []):
                gid = str(g["id"])
                descr = g.get("description", gid)
                short = descr[:80].rstrip(",.")
                if len(descr) > 80:
                    short = short + "…"
                sector_category_names[("adaptation_goal", gid)] = short

        sector_records = await synthesize_by_sector(
            targets, alignment_results, all_classifications,
            category_names=sector_category_names,
            doc_type_labels=doc_type_labels,
        )
        out_path = OUTPUT_DIR / "sector_synthesis.json"
        out_path.write_text(json.dumps(sector_records, indent=2, ensure_ascii=False))
        logger.info(f"  Saved {len(sector_records)} sector syntheses to {out_path}")

        # Summary
        elapsed = time.time() - start
        logger.info("")
        logger.info("=" * 60)
        logger.info(f"Pipeline complete in {elapsed:.1f}s")
        logger.info(f"  Classifications: {len(all_classifications)}")
        logger.info(f"    - Relevant: {sum(1 for c in all_classifications if c['isRelevant'])}")
        logger.info(f"  Pairs assessed: {len(alignment_results)}")
        levels = {}
        for r in alignment_results:
            levels[r["alignment"]] = levels.get(r["alignment"], 0) + 1
        contradiction_levels = ["likely_conflict", "possible_conflict", "possible_misalignment"]
        alignment_levels = ["high", "medium", "low", "none"]
        total_contradictions = sum(levels.get(l, 0) for l in contradiction_levels)
        logger.info("  Alignment:")
        for level in alignment_levels:
            logger.info(f"    - {level}: {levels.get(level, 0)}")
        logger.info(f"  Flagged misalignments: {total_contradictions}")
        for level in contradiction_levels:
            count = levels.get(level, 0)
            if count > 0:
                logger.info(f"    - {level}: {count}")
        logger.info(f"  Output dir: {OUTPUT_DIR}")

        if measure_alignment_results:
            m_levels: dict[str, int] = {}
            for r in measure_alignment_results:
                m_levels[r["alignment"]] = m_levels.get(r["alignment"], 0) + 1
            logger.info(f"  Measure alignment pairs: {len(measure_alignment_results)}")
            logger.info(f"    Levels: {m_levels}")

        if budget_alignment_results:
            b_levels: dict[str, int] = {}
            for r in budget_alignment_results:
                b_levels[r["alignment"]] = b_levels.get(r["alignment"], 0) + 1
            logger.info(f"  Budget alignment pairs: {len(budget_alignment_results)}")
            logger.info(f"    Levels: {b_levels}")

        # Persist environmental footprint snapshot. Prefer live measurements;
        # fall back to an estimate from call counts when the whole run was
        # served from cache (so the live tracker captured nothing).
        footprint = get_footprint_tracker().snapshot()
        if not footprint.get("available"):
            call_groups = [
                {
                    "name": "quantitative_flags",
                    "count": len(quant_flags),
                    "avg_output_tokens": 50,
                    "avg_latency_s": 1.0,
                },
                {
                    "name": "classification",
                    "count": len(all_classifications),
                    "avg_output_tokens": 50,
                    "avg_latency_s": 1.0,
                },
                {
                    "name": "decomposition",
                    "count": len(decompositions)
                    + (len(measure_pseudo_targets) if measure_alignment_results else 0),
                    "avg_output_tokens": 400,
                    "avg_latency_s": 2.5,
                },
                {
                    "name": "alignment",
                    "count": len(alignment_results),
                    "avg_output_tokens": 200,
                    "avg_latency_s": 2.0,
                },
                {
                    "name": "measure_alignment",
                    "count": len(measure_alignment_results),
                    "avg_output_tokens": 200,
                    "avg_latency_s": 2.0,
                },
            ]
            estimated = estimate_footprint_from_counts(call_groups, model=LLM_MODEL)
            if estimated.get("available"):
                footprint = estimated

        (OUTPUT_DIR / "footprint.json").write_text(json.dumps(footprint, indent=2))

        if footprint.get("available"):
            source = footprint.get("source", "measured")
            label = "EcoLogits measurement" if source == "measured" else "EcoLogits estimate (from call counts)"
            logger.info(f"  Footprint ({label}):")
            logger.info(f"    Energy: {footprint['energy_wh']:.2f} Wh")
            logger.info(f"    Water:  {footprint['water_ml']:.2f} mL")
            logger.info(f"    CO2eq:  {footprint['co2_geq']:.2f} gCO2eq")
            logger.info(f"    ADPe:   {footprint['minerals_ugsbeq']:.2f} ugSbeq")
            logger.info(
                f"    Calls:  {footprint['tracked_call_count']} tracked, "
                f"{footprint['cached_call_count']} cached"
            )
        else:
            logger.info("  Footprint: unavailable (EcoLogits did not capture impacts)")

        summary = {
            "totalTargets": len(targets),
            "totalClassifications": len(all_classifications),
            "relevantClassifications": sum(1 for c in all_classifications if c["isRelevant"]),
            "totalPairs": len(alignment_results),
            "alignmentLevels": levels,
            "totalContradictions": total_contradictions,
            "measureAlignmentPairs": len(measure_alignment_results),
            "measurePseudoTargets": len(measure_pseudo_targets),
            "budgetAlignmentPairs": len(budget_alignment_results),
            "budgetPseudoTargets": len(budget_pseudo_targets),
            "elapsedSeconds": round(elapsed, 1),
        }
        write_status(TOTAL_STEPS, "Complete", f"Pipeline finished in {elapsed:.1f}s", status="completed", started_at=started_at, summary=summary)

    except Exception as e:
        logger.exception("Pipeline failed")
        write_status(0, "Error", str(e), status="failed", started_at=started_at, error=str(e))


if __name__ == "__main__":
    asyncio.run(main())
