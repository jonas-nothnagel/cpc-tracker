"""Surgically add the GGA climate-resilience taxonomy to committed
classifications WITHOUT re-running alignment, decomposition or synthesis.

For each country this classifies policy targets (and, where present, BTR measure
and BER budget pseudo-targets) against the seven GGA themes via the same
`rank_classification` the pipeline uses (cache namespace `rank_gga`), then merges
the new records into `python/output/{country}/classifications.json`. Existing
`gga` records are stripped first, so the script is idempotent. Nothing else in
the output dir is touched — this is the "only compute what is genuinely missing"
path, avoiding the ~10% alignment cache-misses a full re-run incurs on a
partially-warm cache.

    cd python
    LLM_CONCURRENCY=4 .venv/bin/python scripts/classify_gga.py                 # all 4 countries
    LLM_CONCURRENCY=4 .venv/bin/python scripts/classify_gga.py --targets-file mongolia-targets.json

Run with the same model + --language that produced the committed classifications
(gpt-5.4 / en) so the GGA records are consistent with the existing lenses. The
pseudo-target inputs are read from the committed output dir, so the BTR/BER
measure files must already exist (they do for every onboarded country).
"""

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.classify import rank_classification  # noqa: E402
from src.config import DATA_DIR, LLM_MODEL, OUTPUT_DIR  # noqa: E402
from src.llm import set_language  # noqa: E402

DEFAULT_TARGETS = [
    "mongolia-targets.json",
    "panama-targets.json",
    "sri-lanka-targets.json",
    "cote-divoire-targets.json",
]


def stem_for(targets_file: str) -> str:
    """mongolia-targets.json -> mongolia (matches the output dir layout)."""
    return re.sub(r"-?targets\.json$", "", targets_file)


def _load(path: Path):
    return json.loads(path.read_text()) if path.exists() else None


async def classify_country(targets_file: str, gga: list[dict]) -> None:
    stem = stem_for(targets_file)
    out_dir = OUTPUT_DIR / stem
    cls_path = out_dir / "classifications.json"
    if not cls_path.exists():
        print(f"[{stem}] no classifications.json at {cls_path} — skipping")
        return

    targets = _load(DATA_DIR / targets_file) or []
    measures = _load(out_dir / "measure_pseudo_targets.json") or []
    budget = _load(out_dir / "budget_pseudo_targets.json") or []
    # Pseudo-targets already carry {id, text}; rank_classification needs only those.
    items = targets + measures + budget
    print(
        f"[{stem}] classifying {len(targets)} targets + {len(measures)} measures "
        f"+ {len(budget)} budget programmes against {len(gga)} GGA themes "
        f"(model={LLM_MODEL})"
    )

    new_records = await rank_classification(items, gga, "gga")

    existing = json.loads(cls_path.read_text())
    kept = [c for c in existing if c.get("taxonomyType") != "gga"]
    merged = kept + new_records
    cls_path.write_text(json.dumps(merged, indent=2))

    n_prim = sum(1 for c in new_records if c.get("isPrimary"))
    print(
        f"[{stem}] merged {len(new_records)} gga records ({n_prim} primaries) into "
        f"{cls_path}  (records {len(existing)} -> {len(merged)})"
    )


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--targets-file", default=None, help="single country; default = all 4")
    parser.add_argument("--language", default="en", choices=["en", "es", "mn", "fr"])
    args = parser.parse_args()
    set_language(args.language)

    gga = json.loads((DATA_DIR / "categories.json").read_text()).get("gga_categories", [])
    if not gga:
        print("No gga_categories in categories.json — nothing to do.")
        return

    files = [args.targets_file] if args.targets_file else DEFAULT_TARGETS
    for tf in files:
        await classify_country(tf, gga)


if __name__ == "__main__":
    asyncio.run(main())
