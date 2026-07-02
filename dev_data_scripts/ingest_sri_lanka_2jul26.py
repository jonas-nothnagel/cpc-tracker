"""One-shot ingestion: append the 2 Jul 2026 expert-curated Sri Lanka targets
to python/data/sri-lanka-targets.json.

Source xlsx: dev_data_scripts/sharepoint_sync/Sri Lanka/data_sri_lanka_2Jul26.xlsx
  Sheet "Sheet1", 196 curated rows from two documents. Columns:
    Country | Target Title | Target Text | Document | Doc | Convention

Documents (Doc codes verbatim from the xlsx):
  PPPP  Physical Planning Policy & Plan - 2048        4 rows (component level)
  NAP   National Agricultural Policy                192 rows (three levels:
        Goal N / Statement N / Action N.M — the expert kept all levels as rows)

NOTE: "NAP" here is the National AGRICULTURAL Policy (the colleague's code),
not a National Adaptation Plan; the country config carries the display name.
The same xlsx also serves as eval gold (python/data/eval/
sri-lanka-2jul26-expert.json) for scripts/eval_extraction.py.

Per-row mapping mirrors ingest_sri_lanka_15jun26.py (every value traces
verbatim to a source column — no fabrication):
  id             "{Doc}_{seq}"   sequential per doc type (PPPP_1.., NAP_1..)
  text           Target Text     verbatim (whitespace-normalised)
  sourceDocument Doc
  sourceLabel    Target Title    verbatim
  country        "Sri Lanka"
  sources        [{ sourceText: <Target Text>, url: "" }]  (no Source column)
  textCleanup    "verbatim"

English is authoritative (as for the 15 Jun corpus): no textOriginal/language.

Usage: uv run --directory python python ../dev_data_scripts/ingest_sri_lanka_2jul26.py
"""

import json
import sys
from collections import Counter
from pathlib import Path

import openpyxl

REPO = Path(__file__).resolve().parent.parent
XLSX = REPO / "dev_data_scripts/sharepoint_sync/Sri Lanka/data_sri_lanka_2Jul26.xlsx"
TARGETS_JSON = REPO / "python/data/sri-lanka-targets.json"

EXPECTED = {"PPPP": 4, "NAP": 192}


def main() -> int:
    wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
    rows = list(wb["Sheet1"].iter_rows(values_only=True))
    header = [str(h).strip() if h is not None else "" for h in rows[0]]
    idx = {h: i for i, h in enumerate(header)}

    existing = json.loads(TARGETS_JSON.read_text())
    already = {t["sourceDocument"] for t in existing}
    clash = already & set(EXPECTED)
    if clash:
        print(f"ABORT: corpus already contains doc types {sorted(clash)} — not re-appending.")
        return 1

    new_targets = []
    seq: Counter = Counter()
    for r in rows[1:]:
        text = r[idx["Target Text"]]
        if text is None or not str(text).strip():
            continue
        doc = str(r[idx["Doc"]]).strip()
        if doc not in EXPECTED:
            print(f"ABORT: unexpected Doc code {doc!r}")
            return 1
        country = str(r[idx["Country"]]).strip()
        if country != "Sri Lanka":
            print(f"ABORT: unexpected Country {country!r}")
            return 1
        seq[doc] += 1
        clean_text = " ".join(str(text).split())
        title = r[idx["Target Title"]]
        new_targets.append({
            "id": f"{doc}_{seq[doc]}",
            "text": clean_text,
            "sourceDocument": doc,
            "sourceLabel": " ".join(str(title).split()) if title else f"{doc} {seq[doc]}",
            "country": "Sri Lanka",
            "sources": [{"sourceText": clean_text, "url": ""}],
            "textCleanup": "verbatim",
        })

    if dict(seq) != EXPECTED:
        print(f"ABORT: row counts {dict(seq)} != expected {EXPECTED}")
        return 1
    merged = existing + new_targets
    ids = [t["id"] for t in merged]
    if len(ids) != len(set(ids)):
        print("ABORT: duplicate ids after merge")
        return 1

    TARGETS_JSON.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n")
    print(f"Appended {len(new_targets)} targets ({dict(seq)}); corpus {len(existing)} -> {len(merged)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
