"""Surgically add GGA sector synthesis to committed sector_synthesis.json files
WITHOUT recomputing the globe / nbs / sector / adaptation lenses.

As of 2026-07-06 `synthesize_by_sector` derives DEFAULT_TAXONOMY_ALLOWLIST from
`config.ACTIVE_TAXONOMIES`, so a full `run_analysis` emits GGA sector synthesis
natively. This script remains the way to backfill GGA into already-committed
outputs WITHOUT a full re-run (e.g. after a corpus repair re-ran STEP 8 before
this fix landed, as happened to Sri Lanka). It calls `synthesize_by_sector` with
`taxonomy_allowlist=("gga",)` over the committed targets / alignment /
classifications, for each visibility state the document toggle can reach
(exactly mirroring run_analysis.py STEP 8), then merges the new gga records into
`python/output/{country}/sector_synthesis[.{lang}].json`. Existing `gga` records
are stripped first, so the script is idempotent. Every non-gga taxonomy and the
full `states` map are preserved untouched.

    cd python
    # English, all four countries (writes sector_synthesis.json):
    LLM_CONCURRENCY=4 .venv/bin/python scripts/rerun_sector_synthesis_gga.py
    # Mongolian, Mongolia only (others have no .mn file, so they are skipped):
    LLM_CONCURRENCY=4 .venv/bin/python scripts/rerun_sector_synthesis_gga.py --language mn
    # single country:
    LLM_CONCURRENCY=4 .venv/bin/python scripts/rerun_sector_synthesis_gga.py --targets-file panama-targets.json

Run with the same model + --language that produced the committed lenses
(gpt-5.4 / en) so the gga records are stylistically consistent. classify_gga.py
must have run first (gga classifications must be in classifications.json).
"""

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import DATA_DIR, OUTPUT_DIR  # noqa: E402
from src.llm import set_language  # noqa: E402
from src.synthesis_states import filter_targets_alignment  # noqa: E402
from src.synthesize_by_sector import synthesize_by_sector  # noqa: E402

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


def _gga_names() -> dict[tuple[str, str], str]:
    cats = json.loads((DATA_DIR / "categories.json").read_text())
    return {
        ("gga", c["id"]): c.get("name", c["id"])
        for c in cats.get("gga_categories", [])
    }


def _strip_gga(entries: list) -> list:
    return [e for e in entries if e.get("taxonomy_type") != "gga"]


async def synth_country(
    targets_file: str, lang: str, gga_names: dict[tuple[str, str], str]
) -> None:
    stem = stem_for(targets_file)
    out_dir = OUTPUT_DIR / stem
    out_name = (
        "sector_synthesis.json" if lang == "en" else f"sector_synthesis.{lang}.json"
    )
    out_path = out_dir / out_name
    if not out_path.exists():
        print(f"[{stem}/{lang}] no {out_name} — skipping (no localized file to merge into)")
        return

    alignment = _load(out_dir / "alignment.json")
    classifications = _load(out_dir / "classifications.json")
    targets = _load(DATA_DIR / targets_file)
    if alignment is None or classifications is None or targets is None:
        print(f"[{stem}/{lang}] missing alignment/classifications/targets — skipping")
        return

    has_gga_cls = any(c.get("taxonomyType") == "gga" for c in classifications)
    if not has_gga_cls:
        print(f"[{stem}/{lang}] no gga classifications — run classify_gga.py first; skipping")
        return

    existing = json.loads(out_path.read_text())
    is_array = isinstance(existing, list)

    # Compute gga for exactly the visibility states this file already holds, so
    # we never issue calls for states the file does not keep. A bare array is the
    # "" (full corpus) state; a {synthesis, states} dict carries one entry per
    # canonical hidden-doc key. Hidden set is recovered from the key the same way
    # the frontend builds it: sorted doc ids joined by "+".
    state_keys = [""] if is_array else list((existing.get("states") or {}).keys())
    if "" not in state_keys:
        state_keys = ["", *state_keys]

    gga_by_state: dict[str, list] = {}
    for key in state_keys:
        hidden = set(key.split("+")) if key else set()
        s_targets, s_alignment = filter_targets_alignment(targets, alignment, hidden)
        results = await synthesize_by_sector(
            s_targets,
            s_alignment,
            classifications,
            category_names=gga_names,
            taxonomy_allowlist=("gga",),
        )
        gga_by_state[key] = results
        print(
            f"[{stem}/{lang}] state '{key or 'full'}': {len(results)} gga sector syntheses"
        )

    if is_array:
        # Bare array == the "" (full corpus) state (mongolia's shape).
        merged = _strip_gga(existing) + gga_by_state.get("", [])
        out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False))
        added = len(gga_by_state.get("", []))
        total = len(merged)
    else:
        states_map = existing.get("states") or {}
        for key in list(states_map.keys()):
            states_map[key] = _strip_gga(states_map[key]) + gga_by_state.get(key, [])
        existing["states"] = states_map
        # `synthesis` is the legacy top-level mirror of the "" state.
        existing["synthesis"] = states_map.get("", [])
        out_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False))
        added = sum(len(v) for v in gga_by_state.values())
        total = len(states_map.get("", []))
    print(
        f"[{stem}/{lang}] merged {added} gga records -> {out_path}  "
        f"(full-corpus entries now {total})"
    )


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--targets-file", default=None, help="single country; default = all 4"
    )
    parser.add_argument("--language", default="en", choices=["en", "es", "mn", "fr"])
    args = parser.parse_args()
    set_language(args.language)

    gga_names = _gga_names()
    if not gga_names:
        print("No gga_categories in categories.json — nothing to do.")
        return

    files = [args.targets_file] if args.targets_file else DEFAULT_TARGETS
    for tf in files:
        await synth_country(tf, args.language, gga_names)


if __name__ == "__main__":
    asyncio.run(main())
