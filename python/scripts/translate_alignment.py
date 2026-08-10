"""
Pair-rationale translation — English → a per-locale sparse overlay.

WHY: every scored pair carries a `description` explaining its verdict, and the
pair drawer renders it. Panama has 66,554 across the three alignment files
(policy-to-policy, BTR, BER), all in English, shown inside an otherwise-Spanish
page. The focal-group report (23 Jul 2026) asked for "linguistic consistency in
the Spanish version by correcting content that is still in English"; the
rationales are the largest remaining piece after the target text itself.

WHY AN OVERLAY, NOT A TRANSLATED COPY: `alignment.json` is ~28 MB for Panama.
A full translated twin would double that on disk and in the image for a file
whose non-prose fields are already known. Instead this writes
`alignment.<locale>.json`:

    {
      "_meta": {...},
      "descriptions": { "targetAId::targetBId": "…", ... }
    }

The frontend merges it onto the records it already has. A pair missing from the
map keeps its English rationale, which is what makes the partial pass below safe.

WHY PARTIAL: by default only the analytically salient verdicts are translated —
`high`, `low`, and `flagged`. For Panama that is 25,271 of 66,554 rationales.
`medium` is the bulk and is the least likely to be opened. Pass
`--levels all` to do everything. Whatever is skipped falls back to English
behind a visible "translation pending" note in the pair drawer, so the gap is
disclosed rather than silent.

Reuses the prompt, locale vocabulary rules, disk cache, and numeric-drift check
from `translate_snapshots.py`, so both passes translate identically and a re-run
with unchanged input is free.

Invocation (run from the `python/` directory):

    cd python && uv run python -m scripts.translate_alignment --country panama --locale es

    # prove the wiring on a handful of pairs before committing to a full run
    cd python && uv run python -m scripts.translate_alignment \
        --country panama --locale es --limit 5 --dry-run

Requirements:
    - `OPENROUTER_API_KEY` (or `LLM_API_KEY`) in the project-root `.env`
    - `python/output/{country}/{alignment,measure_alignment,budget_alignment}.json`
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .translate_snapshots import (
    LOCALES,
    OUTPUT_DIR,
    TRANSLATION_MODEL,
    TRANSLATION_TEMPERATURE,
    USER_TEMPLATE,
    build_system_prompt,
    diff_numbers,
    translate_strings,
)

logger = logging.getLogger(__name__)

#: Verdicts whose rationale is translated by default. `medium` is excluded: it
#: is the bulk of the corpus and the least-opened drawer. `none` carries no
#: finding worth reading in either language.
DEFAULT_LEVELS = ("high", "low", "flagged")

#: Every file carrying pairwise rationales. All three share the same record
#: shape (targetAId / targetBId / alignment / description), and all three are
#: rendered by the same pair drawer — translating only the policy-to-policy one
#: would leave the BTR and BER drawers in English with nothing to explain why.
ALIGNMENT_FILES = ("alignment.json", "measure_alignment.json", "budget_alignment.json")

#: Key for a pair in the overlay. Mirrors the `A::B` convention already used by
#: the ratings ledger and `computeModelAgreement`, so both sides agree on
#: identity without a second scheme.
def pair_key(record: dict[str, Any]) -> str:
    return f"{record.get('targetAId')}::{record.get('targetBId')}"


def select_records(
    records: list[dict[str, Any]], levels: tuple[str, ...] | None
) -> list[dict[str, Any]]:
    """Records with a non-empty rationale whose verdict is in `levels`.

    `levels is None` means every verdict (`--levels all`).
    """
    out = []
    for r in records:
        description = r.get("description")
        if not isinstance(description, str) or not description.strip():
            continue
        if levels is not None and r.get("alignment") not in levels:
            continue
        out.append(r)
    return out


async def process_file(
    country: str,
    filename: str,
    locale: str,
    levels: tuple[str, ...] | None,
    limit: int | None,
    dry_run: bool,
) -> None:

    country_dir = OUTPUT_DIR / country
    src_path = country_dir / filename
    if not src_path.exists():
        logger.warning(f"  {filename}: not found in {country_dir}; skipping.")
        return

    records = json.loads(src_path.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise SystemExit(f"{src_path} is not a list of alignment records.")

    selected = select_records(records, levels)
    total_selected = len(selected)
    if limit is not None:
        selected = selected[:limit]

    by_level: dict[str, int] = {}
    for r in selected:
        by_level[str(r.get("alignment"))] = by_level.get(str(r.get("alignment")), 0) + 1

    logger.info(
        f"{filename} → {locale}: {len(selected)} of {len(records)} rationales selected "
        f"({total_selected} match the level filter) — {by_level}"
    )
    if dry_run:
        logger.info("Dry run: nothing translated, nothing written.")
        for r in selected[:3]:
            logger.info(f"  would translate {pair_key(r)}: {r['description'][:90]}…")
        return

    cache_namespace = f"alignment_translation_{locale}"
    sources = [r["description"] for r in selected]
    translations = await translate_strings(
        sources, locale, cache_namespace, desc=f"Translate rationales → {locale}"
    )

    descriptions: dict[str, str] = {}
    drift_flags: list[dict[str, Any]] = []
    empty_fallbacks = 0
    for record, source, translated in zip(selected, sources, translations, strict=True):
        text = (translated or "").strip()
        if not text:
            # Omit rather than store the English: an absent key already means
            # "falls back to English", so the reader sees the same string either
            # way and the count stays honest about what was translated.
            empty_fallbacks += 1
            continue
        key = pair_key(record)
        descriptions[key] = text
        for issue in diff_numbers(source, text):
            drift_flags.append({"pair": key, "issue": issue})

    payload = {
        "_meta": {
            "country": country,
            "sourceFile": filename,
            "locale": locale,
            "targetLanguage": LOCALES[locale]["name"],
            "model": TRANSLATION_MODEL,
            "temperature": TRANSLATION_TEMPERATURE,
            "promptSystem": build_system_prompt(locale),
            "promptUserTemplate": USER_TEMPLATE,
            "runDate": datetime.now(timezone.utc).isoformat(),
            "cacheNamespace": cache_namespace,
            "levelsTranslated": list(levels) if levels else "all",
            "sourceRecords": len(records),
            "selected": len(selected),
            "translated": len(descriptions),
            "emptyFallbacks": empty_fallbacks,
            "numericDriftFlags": drift_flags,
        },
        "descriptions": descriptions,
    }

    out_path = country_dir / filename.replace(".json", f".{locale}.json")
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    size_mb = out_path.stat().st_size / 1_000_000
    logger.info(
        f"Wrote {out_path.name}: {len(descriptions)} rationales, {size_mb:.1f} MB, "
        f"{len(drift_flags)} numeric-drift flag(s), {empty_fallbacks} empty fallback(s)."
    )


async def amain(
    country: str,
    locale: str,
    levels: tuple[str, ...] | None,
    limit: int | None,
    dry_run: bool,
    files: tuple[str, ...],
) -> None:
    if locale not in LOCALES:
        raise SystemExit(f"Unsupported locale '{locale}'. Choose from {list(LOCALES)}.")
    if not (OUTPUT_DIR / country).is_dir():
        raise SystemExit(
            f"Country output dir not found: {OUTPUT_DIR / country}. "
            f"Run the pipeline for '{country}' first."
        )
    for filename in files:
        await process_file(country, filename, locale, levels, limit, dry_run)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(
        description="Translate alignment pair rationales into a target locale."
    )
    parser.add_argument("--country", required=True, help="e.g. panama")
    parser.add_argument("--locale", required=True, choices=sorted(LOCALES))
    parser.add_argument(
        "--levels",
        default=",".join(DEFAULT_LEVELS),
        help=(
            "Comma-separated alignment levels to translate, or 'all'. "
            f"Default: {','.join(DEFAULT_LEVELS)} (skips the bulk 'medium' tier)."
        ),
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Translate at most N rationales. For proving the wiring cheaply.",
    )
    parser.add_argument(
        "--files",
        default=",".join(ALIGNMENT_FILES),
        help=(
            "Comma-separated rationale files to translate. "
            f"Default: {','.join(ALIGNMENT_FILES)}."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be translated and exit without calling the model.",
    )
    args = parser.parse_args()
    levels = None if args.levels.strip() == "all" else tuple(
        s.strip() for s in args.levels.split(",") if s.strip()
    )
    files = tuple(f.strip() for f in args.files.split(",") if f.strip())
    asyncio.run(
        amain(args.country, args.locale, levels, args.limit, args.dry_run, files)
    )


if __name__ == "__main__":
    main()
