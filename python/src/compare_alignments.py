"""Read-only v1-vs-v2 alignment comparison.

Loads the v1 baseline from a git ref (default `main`) and the v2 from the
working tree, then emits a markdown report:
  - per-record alignment flips (v1 -> v2)
  - mechanism reassignments via the legacy migration table
  - distribution summary for both versions

Usage:
    python -m src.compare_alignments [--baseline-ref main] [--country mongolia]
    python -m src.compare_alignments --country panama > docs/v2-comparison-panama.md
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from .alignment_schema import migrate_legacy_record


def load_json_from_git(ref: str, repo_path: str) -> list[dict[str, Any]] | None:
    """Read JSON at `repo_path` from a git ref. Returns None if the file does not exist at that ref."""
    try:
        out = subprocess.check_output(
            ["git", "show", f"{ref}:{repo_path}"], stderr=subprocess.STDOUT
        )
    except subprocess.CalledProcessError:
        return None
    return json.loads(out)


def load_json_from_disk(path: Path) -> list[dict[str, Any]] | None:
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def index_by_pair(records: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    idx: dict[tuple[str, str], dict[str, Any]] = {}
    for r in records:
        key = tuple(sorted([r.get("targetAId", ""), r.get("targetBId", "")]))
        idx[key] = r
    return idx


def fmt_v1(r: dict[str, Any]) -> str:
    if r is None:
        return "(missing)"
    bits = [r.get("alignment", "?")]
    if r.get("contradictionType"):
        bits.append(f"({r['contradictionType']})")
    return " ".join(bits)


def fmt_v2(r: dict[str, Any]) -> str:
    if r is None:
        return "(missing)"
    bits = [r.get("alignment", "?")]
    if r.get("alignment") == "flagged":
        sub = [
            r.get("mechanism", "?"),
            r.get("manageability", "?"),
            f"conf:{r.get('confidence', '?')}",
        ]
        bits.append(f"({', '.join(sub)})")
    return " ".join(bits)


def distribution_block(label: str, records: list[dict[str, Any]]) -> str:
    total = len(records)
    counts = Counter(r.get("alignment") for r in records)
    lines = [f"### {label} (n={total})"]
    for lvl, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        pct = (n / total * 100) if total else 0.0
        lines.append(f"  {lvl!s:<25} {n:>6}  {pct:5.1f}%")
    return "\n".join(lines)


def diff_pairs(
    v1_idx: dict[tuple[str, str], dict[str, Any]],
    v2_idx: dict[tuple[str, str], dict[str, Any]],
) -> tuple[list[tuple], list[tuple], list[tuple]]:
    """Categorise pairs as:
    - flipped: v1 flagged ↔ v2 not flagged (either direction)
    - mechanism_changed: both flagged but mechanism reassigned (post-migration comparison)
    - same: same status on both sides
    """
    flipped: list[tuple] = []
    mechanism_changed: list[tuple] = []
    same: list[tuple] = []
    all_keys = set(v1_idx) | set(v2_idx)

    for key in sorted(all_keys):
        r1 = v1_idx.get(key)
        r2 = v2_idx.get(key)

        r1_flagged = (
            r1 is not None
            and r1.get("alignment")
            in ("flagged", "possible_misalignment", "possible_conflict", "likely_conflict")
        )
        r2_flagged = r2 is not None and r2.get("alignment") == "flagged"

        if r1_flagged != r2_flagged:
            flipped.append((key, r1, r2))
        elif r1_flagged and r2_flagged:
            # Both flagged — check mechanism reassignment via migration table
            r1_migrated = migrate_legacy_record(r1) if r1 else r1
            if (r1_migrated or {}).get("mechanism") != (r2 or {}).get("mechanism"):
                mechanism_changed.append((key, r1, r2))
            else:
                same.append((key, r1, r2))
        else:
            same.append((key, r1, r2))
    return flipped, mechanism_changed, same


def main() -> int:
    ap = argparse.ArgumentParser(description="Compare v1 (git baseline) vs v2 (working tree) alignment outputs")
    ap.add_argument("--baseline-ref", default="main", help="git ref for v1 baseline (default: main)")
    ap.add_argument("--country", required=True, help="country slug, e.g. mongolia or panama")
    ap.add_argument("--max-rows", type=int, default=30, help="max rows per diff table")
    args = ap.parse_args()

    # Resolve repo root via git so the script works from any CWD
    try:
        repo_root = Path(
            subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
        )
    except subprocess.CalledProcessError:
        sys.exit("error: not in a git repository")

    rel_path = f"python/output/{args.country}/alignment.json"
    v1_records = load_json_from_git(args.baseline_ref, rel_path)
    if v1_records is None:
        sys.exit(f"error: could not find {rel_path} at {args.baseline_ref}")
    v2_records = load_json_from_disk(repo_root / rel_path)
    if v2_records is None:
        sys.exit(f"error: working-tree {rel_path} not found")

    v1_idx = index_by_pair(v1_records)
    v2_idx = index_by_pair(v2_records)

    flipped, mech_changed, same = diff_pairs(v1_idx, v2_idx)

    print(f"# v1 vs v2 alignment comparison — {args.country}")
    print()
    print(f"- v1 baseline: `{args.baseline_ref}:{rel_path}`")
    print(f"- v2 working tree: `{rel_path}`")
    print()

    print(distribution_block("v1 distribution", v1_records))
    print()
    print(distribution_block("v2 distribution", v2_records))
    print()

    print(f"## Pair-level changes")
    print(f"- Flagged status flipped (v1 flagged ↔ v2 not, or vice versa): **{len(flipped)}**")
    print(f"- Both flagged but mechanism reassigned: **{len(mech_changed)}**")
    print(f"- Same status on both sides: **{len(same)}**")
    print()

    if flipped:
        print(f"### Sample flipped pairs (first {min(args.max_rows, len(flipped))} of {len(flipped)})")
        print()
        print("| targetA | targetB | v1 | v2 |")
        print("|---|---|---|---|")
        for key, r1, r2 in flipped[: args.max_rows]:
            a, b = key
            print(f"| {a} | {b} | {fmt_v1(r1)} | {fmt_v2(r2)} |")
        print()

    if mech_changed:
        print(f"### Mechanism reassignments (first {min(args.max_rows, len(mech_changed))} of {len(mech_changed)})")
        print()
        print("| targetA | targetB | v1 (post-migration) | v2 |")
        print("|---|---|---|---|")
        for key, r1, r2 in mech_changed[: args.max_rows]:
            a, b = key
            r1_mig = migrate_legacy_record(r1) if r1 else None
            print(f"| {a} | {b} | {fmt_v2(r1_mig)} | {fmt_v2(r2)} |")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
