"""Decompose the CO's merged Sri Lanka targets into target text + activities, for review.

Reads `data_sri_lanka_16Sep26.xlsx` (sheets `targets_1` and `targets_0`) and writes a review
workbook that shows, per target, what the pipeline would compare (`text`) and what would ride
along as supporting detail (`activities`), plus a flag wherever the derivation needed a
judgement call.

Background: the CO merged sub-items into their parents to avoid a 700+ target corpus. That
keeps the corpus at 225 targets / 22,226 pairs, but it glues ~339 numbered sub-items into the
target sentences. Our schema has a third slot for exactly this - `activities` - which the
Analyst prompt reads from a dedicated block. Using it keeps the CO's 225 targets and the same
cost, while letting each target's own statement be the thing compared.

`decompose()` is the single source of truth: the later ingest script imports it so the
reviewed sheet and the ingested corpus cannot drift.

Read-only against the source. Run from the repo root:

    python3 dev_data_scripts/decompose_sri_lanka_16sep26.py --xlsx <path> --out <path>
"""

from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import sys
import tempfile
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

# Pinned on the CELL CONTENT, not the file bytes. SharePoint re-saves the container whenever
# anyone opens the file, so a byte hash cries wolf. This digest changes only when a cell
# actually changes.
#
# Note on reading the source: the OneDrive copy can lag behind what Excel shows during
# co-authoring. On 18 Sep the local file sat at an older revision for some time while the
# current one was only visible in Excel. If a check here disagrees with what is on screen,
# force the file to download before believing the script.
EXPECTED_CONTENT_SHA256 = "58d49676bac836fa4ac70556751beaed57ccdd9c7d92e16bd23b97d2b9fbf80b"

EXPECTED_T1 = {
    "LDN": 10, "NAgP": 27, "NBSAP": 16, "NDC": 19, "NEneP": 10, "NEnvP": 55,
    "NLTP": 19, "NPPPP": 4, "NPWM": 8, "NTP": 14, "NWP": 26, "NWRP": 17,
}
EXPECTED_T0 = {
    "LDN": 10, "NAgP": 192, "NBSAP": 140, "NDC": 91, "NEneP": 105, "NEnvP": 170,
    "NLTP": 19, "NPPPP": 4, "NPWM": 8, "NTP": 14, "NWP": 26, "NWRP": 17,
}

# Noted but not acted on: targets_1 carries a section labelled "4.3." whose numbered
# statements in targets_0 are 4.3.1.n, so the label is really 4.3.1. It only mattered while
# NEnvP sections were being split; they are now left as delivered.

# Characters the CO's sheet carries (inventoried on the 18 Sep revision): 1,122 non-breaking
# spaces, 452 zero-width spaces, 108 U+F0B7. They need three different treatments.
ZERO_WIDTH = "​‌‍⁠﻿­"   # delete: they sit INSIDE words
NBSP = " "                                        # a real space
# U+F0B7 is the Symbol-font bullet, a private-use code point with no glyph in normal UI
# fonts (renders as an empty box). The previous corpus carried these bullets as "•".
PRIVATE_USE_BULLETS = {"": "•", "": "•", "": "•", "": "•"}


def sq(value: object) -> str:
    """Normalise one cell: fix the invisible and private-use characters, squash whitespace.

    Zero-width characters are DELETED, never turned into spaces: in this sheet they sit inside
    words ("N" + two zero-width spaces + "ational"), and a space there reads as "N ational".
    """
    text = str(value if value is not None else "")
    text = re.sub(f"[{ZERO_WIDTH}]", "", text).replace(NBSP, " ")
    for glyph, bullet in PRIVATE_USE_BULLETS.items():
        text = text.replace(glyph, bullet)
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"\s+", " ", text).strip()


def has_bad_characters(text: str) -> bool:
    """True if any zero-width, non-breaking or private-use character survived."""
    return any(c in ZERO_WIDTH or c == NBSP or 0xE000 <= ord(c) <= 0xF8FF for c in text)


def lab(value: object) -> str:
    """Normalise a Target Name for joining: lowercase, no spaces, no trailing dot.

    Collapsing spaces repairs the source's `Action 14. 2.` (stray space) to `action14.2`.
    """
    return sq(value).lower().replace(" ", "").rstrip(".")


