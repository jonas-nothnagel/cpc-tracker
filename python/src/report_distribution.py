"""Read-only distribution report for an alignment.json file.

Loads a pipeline alignment output and prints counts/percentages by alignment,
mechanism, manageability, and confidence. Flags any field where one value
covers >95% of records — that's the "severity collapse" failure mode the v2.1
redesign is meant to prevent.

Usage:
    python -m src.report_distribution path/to/alignment.json [--country mongolia]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any


COLLAPSE_THRESHOLD = 0.95  # surface a regression flag if any field >95% one value


def load_records(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        sys.exit(f"error: file not found: {path}")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        sys.exit(f"error: expected a JSON list in {path}, got {type(data).__name__}")
    return data


def percentage(n: int, total: int) -> str:
    if total == 0:
        return "0.0%"
    return f"{(n / total) * 100:.1f}%"


def render_distribution(label: str, counter: Counter, total: int) -> str:
    if not counter:
        return f"## {label}\n  (no records)\n"

    rows = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0] or ""))
    lines = [f"## {label}"]
    top_key, top_n = rows[0]
    top_share = top_n / total if total else 0.0
    flag = ""
    if top_share > COLLAPSE_THRESHOLD:
        flag = f"  COLLAPSE-FLAG: {top_share:.1%} of records have a single value ({top_key!r})"

    for key, n in rows:
        key_str = repr(key) if key is None else key
        lines.append(f"  {key_str:<30} {n:>6}  {percentage(n, total)}")
    if flag:
        lines.append(flag)
    return "\n".join(lines) + "\n"


def doc_pair_counts(records: list[dict[str, Any]]) -> Counter:
    """Top doc-pair pairings by flagged count."""
    counter: Counter = Counter()
    for r in records:
        if r.get("alignment") != "flagged":
            continue
        a = (r.get("targetAId") or "?").split("_")[0]
        b = (r.get("targetBId") or "?").split("_")[0]
        pair = tuple(sorted([a, b]))
        counter[pair] += 1
    return counter


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Print alignment.json distribution + regression flags",
    )
    ap.add_argument(
        "path",
        type=Path,
        help="path to alignment.json (or measure_alignment.json, etc.)",
    )
    ap.add_argument(
        "--country",
        default="",
        help="optional country label for the report header",
    )
    args = ap.parse_args()

    records = load_records(args.path)
    total = len(records)
    flagged = [r for r in records if r.get("alignment") == "flagged"]
    n_flagged = len(flagged)

    header = f"Distribution report: {args.path}"
    if args.country:
        header += f"  ({args.country})"
    print(header)
    print("=" * len(header))
    print(f"Total records: {total}")
    print(f"Flagged for review: {n_flagged}  ({percentage(n_flagged, total)})")
    print()

    print(
        render_distribution(
            "Alignment level (all records)",
            Counter(r.get("alignment") for r in records),
            total,
        )
    )

    if n_flagged:
        print(
            render_distribution(
                "Mechanism (within flagged)",
                Counter(r.get("mechanism") for r in flagged),
                n_flagged,
            )
        )
        print(
            render_distribution(
                "Manageability (within flagged)",
                Counter(r.get("manageability") for r in flagged),
                n_flagged,
            )
        )
        print(
            render_distribution(
                "Confidence (within flagged)",
                Counter(r.get("confidence") for r in flagged),
                n_flagged,
            )
        )

        dp = doc_pair_counts(records)
        if dp:
            top5 = dp.most_common(5)
            print("## Top 5 doc-pair pairings by flagged count")
            for (a, b), n in top5:
                print(f"  {a:<8} <-> {b:<8} {n:>6}")
            print()

    # Exit non-zero if any field collapsed, so the script can gate a CI step
    any_collapse = False
    for field in ("alignment",):
        counter = Counter(r.get(field) for r in records)
        if counter and total:
            top_n = max(counter.values())
            if top_n / total > COLLAPSE_THRESHOLD:
                any_collapse = True
    if n_flagged:
        for field in ("mechanism", "manageability", "confidence"):
            counter = Counter(r.get(field) for r in flagged)
            if counter and n_flagged:
                top_n = max(counter.values())
                if top_n / n_flagged > COLLAPSE_THRESHOLD:
                    any_collapse = True

    if any_collapse:
        print("WARNING: at least one field collapsed past the >95% threshold.")
        print("         Inspect the v2.1 prompt or rerun before frontend rollout.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
