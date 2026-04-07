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
    2. Run thematic classification (NBS + sectors + themes)
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
import time
from datetime import datetime, timezone

from .config import DATA_DIR, LLM_MODEL, OUTPUT_DIR
from .classify import run_classification
from .align import decompose_targets, generate_pairs, assess_alignment
from .llm import estimate_footprint_from_counts, get_footprint_tracker
from .quantitative import assess_quantitative_flags
from .measure_align import (
    measures_to_pseudo_targets,
    generate_measure_pairs,
    decompose_measures,
    assess_measure_alignment,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

TOTAL_STEPS = 6


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


def load_input_data(targets_file: str = "mongolia-targets.json") -> tuple[list, list, list, list]:
    """Load targets and categories from JSON files."""
    targets = json.loads((DATA_DIR / targets_file).read_text())
    cats = json.loads((DATA_DIR / "categories.json").read_text())
    nbs = cats["nbs_categories"]
    sectors = cats["ipcc_sectors"]
    themes = cats.get("_themes_deprecated", [])
    logger.info(
        f"Loaded {len(targets)} targets, "
        f"{len(nbs)} NBS + {len(sectors)} IPCC sectors + {len(themes)} themes"
    )
    return targets, nbs, sectors, themes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run CPC analysis pipeline")
    parser.add_argument(
        "--targets-file",
        default="mongolia-targets.json",
        help="Name of the targets JSON file in DATA_DIR (default: mongolia-targets.json)",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    start = time.time()
    started_at = datetime.now(timezone.utc).isoformat()
    logger.info(f"Starting analysis pipeline (model: {LLM_MODEL})")
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
        targets, nbs_categories, sectors, themes = load_input_data(args.targets_file)

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
        write_status(2, "Thematic classification", f"Classifying {len(targets)} targets against NBS categories, IPCC sectors, and cross-cutting themes", started_at=started_at)
        logger.info("")
        logger.info("STEP 2: Thematic classification")
        logger.info("-" * 40)

        nbs_classifications = await run_classification(targets, nbs_categories, "nbs")
        sector_classifications = await run_classification(targets, sectors, "sector")
        theme_classifications = await run_classification(targets, themes, "theme")

        all_classifications = nbs_classifications + sector_classifications + theme_classifications

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

        alignment_results = await assess_alignment(pairs, decompositions)

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
            measure_pseudo_targets = measures_to_pseudo_targets(raw_measures)
            logger.info(f"  {len(raw_measures)} raw measures → {len(measure_pseudo_targets)} valid pseudo-targets")

            if measure_pseudo_targets:
                # Classify BTR measures against NBS and themes (not sectors — ground truth)
                btr_nbs = await run_classification(measure_pseudo_targets, nbs_categories, "nbs")
                btr_themes = await run_classification(measure_pseudo_targets, themes, "theme")
                all_classifications.extend(btr_nbs + btr_themes)

                # Inject ground-truth IPCC sector classifications from BTR data
                for pt in measure_pseudo_targets:
                    all_classifications.append({
                        "targetId": pt["id"],
                        "categoryId": pt["sector"],
                        "taxonomyType": "sector",
                        "isRelevant": True,
                    })

                # Re-save classifications with BTR entries included
                out_path = OUTPUT_DIR / "classifications.json"
                out_path.write_text(json.dumps(all_classifications, indent=2))
                logger.info(f"Updated classifications with BTR entries ({len(btr_nbs)} NBS + {len(btr_themes)} themes + {len(measure_pseudo_targets)} ground-truth sectors)")

                m_pairs = generate_measure_pairs(targets, measure_pseudo_targets)

                if m_pairs:
                    measure_decomps = await decompose_measures(measure_pseudo_targets)
                    all_decomps = {**decompositions, **measure_decomps}
                    measure_alignment_results = await assess_measure_alignment(m_pairs, all_decomps)

                    out_path = OUTPUT_DIR / "measure_alignment.json"
                    out_path.write_text(json.dumps(measure_alignment_results, indent=2))
                    logger.info(f"Saved {len(measure_alignment_results)} measure alignment results")

                    out_path = OUTPUT_DIR / "measure_pseudo_targets.json"
                    out_path.write_text(json.dumps(measure_pseudo_targets, indent=2))
                    logger.info(f"Saved {len(measure_pseudo_targets)} pseudo-targets")
        else:
            logger.info("")
            logger.info("STEP 6: Skipped (no btr_data.json)")

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
        contradiction_levels = ["high_contradiction", "moderate_contradiction", "low_tension"]
        alignment_levels = ["high", "medium", "low", "none"]
        total_contradictions = sum(levels.get(l, 0) for l in contradiction_levels)
        logger.info("  Alignment:")
        for level in alignment_levels:
            logger.info(f"    - {level}: {levels.get(level, 0)}")
        logger.info(f"  Contradictions: {total_contradictions}")
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
            "elapsedSeconds": round(elapsed, 1),
        }
        write_status(TOTAL_STEPS, "Complete", f"Pipeline finished in {elapsed:.1f}s", status="completed", started_at=started_at, summary=summary)

    except Exception as e:
        logger.exception("Pipeline failed")
        write_status(0, "Error", str(e), status="failed", started_at=started_at, error=str(e))


if __name__ == "__main__":
    asyncio.run(main())
