"""Compare candidate pipeline models on real pairs before adopting one.

A model swap changes the analysis, not just the bill: it can drop most of the
pairs currently flagged for review, or flag everything. This probe answers that
cheaply (a few hundred calls) instead of discovering it after a full corpus run.

For each model it runs the real advisor prompt over the same stratified sample
twice, under two cache namespaces, and reports:

  * flag retention   - how many currently-flagged pairs the model still flags
  * background flags - how many it flags among pairs with no known friction
  * run-to-run churn - how many verdicts differ between two identical runs
  * level mix        - where the remaining verdicts land

Pairs are sampled from a country's committed alignment.json, and decompositions
are reused from that run, so prompts are byte-identical to production ones.

Usage:
  cd python
  uv run python -m scripts.probe_model --country sri-lanka --pairs 160 \
      --models gpt-5.4,gpt-5.6-terra

See docs/model-selection.md for the numbers this produced for gpt-5.6-terra.
"""

import argparse
import asyncio
import json
import random
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import align, llm  # noqa: E402
from src.alignment_schema import parse_alignment  # noqa: E402

REPO = Path(__file__).resolve().parent.parent.parent
DATA = REPO / "python/data"
OUTPUT = REPO / "python/output"
SEED = 20260728


def build_prompts(country: str, n: int, rng: random.Random):
    """Stratified sample: half currently-flagged pairs, half background."""
    out_dir = OUTPUT / country
    for needed in ("decompositions.json", "alignment.json"):
        if not (out_dir / needed).exists():
            # Countries last run under an explicit --model keep their outputs in
            # a per-model subdirectory, where this probe cannot read them.
            subdirs = sorted(p.name for p in out_dir.glob("*/") if (p / needed).exists())
            hint = (
                f" Its outputs are under {', '.join(subdirs)}, from a --model run;"
                " re-run the pipeline without --model to probe this country."
                if subdirs else ""
            )
            raise SystemExit(
                f"{out_dir / needed} not found: run the pipeline for {country} first.{hint}"
            )
    targets = {t["id"]: t for t in json.loads((DATA / f"{country}-targets.json").read_text())}
    decomps = json.loads((out_dir / "decompositions.json").read_text())
    cfg = json.loads((DATA / f"{country}-country-config.json").read_text())
    labels = {d["id"]: d.get("mediumLabel", d["id"]) for d in cfg["documentTypes"]}
    alignment = json.loads((out_dir / "alignment.json").read_text())

    # Every currently-flagged pair, so the background stratum can exclude them
    # all. Sampling background pairs uniformly would otherwise readmit flagged
    # ones at the corpus flag rate, and "background flags" would then partly
    # count pairs that were never background.
    all_flagged = {
        tuple(sorted((r["targetAId"], r["targetBId"])))
        for r in alignment if r["alignment"] == "flagged"
    }
    flagged = [p for p in sorted(all_flagged)
               if p[0] in decomps and p[1] in decomps]
    rng.shuffle(flagged)
    usable = sorted(tid for tid in targets if tid in decomps)

    # Every cross-document pair that could be drawn, so the sample size is
    # checked against what exists instead of spinning in rejection sampling.
    background_pool = [
        (a, b)
        for i, a in enumerate(usable)
        for b in usable[i + 1:]
        if targets[a]["sourceDocument"] != targets[b]["sourceDocument"]
        and (a, b) not in all_flagged
    ]
    pairs = flagged[: n // 2]
    n_flagged = len(pairs)
    n_background = min(n - n_flagged, len(background_pool))
    if n_flagged + n_background < n:
        print(f"  note: only {n_flagged + n_background} pairs available "
              f"({n_flagged} flagged, {n_background} background); asked for {n}")
    pairs += rng.sample(background_pool, n_background)

    prompts = []
    for a, b in pairs:
        prompts.append(align.ADVISOR_USER_TEMPLATE.format(
            intro_framing="",
            target_1_type=labels.get(targets[a]["sourceDocument"], targets[a]["sourceDocument"]),
            target_1_decomp=decomps[a],
            target_2_type=labels.get(targets[b]["sourceDocument"], targets[b]["sourceDocument"]),
            target_2_decomp=decomps[b],
        ))
    return prompts, n_flagged


async def run_arm(prompts, model, namespace):
    async def one(user):
        content, info = await llm.call_llm_detailed(
            align.ADVISOR_SYSTEM, user, model=model, cache_namespace=namespace,
        )
        # parse_alignment returns "none" for anything it cannot read, so an
        # empty or refused response would otherwise be tallied as a real "no
        # alignment" verdict and quietly flatter a candidate model.
        if info.get("status") == "content_filter" or not content.strip():
            return "unusable"
        return parse_alignment(content)[0] or "unusable"
    return await asyncio.gather(*(one(u) for u in prompts))


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--country", default="sri-lanka")
    ap.add_argument("--pairs", type=int, default=160)
    ap.add_argument("--models", default="gpt-5.4",
                    help="comma-separated deployment names to compare")
    ap.add_argument("--language", default="en")
    args = ap.parse_args()

    llm.set_language(args.language)
    rng = random.Random(SEED)
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    prompts, n_flagged = build_prompts(args.country, args.pairs, rng)
    if not prompts:
        print(f"No cross-document pairs available for {args.country}.")
        return 1
    n_bg = len(prompts) - n_flagged
    print(f"{args.country}: {len(prompts)} pairs ({n_flagged} currently flagged, "
          f"{n_bg} background) on advisor prompt v{align.PROMPT_VERSION}")
    print(f"about to make {2 * len(prompts) * len(models)} live calls "
          f"({', '.join(models)}), minus anything already cached\n")

    arms_by_model = {}
    for model in models:
        arms = []
        for arm in ("a", "b"):
            slug = model.replace(".", "_").replace("-", "_")
            levels = await run_arm(prompts, model, f"probe_{slug}_{arm}")
            arms.append(levels)
            keep = sum(1 for lv in levels[:n_flagged] if lv == "flagged")
            bg = sum(1 for lv in levels[n_flagged:] if lv == "flagged")
            unusable = sum(1 for lv in levels if lv == "unusable")
            print(f"{model:>16} arm {arm}: keeps {keep}/{n_flagged} flags"
                  f"{f' ({keep / n_flagged:.0%})' if n_flagged else ''}"
                  f" | background flags {bg}/{n_bg}"
                  f"{f' | UNUSABLE {unusable}' if unusable else ''}"
                  f" | {dict(Counter(levels))}")
        churn = sum(1 for x, y in zip(*arms) if x != y)
        print(f"{model:>16} run-to-run churn: {churn}/{len(prompts)} "
              f"({churn / len(prompts):.1%})\n")
        arms_by_model[model] = arms

    if len(models) > 1:
        base = models[0]
        for other in models[1:]:
            x, y = arms_by_model[base][0], arms_by_model[other][0]
            disagree = sum(1 for p, q in zip(x, y) if p != q)
            only_base = sum(1 for p, q in zip(x, y) if p == "flagged" != q)
            only_other = sum(1 for p, q in zip(x, y) if q == "flagged" != p)
            print(f"{base} vs {other}: disagree on {disagree}/{len(x)} "
                  f"({disagree / len(x):.1%}); flags only {base}: {only_base}, "
                  f"only {other}: {only_other}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