def content_digest(path: Path) -> str:
    """sha256 over the raw cell values of both target sheets.

    Stable across SharePoint re-saves, which rewrite the zip container without touching a cell.
    """
    digest = hashlib.sha256()
    book = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for sheet in ("targets_1", "targets_0"):
        digest.update(f"\n--{sheet}--\n".encode())
        for row in book[sheet].iter_rows(values_only=True):
            if any(c not in (None, "") for c in row):
                # Raw values, not sq(): the pin must not move when the cleaning code changes.
                raw = ("" if c is None else str(c) for c in row)
                digest.update(("\x1f".join(raw) + "\x1e").encode())
    book.close()
    return digest.hexdigest()


def read_sheet(path: Path, sheet: str) -> list[dict]:
    book = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = list(book[sheet].iter_rows(values_only=True))
    book.close()
    header = [sq(c) for c in rows[0]]
    # Earlier versions carried NBSAP's merged text in an unnamed 9th column. It is gone now
    # that every document is merged into column C, but name it if it reappears.
    for i, name in enumerate(header):
        if not name:
            header[i] = f"Unnamed {i}"
    out = []
    for row in rows[1:]:
        record = {header[i]: (row[i] if i < len(row) else None) for i in range(len(header))}
        if all(v in (None, "") for v in record.values()):
            continue
        out.append(record)
    return out


def decompose(t1: list[dict], t0: list[dict]) -> list[dict]:
    """Split each `targets_1` row into the target statement plus its activity lines.

    Returns one record per `targets_1` row, in sheet order. `text` is what the pipeline would
    compare; `activities` is what would ride along in the Analyst prompt's activities block.
    `flag` marks where the derivation needed a judgement call:

      OK      nothing to decide
      REVIEW  needs a human eye before this is ingested
    """
    by_doc: dict[str, list[dict]] = defaultdict(list)
    for row in t0:
        by_doc[sq(row["Doc"])].append(row)

    def children(doc: str, parent: str) -> list[dict]:
        """targets_0 rows exactly one numbering level below `parent`."""
        pattern = re.compile(rf"{re.escape(parent)}\.\d+")
        return [r for r in by_doc[doc] if pattern.fullmatch(lab(r["Target Name"]))]

    out: list[dict] = []
    for row in t1:
        doc, name = sq(row["Doc"]), sq(row["Target Name"])
        original = sq(row["Target Text"])
        text, acts, parent = original, [], None
        route, flag, note = "as delivered", "OK", ""

        if doc == "NBSAP":
            # Parent is "NBT n"; its children are labelled "Action n.m", so the generic
            # one-level-deeper rule does not reach them.
            number = re.fullmatch(r"nbt(\d+)", lab(name)).group(1)
            parent = next((r for r in by_doc[doc] if lab(r["Target Name"]) == f"nbt{number}"), None)
            acts = [r for r in by_doc[doc]
                    if re.fullmatch(rf"action{number}(\.\d+)?", lab(r["Target Name"]))]
            route = "statement + Action rows from targets_0"

        elif doc == "NAgP" and lab(name).startswith("policystatement"):
            # targets_1 says "Policy Statement n", targets_0 says "n." - join on the number.
            number = re.fullmatch(r"policystatement(\d+)", lab(name)).group(1)
            parent = next((r for r in by_doc[doc] if lab(r["Target Name"]) == number), None)
            acts = children(doc, number)
            route = "statement + numbered items from targets_0"
            if not parent:
                flag, note = "REVIEW", f"no statement row '{number}.' found in targets_0"

        elif doc == "NEnvP" and re.fullmatch(r"4(\.\d+)+", lab(name)):
            # Left exactly as delivered, deliberately. targets_0 has this section's numbered
            # statements but no row for the section itself, so the only way to split would be
            # to cut a heading out of the merged string. That yields a target like
            # "Conservation of Wetlands" or "Research and Development": a chapter title, not a
            # commitment. A title is a worse thing to compare than the merged cell, so the
            # split is not worth making here. The numbered statements stay where they are,
            # inside the target text.
            route = "left as delivered"
            note = ("section heading plus its numbered statements. Not split: the document "
                    "has no row for the section itself, so the target would be only a title")

        elif doc == "NDC":
            # Each cell is a numbered list of that sector's measures, all of equal standing.
            # No heading sentence to lift out, so there is nothing to split.
            items = len(re.findall(r"(?<![\d.])\d{1,2}\.\s", original))
            route = "left as delivered"
            note = (f"cell is a numbered list of {items} measures for this sector, all of "
                    "equal standing - no heading sentence to separate out"
                    if items > 1 else "single measure, nothing to separate out")

        else:
            # Everything else: the statement is its own targets_0 row, and its children (if
            # any) are one numbering level deeper. Covers NEneP 3.x, NEnvP Goals/Objectives,
            # NAgP Policy Goals, and the seven documents that were never merged.
            parent = next((r for r in by_doc[doc] if lab(r["Target Name"]) == lab(name)), None)
            acts = children(doc, lab(name))
            if acts:
                route = "statement + numbered items from targets_0"

        if parent is not None:
            text = sq(parent["Target Text"])

        out.append({
            "doc": doc,
            "name": name,
            "text": text,
            "activities": [sq(a["Target Text"]) for a in acts],
            "route": route,
            "flag": flag,
            "note": note,
            "chars_before": len(original),
            "chars_after": len(text),
        })
    return out


