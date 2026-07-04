"""One-shot swap: replace the 46 pipeline-extracted NWRP rows in
python/data/sri-lanka-targets.json with the 33 expert-curated NWRP rows.

Source xlsx: dev_data_scripts/sharepoint_sync/Sri Lanka/data_sri_lanka_2Jul26.xlsx
  Sheet "Sheet1". The NWRP rows are part of the CO colleague's 2 Jul 2026
  17:03 extension of the file (SharePoint version history), alongside NFAP
  and NMP rows. Labels are "Policy N" / "Strategy N"; strategy cells hold
  multi-line bullet lists, whitespace-normalised to one line here.

Decision (Jonas, 3 Jul 2026): the 46 NWRP rows extracted by the document
pipeline on 2 Jul were never expert-validated; the colleague's 33 expert
rows supersede them (expert provenance over pipeline provenance). NFAP is
deliberately NOT touched: the expert reviewer approved the 9 pipeline
targets at target level on 2 Jul with zero corrections and listed 48 action
lines (stored as activities, marked addedByReviewer in activitySources).
Verification on 3 Jul confirmed her review is fully encoded in the corpus
and that the colleague's separate clause-level NFAP rows (118) contain
47/48 of her lines — same material, different granularity, no conflict —
so they stay un-ingested reference material.

Per-row mapping mirrors ingest_sri_lanka_2jul26.py (every value traces
verbatim to a source column — no fabrication):
  id             "NWRP_{seq}"    fresh sequence after the drop (NWRP_1..33)
  text           Target Text     verbatim (whitespace-normalised)
  sourceDocument Doc
  sourceLabel    Target Title    verbatim ("Policy 1", "Strategy 1", ...)
  country        "Sri Lanka"
  sources        [{ sourceText: <Target Text>, url: "" }]  (no Source column)
  textCleanup    "verbatim"

Usage: uv run --directory python python ../dev_data_scripts/ingest_sri_lanka_nwrp_swap_3jul26.py
"""

import json
import sys
from pathlib import Path

import openpyxl

REPO = Path(__file__).resolve().parent.parent
XLSX = REPO / "dev_data_scripts/sharepoint_sync/Sri Lanka/data_sri_lanka_2Jul26.xlsx"
TARGETS_JSON = REPO / "python/data/sri-lanka-targets.json"

DOC = "NWRP"
EXPECTED_DROPPED = 46
EXPECTED_NEW = 33


def main() -> int:
    wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
    rows = list(wb["Sheet1"].iter_rows(values_only=True))
    header = [str(h).strip() if h is not None else "" for h in rows[0]]
    idx = {h: i for i, h in enumerate(header)}

    existing = json.loads(TARGETS_JSON.read_text())
    old = [t for t in existing if t["sourceDocument"] == DOC]
    if len(old) != EXPECTED_DROPPED:
        print(f"ABORT: expected to drop {EXPECTED_DROPPED} pipeline {DOC} rows, found {len(old)}")
        return 1
    if any(not str(t["id"]).startswith(f"{DOC}_") for t in old):
        print(f"ABORT: unexpected id scheme among existing {DOC} rows")
        return 1
    kept = [t for t in existing if t["sourceDocument"] != DOC]

    new_targets = []
    seq = 0
    for r in rows[1:]:
        doc = str(r[idx["Doc"]] or "").strip()
        if doc != DOC:
            continue
        text = r[idx["Target Text"]]
        if text is None or not str(text).strip():
            continue
        country = str(r[idx["Country"]]).strip()
        if country != "Sri Lanka":
            print(f"ABORT: unexpected Country {country!r}")
            return 1
        seq += 1
        clean_text = " ".join(str(text).split())
        title = r[idx["Target Title"]]
        new_targets.append({
            "id": f"{DOC}_{seq}",
            "text": clean_text,
            "sourceDocument": DOC,
            "sourceLabel": " ".join(str(title).split()) if title else f"{DOC} {seq}",
            "country": "Sri Lanka",
            "sources": [{"sourceText": clean_text, "url": ""}],
            "textCleanup": "verbatim",
        })

    if len(new_targets) != EXPECTED_NEW:
        print(f"ABORT: {len(new_targets)} expert {DOC} rows != expected {EXPECTED_NEW}")
        return 1
    merged = kept + new_targets
    ids = [t["id"] for t in merged]
    if len(ids) != len(set(ids)):
        print("ABORT: duplicate ids after merge")
        return 1

    TARGETS_JSON.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n")
    print(
        f"Replaced {len(old)} pipeline {DOC} rows with {len(new_targets)} expert rows; "
        f"corpus {len(existing)} -> {len(merged)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
