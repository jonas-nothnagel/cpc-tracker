"""
Fetch a country's NR7 from the CBD Online Reporting Tool and rebuild
`python/data/external/nr7_{iso3}.json` from it.

    cd python && source .venv/bin/activate
    python -m scripts.fetch_nr7_ort --country Mongolia --iso3 MNG --iso2 MN \
        --targets-file mongolia-targets.json

Writes
  data/external/nr7_{iso3}.json            the file the frontend + nr7_align read:
                                           progressItems (Section III), questionnaire
                                           (binary indicators, wording from the tool)
                                           and indicators (headline export, series per
                                           disaggregation)
  data/external/nr7_ort/{iso3}/section3.csv the raw exports, kept for provenance
  data/external/nr7_ort/{iso3}/headline.csv
  data/external/nr7_ort/{iso3}/binary.csv

Does NOT run the alignment: that is a billable step with a pending
calibration decision (see nr7_align.py). Run scripts/run_nr7_alignment.py
separately once the reported-action splitting rule is settled.

Public, read-only data: nothing leaves the machine.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.nr7_ort import (  # noqa: E402
    ORT_SECTIONS,
    build_nr7_data,
    fetch_national_targets_csv,
    fetch_ort_csv,
    fetch_section3_keys,
    file_under_national_targets,
    gbf_to_national,
    national_target_map,
    latest_per_target,
    parse_ort_csv,
)

logger = logging.getLogger("fetch_nr7_ort")
DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--country", required=True, help="Display name, e.g. Mongolia")
    ap.add_argument("--iso3", required=True, help="ISO3, e.g. MNG (names the output file)")
    ap.add_argument("--iso2", required=True, help="ISO2 the ORT indexes by, e.g. MN")
    ap.add_argument(
        "--targets-file",
        required=True,
        help="Country targets file under data/ (e.g. mongolia-targets.json); the NBSAP "
        "targets in it anchor the national-target -> NBSAP match",
    )
    ap.add_argument("--nbsap-doc", default="NBSAP", help="sourceDocument id of the NBSAP targets")
    ap.add_argument("--match-threshold", type=float, default=0.85)
    ap.add_argument(
        "--match",
        choices=["text", "in-order"],
        default="text",
        help="text: national targets restate the corpus wording (the default). in-order: short "
        "titles in the document's order, matched on shared words (Panama against the Nature Pledge)",
    )
    ap.add_argument("--output", default=None, help="Default: data/external/nr7_{iso3}.json")
    ap.add_argument("--no-raw", action="store_true", help="Skip saving the raw CSV exports")
    ap.add_argument(
        "--from-raw",
        action="store_true",
        help="Rebuild the JSON from the saved CSV exports without calling the API",
    )
    args = ap.parse_args()

    iso3 = args.iso3.lower()
    raw_dir = DATA_DIR / "external" / "nr7_ort" / iso3
    out_path = Path(args.output) if args.output else DATA_DIR / "external" / f"nr7_{iso3}.json"

    targets_path = DATA_DIR / args.targets_file
    targets = json.loads(targets_path.read_text())
    nbsap = [t for t in targets if t.get("sourceDocument") == args.nbsap_doc]
    if not nbsap:
        logger.error(f"No {args.nbsap_doc} targets in {targets_path}; cannot anchor the NBSAP match")
        return 2
    logger.info(f"{len(nbsap)} {args.nbsap_doc} targets from {targets_path.name}")

    fetched_at = datetime.now(timezone.utc)
    csv_by_section: dict[str, str] = {}
    if args.from_raw:
        for section in ORT_SECTIONS:
            path = raw_dir / f"{section}.csv"
            if path.exists():
                csv_by_section[section] = path.read_text()
                logger.info(f"Using saved {path}")
            elif section == "section3":
                raise SystemExit(f"--from-raw: {path} is missing")
            else:
                logger.warning(f"--from-raw: {path} missing; the JSON will carry no {section} data")
    else:
        for section in ORT_SECTIONS:
            text = fetch_ort_csv(args.iso2, section)
            csv_by_section[section] = text
            logger.info(f"Fetched {section}: {len(parse_ort_csv(text))} rows, {len(text)} chars")
            if not args.no_raw:
                raw_dir.mkdir(parents=True, exist_ok=True)
                (raw_dir / f"{section}.csv").write_text(text)
        if not args.no_raw:
            (raw_dir / "README.md").write_text(
                f"Raw NR7 exports for {args.country} from the CBD Online Reporting Tool "
                f"(public API), fetched {fetched_at.date().isoformat()} by "
                f"scripts/fetch_nr7_ort.py. All feed nr7_{iso3}.json: section3.csv "
                "(national targets), headline.csv (indicator series), binary.csv "
                "(GBF questionnaire, with the tool's own question wording) and, where the "
                "report files rows under the GBF targets themselves, national_targets.csv "
                "and section3_keys.json (what each row is filed under, from the report's "
                "own record).\n"
            )

    rows = parse_ort_csv(csv_by_section["section3"])
    gbf_to_target = None
    if any(not (r.get("Target") or "").strip() for r in rows):
        keys_path, national_path = raw_dir / "section3_keys.json", raw_dir / "national_targets.csv"
        if args.from_raw:
            keys, national_csv = json.loads(keys_path.read_text()), national_path.read_text()
        else:
            keys, national_csv = fetch_section3_keys(args.iso2), fetch_national_targets_csv(args.iso2)
            if not args.no_raw:
                keys_path.write_text(json.dumps(keys, indent=1, ensure_ascii=False) + "\n")
                national_path.write_text(national_csv)
        national = national_target_map(parse_ort_csv(national_csv))
        rows = file_under_national_targets(rows, keys, national)
        gbf_to_target = gbf_to_national(national)
    headline_rows = parse_ort_csv(csv_by_section["headline"]) if "headline" in csv_by_section else None
    binary_rows = parse_ort_csv(csv_by_section["binary"]) if "binary" in csv_by_section else None
    data = build_nr7_data(
        args.country,
        args.iso3,
        rows,
        nbsap,
        fetched_at=fetched_at,
        threshold=args.match_threshold,
        headline_rows=headline_rows,
        binary_rows=binary_rows,
        match=args.match,
        gbf_to_target=gbf_to_target,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    items = data["progressItems"]
    logger.info(f"Wrote {out_path} ({len(items)} national targets, {len(latest_per_target(rows))} in export)")
    answers = data["questionnaire"]["answers"]
    indicators = data["indicators"]
    with_values = [i for i in indicators if any(p["value"] is not None for s in i["series"] for p in s["points"])]
    logger.info(
        f"Questionnaire: {len(answers)} answers on {len({a['targetId'] for a in answers})} targets, "
        f"{sum(1 for a in answers if a['questionTitle'])} with wording, "
        f"{sum(1 for a in answers if a['responseValue'])} on the standard scale"
    )
    logger.info(
        f"Indicators: {len(indicators)} ({len(with_values)} with values, "
        f"{sum(len(s['points']) for i in indicators for s in i['series'])} points, "
        f"{sum(1 for i in indicators if not i['series'] and i['comments'])} without values but with a country note)"
    )
    by_status: dict[str, int] = {}
    for it in items:
        by_status[it["progressStatus"]] = by_status.get(it["progressStatus"], 0) + 1
    logger.info(f"Progress: {by_status}")
    print(f"\n{'NT':<5} {'status':<12} {'NBSAP':<9} {'score':<6} actions  level")
    for it in items:
        n = len(it["mainActionsSummary"] or "")
        print(
            f"{it['targetId']:<5} {it['progressStatus']:<12} {it['nbsapTargetId'] or '-':<9} "
            f"{it['nbsapMatchScore']:<6} {n:>6}  {it['levelOfProgress']}"
        )
    unmatched = [it["targetId"] for it in items if not it["nbsapTargetId"]]
    if unmatched:
        logger.warning(f"No NBSAP match (below threshold) for: {unmatched}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
