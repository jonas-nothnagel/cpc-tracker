"""Run ONLY the NR7 (7th National Report) alignment step for an existing run.

Why a standalone script: `run_analysis.py --nr7-file ...` replays all nine
pipeline steps and rewrites every artifact in the country's output dir. The
NR7 pass adds exactly two files (nr7_pseudo_targets.json, nr7_alignment.json)
next to an EXISTING per-model run, reusing that run's target decompositions,
and touches nothing else.

The model must be the one the rest of the country was aligned with (Mongolia:
gpt-5.4, served as an Azure deployment of the same name), so NR7 verdicts are
comparable with the target-target, BTR and BER verdicts on the same page.

Cost controls (see the cost note in src/nr7_align.py):
  - The NR7 prompt is rubric-first, so the provider's prompt cache can serve
    the unchanged ~75% of every call; the dry run prints the cacheable share.
  - `--actions NT01,NT03` scores a calibration SUBSET (those national targets'
    reported actions against every policy target) and writes it to
    *.calibration.json, never touching the files the dashboard reads. The
    local cache is keyed on the exact prompt, so those pairs are not paid for
    again when the full run follows with the same prompt.
  - Every live call records its token usage (prompt, cached prompt,
    completion, reasoning) on its cache entry; the totals print at the end.

Usage (from python/):
    # Size the run, render one prompt, make no LLM call:
    .venv/bin/python scripts/run_nr7_alignment.py --dry-run
    .venv/bin/python scripts/run_nr7_alignment.py --dry-run --actions NT01,NT03,NT09

    # Calibration subset, then the full run, via the Azure endpoint in .env:
    .venv/bin/python scripts/run_nr7_alignment.py --endpoint azure --actions NT01,NT03,NT09
    .venv/bin/python scripts/run_nr7_alignment.py --endpoint azure --force
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


def configure_endpoint(mode: str, model: str) -> None:
    """Set provider env BEFORE any src import (config reads env at import)."""
    from dotenv import load_dotenv

    load_dotenv(_PYTHON_DIR.parent / ".env")
    os.environ["LLM_MODEL"] = model
    if mode == "azure":
        if not os.getenv("AZURE_OPENAI_ENDPOINT"):
            raise SystemExit("--endpoint azure: AZURE_OPENAI_ENDPOINT missing from .env")
    elif mode == "none":
        # Dry runs make no calls; an unreachable base URL turns any bug that
        # tries into a loud connection error instead of a paid request.
        os.environ["LLM_BASE_URL"] = "http://127.0.0.1:9"
        os.environ.setdefault("OPENROUTER_API_KEY", "unused")
        os.environ["AZURE_OPENAI_ENDPOINT"] = ""


def _tok(chars: int) -> int:
    """Rough token estimate for English prose (4 chars per token)."""
    return chars // 4


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--targets-file", default="mongolia-targets.json")
    ap.add_argument("--nr7-file", default="external/nr7_mng.json", help="relative to DATA_DIR")
    ap.add_argument("--model", default="gpt-5.4", help="must match the existing run's model")
    ap.add_argument("--dry-run", action="store_true", help="size + render one prompt, no LLM calls")
    ap.add_argument("--endpoint", choices=["azure", "env"], help="required unless --dry-run")
    ap.add_argument("--force", action="store_true", help="overwrite existing NR7 outputs")
    ap.add_argument(
        "--actions",
        default=None,
        help="Comma-separated national target ids (e.g. NT01,NT03) whose reported actions "
        "to score as a calibration subset; outputs go to *.calibration.json",
    )
    args = ap.parse_args()

    if not args.dry_run and not args.endpoint:
        ap.error("--endpoint is required unless --dry-run (refusing to guess a paid endpoint)")
    configure_endpoint("none" if args.dry_run else args.endpoint, args.model)

    import src.config as config
    from src.config import DATA_DIR, OUTPUT_DIR
    from src.llm import get_usage_totals, set_language
    from src.nr7_align import (
        NR7_ADVISOR_SYSTEM,
        NR7_CACHE_NAMESPACE,
        assess_nr7_alignment,
        decompose_nr7_actions,
        generate_nr7_pairs,
        nr7_actions_to_pseudo_targets,
        nr7_prompt_shared_prefix,
        render_nr7_prompt,
    )
    from src.run_analysis import derive_country_file, derive_output_dir, load_input_data

    config.LLM_MODEL = args.model
    set_language("en")  # part of the cache key; matches run_analysis --language en

    subset = [s.strip().upper() for s in args.actions.split(",") if s.strip()] if args.actions else None
    suffix = ".calibration" if subset else ""
    out_names = (f"nr7_pseudo_targets{suffix}.json", f"nr7_alignment{suffix}.json")

    out_dir = derive_output_dir(args.targets_file, OUTPUT_DIR, args.model)
    decomp_path = out_dir / "decompositions.json"
    if not decomp_path.exists():
        raise SystemExit(f"No existing run at {out_dir} (missing decompositions.json)")
    for name in out_names:
        if (out_dir / name).exists() and not args.force and not args.dry_run:
            raise SystemExit(f"{out_dir / name} exists; pass --force to overwrite")

    targets = load_input_data(args.targets_file)[0]
    decompositions = json.loads(decomp_path.read_text())
    missing = [t["id"] for t in targets if t["id"] not in decompositions]
    if missing:
        raise SystemExit(f"{len(missing)} targets lack a decomposition in {decomp_path}: {missing[:5]}")

    config_path = DATA_DIR / derive_country_file(args.targets_file, "country-config")
    doc_type_labels = None
    if config_path.exists():
        doc_type_labels = {
            dt["id"]: dt["mediumLabel"]
            for dt in json.loads(config_path.read_text()).get("documentTypes", [])
        }

    nr7 = json.loads((DATA_DIR / args.nr7_file).read_text())
    items = nr7.get("progressItems", [])
    if subset:
        known = {it["targetId"] for it in items}
        unknown = [s for s in subset if s not in known]
        if unknown:
            raise SystemExit(f"--actions: not in {args.nr7_file}: {unknown} (have {sorted(known)})")
        items = [it for it in items if it["targetId"] in subset]
    pseudo = nr7_actions_to_pseudo_targets(items)
    pairs = generate_nr7_pairs(targets, pseudo)

    print(f"model            : {args.model}")
    print(f"output dir       : {out_dir}")
    print(f"outputs          : {', '.join(out_names)}")
    print(f"cache namespace  : {NR7_CACHE_NAMESPACE}")
    print(f"NR7 input        : {args.nr7_file} ({nr7.get('source', {}).get('name', 'unknown source')})")
    print(f"policy targets   : {len(targets)}")
    print(f"NR7 actions      : {len(pseudo)}{' (subset ' + ','.join(subset) + ')' if subset else ''}  (decompositions to make: {len(pseudo)})")
    print(f"alignment pairs  : {len(pairs)}")

    if args.dry_run:
        if not pairs:
            print("nothing to size")
            return 0
        # Render one real prompt. The action's decomposition does not exist
        # before the run, so stand in with its narrative, which Agent 1 tends
        # to compress rather than expand.
        t, a = pairs[0]
        rendered = render_nr7_prompt(t, a, {**decompositions, a["id"]: a["text"]}, doc_type_labels)
        prefix = nr7_prompt_shared_prefix(rendered, t, doc_type_labels)
        per_pair = _tok(len(rendered)) + _tok(len(NR7_ADVISOR_SYSTEM))
        cacheable = _tok(prefix)
        print(f"approx input tok : ~{per_pair} per pair -> ~{per_pair * len(pairs) / 1e6:.2f}M total")
        print(
            f"shared prefix    : ~{cacheable} tok ({cacheable / max(per_pair, 1):.0%}) identical across "
            f"each group of {len(targets)} calls -> eligible for provider prompt caching"
        )
        print(f"uncached input   : ~{(per_pair - cacheable) * len(pairs) / 1e6:.2f}M tok if every group hits the cache")
        print("\n--dry-run: stopping before any LLM call.")
        return 0

    async def run() -> None:
        nr7_decomps = await decompose_nr7_actions(pseudo)
        results = await assess_nr7_alignment(pairs, {**decompositions, **nr7_decomps}, doc_type_labels)
        (out_dir / out_names[0]).write_text(json.dumps(pseudo, indent=2, ensure_ascii=False))
        (out_dir / out_names[1]).write_text(json.dumps(results, indent=2, ensure_ascii=False))
        print(f"\nSaved {len(results)} NR7 alignment results to {out_dir / out_names[1]}")
        print("level distribution:", dict(Counter(r["alignment"] for r in results)))
        totals = get_usage_totals()
        if totals:
            print("\nlive token usage this run (cached local hits excluded):")
            for ns, u in totals.items():
                cached = u.get("cachedPrompt")
                share = f" ({cached / u['prompt']:.0%} of prompt served from the provider cache)" if cached and u.get("prompt") else ""
                reasoning = f", reasoning {u['reasoning']:,}" if "reasoning" in u else ""
                print(f"  {ns}: {u['calls']} calls, prompt {u.get('prompt', 0):,}{share}, completion {u.get('completion', 0):,}{reasoning}")
        else:
            print("\nno live calls were made (everything came from the local cache)")

    asyncio.run(run())
    return 0


if __name__ == "__main__":
    sys.exit(main())
