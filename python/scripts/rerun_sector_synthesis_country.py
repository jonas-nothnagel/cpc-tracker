"""Surgically write the sector cards of a country's own taxonomies into its
committed sector_synthesis.json, WITHOUT recomputing any other lens.

Mirrors rerun_sector_synthesis_gga.py. For each country that ships
`{country}-taxonomies.json`, calls `synthesize_by_sector` with the country's
taxonomy types as the allowlist over the committed targets / alignment /
classifications, for every visibility state the file already holds (exactly as
run_analysis STEP 8 computes them), then merges the cards in. Cards of the
country's taxonomies and of the global lenses they replace are stripped first,
so the script is idempotent and the file ends as a full run would write it.

    cd python
    .venv/bin/python scripts/rerun_sector_synthesis_country.py --targets-file sri-lanka-targets.json

Run scripts/classify_country_taxonomies.py first, with the same model and
language (gpt-5.4 / en). English only: localized siblings come from
scripts.translate_snapshots afterwards. Appends a footprint-ledger row.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.classify_country_taxonomies import record_footprint, stem_for  # noqa: E402
from src.config import DATA_DIR, OUTPUT_DIR, all_targets_files  # noqa: E402
from src.country_taxonomies import load_country_taxonomies, replaced_lenses  # noqa: E402
from src.llm import set_language  # noqa: E402
from src.synthesis_states import filter_targets_alignment  # noqa: E402
from src.synthesize_by_sector import synthesize_by_sector  # noqa: E402


def _load(path: Path):
    return json.loads(path.read_text()) if path.exists() else None


async def synth_country(targets_file: str) -> None:
    stem = stem_for(targets_file)
    taxonomies = load_country_taxonomies(DATA_DIR / f"{stem}-taxonomies.json")
    if not taxonomies:
        print(f"[{stem}] no {stem}-taxonomies.json; skipping")
        return
    out_dir = OUTPUT_DIR / stem
    out_path = out_dir / "sector_synthesis.json"
    alignment = _load(out_dir / "alignment.json")
    classifications = _load(out_dir / "classifications.json")
    targets = _load(DATA_DIR / targets_file)
    existing = _load(out_path)
    if alignment is None or classifications is None or targets is None or existing is None:
        print(f"[{stem}] missing alignment/classifications/targets/sector_synthesis; skipping")
        return

    own_types = tuple(t["taxonomyType"] for t in taxonomies)
    present = {c.get("taxonomyType") for c in classifications}
    missing = [t for t in own_types if t not in present]
    if missing:
        print(f"[{stem}] no {missing} classifications; run classify_country_taxonomies.py first")
        return
    names = {
        (t["taxonomyType"], c["id"]): c["name"] for t in taxonomies for c in t["categories"]
    }
    config = _load(DATA_DIR / f"{stem}-country-config.json") or {}
    doc_type_labels = {
        dt["id"]: dt.get("mediumLabel") or dt.get("shortLabel") or dt["id"]
        for dt in config.get("documentTypes", [])
    }

    # The states the file already holds; a bare array is the "" (full) state.
    is_array = isinstance(existing, list)
    state_keys = [""] if is_array else list((existing.get("states") or {}).keys())
    if "" not in state_keys:
        state_keys = ["", *state_keys]

    by_state: dict[str, list] = {}
    for key in state_keys:
        hidden = set(key.split("+")) if key else set()
        s_targets, s_alignment = filter_targets_alignment(targets, alignment, hidden)
        by_state[key] = await synthesize_by_sector(
            s_targets,
            s_alignment,
            classifications,
            category_names=names,
            doc_type_labels=doc_type_labels,
            taxonomy_allowlist=own_types,
        )
        print(f"[{stem}] state '{key or 'full'}': {len(by_state[key])} cards")

    dropped = set(own_types) | replaced_lenses(taxonomies)

    def keep(entries: list) -> list:
        return [e for e in entries if e.get("taxonomy_type") not in dropped]

    if is_array:
        merged = keep(existing) + by_state[""]
        out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False))
    else:
        states = existing.get("states") or {}
        for key in state_keys:
            states[key] = keep(states.get(key, [])) + by_state[key]
        existing["states"] = states
        # `synthesis` is the legacy top-level mirror of the "" state.
        existing["synthesis"] = states[""]
        out_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False))
    print(
        f"[{stem}] wrote {sum(len(v) for v in by_state.values())} cards for {list(own_types)} "
        f"across {len(state_keys)} states, dropped {sorted(dropped)} -> {out_path}"
    )
    record_footprint(stem, run_id="country-taxonomies:sector-synthesis")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--targets-file",
        default=None,
        help="single country; default = every corpus that ships a taxonomies file",
    )
    args = parser.parse_args()
    set_language("en")

    files = [args.targets_file] if args.targets_file else all_targets_files()
    for tf in files:
        await synth_country(tf)


if __name__ == "__main__":
    asyncio.run(main())
