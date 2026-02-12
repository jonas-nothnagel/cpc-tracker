"""
Main orchestrator: runs the full analysis pipeline.

Usage:
    cd python
    uv run python -m src.run_analysis

Or with plain Python:
    cd python
    python -m src.run_analysis

Steps:
    1. Load input data (targets + categories)
    2. Run thematic classification (NBS + themes)
    3. Generate theme-filtered pairs
    4. Decompose targets (Agent 1)
    5. Assess alignment (Agent 2)
    6. Save all results as JSON
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import time

from .config import DATA_DIR, LLM_MODEL, OUTPUT_DIR
from .classify import run_classification
from .align import decompose_targets, generate_pairs, assess_alignment

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def load_input_data() -> tuple[list, list, list]:
    """Load targets and categories from JSON files."""
    targets = json.loads((DATA_DIR / "mongolia-targets.json").read_text())
    cats = json.loads((DATA_DIR / "categories.json").read_text())
    nbs = cats["nbs_categories"]
    themes = cats["themes"]
    logger.info(
        f"Loaded {len(targets)} targets, "
        f"{len(nbs)} NBS categories, {len(themes)} themes"
    )
    return targets, nbs, themes


async def main() -> None:
    start = time.time()
    logger.info(f"Starting analysis pipeline (model: {LLM_MODEL})")
    logger.info("=" * 60)

    # 1. Load data
    targets, nbs_categories, themes = load_input_data()

    # 2. Thematic classification
    logger.info("STEP 1: Thematic classification")
    logger.info("-" * 40)

    nbs_classifications = await run_classification(targets, nbs_categories, "nbs")
    theme_classifications = await run_classification(targets, themes, "theme")

    all_classifications = nbs_classifications + theme_classifications

    # Save classifications
    out_path = OUTPUT_DIR / "classifications.json"
    out_path.write_text(json.dumps(all_classifications, indent=2))
    logger.info(f"Saved {len(all_classifications)} classifications to {out_path}")

    # 3. Generate theme-filtered pairs
    logger.info("")
    logger.info("STEP 2: Generate theme-filtered pairs")
    logger.info("-" * 40)

    pairs = generate_pairs(targets, theme_classifications)
    logger.info(f"Total cross-document pairs to assess: {len(pairs)}")

    if not pairs:
        logger.warning("No pairs generated! Check classification results.")
        return

    # 4. Decompose targets (only those that appear in pairs)
    logger.info("")
    logger.info("STEP 3: Decompose targets (Agent 1)")
    logger.info("-" * 40)

    # Collect unique target IDs from pairs
    pair_target_ids = set()
    for ta, tb in pairs:
        pair_target_ids.add(ta["id"])
        pair_target_ids.add(tb["id"])

    targets_for_decomp = [t for t in targets if t["id"] in pair_target_ids]
    decompositions = await decompose_targets(targets_for_decomp)

    # Save decompositions
    out_path = OUTPUT_DIR / "decompositions.json"
    out_path.write_text(json.dumps(decompositions, indent=2))
    logger.info(f"Saved {len(decompositions)} decompositions to {out_path}")

    # 5. Assess alignment
    logger.info("")
    logger.info("STEP 4: Assess alignment (Agent 2)")
    logger.info("-" * 40)

    alignment_results = await assess_alignment(pairs, decompositions)

    # Save alignment results
    out_path = OUTPUT_DIR / "alignment.json"
    out_path.write_text(json.dumps(alignment_results, indent=2))
    logger.info(f"Saved {len(alignment_results)} alignment results to {out_path}")

    # Summary
    elapsed = time.time() - start
    logger.info("")
    logger.info("=" * 60)
    logger.info(f"Pipeline complete in {elapsed:.1f}s")
    logger.info(f"  Classifications: {len(all_classifications)}")
    logger.info(f"    - NBS relevant: {sum(1 for c in nbs_classifications if c['isRelevant'])}")
    logger.info(f"    - Theme relevant: {sum(1 for c in theme_classifications if c['isRelevant'])}")
    logger.info(f"  Pairs assessed: {len(alignment_results)}")
    levels = {}
    for r in alignment_results:
        levels[r["alignment"]] = levels.get(r["alignment"], 0) + 1
    for level in ["high", "medium", "low", "none"]:
        logger.info(f"    - {level}: {levels.get(level, 0)}")
    logger.info(f"  Output dir: {OUTPUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
