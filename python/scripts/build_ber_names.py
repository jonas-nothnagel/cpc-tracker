"""Display names for the budget lines of a country's expenditure review.

Step 1 of the BER plan, names ("English names; descriptions only from
sources"): python/data/<country>-ber-names.json, read by the brief for display
only, never by the pipeline or a prompt.

  mongolia  the review's own Mongolian name of each line (workbook, sheets
            Хөтөлбөр and Зориулалт) and its own Mongolian description where
            the workbook has one; five programmes have none there, and keep
            the earlier machine translation of their description, marked.
  panama    each activity's and programme's own Spanish name with its
            abbreviations written out by the list agreed on 2026-10-05, and
            an English machine translation by the pipeline's model, marked.
            Abbreviation-like words outside the list are reported, not
            written out: adding one to the list is a decision.

Run from python/:
    .venv/bin/python scripts/build_ber_names.py --country panama
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config  # noqa: E402
from src.config import DATA_DIR  # noqa: E402
from src.footprint import append_event, electricity_zone  # noqa: E402
from src.footprint.tracker import get_footprint_tracker  # noqa: E402
from src.llm import call_llm_batch, set_language  # noqa: E402

TRANSLATE_NAMESPACE = "ber_names_en_v1"

# Project-defined framing for a display-only translation; its output never
# reaches a pipeline prompt.
TRANSLATE_SYSTEM = (
    "You translate the names of lines in Panama's national budget from Spanish into English for a policy brief. "
    "Translate faithfully and plainly, as a budget name: keep proper names, acronyms and programme names as they are "
    "(for example SINAP, ARAP, MIDA), expand nothing that is not written out, and add nothing. "
    "Return ONLY the English name, no quotes, no notes."
)


def write_out(name: str, abbreviations: dict[str, str]) -> str:
    """The name with the listed abbreviations written out, spaces collapsed."""
    out = " ".join(name.split())
    for short, full in sorted(abbreviations.items(), key=lambda kv: -len(kv[0])):
        pattern = r"(?<![\w.])" + re.escape(short) + (r"(?![\w])" if not short.endswith(".") else "")
        out = re.sub(pattern, full, out)
    return " ".join(out.split())


def unlisted(names: list[str], abbreviations: dict[str, str]) -> list[str]:
    """Words that look like abbreviations (letters ending in a full stop) and
    that the list does not write out. For the report only."""
    seen: set[str] = set()
    for name in names:
        for word in re.findall(r"(?<![\w.])[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}\.(?=\s|$)", name):
            if word not in abbreviations:
                seen.add(word)
    return sorted(seen)


async def translate(names: list[str]) -> dict[str, str]:
    calls = [{"system": TRANSLATE_SYSTEM, "user": name, "temperature": 0.0, "max_tokens": 200} for name in names]
    raw = await call_llm_batch(calls, cache_namespace=TRANSLATE_NAMESPACE, desc="Budget line names")
    return {name: " ".join(text.strip().strip('"').split()) for name, text in zip(names, raw)}


def panama(previous: dict[str, Any]) -> dict[str, Any]:
    record = json.loads((DATA_DIR / "panama-ber.json").read_text())["record"]
    abbreviations = previous.get("_meta", {}).get("abbreviations", {})
    if not abbreviations:
        raise SystemExit("The agreed abbreviation list (panama-ber-names.json, _meta.abbreviations) is missing")
    entries: dict[str, str] = {}
    for line in record["lines"]:
        entries[line["code"]] = line["name"]
    for programme in record["programmes"]:
        entries[programme["code"]] = programme["name"]
    written = {code: write_out(name, abbreviations) for code, name in entries.items()}
    english = asyncio.run(translate(sorted(set(written.values()))))
    leftovers = unlisted(list(entries.values()), abbreviations)
    if leftovers:
        print(f"Abbreviation-like words not on the agreed list, left as they are ({len(leftovers)}): {', '.join(leftovers)}")
    return {
        "_meta": {
            "purpose": "Display names for Panama's BER budget lines (activities and their programmes) in the brief. Display only: never read by the pipeline or placed in a prompt.",
            "es": "The review's own names (panama-ber.json, from BIOFIN's budget database) with their abbreviations written out by the list below, double spaces collapsed; no word added or changed. List agreed with Jonas on 2026-10-05.",
            "en": f"Translations of the written-out names (machine translation by {config.LLM_MODEL}, {date.today().isoformat()}), shown flagged as translations, with the review's own name kept beside them.",
            "abbreviations": abbreviations,
            **({"unlisted": leftovers} if leftovers else {}),
        },
        "names": {code: {"es": written[code], "en": english[written[code]]} for code in sorted(entries)},
    }


def mongolia(previous: dict[str, Any]) -> dict[str, Any]:
    record = json.loads((DATA_DIR / "mongolia-ber.json").read_text())["record"]
    earlier = previous.get("names", {})
    names: dict[str, Any] = {}
    machine_descriptions = []
    for line in record["lines"]:
        code = line["code"]
        entry: dict[str, Any] = {"mn": line["nameMn"]}
        if line.get("descriptionMn"):
            entry["mnDescription"] = line["descriptionMn"]
        elif earlier.get(code, {}).get("mnDescription"):
            entry["mnDescription"] = earlier[code]["mnDescription"]
            entry["mnDescriptionMachine"] = True
            machine_descriptions.append(code)
        names[code] = entry
    return {
        "_meta": {
            "purpose": "Mongolian names and descriptions for Mongolia's BER budget lines in the brief. Display only: never read by the pipeline or placed in a prompt.",
            "mn": (
                "Names: the review's own Mongolian, from its workbook (BER_1112.xlsx: programmes on sheet Хөтөлбөр, purpose codes on sheet Зориулалт). "
                "Descriptions: the workbook's own Mongolian (Хөтөлбөр column M for 8 programmes, Зориулалт column O for the purpose codes); "
                f"the workbook has none for {', '.join(machine_descriptions)}, which keep a machine translation by Claude (2026-10-15), marked mnDescriptionMachine."
            ),
        },
        "names": names,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--country", choices=["mongolia", "panama", "all"], default="all")
    args = parser.parse_args()
    set_language(None)
    for country, build in (("mongolia", mongolia), ("panama", panama)):
        if args.country not in (country, "all"):
            continue
        path = DATA_DIR / f"{country}-ber-names.json"
        previous = json.loads(path.read_text()) if path.exists() else {}
        payload = build(previous)
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        print(f"Wrote {path} ({len(payload['names'])} names)")
    snap = get_footprint_tracker().snapshot()
    if int(snap.get("call_count", 0) or 0):
        append_event(
            component="dev_pipeline",
            provider="openai",
            model=config.LLM_MODEL,
            region=electricity_zone(),
            run_id=f"ber-names:{args.country}",
            country=None if args.country == "all" else args.country,
            call_count=int(snap.get("call_count", 0) or 0),
            cached_call_count=int(snap.get("cached_call_count", 0) or 0),
            energy_wh=float(snap.get("energy_wh", 0) or 0),
            water_ml=float(snap.get("water_ml", 0) or 0),
            co2_geq=float(snap.get("co2_geq", 0) or 0),
            minerals_ugsbeq=float(snap.get("minerals_ugsbeq", 0) or 0),
            source=snap.get("source", "unavailable"),
        )


if __name__ == "__main__":
    main()
