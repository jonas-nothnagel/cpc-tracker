"""Surgically re-run STEP 8's doc-pair + corpus theme synthesis for committed
outputs WITHOUT re-running extraction, decomposition, classification, or
alignment (never re-run those from here; they are the expensive steps and
their caches must stay warm).

Modeled on rerun_sector_synthesis_gga.py. For each country it:

1. Re-runs `synthesize_doc_pairs` over the committed alignment + targets and
   overwrites `python/output/{country}/doc_pair_synthesis.json`.
2. Re-runs `synthesize_corpus` for every visibility state and writes
   `corpus_themes.json` WITH a `states` map (the bare `python -m
   src.synthesize_corpus` CLI writes the file WITHOUT states; only
   run_analysis / this script write the full shape). State keys are the union
   of the extended `precompute_hidden_states` set (full corpus + every
   single-doc-hidden state + default-hidden states + the briefing-default
   combo) and whatever keys the committed file already holds, so existing
   states (e.g. Panama's "ENR") are preserved and Mongolia's legacy no-states
   shape is normalized.
3. Leaves `sector_synthesis.json` untouched.

Localized siblings (corpus_themes.es.json etc.) are NOT written here; re-run
`scripts.translate_snapshots` afterwards.

    cd python
    # single country (do Sri Lanka first and read every theme before the rest):
    LLM_CONCURRENCY=4 uv run python -m scripts.rerun_synthesis --targets-file sri-lanka-targets.json
    # all four countries:
    LLM_CONCURRENCY=4 uv run python -m scripts.rerun_synthesis

Runs with the pipeline language set to "en" so cache keys match what
`run_analysis --language en` produces.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import DATA_DIR, OUTPUT_DIR, country_display_name  # noqa: E402
from src.llm import set_language  # noqa: E402
from src.synthesis_states import (  # noqa: E402
    canonical_hidden_key,
    filter_doc_pair_records,
    filter_targets_alignment,
    precompute_hidden_states,
)
from src.synthesize_corpus import synthesize_corpus  # noqa: E402
from src.synthesize_doc_pairs import synthesize_doc_pairs  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("rerun_synthesis")

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


# Mirrors PREFERRED_DEFAULT_SLUGS in src/lib/dashboard-data.ts: the model dir
# the dashboard shows by default when a country has per-model outputs.
PREFERRED_MODEL_SLUGS = ["gpt-5-4", "gpt-5-5"]


def resolve_out_dir(stem: str) -> Path | None:
    """Flat layout, or the dashboard-default model subdir (Mongolia)."""
    base = OUTPUT_DIR / stem
    if (base / "alignment.json").exists():
        return base
    if not base.exists():
        return None
    candidates = sorted(
        p for p in base.iterdir()
        if p.is_dir() and (p / "alignment.json").exists()
    )
    for slug in PREFERRED_MODEL_SLUGS:
        for path in candidates:
            if path.name == slug:
                return path
    return candidates[0] if candidates else None


async def rerun_country(targets_file: str) -> None:
    stem = stem_for(targets_file)
    out_dir = resolve_out_dir(stem)
    if out_dir is None:
        logger.warning(f"[{stem}] no alignment.json under {OUTPUT_DIR / stem} — skipping")
        return

    targets = _load(DATA_DIR / targets_file)
    alignment = _load(out_dir / "alignment.json")
    classifications = _load(out_dir / "classifications.json")
    if targets is None or alignment is None:
        logger.warning(f"[{stem}] missing targets/alignment — skipping")
        return

    config = _load(DATA_DIR / f"{stem}-country-config.json") or {}
    # Shared resolver (config name, else title-cased slug) — the same value
    # run_analysis embeds in the corpus-synthesis prompts.
    country_name = country_display_name(stem)
    doc_type_labels = {
        dt["id"]: dt.get("mediumLabel") or dt.get("shortLabel") or dt["id"]
        for dt in config.get("documentTypes", [])
    }
    default_hidden = list(config.get("defaultHiddenDocTypes", []) or [])
    secondary = list(config.get("secondaryDocTypes", []) or [])

    logger.info(
        f"[{stem}] {len(targets)} targets, {len(alignment)} alignment records, "
        f"{len(doc_type_labels)} doc-type labels"
    )

    # 1. Doc-pair synthesis over the full corpus (flat array; the frontend
    # filters it live, so it needs no per-state precompute).
    doc_pair_records = await synthesize_doc_pairs(targets, alignment, doc_type_labels)
    doc_pair_path = out_dir / "doc_pair_synthesis.json"
    doc_pair_path.write_text(
        json.dumps(doc_pair_records, indent=2, ensure_ascii=False)
    )
    logger.info(f"[{stem}] wrote {len(doc_pair_records)} doc-pair syntheses")

    # 2. Corpus themes for every state: extended precompute set + whatever
    # keys the committed file already holds.
    all_doc_types = sorted({t["sourceDocument"] for t in targets})
    state_keys = [
        canonical_hidden_key(s)
        for s in precompute_hidden_states(
            default_hidden,
            all_doc_types=all_doc_types,
            secondary_doc_types=secondary,
        )
    ]
    existing = _load(out_dir / "corpus_themes.json") or {}
    for key in (existing.get("states") or {}).keys():
        if key not in state_keys:
            state_keys.append(key)

    logger.info(
        f"[{stem}] corpus states to compute: "
        f"{[k or '(full)' for k in state_keys]}"
    )

    corpus_states: dict[str, dict] = {}
    for key in state_keys:
        hidden = {h for h in key.split("+") if h}
        state_targets, state_alignment = filter_targets_alignment(
            targets, alignment, hidden
        )
        state_doc_pairs = filter_doc_pair_records(doc_pair_records, hidden)
        corpus_states[key] = await synthesize_corpus(
            state_doc_pairs, country_name,
            targets=state_targets, alignment=state_alignment,
            classifications=classifications,
        )
        logger.info(
            f"[{stem}] state '{key or 'full'}': "
            f"{len(corpus_states[key].get('storylines', []) or [])} themes, "
            f"{len(corpus_states[key].get('validation_warnings', []) or [])} warnings"
        )

    # Same payload shape as run_analysis STEP 8: legacy full-corpus fields at
    # the top level plus the states map.
    corpus_payload = {**corpus_states.get("", {}), "states": corpus_states}
    out_path = out_dir / "corpus_themes.json"
    out_path.write_text(json.dumps(corpus_payload, indent=2, ensure_ascii=False))
    logger.info(
        f"[{stem}] wrote corpus themes ({len(corpus_states)} states) to {out_path}"
    )


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Re-run doc-pair + corpus synthesis (STEP 8) surgically"
    )
    parser.add_argument(
        "--targets-file", default=None, help="single country; default = all 4"
    )
    args = parser.parse_args()
    set_language("en")

    files = [args.targets_file] if args.targets_file else DEFAULT_TARGETS
    for tf in files:
        await rerun_country(tf)


if __name__ == "__main__":
    asyncio.run(main())
