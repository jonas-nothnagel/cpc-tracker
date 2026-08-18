"""Surgically add target_quality.json to committed outputs WITHOUT re-running
the pipeline.

target_quality (which definition elements each target's text states) normally
runs as STEP 4b of run_analysis, so countries analysed before it existed
(added Aug 2026 for the Panama focal group) never got one — the dashboard
silently hides every quality affordance for them. This script computes ONLY
the missing artifact: it loads the country's committed targets and
decompositions.json (so the assessment sees the same reading of each target
the original run did), calls the same assess_target_quality the pipeline
uses (cache namespace `target_quality_v1`), and writes target_quality.json
next to the country's other outputs. Nothing else in the output dir is
touched.

Live-call note: `target_quality_v1` entries exist only for corpora that
already ran STEP 4b, so expect one live LLM call per batch of 8 targets for
a new country. Run with the same model + --language that produced the
committed outputs (gpt-5.4 / en today).

    cd python
    .venv/bin/python scripts/backfill_target_quality.py --targets-file sri-lanka-targets.json

Resolves per-model output subdirs (output/mongolia/gpt-5-4/...) as well as
the flat layout; pass --model-dir to target a specific one. Skips countries
whose target_quality.json already exists unless --force.
"""

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import DATA_DIR, LLM_MODEL, OUTPUT_DIR  # noqa: E402
from src.footprint import append_event, electricity_zone  # noqa: E402
from src.footprint.tracker import get_footprint_tracker  # noqa: E402
from src.llm import set_language  # noqa: E402
from src.target_quality import assess_target_quality  # noqa: E402

# Mirrors PREFERRED_DEFAULT_SLUGS in src/lib/dashboard-data.ts: the model dir the
# dashboard shows by default when a country has per-model outputs.
PREFERRED_MODEL_SLUGS = ["gpt-5-4", "gpt-5-5"]


def stem_for(targets_file: str) -> str:
    """mongolia-targets.json -> mongolia (matches the output dir layout)."""
    return re.sub(r"-?targets\.json$", "", targets_file)


def resolve_output_dir(stem: str, model_dir: str | None) -> Path | None:
    base = OUTPUT_DIR / stem
    if not base.exists():
        return None
    if model_dir:
        return base / model_dir
    if (base / "decompositions.json").exists():
        return base
    candidates = sorted(
        p for p in base.iterdir()
        if p.is_dir() and (p / "decompositions.json").exists()
    )
    for slug in PREFERRED_MODEL_SLUGS:
        for path in candidates:
            if path.name == slug:
                return path
    return candidates[0] if candidates else None


async def backfill(targets_file: str, force: bool, model_dir: str | None) -> None:
    stem = stem_for(targets_file)
    out_dir = resolve_output_dir(stem, model_dir)
    if out_dir is None:
        print(f"[{stem}] no decompositions.json under {OUTPUT_DIR / stem} — skipping")
        return
    quality_path = out_dir / "target_quality.json"
    if quality_path.exists() and not force:
        print(f"[{stem}/{out_dir.name}] target_quality.json already exists — skipping (--force to redo)")
        return

    targets = json.loads((DATA_DIR / targets_file).read_text())
    decompositions_raw = json.loads((out_dir / "decompositions.json").read_text())
    # Same shape run_analysis passes: target id -> decomposition text, strings only.
    decompositions = {
        tid: text
        for tid, text in decompositions_raw.items()
        if isinstance(text, str)
    }
    print(
        f"[{stem}/{out_dir.name}] assessing definition elements for "
        f"{len(targets)} targets ({len(decompositions)} with decomposition "
        f"context, model={LLM_MODEL})"
    )
    records = await assess_target_quality(targets, decompositions)
    quality_path.write_text(json.dumps(records, indent=2))
    stated = sum(1 for r in records if any(r.get("elements", {}).values()))
    print(
        f"[{stem}/{out_dir.name}] wrote {len(records)} records "
        f"({stated} state at least one element) to {quality_path}"
    )

    # Same convention as run_analysis's run-end append: every live-call job
    # leaves a footprint-ledger row (docs/CARBON_METHODOLOGY.md).
    snap = get_footprint_tracker().snapshot()
    if int(snap.get("call_count", 0) or 0):
        append_event(
            component="dev_pipeline",
            provider="openai",
            model=LLM_MODEL,
            region=electricity_zone(),
            run_id=None,
            country=stem,
            call_count=int(snap.get("call_count", 0) or 0),
            cached_call_count=int(snap.get("cached_call_count", 0) or 0),
            energy_wh=float(snap.get("energy_wh", 0) or 0),
            water_ml=float(snap.get("water_ml", 0) or 0),
            co2_geq=float(snap.get("co2_geq", 0) or 0),
            minerals_ugsbeq=float(snap.get("minerals_ugsbeq", 0) or 0),
            source=snap.get("source", "unavailable"),
        )
        print(f"[{stem}/{out_dir.name}] appended footprint ledger row ({snap.get('source')})")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--targets-file", required=True)
    parser.add_argument("--model-dir", default=None, help="e.g. gpt-5-4; default = dashboard default")
    parser.add_argument("--language", default="en", choices=["en", "es", "mn", "fr"])
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    set_language(args.language)
    await backfill(args.targets_file, args.force, args.model_dir)


if __name__ == "__main__":
    asyncio.run(main())
