"""Re-run ONLY the target-to-measure alignment step (run_analysis STEP 6).

Use case: a prompt change in measure_align.py (e.g. the v3 side-correct
framing, 2026-06-10) needs fresh measure verdicts WITHOUT recomputing the far
larger target-to-target corpus alignment, classifications, or syntheses.

Mirrors run_analysis.py call-for-call so every upstream prompt is byte-
identical and hits the shared disk cache:
  - decompose_targets(targets)         -> cached if the corpus ran before
  - decompose_measures(pseudo_targets) -> cheap (one call per reported action)
  - assess_measure_alignment(...)      -> the actual re-run (targets x actions)

Writes ONLY <output>/<country>/measure_alignment.json. Classifications and
measure_pseudo_targets.json are left untouched.

Run from python/:  LLM_CONCURRENCY=4 .venv/bin/python scripts/rerun_measure_alignment.py \
                       --targets-file panama-targets.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import DATA_DIR, OUTPUT_DIR  # noqa: E402
from src.llm import set_language  # noqa: E402
from src.align import decompose_targets  # noqa: E402
from src.measure_align import (  # noqa: E402
    assess_measure_alignment,
    decompose_measures,
    generate_cross_type_pairs,
    generate_measure_pairs,
    measures_to_pseudo_targets,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("rerun_measure_alignment")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--targets-file",
        default="mongolia-targets.json",
        help="Name of the targets JSON file in DATA_DIR (default: mongolia-targets.json)",
    )
    parser.add_argument(
        "--language",
        default="en",
        choices=["en", "es", "mn", "fr"],
        help="Must match the language of the run whose caches you want to reuse.",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    set_language(args.language)

    stem = args.targets_file.replace("-targets.json", "")
    out_dir = OUTPUT_DIR / stem
    if not out_dir.exists():
        raise SystemExit(f"Output dir {out_dir} does not exist; run the full pipeline first.")

    raw = json.loads((DATA_DIR / args.targets_file).read_text())
    targets = raw["targets"] if isinstance(raw, dict) else raw
    logger.info(f"Loaded {len(targets)} targets from {args.targets_file}")

    doc_type_labels: dict[str, str] | None = None
    cfg_path = DATA_DIR / f"{stem}-country-config.json"
    if cfg_path.exists():
        cc = json.loads(cfg_path.read_text())
        doc_type_labels = {
            dt["id"]: dt["mediumLabel"] for dt in cc.get("documentTypes", [])
        }
        logger.info(f"Loaded doc-type labels from {cfg_path.name}")

    btr_path = out_dir / "btr_data.json"
    if not btr_path.exists():
        raise SystemExit(f"{btr_path} not found; nothing to align.")
    btr = json.loads(btr_path.read_text())
    mit = measures_to_pseudo_targets(
        btr.get("mitigationMeasures", []), action_type="mitigation"
    )

    adp: list[dict] = []
    adp_path = DATA_DIR / f"{stem}-btr-adaptation.json"
    if adp_path.exists():
        adp = measures_to_pseudo_targets(
            json.loads(adp_path.read_text()).get("actions", []),
            action_type="adaptation",
        )
    pseudo = mit + adp
    logger.info(f"{len(mit)} mitigation + {len(adp)} adaptation pseudo-targets")

    pairs = generate_measure_pairs(targets, pseudo)
    if mit and adp:
        pairs = pairs + generate_cross_type_pairs(pseudo)

    decomps = await decompose_targets(targets)  # cache-warm after any full run
    mdecomps = await decompose_measures(pseudo)
    results = await assess_measure_alignment(
        pairs, {**decomps, **mdecomps}, doc_type_labels
    )

    out_path = out_dir / "measure_alignment.json"
    out_path.write_text(json.dumps(results, indent=2))
    logger.info(f"Saved {len(results)} measure alignment results to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
