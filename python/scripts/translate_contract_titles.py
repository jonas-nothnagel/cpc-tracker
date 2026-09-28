"""English titles for the contracts the page shows (machine translation).

Reuses the August prompt, model and cache namespace (tender_mt_v1), so the
titles translated then are cache hits and cost nothing again. Writes a flat
{original: english} file beside the payload, which the bake merges
(re-run scripts/build_contracts_layer.py afterwards).

Needs the LLM settings of the project .env and, from a worktree, the main
checkout's cache:

  set -a; . /path/to/main/.env; set +a
  CPC_CACHE_DIR=/path/to/main/python/output/.cache \\
      .venv/bin/python scripts/translate_contract_titles.py --sample 50

`--sample N` takes a seeded sample of the untranslated titles of contracts
mainly for nature or climate or with it as a side benefit, for a check
before the full run; `--all` translates every untranslated title the page
shows.
"""

from __future__ import annotations

import argparse
import asyncio
import gzip
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]

MT_SYSTEM = (
    "Translate the Mongolian public procurement contract title to concise English. "
    "Return ONLY the translation, no commentary."
)
NAMESPACE = "tender_mt_v1"


def pick_sample(titles: list[str], done: set[str], n: int, seed: int = 20260928) -> list[str]:
    """A seeded sample of the titles not translated yet."""
    pool = sorted({t for t in titles if t and t not in done})
    return random.Random(seed).sample(pool, min(n, len(pool)))


async def translate(originals: list[str]) -> dict[str, str]:
    sys.path.insert(0, str(REPO / "python"))
    from src.llm import call_llm_batch

    calls = [{"system": MT_SYSTEM, "user": o, "temperature": 0.0, "max_tokens": 200} for o in originals]
    raws = await call_llm_batch(calls, cache_namespace=NAMESPACE, desc="contract titles")
    return {o: (r or "").strip() for o, r in zip(originals, raws) if (r or "").strip()}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--country", default="mongolia")
    ap.add_argument("--model", default="gpt-5-4")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--sample", type=int)
    group.add_argument("--all", action="store_true")
    args = ap.parse_args()

    out_dir = REPO / "python/output" / args.country / args.model
    payload = json.loads(gzip.decompress((out_dir / "contracts.json.gz").read_bytes()))
    details = json.loads(gzip.decompress((out_dir / "contract-details.json.gz").read_bytes()))
    titles_file = out_dir / "contract-titles.en.json"
    known: dict[str, str] = json.loads(titles_file.read_text()) if titles_file.exists() else {}
    done = set(known) | {d["original"] for d in details.values() if d.get("english")}

    if args.all:
        chosen = sorted({d["original"] for d in details.values() if d["original"] and d["original"] not in done})
    else:
        green = [details[c["id"]]["original"] for c in payload["contracts"] if c["tier"] != "none"]
        chosen = pick_sample(green, done, args.sample)
    print(f"translating {len(chosen)} titles ({len(done)} already in English)")

    result = asyncio.run(translate(chosen))
    known.update(result)
    titles_file.write_text(json.dumps(dict(sorted(known.items())), ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {titles_file}: {len(known)} titles")
    for original in chosen[:10]:
        print(f"  {original}\n    -> {result.get(original, '(no answer)')}")


if __name__ == "__main__":
    main()
