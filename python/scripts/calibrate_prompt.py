"""Calibrate an advisor-prompt revision on a stratified sample BEFORE a full run.

Background (2026-07): under prompt v2.1, DeepSeek-V4-Pro flagged 98.5% of
Mongolia's 9,678 target pairs. The v2.2 revision tightens the flagging gate.
A full 4-model re-run costs ~85k LLM calls, so this script first runs the new
prompt on ~450 stratified pairs for a treatment model (the over-flagger) and a
control model (the production flagship), compares against the stored v2.1
artifacts, and prints PASS/FAIL against numeric gates. New-arm responses are
disk-cached under the new namespace, so (a) re-running this script after a
gate tweak is free and (b) the calls are not wasted: they become warm cache
for the eventual full re-run, which generates identical prompts.

The OLD arm never makes an LLM call: the stored per-model alignment.json IS
the old-prompt result.

Usage (from python/):
    # Strata + old-arm stats only; makes no LLM calls:
    .venv/bin/python scripts/calibrate_prompt.py --dry-run

    # New-arm calls via the NCTP endpoint configured in the project .env:
    .venv/bin/python scripts/calibrate_prompt.py --endpoint nctp

    # Trust LLM_BASE_URL / keys already exported in the environment:
    .venv/bin/python scripts/calibrate_prompt.py --endpoint env

Writes a machine-readable report (gates, per-stratum metrics, changed-verdict
sample for human review) to output/<country>/_prompt_calibration.json.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections import Counter
from pathlib import Path

_PYTHON_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PYTHON_DIR))

STRATA_HELP = """Strata (seeded, deterministic):
  a. consensus  : pairs every model flagged (taken in full; retention gate)
  b. control-flags-nonconsensus : control flags, but not every model does
     (partially corroborated flags; retention here is reported, not gated)
  c. others-aligned   : every non-treatment model rates medium/high
  d. background : uniform random sample of common pairs
