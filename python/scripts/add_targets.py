"""Analyse targets added to a country's corpus, leaving the analysed ones as they are.

When a document joins a country whose targets were already analysed,
run_analysis would compare every pair again, and after any prompt change at
full cost. This runs run_analysis's target steps (STEP 1-5) for the added
targets only and merges the results into the country's files:

  - quantitative and time-bound flags          -> quantitative_flags.json
  - ranked classification (active taxonomies, and the adaptation goals of
    <country>-btr-adaptation.json where it exists) -> classifications.json
  - decomposition (Agent 1)                    -> decompositions.json
  - definition elements                        -> target_quality.json
  - every cross-document pair that involves an added target (Agent 2), with
    the friction dimensions of flagged pairs and the explanations in the
    agreed vocabulary (scripts/contract_wording.py) -> alignment.json

Rows for the added targets are replaced, so a re-run is idempotent. Pairs
between earlier targets keep the prompt version they ran on; status.json
records the added targets and their prompt version. Then run
scripts/align_actions_and_budget.py (reported actions and budget lines) and
scripts/rerun_synthesis.py (themes and document-pair syntheses). Neither
regenerates sector_synthesis.json: it still describes the earlier corpus, and
the previous dashboard's sector drawer shows it as current, so regenerate it
(run_analysis STEP 8's synthesize_by_sector over every visibility state) or
remove it.

With --model the country's files are the model's own directory, as in
run_analysis. A smoke run (--limit-new / --limit-old) writes into --out-dir only.

Run from python/:
    CPC_CACHE_DIR=<main checkout>/python/output/.cache \\
    .venv/bin/python scripts/add_targets.py --targets-file countryx-targets.json --docs FSP
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from src import config  # noqa: E402
from src.align import PROMPT_VERSION, assess_alignment, decompose_targets, generate_pairs  # noqa: E402
from src.classify_globe import load_few_shot_examples  # noqa: E402
from src.config import CACHE_DIR, DATA_DIR, OUTPUT_DIR  # noqa: E402
from src.country_taxonomies import load_country_taxonomies  # noqa: E402
from src.extract_friction_dimensions import enrich_with_friction_dimensions  # noqa: E402
from src.llm import set_language  # noqa: E402
from src.quantitative import assess_quantitative_flags  # noqa: E402
from src.run_analysis import (  # noqa: E402
    classify_active_taxonomies,
    derive_country_file,
    derive_country_slug,
    derive_output_dir,
    load_input_data,
)
from src.target_quality import assess_target_quality  # noqa: E402

from align_actions_and_budget import (  # noqa: E402
    classify_adaptation_goals,
    in_agreed_wording,
    record_footprint,
    use_model,
)

logger = logging.getLogger("add_targets")

CLASSIFICATION_KEYS = ("nbs", "globe", "sector", "globe_sub", "gga", "hr", "country_taxonomies")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--targets-file", required=True, help="Targets JSON in DATA_DIR, e.g. countryx-targets.json")
    parser.add_argument("--docs", required=True, help="Comma-separated document ids whose targets were added, e.g. FSP")
    parser.add_argument("--language", default="en", choices=["en", "es", "mn", "fr"])
    parser.add_argument("--limit-new", type=int, help="Smoke run: the first N added targets")
    parser.add_argument("--limit-old", type=int, help="Smoke run: the first N earlier targets")
    parser.add_argument("--out-dir", type=Path, help="Write here instead (required for a smoke run)")
    parser.add_argument("--model", help="As run_analysis --model: the model and its output dir")
    return parser.parse_args()


def read(path: Path, default: Any) -> Any:
    return json.loads(path.read_text()) if path.exists() else default


def write(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2))
    logger.info(f"Saved {path}")


def by_target(rows: list[dict], new_ids: set[str], fresh: list[dict]) -> list[dict]:
    """Earlier rows of the other targets, then the fresh rows of the added ones."""
    return [r for r in rows if r.get("targetId") not in new_ids] + fresh


async def main() -> None:
    args = parse_args()
    smoke = args.limit_new is not None or args.limit_old is not None
    if smoke and not args.out_dir:
        raise SystemExit("A smoke run needs --out-dir, so the country's files stay as they are.")
    set_language(args.language)
    use_model(args.model)
    country = derive_country_slug(args.targets_file)
    country_dir = derive_output_dir(args.targets_file, OUTPUT_DIR, args.model)
    needed = ("alignment.json", "classifications.json")
    missing = [n for n in needed if not (country_dir / n).exists()]
    if not smoke and missing:
        # Before any call: merging into absent files would write the added rows alone.
        raise SystemExit(
            f"No {', '.join(missing)} in {country_dir}: run run_analysis first, or pass --model."
        )
    out_dir = args.out_dir or country_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    docs = {d.strip() for d in args.docs.split(",") if d.strip()}
    logger.info(f"Model {config.LLM_MODEL}; cache {CACHE_DIR}; added documents {sorted(docs)}; writing to {out_dir}")

    targets, nbs, sectors, globe, globe_sub, gga, hr = load_input_data(args.targets_file)
    new = [t for t in targets if t["sourceDocument"] in docs]
    old = [t for t in targets if t["sourceDocument"] not in docs]
    if args.limit_new is not None:
        new = new[: args.limit_new]
    if args.limit_old is not None:
        old = old[: args.limit_old]
    if not new:
        raise SystemExit(f"No targets of {sorted(docs)} in {args.targets_file}.")
    new_ids = {t["id"] for t in new}
    logger.info(f"{len(new)} added targets, {len(old)} earlier targets")

    examples_path = DATA_DIR / derive_country_file(args.targets_file, "ber-globe-examples")
    config_path = DATA_DIR / derive_country_file(args.targets_file, "country-config")
    doc_type_labels = (
        {dt["id"]: dt["mediumLabel"] for dt in json.loads(config_path.read_text()).get("documentTypes", [])}
        if config_path.exists()
        else None
    )

    # STEP 1: quantitative and time-bound flags.
    quantitative = await assess_quantitative_flags(new)
    # STEP 2: classification, as run_analysis classifies policy targets.
    classes = await classify_active_taxonomies(
        new,
        nbs_categories=nbs,
        sectors=sectors,
        globe_categories=globe,
        globe_subcategories=globe_sub,
        globe_few_shot_examples=load_few_shot_examples(str(examples_path)) if examples_path.exists() else [],
        gga_categories=gga,
        hr_categories=hr,
        cache_suffix="targets",
        country_taxonomies=load_country_taxonomies(DATA_DIR / derive_country_file(args.targets_file, "taxonomies")),
    )
    classifications = [row for key in CLASSIFICATION_KEYS for row in classes.get(key, [])]
    # STEP 2, where the country has a BTR adaptation file: its adaptation goals.
    classifications += await classify_adaptation_goals(
        new, DATA_DIR / derive_country_file(args.targets_file, "btr-adaptation")
    )
    # STEP 4: decomposition of every target the new pairs read (earlier ones from the cache).
    decompositions = await decompose_targets(old + new)
    # STEP 4b: definition elements, with the decomposition as context.
    quality = await assess_target_quality(new, {t["id"]: decompositions.get(t["id"], "") for t in new})
    # STEP 3 + 5: every cross-document pair that involves an added target.
    pairs = [(a, b) for a, b in generate_pairs(old + new) if a["id"] in new_ids or b["id"] in new_ids]
    logger.info(f"{len(pairs)} pairs involve an added target")
    alignment = await assess_alignment(pairs, decompositions, doc_type_labels)
    try:
        alignment = await enrich_with_friction_dimensions(alignment)
    except Exception as e:  # noqa: BLE001 - as run_analysis: never lose the comparisons
        logger.warning(f"Friction-dimension enrichment failed; saving alignment without it: {e}")
    alignment = in_agreed_wording(alignment)

    if smoke:
        write(out_dir / "alignment.added.json", alignment)
        write(out_dir / "classifications.added.json", classifications)
        write(out_dir / "quantitative_flags.added.json", quantitative)
        write(out_dir / "target_quality.added.json", quality)
    else:
        write(out_dir / "quantitative_flags.json", by_target(read(country_dir / "quantitative_flags.json", []), new_ids, quantitative))
        write(out_dir / "classifications.json", by_target(read(country_dir / "classifications.json", []), new_ids, classifications))
        decomposed = read(country_dir / "decompositions.json", {})
        decomposed.update({t["id"]: decompositions[t["id"]] for t in new if t["id"] in decompositions})
        write(out_dir / "decompositions.json", decomposed)
        write(out_dir / "target_quality.json", by_target(read(country_dir / "target_quality.json", []), new_ids, quality))
        earlier = [
            r for r in read(country_dir / "alignment.json", [])
            if r["targetAId"] not in new_ids and r["targetBId"] not in new_ids
        ]
        # The earlier rows in the agreed vocabulary too (a no-op once they are),
        # so the merged file is what these steps produce from any starting point.
        merged = in_agreed_wording(earlier) + alignment
        write(out_dir / "alignment.json", merged)
        status = read(country_dir / "status.json", {})
        summary = status.setdefault("summary", {})
        summary["totalTargets"] = len(targets)
        summary["totalPairs"] = len(merged)
        levels: dict[str, int] = {}
        for r in merged:
            levels[r["alignment"]] = levels.get(r["alignment"], 0) + 1
        summary["alignmentLevels"] = levels
        summary["totalContradictions"] = levels.get("flagged", 0)
        status["addedTargets"] = {
            "documents": sorted(docs),
            "targets": len(new),
            "pairs": len(alignment),
            "promptVersion": PROMPT_VERSION,
            "completedAt": datetime.now(timezone.utc).isoformat(),
        }
        write(out_dir / "status.json", status)

    record_footprint(country, f"add-targets:{country}{':smoke' if smoke else ''}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", datefmt="%H:%M:%S")
    asyncio.run(main())
