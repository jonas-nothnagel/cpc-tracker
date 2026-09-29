"""English for the contracts page: titles, buyers and the purpose reasons
(machine translation).

Each field has its own prompt, cache namespace and output file, a flat
{original: english} file beside the payload that the bake merges (re-run
scripts/build_contracts_layer.py afterwards):

- title: the contract's title as published. Reuses the August prompt and
  namespace (tender_mt_v1), so titles translated then are cache hits.
- buyer: the public body buying, as the record names it.
- reason: the purpose screen's one-sentence reason, which the AI mostly
  wrote in Mongolian.

Only texts with Cyrillic go to the model; text already in English is kept as
it is. An answer that comes back with Mongolian script in it is asked for
once more, in Latin script only; a text that fails twice stays untranslated
(the page then leaves it out). Every run appends its measured footprint to the ledger
(python/output/footprint-ledger.jsonl, or CPC_LEDGER_DIR), one row per model
with live calls, so the work reaches the /sustainability page.

Needs the LLM settings of the project .env and, from a worktree, the main
checkout's cache:

  set -a; . /path/to/main/.env; set +a
  CPC_CACHE_DIR=/path/to/main/python/output/.cache \\
      .venv/bin/python scripts/translate_contracts.py --field buyer --sample 20

`--sample N` takes a seeded sample of the untranslated texts, for a check
before the full run; `--all` translates every untranslated text the page
shows.
"""

from __future__ import annotations

import argparse
import asyncio
import gzip
import json
import random
import re
import sys
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / "python"))

CYRILLIC = re.compile("[Ѐ-ӿ]")


@dataclass(frozen=True)
class Field:
    """One kind of text: where it sits in a contract's record, how it is asked for."""

    key: str
    system: str
    namespace: str
    file: str
    max_tokens: int


FIELDS = {
    "title": Field(
        key="original",
        system=(
            "Translate the Mongolian public procurement contract title to concise English. "
            "Return ONLY the translation, no commentary."
        ),
        namespace="tender_mt_v1",
        file="contract-titles.en.json",
        max_tokens=200,
    ),
    "buyer": Field(
        key="buyer",
        system=(
            "Translate the name of this Mongolian public procurement buyer (a public body, school, "
            "hospital, state-owned company or similar) to English. Transliterate place names, personal "
            "names and brand names; translate descriptive words such as railway, road, heating network "
            "or water supply, also inside a company's name. Call аймаг an aimag and сум a soum. "
            "Return ONLY the English name, no commentary."
        ),
        namespace="tender_buyer_mt_v1",
        file="contract-buyers.en.json",
        max_tokens=120,
    ),
    "reason": Field(
        key="reason",
        system=(
            "Translate this Mongolian text to English. It is one sentence explaining whether a public "
            "procurement contract serves environmental, climate or biodiversity objectives. Translate "
            "faithfully: keep every qualification and add nothing. "
            "Return ONLY the translation, no commentary."
        ),
        namespace="tender_reason_mt_v1",
        file="contract-reasons.en.json",
        max_tokens=300,
    ),
}


# Added to the prompt for an answer that came back with Mongolian script in it.
LATIN_ONLY = " Write the answer in Latin script only: transliterate any Mongolian word you keep."


def translated(known: dict[str, str]) -> set[str]:
    """The texts with an English answer; one still in Mongolian script is not done."""
    return {k for k, v in known.items() if v and not CYRILLIC.search(v)}


def keep_latin(first: dict[str, str], retry: dict[str, str]) -> dict[str, str]:
    """The answers in Latin script: the first answer, else the retry's; a text
    neither gave in Latin script stays untranslated (the page then leaves it out)."""
    out = {}
    for original, answer in first.items():
        for candidate in (answer, retry.get(original, "")):
            if candidate and not CYRILLIC.search(candidate):
                out[original] = candidate
                break
    return out


def pending(texts: list[str], done: set[str]) -> list[str]:
    """Each text still to translate, once: Mongolian (it has Cyrillic), not done."""
    return sorted({t for t in texts if t and CYRILLIC.search(t) and t not in done})


