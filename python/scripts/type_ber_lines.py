"""Place every budget line with reviewed spending in a BIOFIN expenditure type,
for the official chain of the BER plan (step 3): line -> expenditure type ->
GBF targets <- national targets of the 7th National Report.

Reads python/data/<country>-ber.json (step 1) and python/data/
globe-expenditure-types.json (scripts/build_globe_types.py), describes each
line as step 2 does (no amounts), asks the pipeline's model and the second
model (Claude Opus 5.5, Anthropic API) to score the types with step 2's prompt,
and writes python/output/<country>/ber_types_globe.json: both models' top
types with their reasons, the line's type, and the GBF targets both models'
relevant types share (src/ber_types.py). A line whose readings share no GBF
target is kept apart.

Run from python/ (CPC_CACHE_DIR shares the main checkout's warm cache):
    CPC_CACHE_DIR=<main checkout>/python/output/.cache \\
    .venv/bin/python scripts/type_ber_lines.py --country all
A smoke run: --limit 3 --out-dir <dir> (the country's files stay as they are).
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.ber_areas import (  # noqa: E402
    CLAUDE_EFFORT,
    CLAUDE_MODEL,
    claude_ready,
    place_with_claude,
    place_with_pipeline_model,
    reading,
    system_prompt,
)
from src.ber_types import (  # noqa: E402
    CLAUDE_NAMESPACE,
    LENS_NAME,
    PIPELINE_NAMESPACE,
    PROMPT_VERSION,
    chain_reading,
    load_types,
    type_categories,
)
from src.budget_align import record_lines_to_pseudo_targets  # noqa: E402
from src.classify import RELEVANCE_THRESHOLD  # noqa: E402
from src.llm import set_language  # noqa: E402

from src import config  # noqa: E402
from src.config import DATA_DIR, OUTPUT_DIR  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from place_ber_lines import COUNTRIES, record_footprint  # noqa: E402

logger = logging.getLogger("type_ber_lines")

# Each model's ranked types kept in the output, enough for a person's check.
KEEP_RANKED = 5


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--country", choices=[*COUNTRIES, "all"], default="all")
    parser.add_argument("--no-second", action="store_true", help="Skip the second model")
    parser.add_argument("--limit", type=int, help="Smoke run: the first N lines per country")
    parser.add_argument("--out-dir", type=Path, help="Write here instead (required for a smoke run)")
    return parser.parse_args()


async def run_country(country: str, args: argparse.Namespace, types: dict[str, Any]) -> dict[str, int]:
    record = json.loads((DATA_DIR / f"{country}-ber.json").read_text())["record"]
    pseudo = record_lines_to_pseudo_targets(country, record)
    if args.limit is not None:
        pseudo = pseudo[: args.limit]
    descriptions = {p["id"].removeprefix("BER_"): p["analysisText"] for p in pseudo}
    categories = type_categories(types["types"])
    gbf_of = {t["id"]: t["gbf"] for t in types["types"]}
    name_of = {t["id"]: t["name"] for t in types["types"]}
    logger.info(f"{country}: {len(descriptions)} lines, {len(categories)} expenditure types")

    first = await place_with_pipeline_model(descriptions, categories, LENS_NAME, namespace=PIPELINE_NAMESPACE, max_tokens=2000)
    second: dict[str, dict[str, Any]] = {}
    usage: dict[str, int] = {}
    if not args.no_second:
        if not claude_ready():
            raise SystemExit("ANTHROPIC_API_KEY is not set; pass --no-second to run the pipeline's model only")
        second, usage = await place_with_claude(descriptions, categories, LENS_NAME, namespace=CLAUDE_NAMESPACE, enum=False)

    def kept(ranked: list[dict[str, Any]], model: str) -> dict[str, Any]:
        r = reading(ranked[:KEEP_RANKED], model)
        return {
            "model": r["model"],
            "type": r["area"],
            "score": r["score"],
            "ranked": [{**x, "name": name_of[x["id"]], "gbf": gbf_of[x["id"]]} for x in r["ranked"]],
        }

    out_lines = []
    for code, description in descriptions.items():
        two = second.get(code)
        out_lines.append({
            "code": code,
            "description": description,
            "first": kept(first[code], config.LLM_MODEL),
            "second": kept(two["ranked"], two["model"]) | ({"declined": True} if two.get("declined") else {}) if two else None,
            **chain_reading(first[code], two["ranked"] if two else None, gbf_of),
        })

    counts: dict[str, int] = {}
    for line in out_lines:
        for key in (line["status"], f"type:{line['typeStatus']}"):
            counts[key] = counts.get(key, 0) + 1
    system = system_prompt(LENS_NAME, categories)
    result = {
        "_provenance": (
            f"Built by python/scripts/type_ber_lines.py on {datetime.now(timezone.utc).date().isoformat()} from "
            f"python/data/{country}-ber.json and python/data/globe-expenditure-types.json. AI-estimated: each type is "
            "a model's reading of the review's description of the line, to be checked by a person."
        ),
        "promptVersion": PROMPT_VERSION,
        "prompt": "src/ber_areas.py SYSTEM_TEMPLATE, with the catalogue of python/data/globe-expenditure-types.json",
        "systemSha256": hashlib.sha256(system.encode()).hexdigest(),
        "models": {"first": config.LLM_MODEL, "second": None if args.no_second else f"{CLAUDE_MODEL} (effort {CLAUDE_EFFORT})"},
        "threshold": RELEVANCE_THRESHOLD,
        "rule": (
            "A line links to a GBF target where both models place it, at the threshold, in an expenditure type "
            "BIOFIN files under that target; otherwise it is kept apart."
        ),
        "counts": counts,
        "lines": out_lines,
    }
    out_dir = args.out_dir / country if args.out_dir else OUTPUT_DIR / country
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "ber_types_globe.json"
    path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    logger.info(f"{country}: {counts} -> {path}")
    return usage


async def main() -> None:
    args = parse_args()
    if args.limit is not None and not args.out_dir:
        raise SystemExit("A smoke run needs --out-dir, so the country's files stay as they are.")
    # No language directive: both models read the same system prompt, word for word.
    set_language(None)
    types = load_types()
    countries = COUNTRIES if args.country == "all" else (args.country,)
    total: dict[str, int] = {}
    for country in countries:
        usage = await run_country(country, args, types)
        for k, v in usage.items():
            total[k] = total.get(k, 0) + v
    logger.info(f"Second model: {total}")
    run_id = f"ber-types:globe:{args.country}{':smoke' if args.limit is not None else ''}"
    record_footprint(run_id, None if args.country == "all" else args.country, total)


if __name__ == "__main__":
    asyncio.run(main())
