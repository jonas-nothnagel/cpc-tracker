"""Place every budget line of an expenditure review in an area of a lens.

Step 2 of the BER plan, "Tag each line". Reads python/data/<country>-ber.json
(step 1), describes each line from the review's own record (no amounts), asks
the pipeline's model and a second model (Claude Opus 5.5, Anthropic API) to
score every area, and writes python/output/<country>/ber_areas.json: both
readings with their reasons, the prompt as sent, and the area each line takes
until a person checks it. Lines the two models place differently, or that no
area fits at the relevance mark, are kept apart.

The lines are those the review decided on: Mongolia's 28 programmes and
purpose codes, Panama's budget activities, Sri Lanka's project lines.

Run from python/ (CPC_CACHE_DIR shares the main checkout's warm cache):
    CPC_CACHE_DIR=<main checkout>/python/output/.cache \\
    .venv/bin/python scripts/place_ber_lines.py --country all
A smoke run: --limit 3 --out-dir <dir> (the country's files stay as they are).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config  # noqa: E402
from src.ber_areas import (  # noqa: E402
    CLAUDE_EFFORT,
    CLAUDE_MODEL,
    PROMPT_VERSION,
    claude_ready,
    combine,
    describe_line,
    place_with_claude,
    place_with_pipeline_model,
    reading,
    system_prompt,
)
from src.classify import RELEVANCE_THRESHOLD  # noqa: E402
from src.config import DATA_DIR, OUTPUT_DIR  # noqa: E402
from src.footprint import append_event, electricity_zone  # noqa: E402
from src.footprint.tracker import get_footprint_tracker  # noqa: E402
from src.llm import set_language  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("place_ber_lines")

COUNTRIES = ("mongolia", "panama", "sri-lanka")
LINE_KINDS = {"mongolia": ("programme", "purpose"), "panama": ("activity",), "sri-lanka": ("project",)}
LENSES = {
    # lens id -> (categories.json key, the name the prompt uses)
    "globe": ("globe_categories", "GLOBE (BIOFIN's Global Biodiversity Expenditure taxonomy)"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--country", choices=[*COUNTRIES, "all"], default="all")
    parser.add_argument("--lens", choices=sorted(LENSES), default="globe")
    parser.add_argument("--no-second", action="store_true", help="Skip the second model")
    parser.add_argument("--limit", type=int, help="Smoke run: the first N lines per country")
    parser.add_argument("--out-dir", type=Path, help="Write here instead (required for a smoke run)")
    return parser.parse_args()


def lines_of(country: str, record: dict[str, Any]) -> list[dict[str, Any]]:
    return [l for l in record["lines"] if l["kind"] in LINE_KINDS[country]]


def record_footprint(run_id: str, country: str | None, claude_usage: dict[str, int] | None) -> None:
    snap = get_footprint_tracker().snapshot()
    if int(snap.get("call_count", 0) or 0):
        append_event(
            component="dev_pipeline",
            provider="openai",
            model=config.LLM_MODEL,
            region=electricity_zone(),
            run_id=run_id,
            country=country,
            call_count=int(snap.get("call_count", 0) or 0),
            cached_call_count=int(snap.get("cached_call_count", 0) or 0),
            energy_wh=float(snap.get("energy_wh", 0) or 0),
            water_ml=float(snap.get("water_ml", 0) or 0),
            co2_geq=float(snap.get("co2_geq", 0) or 0),
            minerals_ugsbeq=float(snap.get("minerals_ugsbeq", 0) or 0),
            source=snap.get("source", "unavailable"),
        )
    if claude_usage and claude_usage["calls"]:
        # The footprint library has no profile for this model: the row records
        # calls and tokens, and its energy as unavailable rather than guessed.
        append_event(
            component="dev_pipeline",
            provider="anthropic",
            model=CLAUDE_MODEL,
            region="unknown",
            run_id=run_id,
            country=country,
            call_count=claude_usage["calls"],
            cached_call_count=claude_usage["cached"],
            energy_wh=0.0,
            water_ml=0.0,
            co2_geq=0.0,
            minerals_ugsbeq=0.0,
            source="unavailable",
            input_tokens=claude_usage["input_tokens"] + claude_usage["cache_read_tokens"],
            output_tokens=claude_usage["output_tokens"],
        )


async def run_country(country: str, lens: str, args: argparse.Namespace, categories: list[dict[str, Any]], lens_name: str) -> dict[str, int]:
    payload = json.loads((DATA_DIR / f"{country}-ber.json").read_text())
    record = payload["record"]
    lines = lines_of(country, record)
    if args.limit is not None:
        lines = lines[: args.limit]
    descriptions = {l["code"]: describe_line(country, record, l) for l in lines}
    logger.info(f"{country}: {len(lines)} lines, lens {lens}")

    first = await place_with_pipeline_model(descriptions, categories, lens_name)
    second: dict[str, dict[str, Any]] = {}
    usage = {"calls": 0, "cached": 0, "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0}
    if not args.no_second:
        if not claude_ready():
            raise SystemExit("ANTHROPIC_API_KEY is not set; pass --no-second to run the pipeline's model only")
        second, usage = await place_with_claude(descriptions, categories, lens_name)

    out_lines = []
    for line in lines:
        code = line["code"]
        one = reading(first[code], config.LLM_MODEL)
        two = reading(second[code]["ranked"], second[code]["model"]) if code in second else None
        if two is not None and second[code].get("declined"):
            two["declined"] = True
        out_lines.append({"code": code, "description": descriptions[code], "first": one, "second": two, **combine(one, two)})

    counts: dict[str, int] = {}
    for l in out_lines:
        counts[l["status"]] = counts.get(l["status"], 0) + 1
    result = {
        "_provenance": (
            f"Built by python/scripts/place_ber_lines.py on {datetime.now(timezone.utc).date().isoformat()} from "
            f"python/data/{country}-ber.json. AI-estimated: each area is a model's reading of the review's description "
            "of the line, to be checked by a person (python/data/<country>-ber-areas.json holds the checks)."
        ),
        "lens": lens,
        "promptVersion": PROMPT_VERSION,
        "system": system_prompt(lens_name, categories),
        "models": {"first": config.LLM_MODEL, "second": None if args.no_second else f"{CLAUDE_MODEL} (effort {CLAUDE_EFFORT})"},
        "threshold": RELEVANCE_THRESHOLD,
        "counts": counts,
        "lines": out_lines,
    }
    out_dir = args.out_dir / country if args.out_dir else OUTPUT_DIR / country
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"ber_areas_{lens}.json"
    path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    logger.info(f"{country}: {counts} -> {path}")
    return usage


async def main() -> None:
    args = parse_args()
    if args.limit is not None and not args.out_dir:
        raise SystemExit("A smoke run needs --out-dir, so the country's files stay as they are.")
    # No language directive: both models read the same system prompt, word for word.
    set_language(None)
    categories_key, lens_name = LENSES[args.lens]
    categories = json.loads((DATA_DIR / "categories.json").read_text())[categories_key]
    countries = COUNTRIES if args.country == "all" else (args.country,)
    total = {"calls": 0, "cached": 0, "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0}
    for country in countries:
        usage = await run_country(country, args.lens, args, categories, lens_name)
        for k, v in usage.items():
            total[k] += v
    logger.info(f"Second model: {total}")
    run_id = f"ber-areas:{args.lens}:{args.country}{':smoke' if args.limit is not None else ''}"
    record_footprint(run_id, None if args.country == "all" else args.country, total)


if __name__ == "__main__":
    asyncio.run(main())