def pick_sample(texts: list[str], done: set[str], n: int, seed: int = 20260928) -> list[str]:
    """A seeded sample of the texts not translated yet."""
    pool = pending(texts, done)
    return random.Random(seed).sample(pool, min(n, len(pool)))


async def translate(field: Field, originals: list[str]) -> dict[str, str]:
    from src.llm import call_llm_batch

    async def ask(system: str, texts: list[str]) -> dict[str, str]:
        calls = [{"system": system, "user": o, "temperature": 0.0, "max_tokens": field.max_tokens} for o in texts]
        raws = await call_llm_batch(calls, cache_namespace=field.namespace, desc=f"contract {field.key}")
        return {o: (r or "").strip() for o, r in zip(texts, raws) if (r or "").strip()}

    first = await ask(field.system, originals)
    again = [o for o, answer in first.items() if CYRILLIC.search(answer)]
    retry = await ask(field.system + LATIN_ONLY, again) if again else {}
    if again:
        print(f"{len(again)} answers came back with Mongolian script; asked again in Latin script only")
    return keep_latin(first, retry)


def ledger_rows(snapshot: dict) -> list[dict]:
    """The tracker's per-model rows that made live calls (a run served wholly
    from the cache adds nothing to the footprint)."""
    return [
        row
        for row in snapshot.get("by_model") or []
        if int(row.get("call_count", 0) or 0) > int(row.get("cached_call_count", 0) or 0)
    ]


def record_footprint(snapshot: dict, *, field: str, country: str) -> int:
    """Append the run's footprint to the ledger, one row per model; returns the rows written."""
    from src.footprint import append_event, electricity_zone

    rows = ledger_rows(snapshot)
    for row in rows:
        append_event(
            component="dev_pipeline",
            provider="openai",
            model=row["model"],
            region=electricity_zone(),
            run_id=f"contracts-translation:{field}",
            country=country,
            call_count=int(row.get("call_count", 0) or 0),
            cached_call_count=int(row.get("cached_call_count", 0) or 0),
            energy_wh=float(row.get("energy_wh", 0) or 0),
            water_ml=float(row.get("water_ml", 0) or 0),
            co2_geq=float(row.get("co2_geq", 0) or 0),
            minerals_ugsbeq=float(row.get("minerals_ugsbeq", 0) or 0),
            source=row.get("source") or "unavailable",
            **{
                f"{m}_{end}": row.get(f"{m}_{end}")
                for m in ("energy_wh", "water_ml", "co2_geq", "minerals_ugsbeq")
                for end in ("min", "max")
            },
        )
    return len(rows)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--field", choices=sorted(FIELDS), required=True)
    ap.add_argument("--country", default="mongolia")
    ap.add_argument("--model", default="gpt-5-4")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--sample", type=int)
    group.add_argument("--all", action="store_true")
    args = ap.parse_args()
    field = FIELDS[args.field]

    out_dir = REPO / "python/output" / args.country / args.model
    details = json.loads(gzip.decompress((out_dir / "contract-details.json.gz").read_bytes()))
    out_file = out_dir / field.file
    known: dict[str, str] = json.loads(out_file.read_text()) if out_file.exists() else {}
    known = {k: v for k, v in known.items() if k in translated(known)}
    done = set(known)
    if args.field == "title":
        done |= {d["original"] for d in details.values() if d.get("english")}

    texts = [d.get(field.key) or "" for d in details.values()]
    chosen = pending(texts, done) if args.all else pick_sample(texts, done, args.sample)
    print(f"translating {len(chosen)} {args.field} texts ({len(done)} already in English)")

    from src.llm import get_footprint_tracker

    result = asyncio.run(translate(field, chosen))
    known.update(result)
    out_file.write_text(json.dumps(dict(sorted(known.items())), ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {out_file}: {len(known)} texts")

    written = record_footprint(get_footprint_tracker().snapshot(), field=args.field, country=args.country)
    print(f"footprint: {written} ledger row(s) appended")
    for original in chosen[:10]:
        print(f"  {original}\n    -> {result.get(original, '(no answer)')}")


if __name__ == "__main__":
    main()
