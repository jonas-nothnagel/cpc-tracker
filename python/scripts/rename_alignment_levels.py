"""One-shot migration: rename old contradiction-level enum strings to the
new cautious vocabulary across stored pipeline JSON outputs.

Old keys ↦ new keys:
  low_tension              ↦ possible_misalignment
  moderate_contradiction   ↦ possible_conflict
  high_contradiction       ↦ likely_conflict

The new vocabulary frames the negative side of the alignment scale as
flagged-for-review rather than certain contradictions (see CLAUDE.md
guardrail).

What this touches:
- Each `alignment` / `measure_alignment` / `budget_alignment` record's
  `alignment` field (value string).
- `status.json`'s `summary.alignmentLevels` dict keys.

What this NEVER touches:
- Free-text fields (`description`, rationale, etc.) — LLM-generated rationales
  legitimately contain the words "tension" and "contradiction"; rewriting them
  would corrupt the data.

Usage:
    python -m scripts.rename_alignment_levels --dry-run
    python -m scripts.rename_alignment_levels

By default scans:
    python/output/*/alignment.json
    python/output/*/measure_alignment.json
    python/output/*/budget_alignment.json
    python/output/*/status.json
    python/analyses/*/output/alignment.json
    python/analyses/*/output/measure_alignment.json
    python/analyses/*/output/budget_alignment.json
    python/analyses/*/output/status.json

Idempotent: detects already-migrated files by looking for any new key in the
data and skips them with a log message.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any

LEVEL_RENAME: dict[str, str] = {
    "low_tension": "possible_misalignment",
    "moderate_contradiction": "possible_conflict",
    "high_contradiction": "likely_conflict",
}
NEW_LEVELS: set[str] = set(LEVEL_RENAME.values())

logger = logging.getLogger("rename_alignment_levels")


def default_paths(repo_root: Path) -> list[Path]:
    """Default file scope: pipeline outputs for both committed countries plus
    any per-session analyses dirs (historical upload-flow artifacts)."""
    out: list[Path] = []
    output_root = repo_root / "python" / "output"
    if output_root.is_dir():
        for country_dir in sorted(output_root.iterdir()):
            if country_dir.is_dir():
                out.extend(country_dir.glob("alignment.json"))
                out.extend(country_dir.glob("measure_alignment.json"))
                out.extend(country_dir.glob("budget_alignment.json"))
                out.extend(country_dir.glob("status.json"))

    analyses_root = repo_root / "python" / "analyses"
    if analyses_root.is_dir():
        for analysis_dir in sorted(analyses_root.iterdir()):
            if not analysis_dir.is_dir():
                continue
            out_dir = analysis_dir / "output"
            if not out_dir.is_dir():
                continue
            out.extend(out_dir.glob("alignment.json"))
            out.extend(out_dir.glob("measure_alignment.json"))
            out.extend(out_dir.glob("budget_alignment.json"))
            out.extend(out_dir.glob("status.json"))
    return out


def migrate_alignment_records(records: list[dict[str, Any]]) -> int:
    """Mutate alignment-shape records (each having an `alignment` value string).
    Returns count of values renamed."""
    count = 0
    for r in records:
        level = r.get("alignment")
        if isinstance(level, str) and level in LEVEL_RENAME:
            r["alignment"] = LEVEL_RENAME[level]
            count += 1
    return count


def migrate_status(status_obj: dict[str, Any]) -> int:
    """Rebuild `summary.alignmentLevels` dict with renamed keys. Preserves counts."""
    summary = status_obj.get("summary")
    if not isinstance(summary, dict):
        return 0
    levels = summary.get("alignmentLevels")
    if not isinstance(levels, dict):
        return 0
    new_levels: dict[str, int] = {}
    count = 0
    for k, v in levels.items():
        if k in LEVEL_RENAME:
            new_levels[LEVEL_RENAME[k]] = v
            count += 1
        else:
            new_levels[k] = v
    summary["alignmentLevels"] = new_levels
    return count


def is_already_migrated(path: Path, obj: Any) -> bool:
    """Detect files where any new-vocabulary key is already present, so we
    don't double-rewrite."""
    if path.name == "status.json":
        if not isinstance(obj, dict):
            return False
        summary = obj.get("summary")
        if not isinstance(summary, dict):
            return False
        levels = summary.get("alignmentLevels")
        if not isinstance(levels, dict):
            return False
        return any(k in NEW_LEVELS for k in levels)
    if isinstance(obj, list) and obj:
        sample = obj[0]
        if isinstance(sample, dict):
            return sample.get("alignment") in NEW_LEVELS
    return False


def write_atomic(path: Path, obj: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def process_file(path: Path, *, dry_run: bool) -> tuple[bool, int]:
    """Returns (touched, renamed_count). `touched` is False if skipped."""
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("  skip (unreadable JSON): %s — %s", path, exc)
        return False, 0

    if is_already_migrated(path, obj):
        logger.info("  skip (already migrated): %s", path)
        return False, 0

    if path.name == "status.json":
        count = migrate_status(obj)
    elif isinstance(obj, list):
        count = migrate_alignment_records(obj)
    else:
        logger.warning("  skip (unexpected shape): %s", path)
        return False, 0

    if count == 0:
        logger.info("  no renames needed: %s", path)
        return False, 0

    if dry_run:
        logger.info("  [dry-run] would rename %d entries in %s", count, path)
    else:
        write_atomic(path, obj)
        logger.info("  renamed %d entries in %s", count, path)
    return True, count


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else "")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without writing.",
    )
    parser.add_argument(
        "--paths",
        nargs="+",
        type=Path,
        help="Explicit file paths to process (overrides default scan).",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    repo_root = Path(__file__).resolve().parents[2]
    paths = list(args.paths) if args.paths else default_paths(repo_root)

    if not paths:
        logger.error("No files matched. Pass --paths or check that python/output exists.")
        return 1

    logger.info(
        "Scanning %d file(s) (mode: %s)",
        len(paths),
        "dry-run" if args.dry_run else "write",
    )

    touched_files = 0
    total_renamed = 0
    for path in paths:
        if not path.is_file():
            logger.warning("  skip (missing): %s", path)
            continue
        ok, n = process_file(path, dry_run=args.dry_run)
        if ok:
            touched_files += 1
            total_renamed += n

    logger.info(
        "Done: %s %d entries across %d file(s).",
        "would rename" if args.dry_run else "renamed",
        total_renamed,
        touched_files,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
