"""Surgically add the human rights themes taxonomy to committed classifications
WITHOUT re-running alignment, decomposition or synthesis.

Classifies policy targets (and, where present, BTR measure and BER budget
pseudo-targets) against the nine human rights themes via the same
`rank_classification` the pipeline uses (cache namespace `rank_hr`), then merges
the new records into the country's `classifications.json`. Existing `hr` records
are stripped first, so the script is idempotent. Nothing else in the output dir
is touched — the "only compute what is genuinely missing" path.

`rank_hr` is a brand-new cache namespace, so this is a cold run: expect one live
LLM call per item. It cannot reuse any existing cache, but equally it invalidates
nothing — every other lens stays warm.

    cd python
    LLM_CONCURRENCY=4 .venv/bin/python scripts/classify_hr.py --targets-file mongolia-targets.json

Run with the same model + --language that produced the committed classifications
(gpt-5.4 / en for the current outputs) so the human rights records are consistent
with the existing lenses. Unlike classify_gga.py this resolves per-model output
subdirs (python/output/mongolia/gpt-5-4/...) as well as the flat layout; pass
--model-dir to target a specific one.

The taxonomy is a DRAFT under expert review — see the hr_categories entry in
data/categories.json. Re-run after re-ingesting an updated sheet.
"""

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.classify import rank_classification  # noqa: E402
from src.config import DATA_DIR, LLM_MODEL, OUTPUT_DIR, all_targets_files  # noqa: E402
from src.llm import set_language  # noqa: E402

# Every committed corpus, from the python/data glob — see config.all_targets_files.
DEFAULT_TARGETS = all_targets_files()

# Mirrors PREFERRED_DEFAULT_SLUGS in src/lib/dashboard-data.ts: the model dir the
# dashboard shows by default when a country has per-model outputs.
PREFERRED_MODEL_SLUGS = ["gpt-5-4", "gpt-5-5"]

TAXONOMY = "hr"


def stem_for(targets_file: str) -> str:
    """mongolia-targets.json -> mongolia (matches the output dir layout)."""
    return re.sub(r"-?targets\.json$", "", targets_file)


def _load(path: Path):
    return json.loads(path.read_text()) if path.exists() else None


def resolve_output_dirs(stem: str, model_dir: str | None) -> list[Path]:
    """Output dirs holding a classifications.json for this country.

    Countries are either flat (`output/panama/classifications.json`) or split by
    model (`output/mongolia/gpt-5-4/...`). For the split layout classify only the
    dashboard's default model unless --model-dir says otherwise, so a pilot does
    not silently pay for every model variant.
    """
    base = OUTPUT_DIR / stem
    if not base.exists():
        return []
    if model_dir:
        return [base / model_dir]
    if (base / "classifications.json").exists():
        return [base]
    candidates = sorted(p for p in base.iterdir() if (p / "classifications.json").exists())
    for slug in PREFERRED_MODEL_SLUGS:
        for path in candidates:
            if path.name == slug:
                return [path]
    return candidates[:1]


async def classify_country(
    targets_file: str, hr: list[dict], model_dir: str | None
) -> None:
    stem = stem_for(targets_file)
    out_dirs = resolve_output_dirs(stem, model_dir)
    if not out_dirs:
        print(f"[{stem}] no classifications.json under {OUTPUT_DIR / stem} — skipping")
        return

    for out_dir in out_dirs:
        cls_path = out_dir / "classifications.json"
        if not cls_path.exists():
            print(f"[{stem}] no classifications.json at {cls_path} — skipping")
            continue

        targets = _load(DATA_DIR / targets_file) or []
        measures = _load(out_dir / "measure_pseudo_targets.json") or []
        budget = _load(out_dir / "budget_pseudo_targets.json") or []
        # Pseudo-targets already carry {id, text}; rank_classification needs only those.
        items = targets + measures + budget
        print(
            f"[{stem}/{out_dir.name}] classifying {len(targets)} targets + "
            f"{len(measures)} measures + {len(budget)} budget programmes against "
            f"{len(hr)} human rights themes (model={LLM_MODEL}) "
            f"-> {len(items) * len(hr)} records, {len(items)} LLM calls"
        )

        new_records = await rank_classification(items, hr, TAXONOMY)

        existing = json.loads(cls_path.read_text())
        kept = [c for c in existing if c.get("taxonomyType") != TAXONOMY]
        merged = kept + new_records
        cls_path.write_text(json.dumps(merged, indent=2))

        n_prim = sum(1 for c in new_records if c.get("isPrimary"))
        print(
            f"[{stem}/{out_dir.name}] merged {len(new_records)} {TAXONOMY} records "
            f"({n_prim} primaries) into {cls_path}  "
            f"(records {len(existing)} -> {len(merged)})"
        )


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--targets-file",
        default=None,
        help="single country; default = every committed corpus",
    )
    parser.add_argument("--model-dir", default=None, help="e.g. gpt-5-4; default = dashboard default")
    parser.add_argument("--language", default="en", choices=["en", "es", "mn", "fr"])
    args = parser.parse_args()
    set_language(args.language)

    hr = json.loads((DATA_DIR / "categories.json").read_text()).get("hr_categories", [])
    if not hr:
        print("No hr_categories in categories.json — run the ingest script first.")
        return

    files = [args.targets_file] if args.targets_file else DEFAULT_TARGETS
    for tf in files:
        await classify_country(tf, hr, args.model_dir)


if __name__ == "__main__":
    asyncio.run(main())