FLAG_FILL = {
    "OK":     PatternFill("solid", fgColor="E8F3E8"),
    "REVIEW": PatternFill("solid", fgColor="FBE3D6"),
}
HEADERS = ["Doc", "Target Name", "Target Text (proposed)", "Activities (one per line)",
           "# Activities", "Chars before", "Chars after", "Derived how", "Flag",
           "What to check"]
WIDTHS = [8, 22, 62, 70, 12, 13, 12, 32, 11, 54]

SUMMARY_ROWS = [
    ("Sri Lanka targets: proposed split into target text and activities", None, True),
    ("", None, False),

    ("What this sheet proposes", None, True),
    ("The target list stays exactly as delivered in targets_1: the same 225 targets across", None, False),
    ("12 documents, and the same analysis cost. The only change is that where a cell holds a", None, False),
    ("statement followed by its numbered sub-items, the statement goes in the target text and", None, False),
    ("the sub-items go in a separate 'activities' field.", None, False),
    ("", None, False),
    ("This is not a fix for a broken analysis. The pipeline handles long merged text perfectly", None, False),
    ("well, and it breaks every target into goal, action, area, audience and outcome either", None, False),
    ("way. The split is mainly so the dashboard can list activities as separate items under a", None, False),
    ("target, with a count, instead of one wall of prose. It also tells the analysis which", None, False),
    ("sentence is the commitment and which are the steps toward it.", None, False),
    ("", None, False),
    ("It is applied only where it is free: 41 of the 225 targets, where the statement is", None, False),
    ("already its own row in targets_0. The other 184 are untouched.", None, False),
    ("", None, False),
    ("NBSAP already works this way in the current dashboard, with its 123 actions listed", None, False),
    ("under each target. A spreadsheet column headed 'activities' is also a format the upload", None, False),
    ("path already reads directly, so this is a normal shape for the data, not a special case.", None, False),
    ("Nothing here is re-typed or invented: every statement and every numbered item is", None, False),
    ("already its own row in targets_0, so the split just puts them back where they were.", None, False),
    ("", None, False),

    ("Everything is present in this version", None, True),
    ("An earlier version of this file was missing content: the National Energy Policy cells", None, False),
    ("ended announcing their strategies without listing them, and NBSAP's actions sat in a", None, False),
    ("separate unnamed column. Both are resolved here. All 796 rows of targets_0 now appear", None, False),
    ("inside targets_1, and the split below recovers every one of them.", None, False),
    ("", None, False),

    ("Where the split is not made, and why", None, True),
    ("NEnvP, National Environment Policy, 27 rows, and the 19 NDC rows: left exactly as", None, False),
    ("delivered.", None, False),
    ("", None, False),
    ("For NEnvP the document has no row for the section itself, only for the numbered", None, False),
    ("statements under it. Splitting would mean cutting a heading out of the merged text, and", None, False),
    ("that heading is a chapter title rather than a commitment: 'Conservation of Wetlands',", None, False),
    ("'Resource Mobilization', 'Research and Development', around 50 characters each. A title", None, False),
    ("is a worse thing to compare than the merged cell, so the split is not worth making.", None, False),
    ("", None, False),
    ("The rule applied throughout: split only where the document itself supplies the", None, False),
    ("statement as its own row, so the split puts back what was already there. Never", None, False),
    ("manufacture a target by cutting a string.", None, False),
    ("", None, False),

    ("NDC, same reasoning", None, True),
    ("17 of the 19 NDC rows are a numbered list of that sector's measures, 3 to 9 of them,", None, False),
    ("all of equal standing. There is no statement to lift out either, so they stay as", None, False),
    ("delivered. For reference, the current dashboard carries these as 91 separate targets;", None, False),
    ("merging them into 19 is a deliberate change.", None, False),
    ("", None, False),

    ("Cost, for reference", None, True),
    ("targets_0, every row its own target     784 targets   256,374 pairs   ~8 h, ~19 kg CO2e", None, False),
    ("targets_1 as delivered                  225 targets    22,226 pairs   ~43 min, ~1.7 kg", None, False),
    ("targets_1 with activities split out     225 targets    22,226 pairs   ~43 min, ~1.7 kg", None, False),
    ("Activities do not create comparisons, so splitting them out costs nothing extra.", None, False),
    ("", None, False),

    ("Text clean-up, handled at import rather than in this sheet", None, True),
    ("39 non-breaking spaces and 7 zero-width spaces across 19 rows.", None, False),
    ("Words run together that a previous clean-up had fixed: 'uniqueenvironmental',", None, False),
    ("'riverbasin', 'andlocal', 'customswhen'. Also some this file fixes that the current", None, False),
    ("data still has wrong: 'c o n s u m i n g' and 'community garders'.", None, False),
    ("Rule: only add missing spaces and correct scanning errors. Never drop, add or swap a", None, False),
    ("word. 'community garders' becomes 'community gardens'; 'community' stays.", None, False),
]


