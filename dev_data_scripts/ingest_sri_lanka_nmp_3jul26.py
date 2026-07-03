"""One-shot ingestion: append the National Mineral Policy (NMP) expert rows
to python/data/sri-lanka-targets.json.

Source xlsx: dev_data_scripts/sharepoint_sync/Sri Lanka/data_sri_lanka_2Jul26.xlsx
  Sheet "Sheet1". The file was EXTENDED after ingest_sri_lanka_2jul26.py ran:
  SharePoint version history attributes the addition of the NMP / NFAP / NWRP
  rows to the CO colleague (Julien Pigot) on 2 Jul 2026, 17:03. As of
  3 Jul 2026 the sheet holds 402 rows across five Doc codes:
    NAP 192, NFAP 118, NMP 55, NWRP 33, PPPP 4

This script ingests ONLY the 55 NMP rows (7 "Goal NN" rows + 48 clause-level
rows labelled like "1 a)"), per Jonas's decision on 3 Jul 2026. The expert
NFAP (118, clause level) and NWRP (33) rows are deliberately NOT ingested
here: the corpus already carries pipeline-extracted NFAP/NWRP targets and the
replace-vs-keep curation decision is still open. Never hand-edit the targets
file; a future one-shot script handles that decision.

Per-row mapping mirrors ingest_sri_lanka_2jul26.py (every value traces
verbatim to a source column — no fabrication):
  id             "NMP_{seq}"     sequential (NMP_1..NMP_55)
  text           Target Text     verbatim (whitespace-normalised)
  sourceDocument Doc
  sourceLabel    Target Title    verbatim ("Goal 01", "1 a)", ...)
  country        "Sri Lanka"
  sources        [{ sourceText: <Target Text>, url: "" }]  (no Source column)
  textCleanup    "verbatim"

English is authoritative (as for the rest of the corpus): no textOriginal.

Usage: uv run --directory python python ../dev_data_scripts/ingest_sri_lanka_nmp_3jul26.py
"""

import json
import sys
from collections import Counter
from pathlib import Path

import openpyxl

REPO = Path(__file__).resolve().parent.parent
XLSX = REPO / "dev_data_scripts/sharepoint_sync/Sri Lanka/data_sri_lanka_2Jul26.xlsx"
TARGETS_JSON = REPO / "python/data/sri-lanka-targets.json"

INGEST = "NMP"
EXPECTED_ROWS = 55
# Doc codes present in the extended sheet that this script knowingly skips.
KNOWN_OTHER = {"NAP", "PPPP", "NFAP", "NWRP"}


def main() -> int:
    wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
    rows = list(wb["Sheet1"].iter_rows(values_only=True))
    header = [str(h).strip() if h is not None else "" for h in rows[0]]
    idx = {h: i for i, h in enumerate(header)}

    existing = json.loads(TARGETS_JSON.read_text())
    if any(t["sourceDocument"] == INGEST for t in existing):
        print(f"ABORT: corpus already contains {INGEST} — not re-appending.")
        return 1

    new_targets = []
    skipped: Counter = Counter()
    seq = 0
    for r in rows[1:]:
        text = r[idx["Target Text"]]
        if text is None or not str(text).strip():
            continue
        doc = str(r[idx["Doc"]]).strip()
        if doc != INGEST:
            if doc not in KNOWN_OTHER:
                print(f"ABORT: unexpected Doc code {doc!r}")
                return 1
            skipped[doc] += 1
            continue
        country = str(r[idx["Country"]]).strip()
        if country != "Sri Lanka":
            print(f"ABORT: unexpected Country {country!r}")
            return 1
        seq += 1
        clean_text = " ".join(str(text).split())
        title = r[idx["Target Title"]]
        new_targets.append({
            "id": f"{INGEST}_{seq}",
            "text": clean_text,
            "sourceDocument": INGEST,
            "sourceLabel": " ".join(str(title).split()) if title else f"{INGEST} {seq}",
            "country": "Sri Lanka",
            "sources": [{"sourceText": clean_text, "url": ""}],
            "textCleanup": "verbatim",
        })

    if len(new_targets) != EXPECTED_ROWS:
        print(f"ABORT: {len(new_targets)} NMP rows != expected {EXPECTED_ROWS}")
        return 1
    merged = existing + new_targets
    ids = [t["id"] for t in merged]
    if len(ids) != len(set(ids)):
        print("ABORT: duplicate ids after merge")
        return 1

    TARGETS_JSON.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n")
    print(
        f"Appended {len(new_targets)} NMP targets; corpus {len(existing)} -> {len(merged)}. "
        f"Skipped (pending curation decision): {dict(skipped)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
