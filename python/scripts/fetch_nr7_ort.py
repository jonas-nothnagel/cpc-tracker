"""
Fetch a country's NR7 from the CBD Online Reporting Tool and rebuild
`python/data/external/nr7_{iso3}.json` from it.

    cd python && source .venv/bin/activate
    python -m scripts.fetch_nr7_ort --country Mongolia --iso3 MNG --iso2 MN \
        --targets-file mongolia-targets.json

Writes
  data/external/nr7_{iso3}.json            the file the frontend + nr7_align read
  data/external/nr7_ort/{iso3}/section3.csv the raw exports, kept for provenance
  data/external/nr7_ort/{iso3}/headline.csv (indicator time series; not consumed yet)
  data/external/nr7_ort/{iso3}/binary.csv   (GBF questionnaire answers; not consumed yet)

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
    fetch_ort_csv,
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
    ap.add_argument("--output", default=None, help="Default: data/external/nr7_{iso3}.json")
    ap.add_argument("--no-raw", action="store_true", help="Skip saving the raw CSV exports")
    ap.add_argument(
        "--from-raw",
        action="store_true",
        help="Rebuild the JSON from the saved section3.csv without calling the API",
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
        csv_by_section["section3"] = (raw_dir / "section3.csv").read_text()
        logger.info(f"Using saved {raw_dir / 'section3.csv'}")
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
                f"scripts/fetch_nr7_ort.py. section3.csv feeds nr7_{iso3}.json; "
                "headline.csv (indicator time series) and binary.csv (GBF questionnaire) "
                "are kept for provenance and future use.\n"
            )

    rows = parse_ort_csv(csv_by_section["section3"])
    data = build_nr7_data(
        args.country, args.iso3, rows, nbsap, fetched_at=fetched_at, threshold=args.match_threshold
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    items = data["progressItems"]
    logger.info(f"Wrote {out_path} ({len(items)} national targets, {len(latest_per_target(rows))} in export)")
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
