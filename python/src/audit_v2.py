"""Read-only credibility audit utilities for v2.1 alignment output.

Two tools:

  coherence-check
    Walks every flagged record and applies mechanical heuristics that flag
    likely self-contradictions. Useful as a fast sweep before reading the
    sampled cases by hand.

      python -m src.audit_v2 coherence --country mongolia
      python -m src.audit_v2 coherence --country panama

  sample
    Emits a stratified case-file bundle covering all
    mechanism × manageability × confidence cells, weighted toward the
    high-stakes cells (Fundamental, High-confidence). Each case file
    contains both target texts, the v2 description and labels, the v1 record
    (if any), and decompositions. Reviewers read these cases and judge
    credibility against the source policy text.

      python -m src.audit_v2 sample --country mongolia --n 20 > cases.md
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]


def load_alignment(country: str) -> list[dict[str, Any]]:
    path = REPO_ROOT / "python" / "output" / country / "alignment.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_v1_alignment(country: str) -> dict[tuple[str, str], dict[str, Any]]:
    """Read the v1 baseline from `main` via git."""
    rel = f"python/output/{country}/alignment.json"
    try:
        out = subprocess.check_output(
            ["git", "show", f"main:{rel}"], cwd=REPO_ROOT, stderr=subprocess.DEVNULL
        )
        records = json.loads(out)
    except subprocess.CalledProcessError:
        return {}
    return {
        tuple(sorted([r.get("targetAId", ""), r.get("targetBId", "")])): r
        for r in records
    }


def load_targets(country: str) -> dict[str, dict[str, Any]]:
    path = REPO_ROOT / "python" / "data" / f"{country}-targets.json"
    with open(path, encoding="utf-8") as f:
        return {t["id"]: t for t in json.load(f)}


def load_decompositions(country: str) -> dict[str, str]:
    path = REPO_ROOT / "python" / "output" / country / "decompositions.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Coherence heuristics
# ---------------------------------------------------------------------------

# Words that, if present in the description, suggest a real "shared finite
# resource" claim. Used to spot resource_competition records whose description
# does not actually point at a shared resource.
RESOURCE_KEYWORDS = {
    "water", "land", "soil", "budget", "grazing", "pasture", "headcount",
    "forest", "land base", "watershed", "river", "basin", "rangeland",
    "capacity", "carrying capacity", "emissions budget", "finite", "limited",
    "competition", "compete", "competing", "scarce", "scarcity",
}

# Words that, if present in the description, suggest "stated objectives
# contradict each other" — the goal_conflict signal.
GOAL_CONFLICT_KEYWORDS = {
    "opposing", "contradict", "contradicts", "contradiction", "incompatible",
    "directly oppose", "opposing objectives", "opposing intent",
    "cannot both", "cannot be both", "either/or",
}

# Words that, if present in the description, suggest delivery / coordination
# friction — implementation-level rather than goal-level.
DELIVERY_KEYWORDS = {
    "coordinat", "safeguard", "siting", "sequenc", "zoning", "spatial planning",
    "implementation", "delivery", "operational", "pressure", "intensify",
    "indirect", "downstream",
}

# Hedge words: a "high" confidence call shouldn't lean on too many of these.
HEDGE_WORDS = {
    "may", "might", "could", "potentially", "possibly", "uncertain",
    "appears to", "seems to", "broadly", "loosely",
}

# Words that mean "needs target redesign" (Fundamental signal).
FUNDAMENTAL_KEYWORDS = {
    "revising", "revise", "redesign", "modify", "modification",
    "cannot both be", "cannot be reconciled", "would need to drop",
    "in the targets themselves", "as written",
    "drop", "dropped", "abandon", "rewrite",
}

# Words that mean "coordination is enough" (Manageable signal).
MANAGEABLE_KEYWORDS = {
    "coordinated", "coordination", "safeguard", "sequenced", "zoning",
    "spatial planning", "could keep both", "could coexist",
    "manageable", "compatible if", "compatible with", "manageable trade-off",
}


def count_matches(text: str, keywords: set[str]) -> int:
    text_lower = text.lower()
    return sum(1 for kw in keywords if kw in text_lower)


def coherence_findings(record: dict[str, Any]) -> list[str]:
    """Return a list of human-readable warnings for this record. Empty = clean."""
    if record.get("alignment") != "flagged":
        return []
    desc = (record.get("description") or "").lower()
    mechanism = record.get("mechanism")
    manageability = record.get("manageability")
    confidence = record.get("confidence")
    out: list[str] = []

    # Mechanism vs description content
    if mechanism == "resource_competition":
        if count_matches(desc, RESOURCE_KEYWORDS) == 0:
            out.append("mechanism=resource_competition but no resource keywords in description")
    elif mechanism == "goal_conflict":
        if (
            count_matches(desc, GOAL_CONFLICT_KEYWORDS) == 0
            and count_matches(desc, FUNDAMENTAL_KEYWORDS) == 0
        ):
            out.append(
                "mechanism=goal_conflict but description does not assert opposition or target redesign"
            )
    elif mechanism == "delivery_friction":
        if count_matches(desc, DELIVERY_KEYWORDS) == 0:
            out.append("mechanism=delivery_friction but no delivery-language in description")

    # Manageability vs description
    if manageability == "fundamental":
        if count_matches(desc, FUNDAMENTAL_KEYWORDS) == 0:
            out.append(
                "manageability=fundamental but description does not call out target redesign needs"
            )
        if count_matches(desc, MANAGEABLE_KEYWORDS) >= 2:
            out.append(
                "manageability=fundamental but description leans on coordination language"
            )

    # Confidence vs hedging
    hedge_count = count_matches(desc, HEDGE_WORDS)
    if confidence == "high" and hedge_count >= 3:
        out.append(f"confidence=high but description has {hedge_count} hedge words")
    if confidence == "low" and hedge_count == 0:
        out.append("confidence=low but description has no hedge language")

    return out


def cmd_coherence(country: str) -> int:
    records = load_alignment(country)
    flagged = [r for r in records if r.get("alignment") == "flagged"]
    total = len(flagged)

    issue_counts: Counter = Counter()
    inconsistent_records: list[tuple[dict[str, Any], list[str]]] = []
    for r in flagged:
        warnings = coherence_findings(r)
        if warnings:
            inconsistent_records.append((r, warnings))
            for w in warnings:
                # Coarse bucket = first phrase before "but"
                bucket = w.split(" but ", 1)[0]
                issue_counts[bucket] += 1

    print(f"# Coherence audit, {country}")
    print()
    print(f"- Flagged records audited: **{total}**")
    print(f"- Records with at least one issue: **{len(inconsistent_records)} ({len(inconsistent_records) / max(total, 1) * 100:.1f}%)**")
    print(f"- Records clean: **{total - len(inconsistent_records)} ({(total - len(inconsistent_records)) / max(total, 1) * 100:.1f}%)**")
    print()
    print("## Issue type frequencies")
    for issue, n in issue_counts.most_common():
        print(f"- `{issue}` — {n}")
    print()
    print("## First 15 inconsistent records")
    for r, warnings in inconsistent_records[:15]:
        a = r.get("targetAId", "?")
        b = r.get("targetBId", "?")
        m = r.get("mechanism", "?")
        mg = r.get("manageability", "?")
        c = r.get("confidence", "?")
        desc = (r.get("description") or "")[:200].replace("\n", " ")
        print(f"\n### {a} ↔ {b}  [{m}, {mg}, conf:{c}]")
        for w in warnings:
            print(f"- WARN: {w}")
        print(f"- desc: {desc}…")
    return 0


# ---------------------------------------------------------------------------
# Stratified sampler
# ---------------------------------------------------------------------------

def cmd_sample(country: str, n: int) -> int:
    records = load_alignment(country)
    flagged = [r for r in records if r.get("alignment") == "flagged"]
    targets = load_targets(country)
    decomps = load_decompositions(country)
    v1_index = load_v1_alignment(country)

    # Stratify by (mechanism, manageability, confidence). We want every cell
    # represented when possible, weighted toward high-stakes cells.
    cells: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for r in flagged:
        key = (
            r.get("mechanism") or "?",
            r.get("manageability") or "?",
            r.get("confidence") or "?",
        )
        cells[key].append(r)

    # Allocation strategy: include all "fundamental" and all "high confidence"
    # records (they are rare and high-stakes), then fill remaining slots from
    # the most common cells.
    sample: list[dict[str, Any]] = []
    high_stakes_keys = [
        k for k in cells
        if k[1] == "fundamental" or k[2] == "high" or k[0] == "goal_conflict"
    ]
    for k in high_stakes_keys:
        sample.extend(cells[k][: max(1, n // 8)])

    # Fill remaining slots with stratified sampling from the rest
    remaining_quota = max(0, n - len(sample))
    if remaining_quota > 0:
        other_keys = [k for k in cells if k not in high_stakes_keys]
        per_cell = max(1, remaining_quota // max(1, len(other_keys)))
        for k in other_keys:
            sample.extend(cells[k][:per_cell])

    sample = sample[:n]

    print(f"# Stratified flagged-pair sample ({country}, n={len(sample)})")
    print()
    print(f"Drawn from {len(flagged)} flagged records across {len(cells)} mechanism×manageability×confidence cells.")
    print()
    for i, r in enumerate(sample, 1):
        a = r.get("targetAId", "?")
        b = r.get("targetBId", "?")
        ta = targets.get(a, {})
        tb = targets.get(b, {})
        v1 = v1_index.get(tuple(sorted([a, b])), {})

        print(f"## Case {i}: {a} ↔ {b}")
        print()
        print(f"**v2 labels**: alignment={r.get('alignment')}  mechanism={r.get('mechanism')}  manageability={r.get('manageability')}  confidence={r.get('confidence')}")
        if v1:
            v1_align = v1.get("alignment", "?")
            v1_ct = v1.get("contradictionType", "?")
            print(f"**v1 label (baseline)**: alignment={v1_align}  contradictionType={v1_ct}")
        print()
        print(f"**Target A ({a}, {ta.get('sourceDocument', '?')})**:")
        print(f"> {ta.get('text', '(missing)')}")
        print()
        print(f"**Target B ({b}, {tb.get('sourceDocument', '?')})**:")
        print(f"> {tb.get('text', '(missing)')}")
        print()
        print("**Decomposition A** (Agent 1 output, abbreviated):")
        print(f"> {(decomps.get(a) or '')[:600].replace(chr(10), ' ')}")
        print()
        print("**Decomposition B**:")
        print(f"> {(decomps.get(b) or '')[:600].replace(chr(10), ' ')}")
        print()
        print("**v2 description**:")
        print(f"> {r.get('description', '(missing)')}")
        if v1.get("description"):
            print()
            print("**v1 description (baseline)**:")
            print(f"> {v1.get('description')}")
        print()
        print("**Reviewer verdict** (fill in: plausible / dubious / wrong + why)")
        print()
        print("---")
        print()
    return 0


# ---------------------------------------------------------------------------
# False-negative sampler (v1 flagged but v2 not)
# ---------------------------------------------------------------------------

def cmd_false_negatives(country: str, n: int) -> int:
    records = load_alignment(country)
    v2_index = {
        tuple(sorted([r.get("targetAId", ""), r.get("targetBId", "")])): r
        for r in records
    }
    v1_index = load_v1_alignment(country)
    targets = load_targets(country)

    v1_flagged_levels = {
        "possible_misalignment", "possible_conflict", "likely_conflict",
        "low_tension", "moderate_contradiction", "high_contradiction",
    }

    false_negatives: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for key, v1_rec in v1_index.items():
        if v1_rec.get("alignment") not in v1_flagged_levels:
            continue
        v2_rec = v2_index.get(key)
        if v2_rec is None:
            continue
        if v2_rec.get("alignment") != "flagged":
            false_negatives.append((v1_rec, v2_rec))

    print(f"# False-negative review ({country})")
    print()
    print(f"Pairs where v1 flagged but v2 did not: **{len(false_negatives)}**")
    print()
    for i, (v1_rec, v2_rec) in enumerate(false_negatives[:n], 1):
        a = v1_rec.get("targetAId", "?")
        b = v1_rec.get("targetBId", "?")
        ta = targets.get(a, {})
        tb = targets.get(b, {})
        print(f"## Case {i}: {a} ↔ {b}")
        print()
        print(f"**v1 (flagged)**: alignment={v1_rec.get('alignment')}  contradictionType={v1_rec.get('contradictionType')}")
        print(f"**v2 (unflagged)**: alignment={v2_rec.get('alignment')}")
        print()
        print(f"**Target A**: {ta.get('text', '?')[:400]}")
        print()
        print(f"**Target B**: {tb.get('text', '?')[:400]}")
        print()
        print("**v1 description**:")
        print(f"> {v1_rec.get('description', '?')}")
        print()
        print("**v2 description**:")
        print(f"> {v2_rec.get('description', '?')}")
        print()
        print("**Reviewer verdict** (fill in: v2 correctly de-flagged / v2 missed real friction)")
        print()
        print("---")
        print()
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="v2.1 credibility audit utilities")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_co = sub.add_parser("coherence", help="Coherence checks across flagged records")
    p_co.add_argument("--country", required=True)

    p_sa = sub.add_parser("sample", help="Stratified case-file sample")
    p_sa.add_argument("--country", required=True)
    p_sa.add_argument("--n", type=int, default=20)

    p_fn = sub.add_parser("false-negatives", help="Pairs flagged in v1 but not v2")
    p_fn.add_argument("--country", required=True)
    p_fn.add_argument("--n", type=int, default=15)

    args = ap.parse_args()
    if args.cmd == "coherence":
        return cmd_coherence(args.country)
    elif args.cmd == "sample":
        return cmd_sample(args.country, args.n)
    elif args.cmd == "false-negatives":
        return cmd_false_negatives(args.country, args.n)
    return 1


if __name__ == "__main__":
    sys.exit(main())
