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
    targets = {t["id"]: t for t in json.loads((DATA / f"{country}-targets.json").read_text())}
    decomps = json.loads((out_dir / "decompositions.json").read_text())
    cfg = json.loads((DATA / f"{country}-country-config.json").read_text())
    labels = {d["id"]: d.get("mediumLabel", d["id"]) for d in cfg["documentTypes"]}
    alignment = json.loads((out_dir / "alignment.json").read_text())

    flagged = [(r["targetAId"], r["targetBId"]) for r in alignment
               if r["alignment"] == "flagged" and r["targetAId"] in decomps
               and r["targetBId"] in decomps]
    rng.shuffle(flagged)
    usable = sorted(tid for tid in targets if tid in decomps)

    pairs, seen = [], set()
    for p in flagged[: n // 2]:
        seen.add(p)
        pairs.append(p)
    n_flagged = len(pairs)
    while len(pairs) < n:
        a, b = rng.sample(usable, 2)
        if targets[a]["sourceDocument"] == targets[b]["sourceDocument"]:
            continue  # the pipeline only scores cross-document pairs
        key = tuple(sorted((a, b)))
        if key in seen:
            continue
        seen.add(key)
        pairs.append(key)

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
        content = await llm.call_llm(
            align.ADVISOR_SYSTEM, user, model=model, cache_namespace=namespace,
        )
        return parse_alignment(content)[0] or "unparsed"
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
    prompts, n_flagged = build_prompts(args.country, args.pairs, rng)
    n_bg = len(prompts) - n_flagged
    print(f"{args.country}: {len(prompts)} pairs ({n_flagged} currently flagged, "
          f"{n_bg} background) on advisor prompt v{align.PROMPT_VERSION}\n")

    arms_by_model = {}
    for model in [m.strip() for m in args.models.split(",") if m.strip()]:
        arms = []
        for arm in ("a", "b"):
            slug = model.replace(".", "_").replace("-", "_")
            levels = await run_arm(prompts, model, f"probe_{slug}_{arm}")
            arms.append(levels)
            keep = sum(1 for lv in levels[:n_flagged] if lv == "flagged")
            bg = sum(1 for lv in levels[n_flagged:] if lv == "flagged")
            print(f"{model:>16} arm {arm}: keeps {keep}/{n_flagged} flags"
                  f"{f' ({keep / n_flagged:.0%})' if n_flagged else ''}"
                  f" | background flags {bg}/{n_bg} | {dict(Counter(levels))}")
        churn = sum(1 for x, y in zip(*arms) if x != y)
        print(f"{model:>16} run-to-run churn: {churn}/{len(prompts)} "
              f"({churn / len(prompts):.1%})\n")
        arms_by_model[model] = arms

    models = list(arms_by_model)
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