"""


def configure_endpoint(mode: str) -> None:
    """Set provider env vars BEFORE any src import (config reads env at import).

    llm.py routes to Azure whenever AZURE_OPENAI_ENDPOINT is set, regardless of
    LLM_BASE_URL, so every mode explicitly blanks it. Values are written into
    os.environ ahead of src.config's load_dotenv, which never overrides
    variables that already exist.
    """
    from dotenv import load_dotenv

    load_dotenv(_PYTHON_DIR.parent / ".env")
    if mode == "nctp":
        base = os.getenv("NCTP_BASE_URL")
        key = os.getenv("NCTP_API_KEY")
        if not base or not key:
            raise SystemExit("--endpoint nctp: NCTP_BASE_URL / NCTP_API_KEY missing from .env")
        os.environ["LLM_BASE_URL"] = base
        os.environ["OPENROUTER_API_KEY"] = key  # config prefers this name
        os.environ["LLM_API_KEY"] = key
    elif mode == "none":
        # Dry runs make no calls; an unreachable base URL turns any bug that
        # tries into a loud connection error instead of a paid request.
        os.environ["LLM_BASE_URL"] = "http://127.0.0.1:9"
        os.environ.setdefault("OPENROUTER_API_KEY", "unused")
    os.environ["AZURE_OPENAI_ENDPOINT"] = ""


def flag_rate(idx, keys) -> float:
    if not keys:
        return 0.0
    return sum(1 for k in keys if idx[k]["alignment"] == "flagged") / len(keys)


def retention(old_flagged_keys, new_idx) -> float:
    if not old_flagged_keys:
        return 1.0
    kept = sum(1 for k in old_flagged_keys if new_idx[k]["alignment"] == "flagged")
    return kept / len(old_flagged_keys)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="A/B a prompt revision on stratified pairs before a full run",
        epilog=STRATA_HELP,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--country", default="mongolia")
    ap.add_argument("--treatment", default="deepseek-v4-pro", help="over-flagging model slug")
    ap.add_argument("--control", default="gpt-5-4", help="non-regression model slug")
    ap.add_argument("--sample-b", type=int, default=60)
    ap.add_argument("--sample-c", type=int, default=100)
    ap.add_argument("--sample-d", type=int, default=100)
    ap.add_argument(
        "--dry-run", action="store_true", help="strata + old-arm stats only, no LLM calls"
    )
    ap.add_argument(
        "--endpoint",
        choices=["nctp", "env"],
        help="required unless --dry-run: where new-arm calls go",
    )
    args = ap.parse_args()

    if not args.dry_run and not args.endpoint:
        ap.error("--endpoint is required unless --dry-run (refusing to guess a paid endpoint)")
    configure_endpoint(args.endpoint if not args.dry_run else "none")

    # Imports come after endpoint config on purpose (see configure_endpoint).
    from src import config  # noqa: E402
    from src.align import (  # noqa: E402
        ALIGNMENT_CACHE_NAMESPACE,
        PROMPT_VERSION,
        assess_alignment,
        generate_pairs,
    )
    from src.analyze_model_comparison import (  # noqa: E402
        _seeded_sample,
        list_model_slugs,
        load_model_alignment,
        vocab_compliance,
    )
    from src.compare_alignments import index_by_pair  # noqa: E402
    from src.llm import set_language  # noqa: E402

    country_dir = config.OUTPUT_DIR / args.country
    slugs = list_model_slugs(country_dir)
    if args.treatment not in slugs or args.control not in slugs:
        raise SystemExit(f"treatment/control not found under {country_dir}; have {slugs}")

    all_idx = {s: load_model_alignment(country_dir, s) for s in slugs}
    common = set.intersection(*(set(i) for i in all_idx.values()))
    flagged = {
        s: {k for k in common if all_idx[s][k]["alignment"] == "flagged"} for s in slugs
    }
    non_treatment = [s for s in slugs if s != args.treatment]

    # --- Strata --------------------------------------------------------------
    consensus_set = set.intersection(*flagged.values())
    stratum_a = sorted(consensus_set)
    b_pool = sorted(flagged[args.control] - consensus_set)
    c_pool = sorted(
        k
        for k in common
        if all(all_idx[s][k]["alignment"] in ("medium", "high") for s in non_treatment)
    )
    seed_base = f"{args.country}|prompt-calibration|{PROMPT_VERSION}"
    strata = {
        "a_consensus": stratum_a,
        "b_control_flags_nonconsensus": _seeded_sample(b_pool, f"{seed_base}|b", args.sample_b),
        "c_others_aligned": _seeded_sample(c_pool, f"{seed_base}|c", args.sample_c),
        "d_background": _seeded_sample(sorted(common), f"{seed_base}|d", args.sample_d),
    }
    union_keys = sorted({k for keys in strata.values() for k in keys})

    print(
        f"Prompt calibration · {args.country} · v{PROMPT_VERSION} "
        f"→ cache {ALIGNMENT_CACHE_NAMESPACE}"
    )
    print(f"  treatment={args.treatment}  control={args.control}  models on disk={slugs}\n")
    for name, keys in strata.items():
        t_old = flag_rate(all_idx[args.treatment], keys)
        c_old = flag_rate(all_idx[args.control], keys)
        print(
            f"  {name:22s} n={len(keys):>4}   old flag-rate: "
            f"{args.treatment}={t_old:6.1%}  {args.control}={c_old:6.1%}"
        )
    est_calls = len(union_keys) * 2
    print(f"\n  union: {len(union_keys)} pairs → ≤{est_calls} live calls (cache hits are free)")

    if args.dry_run:
        print("\n--dry-run: stopping before any LLM call.")
        return 0

    # --- New arm ---------------------------------------------------------------
    set_language("en")  # part of the cache key; matches run_analysis --language en
    data_prefix = args.country
    targets = json.loads((config.DATA_DIR / f"{data_prefix}-targets.json").read_text())
    cc = json.loads((config.DATA_DIR / f"{data_prefix}-country-config.json").read_text())
    labels = {dt["id"]: dt["mediumLabel"] for dt in cc.get("documentTypes", [])}
    union_set = set(union_keys)
    # Filter generate_pairs (not reconstruct) so pair order and orientation are
    # byte-identical to a future full run: these cache entries pre-warm it.
    pairs = [
        (ta, tb)
        for ta, tb in generate_pairs(targets)
        if tuple(sorted((ta["id"], tb["id"]))) in union_set
    ]
    assert len(pairs) == len(union_keys), (
        f"sampled keys not reproduced by generate_pairs: {len(pairs)} vs {len(union_keys)}"
    )

    # Both models run inside ONE event loop: the llm module's client and
    # semaphore are created lazily and bound to the loop of first use, so a
    # second asyncio.run would hand them a closed loop.
    async def run_new_arm() -> dict[str, dict]:
        out: dict[str, dict] = {}
        for slug in (args.treatment, args.control):
            status = json.loads((country_dir / slug / "status.json").read_text())
            model_name = (status.get("footprint") or {}).get("model")
            if not model_name:
                raise SystemExit(f"{slug}/status.json has no footprint.model to run as")
            config.LLM_MODEL = model_name  # call_llm reads this at call time
            decomps = json.loads((country_dir / slug / "decompositions.json").read_text())
            print(f"\nRunning v{PROMPT_VERSION} prompt for {model_name} on {len(pairs)} pairs …")
            records = await assess_alignment(pairs, decomps, labels)
            out[slug] = index_by_pair(records)
        return out

    new_idx = asyncio.run(run_new_arm())

    # --- Gates -------------------------------------------------------------------
    t_old, t_new = all_idx[args.treatment], new_idx[args.treatment]
    c_old, c_new = all_idx[args.control], new_idx[args.control]

    t_flags_new = [k for k in union_keys if t_new[k]["alignment"] == "flagged"]
    payloads = Counter(
        (t_new[k].get("mechanism"), t_new[k].get("manageability"), t_new[k].get("confidence"))
        for k in t_flags_new
    )
    modal_share = (payloads.most_common(1)[0][1] / len(t_flags_new)) if t_flags_new else 0.0
    confidences = {t_new[k].get("confidence") for k in t_flags_new}
    control_changed = sum(
        1 for k in union_keys if c_old[k]["alignment"] != c_new[k]["alignment"]
    ) / len(union_keys)
    c_share_mh = (
        sum(1 for k in strata["c_others_aligned"] if t_new[k]["alignment"] in ("medium", "high"))
        / len(strata["c_others_aligned"])
        if strata["c_others_aligned"]
        else 0.0
    )
    vocab = vocab_compliance(
        {(s, k): new_idx[s][k] for s in new_idx for k in union_keys}
    )

    gates = {
        "G1_treatment_background_flag_rate": {
            "value": flag_rate(t_new, strata["d_background"]),
            "threshold": "<= 0.25",
            "pass": flag_rate(t_new, strata["d_background"]) <= 0.25,
        },
        "G2_treatment_consensus_retention": {
            "value": retention(strata["a_consensus"], t_new),
            "threshold": ">= 0.90",
            "pass": retention(strata["a_consensus"], t_new) >= 0.90,
        },
        "G3a_control_label_change_rate": {
            "value": control_changed,
            "threshold": "<= 0.15",
            "pass": control_changed <= 0.15,
        },
        "G3b_control_consensus_retention": {
            "value": retention(
                [k for k in strata["a_consensus"] if k in flagged[args.control]], c_new
            ),
            "threshold": ">= 0.95",
            "pass": retention(
                [k for k in strata["a_consensus"] if k in flagged[args.control]], c_new
            )
            >= 0.95,
        },
        "G3c_control_background_drift": {
            "value": abs(
                flag_rate(c_new, strata["d_background"]) - flag_rate(c_old, strata["d_background"])
            ),
            "threshold": "<= 0.05",
            "pass": abs(
                flag_rate(c_new, strata["d_background"]) - flag_rate(c_old, strata["d_background"])
            )
            <= 0.05,
        },
        "G4a_treatment_others_aligned_flag_rate": {
            "value": flag_rate(t_new, strata["c_others_aligned"]),
            "threshold": "<= 0.10",
            "pass": flag_rate(t_new, strata["c_others_aligned"]) <= 0.10,
        },
        "G4b_treatment_others_aligned_medium_high_share": {
            "value": c_share_mh,
            "threshold": ">= 0.50",
            "pass": c_share_mh >= 0.50,
        },
        "G5a_treatment_modal_flag_payload_share": {
            "value": modal_share,
            "threshold": "< 0.30",
            "pass": modal_share < 0.30,
        },
        "G5b_treatment_confidence_not_collapsed": {
            "value": sorted(str(c) for c in confidences),
            "threshold": "> 1 distinct value (when flags exist)",
            "pass": len(confidences) > 1 or not t_flags_new,
        },
        "G6_banned_vocabulary_records": {
            "value": vocab["pairsWithViolation"],
            "threshold": "== 0",
            "pass": vocab["pairsWithViolation"] == 0,
        },
    }

    # Changed-verdict sample for the mandatory human spot-read.
    changed = [
        {
            "pair": list(k),
            "stratum": next(n for n, keys in strata.items() if k in keys),
            "old": {"alignment": t_old[k]["alignment"], "confidence": t_old[k].get("confidence")},
            "new": {
                "alignment": t_new[k]["alignment"],
                "confidence": t_new[k].get("confidence"),
                "description": t_new[k].get("description"),
            },
        }
        for k in union_keys
        if t_old[k]["alignment"] != t_new[k]["alignment"]
    ]
    spot_read = _seeded_sample(
        [tuple(c["pair"]) for c in changed], f"{seed_base}|spotread", 20
    )
    spot_set = {tuple(p) for p in spot_read}

    report = {
        "promptVersion": PROMPT_VERSION,
        "cacheNamespace": ALIGNMENT_CACHE_NAMESPACE,
        "country": args.country,
        "treatment": args.treatment,
        "control": args.control,
        "strataSizes": {n: len(keys) for n, keys in strata.items()},
        "unionPairs": len(union_keys),
        "gates": gates,
        "allGatesPass": all(g["pass"] for g in gates.values()),
        "newDistribution": {
            s: dict(Counter(new_idx[s][k]["alignment"] for k in union_keys)) for s in new_idx
        },
        "treatmentChangedVerdicts": changed,
        "spotReadSample": [list(p) for p in spot_read],
    }
    out_path = country_dir / "_prompt_calibration.json"
    out_path.write_text(json.dumps(report, indent=2))

    print(f"\nGates (v{PROMPT_VERSION}):")
    for name, g in gates.items():
        mark = "PASS" if g["pass"] else "FAIL"
        print(f"  {mark}  {name:45s} {g['value']}  (need {g['threshold']})")
    print(
        f"\n  treatment verdicts changed: {len(changed)}; "
        f"spot-read {len(spot_set)} of them in {out_path}"
    )
    print(f"  all gates pass: {report['allGatesPass']}")
    print("\nHuman step before declaring PASS: read the spot-read sample in the report.")
    return 0 if report["allGatesPass"] else 1


if __name__ == "__main__":
    sys.exit(main())
