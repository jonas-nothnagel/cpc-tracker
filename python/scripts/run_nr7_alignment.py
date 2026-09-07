"""Run ONLY the NR7 (7th National Report) alignment step for an existing run.

Why a standalone script: `run_analysis.py --nr7-file ...` replays all nine
pipeline steps and rewrites every artifact in the country's output dir. For
the first NR7 pass we want to add exactly two files (nr7_pseudo_targets.json,
nr7_alignment.json) next to an EXISTING per-model run, reusing that run's
target decompositions, and touch nothing else.

The model must be the one the rest of the country was aligned with (Mongolia:
gpt-5.4, served as an Azure deployment of the same name), so NR7 verdicts are
comparable with the target-target, BTR and BER verdicts on the same page.

Usage (from python/):
    # Size the run, render one prompt, make no LLM call:
    .venv/bin/python scripts/run_nr7_alignment.py --dry-run

    # Real run via the Azure endpoint in the project .env:
    .venv/bin/python scripts/run_nr7_alignment.py --endpoint azure
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


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--targets-file", default="mongolia-targets.json")
    ap.add_argument("--nr7-file", default="external/nr7_mng.json", help="relative to DATA_DIR")
    ap.add_argument("--model", default="gpt-5.4", help="must match the existing run's model")
    ap.add_argument("--dry-run", action="store_true", help="size + render one prompt, no LLM calls")
    ap.add_argument("--endpoint", choices=["azure", "env"], help="required unless --dry-run")
    ap.add_argument("--force", action="store_true", help="overwrite existing NR7 outputs")
    args = ap.parse_args()

    if not args.dry_run and not args.endpoint:
        ap.error("--endpoint is required unless --dry-run (refusing to guess a paid endpoint)")
    configure_endpoint("none" if args.dry_run else args.endpoint, args.model)

    import src.config as config
    from src.config import DATA_DIR, OUTPUT_DIR
    from src.llm import set_language
    from src.measure_align import MEASURE_ADVISOR_USER_TEMPLATE
    from src.nr7_align import (
        NR7_CACHE_NAMESPACE,
        NR7_INTRO_FRAMING,
        _nr7_side_label,
        assess_nr7_alignment,
        decompose_nr7_actions,
        generate_nr7_pairs,
        nr7_actions_to_pseudo_targets,
    )
    from src.run_analysis import derive_country_file, derive_output_dir, load_input_data

    config.LLM_MODEL = args.model
    set_language("en")  # part of the cache key; matches run_analysis --language en

    out_dir = derive_output_dir(args.targets_file, OUTPUT_DIR, args.model)
    decomp_path = out_dir / "decompositions.json"
    if not decomp_path.exists():
        raise SystemExit(f"No existing run at {out_dir} (missing decompositions.json)")
    for name in ("nr7_alignment.json", "nr7_pseudo_targets.json"):
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
    pseudo = nr7_actions_to_pseudo_targets(nr7.get("progressItems", []))
    pairs = generate_nr7_pairs(targets, pseudo)

    print(f"model            : {args.model}")
    print(f"output dir       : {out_dir}")
    print(f"cache namespace  : {NR7_CACHE_NAMESPACE}")
    print(f"policy targets   : {len(targets)}")
    print(f"NR7 actions      : {len(pseudo)}  (decompositions to make: {len(pseudo)})")
    print(f"alignment pairs  : {len(pairs)}")

    if args.dry_run:
        # Render one real prompt so the size estimate reflects actual decomps.
        t, a = pairs[0]
        rendered = MEASURE_ADVISOR_USER_TEMPLATE.format(
            intro_framing=NR7_INTRO_FRAMING,
            target_1_type=_nr7_side_label(t, doc_type_labels or {}),
            target_1_decomp=decompositions[t["id"]],
            target_2_type=_nr7_side_label(a, doc_type_labels or {}),
            target_2_decomp="(NR7 decomposition, similar length)",
        )
        approx_in = len(rendered) // 4 + 400  # + the NR7 decomp it will carry
        print(f"approx input tok : ~{approx_in} per pair -> ~{approx_in * len(pairs) / 1e6:.1f}M total")
        print("\n--dry-run: stopping before any LLM call.")
        return 0

    async def run() -> None:
        nr7_decomps = await decompose_nr7_actions(pseudo)
        results = await assess_nr7_alignment(pairs, {**decompositions, **nr7_decomps}, doc_type_labels)
        (out_dir / "nr7_pseudo_targets.json").write_text(json.dumps(pseudo, indent=2, ensure_ascii=False))
        (out_dir / "nr7_alignment.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
        print(f"\nSaved {len(results)} NR7 alignment results to {out_dir}")
        print("level distribution:", dict(Counter(r["alignment"] for r in results)))

    asyncio.run(run())
    return 0


if __name__ == "__main__":
    sys.exit(main())
