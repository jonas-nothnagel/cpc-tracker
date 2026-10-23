"""The review sheet for steps 2 and 3 of the BER plan: a person checks each
line's area, and each line's expenditure type of the official chain.

  build   python/output/<country>/ber_areas_<lens>.json (both models' readings)
          -> one workbook, a sheet per country: every line with its money, each
          model's area and reason, and empty columns for the call. Lines the
          models place differently come first, then the rest, largest money
          first. Earlier calls (python/data/<country>-ber-areas.json) are
          filled in. Where python/output/<country>/ber_types_globe.json
          exists, a "<Country> types" sheet does the same for the types.
  import  the filled workbook -> python/data/<country>-ber-areas.json (and
          <country>-ber-types.json): each call with who made it and when. Only
          these count as checked; until then the brief marks a line's area or
          type "AI-suggested, not reviewed".

Run from python/:
    .venv/bin/python scripts/ber_review_sheet.py build [--out PATH]
    .venv/bin/python scripts/ber_review_sheet.py import PATH --by "Name"
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import DATA_DIR, OUTPUT_DIR  # noqa: E402

COUNTRIES = {"mongolia": "Mongolia", "panama": "Panama", "sri-lanka": "Sri Lanka"}
LENS_KEYS = {"globe": "globe_categories"}
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "tmp" / "ber" / "BER review sheet - GLOBE.xlsx"
CALLS = {"Accept": "accept", "Change": "change", "None fits": "none"}

COLUMNS = [
    ("Line", 16),
    ("Name", 44),
    ("Institution or ministry", 28),
    ("The review's own tags", 22),
    ("Reviewed spending", 16),
    ("US$ million", 12),
    ("Years", 10),
    ("Model 1: area", 26),
    ("Model 1: score", 9),
    ("Model 1: reason", 50),
    ("Model 2: area", 26),
    ("Model 2: reason", 50),
    ("The two models", 18),
    ("Your call", 12),
    ("Area, if you change it", 26),
    ("Note", 30),
]
STATUS_WORDS = {
    "models-differ": "place it differently",
    "no-clear-area": "find no clear area",
    "models-agree": "agree",
    "one-model": "one model only",
}


def area_names(lens: str) -> dict[str, str]:
    categories = json.loads((DATA_DIR / "categories.json").read_text())[LENS_KEYS[lens]]
    return {c["id"]: c["name"] for c in categories}


def money(record: dict[str, Any], line: dict[str, Any]) -> tuple[float, float, str]:
    """The line's counted amount over the record's complete years, in its own
    currency and in US$ (each year at its own rate)."""
    years = [y for y in record["years"] if y["complete"]]
    local = usd = 0.0
    for y in years:
        cells = (line["amounts"].get(y["year"]) or {}).values()
        value = sum((c or {}).get("counted", 0.0) for c in cells)
        local += value
        scale = 1000.0 if record["unit"] == "billion" else 1.0
        usd += value * scale / y["usdRate"]
    span = f"{years[0]['year']}-{years[-1]['year']}" if years else ""
    return local, usd, span


def build(lens: str, out: Path) -> None:
    names = area_names(lens)
    wb = Workbook()
    guide = wb.active
    guide.title = "How to use"
    for row in [
        ["One row per budget line of the expenditure review, a sheet per country."],
        ["Two AI models placed each line in a GLOBE area from the review's own description of it, without its amounts."],
        ["Rows where the two models place the line differently, or find no clear area, come first; then the rest, largest money first."],
        ["Your call: Accept (model 1's area), Change (pick the area in the next column) or None fits (the line stays apart)."],
        ["Two models agreeing is not a check: only your call counts as checked. Leave a row empty to decide later."],
        ["Send the sheet back as it is; scripts/ber_review_sheet.py import reads the calls."],
    ]:
        guide.append(row)
    guide.column_dimensions["A"].width = 120

    area_list = list(names.values())
    for country, title in COUNTRIES.items():
        path = OUTPUT_DIR / country / f"ber_areas_{lens}.json"
        if not path.exists():
            continue
        readings = json.loads(path.read_text())
        record = json.loads((DATA_DIR / f"{country}-ber.json").read_text())["record"]
        by_code = {l["code"]: l for l in record["lines"]}
        earlier = load_calls(country, lens)
        rows = []
        for r in readings["lines"]:
            line = by_code[r["code"]]
            local, usd, span = money(record, line)
            rows.append((r, line, local, usd, span))
        priority = {"models-differ": 0, "no-clear-area": 1, "one-model": 2, "models-agree": 3}
        rows.sort(key=lambda x: (priority[x[0]["status"]], -x[2], x[0]["code"]))

        ws = wb.create_sheet(title)
        ws.append([c for c, _ in COLUMNS])
        for i, (_, width) in enumerate(COLUMNS, start=1):
            ws.column_dimensions[get_column_letter(i)].width = width
        for cell in ws[1]:
            cell.font = Font(bold=True)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.freeze_panes = "C2"
        unit = f"{record['currency']} {record['unit']}"
        ws.cell(1, 5).value = f"Reviewed spending ({unit})"
        for r, line, local, usd, span in rows:
            first, second = r["first"], r["second"] or {}
            call = earlier.get(r["code"], {})
            ws.append(
                [
                    r["code"],
                    line["name"],
                    line.get("institution") or line.get("ministry") or "",
                    "; ".join(line.get("tags", [])) if isinstance(line.get("tags"), list) else "",
                    round(local, 3),
                    round(usd, 2),
                    span,
                    names.get(first["area"], "") if first["area"] else "",
                    first["score"],
                    (first["ranked"][0]["reasoning"] if first["ranked"] else ""),
                    names.get(second.get("area"), "") if second.get("area") else "",
                    (second["ranked"][0]["reasoning"] if second.get("ranked") else ""),
                    STATUS_WORDS[r["status"]],
                    next((k for k, v in CALLS.items() if v == call.get("call")), ""),
                    names.get(call.get("area"), "") if call.get("call") == "change" else "",
                    call.get("note", ""),
                ]
            )
        shade = PatternFill("solid", fgColor="FFF5C7")
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = Alignment(wrap_text=True, vertical="top")
            if row[12].value in (STATUS_WORDS["models-differ"], STATUS_WORDS["no-clear-area"]):
                row[12].fill = shade
        last = ws.max_row
        calls = DataValidation(type="list", formula1='"' + ",".join(CALLS) + '"', allow_blank=True)
        areas = DataValidation(type="list", formula1='"' + ",".join(area_list) + '"', allow_blank=True)
        ws.add_data_validation(calls)
        ws.add_data_validation(areas)
        calls.add(f"N2:N{last}")
        areas.add(f"O2:O{last}")
    build_type_sheets(wb)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    print(f"Wrote {out}")


# ---------------------------------------------------------------------------
# The expenditure types of the official chain (step 3)
# ---------------------------------------------------------------------------

TYPE_COLUMNS = [
    ("Line", 16),
    ("Name", 44),
    ("Reviewed spending", 16),
    ("US$ million", 12),
    ("Years", 10),
    ("Model 1: type", 40),
    ("Model 1: score", 9),
    ("Model 1: reason", 50),
    ("Model 2: type", 40),
    ("Model 2: reason", 50),
    ("GBF targets both readings lead to", 18),
    ("The two models", 18),
    ("Your call", 12),
    ("Type code, if you change it", 14),
    ("Note", 30),
]
TYPE_STATUS_WORDS = {
    "models-differ": "pick different types",
    "no-clear-type": "find no clear type",
    "models-agree": "agree",
    "one-model": "one model only",
}


def type_sheet_title(title: str) -> str:
    return f"{title} types"


def build_type_sheets(wb: Workbook) -> None:
    """A sheet per country for the lines' expenditure types: rows whose two
    readings lead to no shared GBF target first, then those the models type
    differently, then the rest, largest money first."""
    guide = wb["How to use"]
    guide.append([])
    guide.append(["The 'types' sheets: the same lines, each placed by the two models in a BIOFIN expenditure type (GLOBE level 3)."])
    guide.append(["A type leads to the GBF targets BIOFIN files it under; a line meets a national target of the 7th National Report through a GBF target both readings lead to."])
    guide.append(["Your call: Accept (model 1's type), Change (write the type code, e.g. 7.01.12) or None fits."])
    for country, title in COUNTRIES.items():
        path = OUTPUT_DIR / country / "ber_types_globe.json"
        if not path.exists():
            continue
        readings = json.loads(path.read_text())
        record = json.loads((DATA_DIR / f"{country}-ber.json").read_text())["record"]
        by_code = {l["code"]: l for l in record["lines"]}
        earlier = load_type_calls(country)
        rows = []
        for r in readings["lines"]:
            local, usd, span = money(record, by_code[r["code"]])
            rows.append((r, by_code[r["code"]], local, usd, span))
        rows.sort(key=lambda x: (x[0]["status"] != "apart", x[0]["typeStatus"] == "models-agree", -x[2], x[0]["code"]))

        ws = wb.create_sheet(type_sheet_title(title))
        ws.append([c for c, _ in TYPE_COLUMNS])
        for i, (_, width) in enumerate(TYPE_COLUMNS, start=1):
            ws.column_dimensions[get_column_letter(i)].width = width
        for cell in ws[1]:
            cell.font = Font(bold=True)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.freeze_panes = "C2"
        ws.cell(1, 3).value = f"Reviewed spending ({record['currency']} {record['unit']})"

        def named(reading: dict[str, Any] | None) -> str:
            if not reading or not reading.get("ranked"):
                return ""
            top = reading["ranked"][0]
            return f"{top['id']} {top['name']} (GBF {', '.join(str(g) for g in top['gbf'])})"

        for r, line, local, usd, span in rows:
            first, second = r["first"], r["second"]
            call = earlier.get(r["code"], {})
            ws.append(
                [
                    r["code"],
                    line["name"],
                    round(local, 3),
                    round(usd, 2),
                    span,
                    named(first),
                    first["score"],
                    first["ranked"][0]["reasoning"] if first["ranked"] else "",
                    named(second),
                    second["ranked"][0]["reasoning"] if second and second.get("ranked") else "",
                    ", ".join(str(g) for g in r["gbf"]) or "none",
                    TYPE_STATUS_WORDS[r["typeStatus"]],
                    next((k for k, v in CALLS.items() if v == call.get("call")), ""),
                    call.get("type", "") if call.get("call") == "change" else "",
                    call.get("note", ""),
                ]
            )
        shade = PatternFill("solid", fgColor="FFF5C7")
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = Alignment(wrap_text=True, vertical="top")
            if row[10].value == "none" or row[11].value != TYPE_STATUS_WORDS["models-agree"]:
                row[11].fill = shade
        calls = DataValidation(type="list", formula1='"' + ",".join(CALLS) + '"', allow_blank=True)
        ws.add_data_validation(calls)
        calls.add(f"M2:M{ws.max_row}")


def type_calls_path(country: str) -> Path:
    return DATA_DIR / f"{country}-ber-types.json"


def load_type_calls(country: str) -> dict[str, dict[str, Any]]:
    path = type_calls_path(country)
    return json.loads(path.read_text()).get("types", {}) if path.exists() else {}


def import_type_calls(wb: Any, by: str) -> None:
    types = {t["id"] for t in json.loads((DATA_DIR / "globe-expenditure-types.json").read_text())["types"]}
    for country, title in COUNTRIES.items():
        sheet = type_sheet_title(title)
        if sheet not in wb.sheetnames:
            continue
        readings = json.loads((OUTPUT_DIR / country / "ber_types_globe.json").read_text())
        first_type = {r["code"]: r["first"]["type"] for r in readings["lines"]}
        target = type_calls_path(country)
        stored = json.loads(target.read_text()) if target.exists() else {}
        calls = stored.get("types", {})
        changed = 0
        for row in wb[sheet].iter_rows(min_row=2, values_only=True):
            code, call, code_given, note = row[0], row[12], row[13], row[14]
            if not code or not call:
                continue
            kind = CALLS.get(str(call).strip())
            if kind is None:
                raise SystemExit(f"{sheet}, line {code}: unknown call {call!r}")
            chosen = str(code_given).strip() if code_given else ""
            if kind == "change" and chosen not in types:
                raise SystemExit(f"{sheet}, line {code}: Change needs a type code from the GLOBE workbook, found {chosen!r}")
            entry = {
                "call": kind,
                "type": chosen if kind == "change" else first_type.get(code) if kind == "accept" else None,
                "by": by,
                "at": date.today().isoformat(),
                **({"note": str(note).strip()} if note else {}),
            }
            if calls.get(code, {}) | {"at": entry["at"]} != entry:
                changed += 1
            calls[code] = entry
        stored["_provenance"] = (
            "A person's calls on the expenditure types the AI suggested for the review's lines (step 3 of the BER "
            "plan, the official chain); written by python/scripts/ber_review_sheet.py import. Only these count as checked."
        )
        stored["types"] = dict(sorted(calls.items()))
        target.write_text(json.dumps(stored, indent=2, ensure_ascii=False) + "\n")
        print(f"{sheet}: {changed} calls new or changed, {len(calls)} in all -> {target}")


def calls_path(country: str) -> Path:
    return DATA_DIR / f"{country}-ber-areas.json"


def load_calls(country: str, lens: str) -> dict[str, dict[str, Any]]:
    path = calls_path(country)
    if not path.exists():
        return {}
    return json.loads(path.read_text()).get(lens, {})


def import_calls(path: Path, lens: str, by: str) -> None:
    names = area_names(lens)
    by_name = {v: k for k, v in names.items()}
    wb = load_workbook(path, data_only=True)
    for country, title in COUNTRIES.items():
        if title not in wb.sheetnames:
            continue
        ws = wb[title]
        readings = json.loads((OUTPUT_DIR / country / f"ber_areas_{lens}.json").read_text())
        first_area = {r["code"]: r["first"]["area"] for r in readings["lines"]}
        target = calls_path(country)
        stored = json.loads(target.read_text()) if target.exists() else {}
        calls = stored.get(lens, {})
        changed = 0
        for row in ws.iter_rows(min_row=2, values_only=True):
            code, call, area, note = row[0], row[13], row[14], row[15]
            if not code or not call:
                continue
            kind = CALLS.get(str(call).strip())
            if kind is None:
                raise SystemExit(f"{title}, line {code}: unknown call {call!r}")
            if kind == "change" and area not in by_name:
                raise SystemExit(f"{title}, line {code}: Change needs an area from the list, found {area!r}")
            entry = {
                "call": kind,
                "area": by_name[area] if kind == "change" else first_area.get(code) if kind == "accept" else None,
                "by": by,
                "at": date.today().isoformat(),
                **({"note": str(note).strip()} if note else {}),
            }
            if calls.get(code, {}) | {"at": entry["at"]} != entry:
                changed += 1
            calls[code] = entry
        stored["_provenance"] = (
            "A person's calls on the areas the AI suggested for the review's lines (step 2 of the BER plan); "
            "written by python/scripts/ber_review_sheet.py import. Only these count as checked."
        )
        stored[lens] = dict(sorted(calls.items()))
        target.write_text(json.dumps(stored, indent=2, ensure_ascii=False) + "\n")
        print(f"{title}: {changed} calls new or changed, {len(calls)} in all -> {target}")
    import_type_calls(wb, by)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    b = sub.add_parser("build")
    b.add_argument("--lens", default="globe", choices=sorted(LENS_KEYS))
    b.add_argument("--out", type=Path, default=DEFAULT_OUT)
    i = sub.add_parser("import")
    i.add_argument("sheet", type=Path)
    i.add_argument("--lens", default="globe", choices=sorted(LENS_KEYS))
    i.add_argument("--by", required=True, help="Who made the calls, as the brief should name them")
    args = parser.parse_args()
    if args.command == "build":
        build(args.lens, args.out)
    else:
        import_calls(args.sheet, args.lens, args.by)


if __name__ == "__main__":
    main()
