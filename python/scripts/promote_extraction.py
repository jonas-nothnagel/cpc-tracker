"""
Promote reviewed extraction output into the curated targets-file shape.

The local workflow is: extract -> human review of the JSON (delete/edit
items) -> promote -> run analysis:

    uv run python -m src.extract --file doc.pdf --source-document PNSH \\
        --country Panama --output pnsh.extracted.json
    # review/edit pnsh.extracted.json by hand
    uv run python -m scripts.promote_extraction --input pnsh.extracted.json \\
        --targets-file data/panama-targets.json --source-url https://... --dry-run
    uv run python -m scripts.promote_extraction --input pnsh.extracted.json \\
        --targets-file data/panama-targets.json --source-url https://...

Or produce a standalone targets file for run_analysis without touching a
curated corpus:

    uv run python -m scripts.promote_extraction --input pnsh.extracted.json \\
        --output data/panama-pnsh-targets.json --country Panama

Promotion is deliberately strict: records must carry verbatim sources and a
textCleanup tier, and records the quote validator flagged are refused
unless --allow-flagged is passed (the human reviewer takes responsibility).
Ids are assigned HERE, not at extraction time, because review removes and
reorders items; the id pattern (plain "NDC_7" vs country-prefixed
"panama_NP_7") is detected from the existing corpus and continued.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from pathlib import Path
from typing import Any

from src.extract_validation import text_similarity

logger = logging.getLogger("promote_extraction")

PY_ROOT = Path(__file__).resolve().parent.parent

# Fields carried into the curated record, in canonical order.
_FIELD_ORDER = [
    "id", "text", "sourceDocument", "sourceLabel", "sourceLabelOriginal",
    "country", "sources", "textCleanup", "textOriginal", "textOriginalSource",
    "language", "pageNumbers", "activities", "_provenanceFlag",
]

# Similarity above which a promoted record is warned as a likely duplicate
# of an existing corpus record (e.g. the same document ingested twice).
_DUP_WARN_SIMILARITY = 0.9


def _detect_id_pattern(existing: list[dict[str, Any]], doc: str) -> tuple[str, int]:
    """Return (prefix, next_seq) continuing the corpus id convention.

    Mongolia-style ids are "NRVTS_1"; Panama-style are "panama_NP_1". The
    prefix is whatever precedes "{DOC}_{seq}" in existing ids for this
    document type, falling back to any id in the file, else no prefix.
    """
    doc_re = re.compile(rf"^(.*?){re.escape(doc)}_(\d+)$")
    max_seq = 0
    prefix: str | None = None
    for t in existing:
        m = doc_re.match(str(t.get("id", "")))
        if m:
            prefix = m.group(1)
            max_seq = max(max_seq, int(m.group(2)))
    if prefix is None:
        # No ids for this doc type yet: inherit the prefix style of the file
        any_re = re.compile(r"^(.*?)[A-Z][A-Z0-9]*_(\d+)$")
        for t in existing:
            m = any_re.match(str(t.get("id", "")))
            if m:
                prefix = m.group(1)
                break
    return prefix or "", max_seq + 1


def _qc_record(item: dict[str, Any], allow_flagged: bool) -> list[str]:
    """Return QC failures for one extraction record (empty = promotable)."""
    problems: list[str] = []
    if not str(item.get("text", "")).strip():
        problems.append("empty text")
    if not str(item.get("sourceDocument", "")).strip():
        problems.append("missing sourceDocument")
    sources = [
        s for s in item.get("sources") or []
        if isinstance(s, dict) and str(s.get("sourceText", "")).strip()
    ]
    if not sources:
        problems.append("no verbatim sources[]")
    if item.get("textCleanup") not in ("verbatim", "cleaned", "synthesis"):
        problems.append("missing textCleanup")
    if not allow_flagged:
        if item.get("_provenanceFlag"):
            problems.append(f"provenance flag: {str(item['_provenanceFlag'])[:80]}")
        not_found = [
            i for i, s in enumerate(item.get("sources") or [])
            if isinstance(s, dict) and s.get("_quoteMatch") == "not_found"
        ]
        if not_found:
            problems.append(f"quote(s) not found in document: sources{not_found}")
    return problems


def _promote_record(
    item: dict[str, Any],
    *,
    record_id: str,
    country: str,
    source_url: str | None,
) -> dict[str, Any]:
    """Map one reviewed extraction record to the curated corpus shape."""
    sources = []
    for s in item.get("sources") or []:
        if not (isinstance(s, dict) and str(s.get("sourceText", "")).strip()):
            continue
        entry: dict[str, Any] = {"sourceText": s["sourceText"]}
        if s.get("section"):
            entry["section"] = s["section"]
        entry["url"] = s.get("url") or source_url or ""
        sources.append(entry)

    out: dict[str, Any] = {
        "id": record_id,
        "text": item["text"],
        "sourceDocument": item["sourceDocument"],
        "sourceLabel": item.get("sourceLabel") or item.get("label") or record_id,
        "country": country,
        "sources": sources,
        "textCleanup": item.get("textCleanup"),
    }
    if item.get("labelOriginal") or item.get("sourceLabelOriginal"):
        out["sourceLabelOriginal"] = item.get("sourceLabelOriginal") or item["labelOriginal"]
    for key in ("textOriginal", "textOriginalSource", "language",
                "pageNumbers", "activities", "_provenanceFlag"):
        if item.get(key):
            out[key] = item[key]
    return {k: out[k] for k in _FIELD_ORDER if k in out}


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--input", required=True, help="Reviewed extraction JSON")
    parser.add_argument(
        "--targets-file", default=None,
        help="Curated corpus (relative to python/) to append into, e.g. data/panama-targets.json",
    )
    parser.add_argument(
        "--output", default=None,
        help="Write a standalone targets file instead of merging (for run_analysis --targets-file)",
    )
    parser.add_argument("--country", default=None, help="Country override when items lack one")
    parser.add_argument("--source-url", default=None, help="Canonical online source URL for sources[].url")
    parser.add_argument("--allow-flagged", action="store_true",
                        help="Promote records the validators flagged (reviewer takes responsibility)")
    parser.add_argument("--dry-run", action="store_true", help="Report only; write nothing")
    args = parser.parse_args()

    if bool(args.targets_file) == bool(args.output):
        parser.error("exactly one of --targets-file or --output is required")

    input_path = Path(args.input)
    if not input_path.exists():
        logger.error("Input not found: %s", input_path)
        return 2
    items = json.loads(input_path.read_text())
    if not isinstance(items, list) or not items:
        logger.error("Input is empty or not a JSON array: %s", input_path)
        return 2

    existing: list[dict[str, Any]] = []
    targets_path: Path | None = None
    if args.targets_file:
        targets_path = (PY_ROOT / args.targets_file).resolve()
        if not targets_path.exists():
            logger.error("Targets file not found: %s", targets_path)
            return 2
        existing = json.loads(targets_path.read_text())

    country = args.country or next(
        (str(i["country"]) for i in items if i.get("country")), None
    )
    if not country:
        logger.error("No country on the records and no --country given")
        return 2

    # QC pass -----------------------------------------------------------------
    failures: list[tuple[int, list[str]]] = []
    for idx, item in enumerate(items):
        problems = _qc_record(item, allow_flagged=args.allow_flagged)
        if problems:
            failures.append((idx, problems))
    if failures:
        for idx, problems in failures:
            label = items[idx].get("label") or items[idx].get("sourceLabel") or f"item {idx}"
            logger.error("NOT promotable — %s: %s", label, "; ".join(problems))
        logger.error(
            "%d of %d records failed QC. Fix them in the reviewed JSON, or use "
            "--allow-flagged to accept validator-flagged records deliberately.",
            len(failures), len(items),
        )
        return 1

    # Duplicate check against the existing corpus ------------------------------
    dup_warnings = 0
    for item in items:
        for t in existing:
            if text_similarity(str(item.get("text", "")), str(t.get("text", ""))) >= _DUP_WARN_SIMILARITY:
                logger.warning(
                    "Possible duplicate of existing %s: '%s'",
                    t.get("id"), str(item.get("text", ""))[:70],
                )
                dup_warnings += 1
                break

    # Id assignment + mapping ---------------------------------------------------
    seqs: dict[str, tuple[str, int]] = {}
    promoted: list[dict[str, Any]] = []
    for item in items:
        doc = str(item["sourceDocument"])
        if doc not in seqs:
            seqs[doc] = _detect_id_pattern(existing, doc)
        prefix, seq = seqs[doc]
        seqs[doc] = (prefix, seq + 1)
        promoted.append(_promote_record(
            item,
            record_id=f"{prefix}{doc}_{seq}",
            country=country,
            source_url=args.source_url,
        ))

    # Report + write -------------------------------------------------------------
    by_doc: dict[str, int] = {}
    for p in promoted:
        by_doc[p["sourceDocument"]] = by_doc.get(p["sourceDocument"], 0) + 1
    logger.info(
        "Promoting %d record(s) (%s) for %s; %d duplicate warning(s)",
        len(promoted),
        ", ".join(f"{d}: {n}" for d, n in by_doc.items()),
        country,
        dup_warnings,
    )
    logger.info("Ids: %s ... %s", promoted[0]["id"], promoted[-1]["id"])

    if args.dry_run:
        logger.info("Dry run: nothing written")
        return 0

    if targets_path is not None:
        merged = existing + promoted
        ids = [t.get("id") for t in merged]
        if len(ids) != len(set(ids)):
            logger.error("Duplicate ids after merge — aborting without writing")
            return 1
        targets_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n")
        logger.info("Appended to %s (%d -> %d records)", targets_path, len(existing), len(merged))
    else:
        out_path = Path(args.output)
        out_path.write_text(json.dumps(promoted, indent=2, ensure_ascii=False) + "\n")
        logger.info("Wrote standalone targets file %s", out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