def write_workbook(rows: list[dict], out_path: Path, source_name: str, digest: str) -> None:
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.title = "decomposed"

    for col, (head, width) in enumerate(zip(HEADERS, WIDTHS), start=1):
        cell = sheet.cell(row=1, column=col, value=head)
        cell.font = Font(bold=True)
        cell.alignment = Alignment(vertical="top", wrap_text=True)
        sheet.column_dimensions[get_column_letter(col)].width = width

    for i, rec in enumerate(rows, start=2):
        values = [rec["doc"], rec["name"], rec["text"], "\n".join(rec["activities"]),
                  len(rec["activities"]), rec["chars_before"], rec["chars_after"],
                  rec["route"], rec["flag"], rec["note"]]
        for col, value in enumerate(values, start=1):
            cell = sheet.cell(row=i, column=col, value=value)
            cell.alignment = Alignment(vertical="top", wrap_text=col in (3, 4, 10))
        sheet.cell(row=i, column=9).fill = FLAG_FILL[rec["flag"]]

    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = f"A1:{get_column_letter(len(HEADERS))}{len(rows) + 1}"

    summary = book.create_sheet("summary")
    summary.column_dimensions["A"].width = 96
    summary.column_dimensions["B"].width = 12
    line = 1
    for text, value, bold in SUMMARY_ROWS:
        cell = summary.cell(row=line, column=1, value=text)
        if bold:
            cell.font = Font(bold=True)
        if value is not None:
            summary.cell(row=line, column=2, value=value)
        line += 1

    line += 1
    summary.cell(row=line, column=1, value="Flag counts").font = Font(bold=True)
    line += 1
    meanings = {
        "OK": "nothing to decide",
        "REVIEW": "worth an eye before this is ingested",
    }
    for flag in ("OK", "REVIEW"):
        count = sum(1 for r in rows if r["flag"] == flag)
        summary.cell(row=line, column=1, value=f"{flag:9} {count:4d}   {meanings[flag]}")
        summary.cell(row=line, column=1).fill = FLAG_FILL[flag]
        line += 1

    line += 1
    summary.cell(row=line, column=1, value="Provenance").font = Font(bold=True)
    line += 1
    for text in (f"Source: {source_name}",
                 f"Content digest (sha256 over the cell values, not the file bytes): {digest}",
                 f"Targets: {len(rows)}   Activity lines recovered: "
                 f"{sum(len(r['activities']) for r in rows)}",
                 "Generated by dev_data_scripts/decompose_sri_lanka_16sep26.py (read-only)."):
        summary.cell(row=line, column=1, value=text)
        line += 1

    book.save(out_path)


def norm(text: str) -> str:
    """Aggressive normalisation, for containment checks only."""
    return re.sub(r"[^a-z0-9]+", " ", sq(text).lower()).strip()


