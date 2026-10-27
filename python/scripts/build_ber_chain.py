"""The official chain of the BER plan (step 3), and progress beside money
(step 4): each national target of a country's 7th National Report (NR7) to
the CBD, with its reported progress, beside the budget lines it meets through
a target of the Kunming-Montreal Global Biodiversity Framework (GBF).

    budget line -> BIOFIN expenditure type -> GBF targets <- national target

Both ends are official: BIOFIN files each expenditure type under GBF targets
(python/data/globe-expenditure-types.json), and the country filed each
national target under GBF targets in its NR7. The one AI step is the line's
type (scripts/type_ber_lines.py: two models, a person's check to come); a
line meets a national target only through a GBF target both models' types
lead to.

National targets:
  - Mongolia: python/data/external/nr7_mng.json (scripts/fetch_nr7_ort.py);
  - Panama: the NR7 Section III export of the CBD Online Reporting Tool,
    saved verbatim to python/data/external/nr7_ort/pan/section3.csv (--fetch
    refreshes it). Panama's corpus holds no NBSAP to match, so the national
    targets stand as the report words them.
Sri Lanka waits: its export leaves the target and its GBF targets blank for
21 of 22 national targets.

Writes python/output/<country>/ber_chain.json. Run from python/:
    .venv/bin/python scripts/build_ber_chain.py --country all [--fetch]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.nr7_ort import (  # noqa: E402
    ORT_SOURCE_NAME,
    _clean,
    fetch_ort_csv,
    latest_per_target,
    map_level,
    normalise_level,
    parse_gbf_targets,
    parse_ort_csv,
)

from src.config import DATA_DIR, OUTPUT_DIR  # noqa: E402

EXTERNAL = DATA_DIR / "external"
# country -> where its national targets come from.
SOURCES = {
    "mongolia": {"kind": "nr7-json", "path": EXTERNAL / "nr7_mng.json"},
    "panama": {"kind": "ort-csv", "path": EXTERNAL / "nr7_ort" / "pan" / "section3.csv", "iso2": "pa", "name": "Panama"},
}


def gbf_numbers(items: list[dict[str, str]]) -> list[int]:
    return sorted({int(g["id"].removeprefix("T")) for g in items})


def from_nr7_json(path: Path) -> tuple[list[dict[str, Any]], dict[str, str]]:
    data = json.loads(path.read_text())
    targets = [
        {
            "id": p["targetId"],
            "label": p["targetId"],
            "text": p["targetText"],
            "status": p["progressStatus"],
            "levelOfProgress": p["levelOfProgress"],
            "gbf": gbf_numbers(p.get("gbfTargets") or []),
            "gbfTitles": {g["id"].removeprefix("T").lstrip("0"): g["title"] for g in p.get("gbfTargets") or []},
            "nbsapTargetId": p.get("nbsapTargetId"),
        }
        for p in data["progressItems"]
    ]
    return targets, {"name": data["source"]["name"], "file": str(path.relative_to(DATA_DIR.parent))}


def from_ort_csv(spec: dict[str, Any], fetch: bool) -> tuple[list[dict[str, Any]], dict[str, str]]:
    path: Path = spec["path"]
    if fetch or not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(fetch_ort_csv(spec["iso2"], "section3"))
        (path.parent / "README.md").write_text(
            f"Raw NR7 Section III export for {spec['name']} from the CBD Online Reporting Tool (public API), "
            f"fetched {datetime.now(timezone.utc).date().isoformat()} by scripts/build_ber_chain.py. It feeds "
            "python/output/<country>/ber_chain.json (national targets beside reviewed spending).\n"
        )
    targets = []
    for row in latest_per_target(parse_ort_csv(path.read_text())):
        gbf = parse_gbf_targets(row.get("GBF Targets"))
        targets.append({
            "id": row["Unique ID"],
            "label": None,
            "text": _clean(row["Target"]) or "",
            "status": map_level(row.get("Level of Progress")),
            "levelOfProgress": normalise_level(row.get("Level of Progress")),
            "gbf": gbf_numbers(gbf),
            "gbfTitles": {g["id"].removeprefix("T").lstrip("0"): g["title"] for g in gbf},
            "nbsapTargetId": None,
        })
    return targets, {"name": ORT_SOURCE_NAME, "file": str(path.relative_to(DATA_DIR.parent))}


def build(country: str, fetch: bool) -> dict[str, Any]:
    spec = SOURCES[country]
    targets, source = from_nr7_json(spec["path"]) if spec["kind"] == "nr7-json" else from_ort_csv(spec, fetch)
    typed = json.loads((OUTPUT_DIR / country / "ber_types_globe.json").read_text())
    lines = {
        line["code"]: {
            "type": line["type"],
            "typeStatus": line["typeStatus"],
            "gbf": line["gbf"],
            "status": line["status"],
            "checked": False,
        }
        for line in typed["lines"]
    }
    # A person's call on a line's type (scripts/ber_review_sheet.py import)
    # replaces the models' reading: the line leads to its type's GBF targets.
    calls_path = DATA_DIR / f"{country}-ber-types.json"
    calls = json.loads(calls_path.read_text()).get("types", {}) if calls_path.exists() else {}
    gbf_of = {t["id"]: t["gbf"] for t in json.loads((DATA_DIR / "globe-expenditure-types.json").read_text())["types"]}
    for code, call in calls.items():
        if code not in lines:
            continue
        gbf = gbf_of.get(call.get("type") or "", []) if call.get("call") in ("accept", "change") else []
        lines[code] |= {"type": call.get("type"), "gbf": gbf, "status": "linked" if gbf else "apart", "checked": True}
    met: set[str] = set()
    for t in targets:
        t["lines"] = [
            {"code": code, "via": sorted(set(line["gbf"]) & set(t["gbf"]))}
            for code, line in lines.items()
            if set(line["gbf"]) & set(t["gbf"])
        ]
        met.update(entry["code"] for entry in t["lines"])
    return {
        "_provenance": (
            f"Built by python/scripts/build_ber_chain.py on {datetime.now(timezone.utc).date().isoformat()} from "
            f"{source['file']} and python/output/{country}/ber_types_globe.json."
        ),
        "nr7": source,
        "rule": (
            "A national target meets a budget line where the GBF targets the country filed it under in its 7th "
            "National Report share one with the GBF targets BIOFIN files the line's expenditure type under, "
            "both models agreeing on that GBF target (python/output/<country>/ber_types_globe.json)."
        ),
        "nationalTargets": targets,
        "lines": lines,
        "counts": {
            "nationalTargets": len(targets),
            "withLines": sum(1 for t in targets if t["lines"]),
            "lines": len(lines),
            "linesLinked": sum(1 for line in lines.values() if line["status"] == "linked"),
            "linesMeetingATarget": len(met),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--country", choices=[*SOURCES, "all"], default="all")
    parser.add_argument("--fetch", action="store_true", help="Refresh a saved NR7 export from the CBD tool first")
    args = parser.parse_args()
    for country in SOURCES if args.country == "all" else (args.country,):
        chain = build(country, args.fetch)
        path = OUTPUT_DIR / country / "ber_chain.json"
        path.write_text(json.dumps(chain, indent=2, ensure_ascii=False) + "\n")
        print(f"{country}: {chain['counts']} -> {path}")


if __name__ == "__main__":
    main()