def verify(t1: list[dict], t0: list[dict], rows: list[dict]) -> bool:
    """Print every check. Returns False if any hard check failed."""
    ok = True

    def check(label: str, passed: bool, detail: str = "") -> None:
        nonlocal ok
        ok &= passed
        print(f"  [{'PASS' if passed else 'FAIL'}] {label}" + (f"  {detail}" if detail else ""))

    print("\nSource")
    c1 = Counter(sq(r["Doc"]) for r in t1)
    c0 = Counter(sq(r["Doc"]) for r in t0)
    check("targets_1 per-document counts", dict(c1) == EXPECTED_T1,
          "" if dict(c1) == EXPECTED_T1 else f"got {dict(sorted(c1.items()))}")
    check("targets_0 per-document counts", dict(c0) == EXPECTED_T0,
          "" if dict(c0) == EXPECTED_T0 else f"got {dict(sorted(c0.items()))}")

    goals = [sq(r["Target Text"]) for r in t1
             if sq(r["Doc"]) == "NAgP" and sq(r["Target Name"]).startswith("Policy Goal")]
    check("12 NAgP Policy Goals, all distinct", len(goals) == 12 == len(set(goals)),
          f"{len(goals)} rows, {len(set(goals))} distinct")

    dupes = [t for t, n in Counter(norm(r["Target Text"]) for r in t1).items() if n > 1]
    check("no duplicate target text in targets_1", not dupes,
          "" if not dupes else f"{len(dupes)} duplicated")

    print("\nDecomposition")
    check(f"{len(EXPECTED_T1)} documents, {sum(EXPECTED_T1.values())} targets",
          len(rows) == sum(EXPECTED_T1.values()))

    # Splitting must never leave a long target behind: if a statement was lifted out, what
    # remains is that statement. Rows left merged on purpose are allowed to be long.
    split_rows = [r for r in rows if r["chars_before"] != r["chars_after"]]
    long_splits = [r for r in split_rows if r["chars_after"] > 800]
    check("every split target is under 800 chars", not long_splits,
          f"{len(split_rows)} split, {len(long_splits)} still long")
    merged = [r for r in rows if r["chars_after"] > 800]
    print(f"  [note] {len(merged)} targets are over 800 chars, all left merged on purpose: "
          f"{dict(Counter(r['doc'] for r in merged))}")

    # Nothing lost: every targets_0 row must survive as a target, as an activity, or inside a
    # target that was deliberately left merged.
    as_target = {norm(r["text"]) for r in rows}
    as_activity = {norm(a) for r in rows for a in r["activities"]}
    merged_blob = defaultdict(str)
    for r in rows:
        merged_blob[r["doc"]] += " || " + norm(r["text"])
    lost = []
    for row in t0:
        key = norm(row["Target Text"])
        if not key or key in as_target or key in as_activity:
            continue
        if key in merged_blob[sq(row["Doc"])]:
            continue
        lost.append((sq(row["Doc"]), sq(row["Target Name"])))
    check("every targets_0 row survives as target, activity, or inside a merged target",
          not lost, "" if not lost else f"{len(lost)} lost: {lost[:6]}")

    print("\nPer document")
    print(f"  {'doc':7}{'targets':>9}{'activities':>12}   flags")
    for doc in sorted(EXPECTED_T1):
        group = [r for r in rows if r["doc"] == doc]
        flags = Counter(r["flag"] for r in group)
        acts = sum(len(r["activities"]) for r in group)
        pretty = " ".join(f"{k}:{v}" for k, v in sorted(flags.items()))
        print(f"  {doc:7}{len(group):9d}{acts:12d}   {pretty}")

    counts = Counter(r["flag"] for r in rows)
    print(f"\n  flags: {dict(sorted(counts.items()))}")
    print(f"  activity lines recovered: {sum(len(r['activities']) for r in rows)}")
    return ok


def main() -> int:
    default_src = Path.home() / (
        "Library/CloudStorage/OneDrive-UnitedNationsDevelopmentProgramme-"
        "GEFGBFEarlyActionSupportOneDrive-AIFlagship/Sri Lanka/data_sri_lanka_16Sep26.xlsx"
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx", type=Path, default=default_src)
    parser.add_argument("--out", type=Path,
                        default=Path("data_sri_lanka_16Sep26_decomposed_for_review.xlsx"))
    args = parser.parse_args()

    if not args.xlsx.exists():
        print(f"source not found: {args.xlsx}", file=sys.stderr)
        return 2

    # Work on a copy: SharePoint re-saves mutate the live file underneath a long read.
    with tempfile.TemporaryDirectory() as tmp:
        local = Path(tmp) / args.xlsx.name
        shutil.copy2(args.xlsx, local)
        digest = content_digest(local)
        print(f"source:  {args.xlsx}")
        print(f"content: {digest}"
              + ("" if digest == EXPECTED_CONTENT_SHA256
                 else "   <- CONTENT DIFFERS from the pinned version, re-read the checks below"))

        t1 = read_sheet(local, "targets_1")
        t0 = read_sheet(local, "targets_0")
        rows = decompose(t1, t0)
        passed = verify(t1, t0, rows)
        write_workbook(rows, args.out, args.xlsx.name, digest)

    print(f"\nwrote {args.out}")
    if not passed:
        print("\nsome checks FAILED - read the output above before sending this workbook.")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
