"""
Extraction evaluation harness.

Measures the automatic document → target extraction (src/extract.py) against
the expert-curated gold targets (python/data/*-targets.json) for source
documents that exist locally in the OneDrive-synced SharePoint mirror.
The eval set lives in scripts/eval_manifest.json.

Usage (from python/):
    uv run python -m scripts.eval_extraction --label baseline-<sha>
    uv run python -m scripts.eval_extraction --label after-fixes --compare baseline-<sha>
    uv run python -m scripts.eval_extraction --label smoke --only ILDN
    uv run python -m scripts.eval_extraction --label rescore --from-run output/eval/baseline-<sha>

Design notes:
- Gold is NOT exhaustive. "extraction_matched_ratio" is a soft precision
  proxy and is never a number to optimise toward (never force results).
- Gold reachability (are the gold quotes present in the parsed PDF text at
  all?) is computed first and is the honest recall ceiling: curated targets
  were often transcribed from a different published version of the document.
- Tier 1 = quote-anchored gold; tier 2 = text-similarity gold only (the gold
  quotes were composed by the CO, not copied); tier 3 = parse-stats fixture
  only (no extraction run, no gold).
- Matching thresholds are constants below. The report includes a match-audit
  table (every matched pair with score and channel, every unmatched item
  with its best score) so a human can sanity-check thresholds on real pairs.
- Re-runs reuse the LLM disk cache; only prompt/model changes cost a fresh
  paid run. The report header records model + git sha + a prompt hash so
  cache invalidation is visible.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import statistics
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any

from src import extract as ex
from src.config import LLM_CONCURRENCY, LLM_MODEL
from src.extract_validation import (
    MatchCorpus,
    ngram_jaccard,
    normalise_for_matching,
    text_similarity,
)
from src.llm import get_footprint_tracker, set_language

logger = logging.getLogger("eval_extraction")

PY_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = PY_ROOT.parent
MANIFEST_PATH = Path(__file__).resolve().parent / "eval_manifest.json"
EVAL_OUT_ROOT = PY_ROOT / "output" / "eval"

# ---------------------------------------------------------------------------
# Matching thresholds (see module docstring: audit table exists to sanity-
# check these on real pairs; adjust once, deliberately, not per run)
# ---------------------------------------------------------------------------

SIM_ACCEPT = 0.60        # text-similarity channel acceptance
QUOTE_ACCEPT = 0.30      # quote n-gram Jaccard channel acceptance
REACHABLE_THRESHOLD = 0.5  # gold counts as reachable at this max containment


# ---------------------------------------------------------------------------
# Warning capture (content-filter empties + JSON parse failures are otherwise
# invisible from outside extract.py)
# ---------------------------------------------------------------------------


class _WarningCounter(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.WARNING)
        self.content_filter = 0
        self.parse_failures = 0

    def emit(self, record: logging.LogRecord) -> None:
        msg = record.getMessage().lower()
        if "content filter" in msg:
            self.content_filter += 1
        if "could not parse extraction response" in msg:
            self.parse_failures += 1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _git_sha() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO_ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip()
    except Exception:
        return "unknown"


def _prompt_hash() -> str:
    """Hash of every extraction prompt constant; changes when cache invalidates."""
    blob = "\n".join([
        ex.FEW_SHOT_EXAMPLES, ex.EXTRACT_SYSTEM, ex.EXTRACT_USER,
        ex.RELEVANCE_FILTER_SYSTEM, ex.RELEVANCE_FILTER_USER,
        ex.CONSOLIDATE_SYSTEM, ex.CONSOLIDATE_USER,
        ex.ACTIVITIES_SYSTEM, ex.ACTIVITIES_USER, ex.MULTILANG_ADDENDUM,
    ])
    return sha256(blob.encode()).hexdigest()[:12]


def _snippet(text: str, n: int = 72) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1] + "…"


def _length_stats(texts: list[str]) -> dict[str, int]:
    lens = sorted(len(t) for t in texts if t)
    if not lens:
        return {"n": 0, "p10": 0, "median": 0, "p90": 0}
    return {
        "n": len(lens),
        "p10": lens[max(0, int(0.10 * (len(lens) - 1)))],
        "median": lens[len(lens) // 2],
        "p90": lens[min(len(lens) - 1, int(0.90 * (len(lens) - 1)))],
    }


def _gold_quote_texts(target: dict[str, Any]) -> list[str]:
    quotes = [
        str(s.get("sourceText", "")).strip()
        for s in target.get("sources") or []
        if isinstance(s, dict) and str(s.get("sourceText", "")).strip()
    ]
    if quotes:
        return quotes
    # Fallback for gold rows without usable quotes
    return [t for t in [target.get("textOriginal"), target.get("text")] if t]


def _candidate_texts(item: dict[str, Any]) -> list[str]:
    """Every text field of a target/extraction item usable for similarity."""
    return [
        str(item[k]).strip()
        for k in ("text", "text_eng", "textOriginal")
        if item.get(k) and str(item[k]).strip()
    ]


def _pdf_page_count(path: Path) -> int | None:
    if path.suffix.lower() != ".pdf":
        return None
    try:
        import pymupdf
    except ImportError:  # pragma: no cover
        import fitz as pymupdf  # type: ignore[no-redef]
    with pymupdf.open(str(path)) as doc:
        return len(doc)


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------


@dataclass
class MatchResult:
    matched: list[dict[str, Any]] = field(default_factory=list)
    unmatched_gold: list[dict[str, Any]] = field(default_factory=list)
    unmatched_extracted: list[dict[str, Any]] = field(default_factory=list)


def match_gold_to_extracted(
    gold: list[dict[str, Any]],
    extracted: list[dict[str, Any]],
    quote_anchored: bool,
) -> MatchResult:
    """Greedy 1:1 assignment between gold and extracted targets.

    Channels:
      quote — n-gram Jaccard between gold and extracted verbatim quotes
              (language-independent; only meaningful for tier-1 docs)
      text  — max text_similarity across all (gold, extracted) text-field
              pairs (text / text_eng / textOriginal)
    A pair is eligible when quote >= QUOTE_ACCEPT or text >= SIM_ACCEPT;
    greedy order is by max(text score, quote score).
    """
    norm_gold_quotes = [
        [normalise_for_matching(q) for q in _gold_quote_texts(g)] for g in gold
    ]
    norm_ext_quotes = [
        [
            normalise_for_matching(str(s.get("sourceText", "")))
            for s in e.get("sources") or []
            if isinstance(s, dict) and str(s.get("sourceText", "")).strip()
        ]
        for e in extracted
    ]

    pairs: list[tuple[float, float, float, int, int]] = []
    best_by_gold: dict[int, tuple[float, int]] = {}
    best_by_ext: dict[int, tuple[float, int]] = {}
    for gi, g in enumerate(gold):
        g_texts = _candidate_texts(g)
        for ei, e in enumerate(extracted):
            t_score = max(
                (text_similarity(a, b) for a in g_texts for b in _candidate_texts(e)),
                default=0.0,
            )
            q_score = 0.0
            if quote_anchored and norm_gold_quotes[gi] and norm_ext_quotes[ei]:
                q_score = max(
                    ngram_jaccard(a, b)
                    for a in norm_gold_quotes[gi]
                    for b in norm_ext_quotes[ei]
                )
            rank = max(t_score, q_score)
            # Track best scores over ALL pairs (not just eligible ones) so the
            # audit table shows how close the near-misses actually were.
            if rank > best_by_gold.get(gi, (0.0, -1))[0]:
                best_by_gold[gi] = (rank, ei)
            if rank > best_by_ext.get(ei, (0.0, -1))[0]:
                best_by_ext[ei] = (rank, gi)
            if t_score >= SIM_ACCEPT or q_score >= QUOTE_ACCEPT:
                pairs.append((rank, t_score, q_score, gi, ei))

    pairs.sort(key=lambda p: p[0], reverse=True)
    gold_taken: set[int] = set()
    ext_taken: set[int] = set()
    result = MatchResult()

    for rank, t_score, q_score, gi, ei in pairs:
        if gi in gold_taken or ei in ext_taken:
            continue
        gold_taken.add(gi)
        ext_taken.add(ei)
        result.matched.append({
            "goldId": gold[gi].get("id"),
            "goldLabel": gold[gi].get("sourceLabel"),
            "goldText": _snippet(gold[gi].get("text", "")),
            "extractedIndex": ei,
            "extractedLabel": extracted[ei].get("label") or extracted[ei].get("sourceLabel"),
            "extractedText": _snippet(extracted[ei].get("text", "")),
            "textScore": round(t_score, 3),
            "quoteScore": round(q_score, 3),
            "channel": "quote" if q_score >= QUOTE_ACCEPT and q_score >= t_score else "text",
        })

    for gi, g in enumerate(gold):
        if gi in gold_taken:
            continue
        best, ei = best_by_gold.get(gi, (0.0, -1))
        result.unmatched_gold.append({
            "goldId": g.get("id"),
            "goldLabel": g.get("sourceLabel"),
            "goldText": _snippet(g.get("text", "") or g.get("textOriginal", "")),
            "bestScore": round(best, 3),
            "bestExtractedText": _snippet(extracted[ei].get("text", "")) if ei >= 0 else "",
        })
    for ei, e in enumerate(extracted):
        if ei in ext_taken:
            continue
        best, gi = best_by_ext.get(ei, (0.0, -1))
        result.unmatched_extracted.append({
            "extractedIndex": ei,
            "extractedLabel": e.get("label") or e.get("sourceLabel"),
            "extractedText": _snippet(e.get("text", "")),
            "bestScore": round(best, 3),
            "bestGoldId": gold[gi].get("id") if gi >= 0 else None,
        })
    return result


# ---------------------------------------------------------------------------
# Per-document evaluation
# ---------------------------------------------------------------------------


async def evaluate_document(
    entry: dict[str, Any],
    outdir: Path,
    from_run: Path | None,
) -> dict[str, Any]:
    code = entry["docCode"]
    doc_path = REPO_ROOT / entry["docPath"]
    if not doc_path.exists():
        raise FileNotFoundError(
            f"{code}: {doc_path} not found. The SharePoint mirror "
            "(dev_data_scripts/sharepoint_sync) is an OneDrive symlink — make "
            "sure it is mounted/synced on this machine."
        )

    logger.info("=== %s (tier %s): parsing %s", code, entry["tier"], doc_path.name)
    parse_start = time.perf_counter()
    doc_text = ex.extract_text(doc_path)
    full_text = doc_text.full_text
    corpus = MatchCorpus(full_text)
    page_count = _pdf_page_count(doc_path)
    parse_stats = {
        "pageCount": page_count,
        "pagesWithText": len(doc_text.pages),
        "chars": len(full_text),
        "parseSeconds": round(time.perf_counter() - parse_start, 1),
    }

    result: dict[str, Any] = {
        "docCode": code,
        "tier": entry["tier"],
        "sourceDocument": entry.get("sourceDocument"),
        "language": entry.get("language"),
        "notes": entry.get("notes", ""),
        "parseStats": parse_stats,
    }

    if entry["tier"] == 3:
        logger.info("%s: tier-3 fixture, parse stats only: %s", code, parse_stats)
        return result

    # Gold + reachability -----------------------------------------------------
    gold_all = json.loads((REPO_ROOT / entry["goldFile"]).read_text())
    gold = [t for t in gold_all if t.get("sourceDocument") == entry["sourceDocument"]]
    reachability = []
    for g in gold:
        best = max((corpus.containment(q) for q in _gold_quote_texts(g)), default=0.0)
        reachability.append({"goldId": g.get("id"), "containment": round(best, 3)})
    reachable_ids = {
        r["goldId"] for r in reachability if r["containment"] >= REACHABLE_THRESHOLD
    }
    result["gold"] = {
        "n": len(gold),
        "reachable": len(reachable_ids),
        "reachability": reachability,
        "lengths": _length_stats([g.get("text", "") for g in gold]),
    }

    # Extraction ---------------------------------------------------------------
    extracted_file = outdir / "extracted" / f"{code}.json"
    prior = from_run / "extracted" / f"{code}.json" if from_run else None
    counter = _WarningCounter()
    tracker = get_footprint_tracker()
    fp_before = tracker.snapshot()

    if prior and prior.exists():
        extracted = json.loads(prior.read_text())
        result["extractionSource"] = str(prior.relative_to(PY_ROOT))
        extract_seconds = 0.0
    else:
        logging.getLogger().addHandler(counter)
        t0 = time.perf_counter()
        try:
            extracted = await ex.extract_from_file(
                doc_path,
                doc_type=entry["docType"],
                source_document=entry["sourceDocument"],
                language=entry.get("language"),
            )
        finally:
            logging.getLogger().removeHandler(counter)
        extract_seconds = time.perf_counter() - t0
        result["extractionSource"] = "fresh run"

    fp_after = tracker.snapshot()
    extracted_file.parent.mkdir(parents=True, exist_ok=True)
    extracted_file.write_text(json.dumps(extracted, indent=2, ensure_ascii=False))

    footprint_delta = {
        k: round(float(fp_after.get(k, 0) or 0) - float(fp_before.get(k, 0) or 0), 4)
        for k in ("call_count", "cached_call_count", "energy_wh", "co2_geq")
        if isinstance(fp_after.get(k), (int, float))
    }

    # Verbatim compliance ------------------------------------------------------
    quote_levels: dict[str, int] = {"exact": 0, "normalized": 0, "fuzzy": 0, "not_found": 0}
    quotes_total = 0
    for e in extracted:
        for s in e.get("sources") or []:
            if isinstance(s, dict) and str(s.get("sourceText", "")).strip():
                quotes_total += 1
                quote_levels[corpus.quote_match_level(s["sourceText"])] += 1
    cleanup_dist: dict[str, int] = {}
    for e in extracted:
        cleanup_dist[e.get("textCleanup") or "missing"] = (
            cleanup_dist.get(e.get("textCleanup") or "missing", 0) + 1
        )
    flags = sum(1 for e in extracted if e.get("_provenanceFlag"))

    # Matching ------------------------------------------------------------------
    match = match_gold_to_extracted(gold, extracted, quote_anchored=entry["tier"] == 1)
    matched_gold_ids = {m["goldId"] for m in match.matched}
    matched_reachable = len(matched_gold_ids & reachable_ids)

    # For unmatched extracted targets, scan the WHOLE country corpus: an
    # extracted target that misses this document's gold subset may match a
    # target curated from another document (LDN documents overlap heavily,
    # and the same commitment often recurs across national plans).
    for u in match.unmatched_extracted:
        e_texts = _candidate_texts(extracted[u["extractedIndex"]])
        best_score, best_id = 0.0, None
        for g in gold_all:
            s = max(
                (text_similarity(a, b) for a in e_texts for b in _candidate_texts(g)),
                default=0.0,
            )
            if s > best_score:
                best_score, best_id = s, g.get("id")
        u["bestAnywhereScore"] = round(best_score, 3)
        u["bestAnywhereGoldId"] = best_id

    result["extraction"] = {
        "n": len(extracted),
        "seconds": round(extract_seconds, 1),
        "footprintDelta": footprint_delta,
        "contentFilterWarnings": counter.content_filter,
        "parseFailureWarnings": counter.parse_failures,
        "lengths": _length_stats([e.get("text", "") for e in extracted]),
        "textCleanup": cleanup_dist,
        "provenanceFlags": flags,
        "quotesTotal": quotes_total,
        "quoteMatchLevels": quote_levels,
    }
    result["metrics"] = {
        "recallRaw": round(len(matched_gold_ids) / len(gold), 3) if gold else None,
        "recallReachable": (
            round(matched_reachable / len(reachable_ids), 3) if reachable_ids else None
        ),
        "extractionMatchedRatio": (
            round(len(match.matched) / len(extracted), 3) if extracted else None
        ),
        "granularityRatio": round(len(extracted) / len(gold), 2) if gold else None,
    }
    result["matchAudit"] = {
        "matched": match.matched,
        "unmatchedGold": match.unmatched_gold,
        "unmatchedExtracted": match.unmatched_extracted,
    }
    logger.info(
        "%s: gold=%d reachable=%d extracted=%d matched=%d recallReachable=%s",
        code, len(gold), len(reachable_ids), len(extracted), len(match.matched),
        result["metrics"]["recallReachable"],
    )
    return result


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------


def _pct(x: float | None) -> str:
    return "n/a" if x is None else f"{100 * x:.0f}%"


def render_markdown(report: dict[str, Any]) -> str:
    meta = report["meta"]
    lines = [
        f"# Extraction eval report: `{meta['label']}`",
        "",
        f"- Generated: {meta['generatedAt']}  ·  git `{meta['gitSha']}`  ·  model `{meta['model']}` (concurrency {meta['concurrency']})",
        f"- Prompt hash: `{meta['promptHash']}` (changes when any extraction prompt changes and the LLM cache invalidates)",
        f"- Thresholds: similarity >= {SIM_ACCEPT}, quote-Jaccard >= {QUOTE_ACCEPT}, reachable >= {REACHABLE_THRESHOLD}",
        "",
        "Gold is not exhaustive: `extraction matched` is a soft precision proxy, not a target to optimise.",
        "`recall (reachable)` counts only gold targets whose curated quotes actually occur in the parsed local PDF.",
        "",
        "## Headline (tier 1 = quote-anchored gold; tier 2 similarity-only, reported separately)",
        "",
        "| doc | tier | gold | reachable | extracted | matched | recall (reachable) | recall (raw) | extraction matched | granularity | verbatim quotes found | flags |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for d in report["documents"]:
        if d["tier"] == 3:
            continue
        m, e_, g = d["metrics"], d["extraction"], d["gold"]
        q = e_["quoteMatchLevels"]
        found = e_["quotesTotal"] - q["not_found"]
        verbatim = (
            f"{found}/{e_['quotesTotal']}" if e_["quotesTotal"] else "0/0"
        )
        lines.append(
            f"| {d['docCode']} | {d['tier']} | {g['n']} | {g['reachable']} | {e_['n']} "
            f"| {len(d['matchAudit']['matched'])} | {_pct(m['recallReachable'])} | {_pct(m['recallRaw'])} "
            f"| {_pct(m['extractionMatchedRatio'])} | {m['granularityRatio']} | {verbatim} | {e_['provenanceFlags']} |"
        )

    tier3 = [d for d in report["documents"] if d["tier"] == 3]
    if tier3:
        lines += ["", "## Tier-3 fixtures (parse stats only)", ""]
        for d in tier3:
            p = d["parseStats"]
            lines.append(
                f"- **{d['docCode']}**: {p['pagesWithText']}/{p['pageCount']} pages with text, "
                f"{p['chars']:,} chars. {d['notes']}"
            )

    for d in report["documents"]:
        if d["tier"] == 3:
            continue
        e_, g = d["extraction"], d["gold"]
        lines += [
            "",
            f"## {d['docCode']} (tier {d['tier']}, {d['sourceDocument']}, {d['language']})",
            "",
            d["notes"],
            "",
            f"- Parse: {d['parseStats']['pagesWithText']}/{d['parseStats']['pageCount']} pages with text, "
            f"{d['parseStats']['chars']:,} chars",
            f"- Extraction: {e_['n']} targets in {e_['seconds']}s ({d['extractionSource']}); "
            f"LLM calls {e_['footprintDelta'].get('call_count', 0):.0f} "
            f"({e_['footprintDelta'].get('cached_call_count', 0):.0f} cached); "
            f"content-filter warnings {e_['contentFilterWarnings']}, parse-failure warnings {e_['parseFailureWarnings']}",
            f"- Quote match levels: {e_['quoteMatchLevels']} of {e_['quotesTotal']} quotes",
            f"- textCleanup: {e_['textCleanup']}; provenance flags: {e_['provenanceFlags']}",
            f"- Length (chars) gold p10/median/p90: {g['lengths']['p10']}/{g['lengths']['median']}/{g['lengths']['p90']} "
            f"vs extracted: {e_['lengths']['p10']}/{e_['lengths']['median']}/{e_['lengths']['p90']}",
            "",
            "### Matched pairs",
            "",
            "| gold | extracted | text | quote | via |",
            "|---|---|---|---|---|",
        ]
        for mrow in d["matchAudit"]["matched"]:
            lines.append(
                f"| {mrow['goldId']} `{_snippet(mrow['goldText'], 48)}` "
                f"| `{_snippet(mrow['extractedText'], 48)}` "
                f"| {mrow['textScore']} | {mrow['quoteScore']} | {mrow['channel']} |"
            )
        lines += ["", "### Unmatched gold", ""]
        if d["matchAudit"]["unmatchedGold"]:
            lines += ["| gold | best score | closest extracted |", "|---|---|---|"]
            for u in d["matchAudit"]["unmatchedGold"]:
                reach = next(
                    (r["containment"] for r in g["reachability"] if r["goldId"] == u["goldId"]),
                    None,
                )
                reach_note = "" if reach is None or reach >= REACHABLE_THRESHOLD else " (unreachable)"
                lines.append(
                    f"| {u['goldId']}{reach_note} `{_snippet(u['goldText'], 56)}` "
                    f"| {u['bestScore']} | `{_snippet(u['bestExtractedText'], 48)}` |"
                )
        else:
            lines.append("None.")
        lines += ["", "### Unmatched extracted (gold may simply not cover these)", ""]
        if d["matchAudit"]["unmatchedExtracted"]:
            lines += [
                "| extracted | best gold score (this doc) | closest gold anywhere in corpus |",
                "|---|---|---|",
            ]
            for u in d["matchAudit"]["unmatchedExtracted"]:
                anywhere = (
                    f"{u.get('bestAnywhereGoldId')} @ {u.get('bestAnywhereScore')}"
                    if u.get("bestAnywhereGoldId")
                    else ""
                )
                lines.append(
                    f"| `{_snippet(u['extractedText'], 72)}` | {u['bestScore']} | {anywhere} |"
                )
        else:
            lines.append("None.")

    return "\n".join(lines) + "\n"


def render_comparison(base: dict[str, Any], new: dict[str, Any]) -> str:
    lines = [
        f"## Comparison: `{base['meta']['label']}` → `{new['meta']['label']}`",
        "",
        f"Prompt hash: `{base['meta']['promptHash']}` → `{new['meta']['promptHash']}`"
        + ("  (prompts unchanged, cache-hit re-run)" if base["meta"]["promptHash"] == new["meta"]["promptHash"] else "  (prompts CHANGED, fresh LLM run)"),
        "",
        "| doc | recall (reachable) | recall (raw) | extraction matched | granularity | quotes found | flags |",
        "|---|---|---|---|---|---|---|",
    ]
    base_docs = {d["docCode"]: d for d in base["documents"] if d["tier"] != 3}
    for d in new["documents"]:
        if d["tier"] == 3:
            continue
        b = base_docs.get(d["docCode"])

        def delta(get) -> str:
            nv = get(d)
            if b is None or nv is None:
                return _pct(nv) if isinstance(nv, float) else str(nv)
            bv = get(b)
            if isinstance(nv, float):
                return f"{_pct(bv)} → {_pct(nv)}"
            return f"{bv} → {nv}"

        quotes = lambda x: (  # noqa: E731
            x["extraction"]["quotesTotal"] - x["extraction"]["quoteMatchLevels"]["not_found"]
        )
        lines.append(
            f"| {d['docCode']} "
            f"| {delta(lambda x: x['metrics']['recallReachable'])} "
            f"| {delta(lambda x: x['metrics']['recallRaw'])} "
            f"| {delta(lambda x: x['metrics']['extractionMatchedRatio'])} "
            f"| {delta(lambda x: x['metrics']['granularityRatio'])} "
            f"| {delta(quotes)} "
            f"| {delta(lambda x: x['extraction']['provenanceFlags'])} |"
        )
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def main_async(args: argparse.Namespace) -> int:
    manifest = json.loads(MANIFEST_PATH.read_text())
    entries = manifest["documents"]
    if args.only:
        wanted = {c.strip().upper() for c in args.only.split(",")}
        entries = [e for e in entries if e["docCode"].upper() in wanted]
        if not entries:
            logger.error("--only matched no manifest entries: %s", args.only)
            return 2

    outdir = EVAL_OUT_ROOT / args.label
    outdir.mkdir(parents=True, exist_ok=True)
    from_run = (PY_ROOT / args.from_run).resolve() if args.from_run else None
    if from_run and not from_run.exists():
        logger.error("--from-run directory not found: %s", from_run)
        return 2

    # Match the CLI/wizard default so the LLM cache is shared with normal runs.
    set_language("en")

    report: dict[str, Any] = {
        "meta": {
            "label": args.label,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "gitSha": _git_sha(),
            "model": LLM_MODEL,
            "concurrency": LLM_CONCURRENCY,
            "promptHash": _prompt_hash(),
            "thresholds": {
                "simAccept": SIM_ACCEPT,
                "quoteAccept": QUOTE_ACCEPT,
                "reachable": REACHABLE_THRESHOLD,
            },
        },
        "documents": [],
    }

    for entry in entries:
        report["documents"].append(await evaluate_document(entry, outdir, from_run))

    # Aggregate over tier 1 only (the honest headline)
    tier1 = [d for d in report["documents"] if d["tier"] == 1 and d.get("metrics")]
    if tier1:
        recalls = [d["metrics"]["recallReachable"] for d in tier1 if d["metrics"]["recallReachable"] is not None]
        report["aggregate"] = {
            "tier1Docs": len(tier1),
            "meanRecallReachable": round(statistics.mean(recalls), 3) if recalls else None,
            "totalGold": sum(d["gold"]["n"] for d in tier1),
            "totalReachable": sum(d["gold"]["reachable"] for d in tier1),
            "totalExtracted": sum(d["extraction"]["n"] for d in tier1),
            "totalMatched": sum(len(d["matchAudit"]["matched"]) for d in tier1),
        }

    (outdir / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    md = render_markdown(report)

    if args.compare:
        base_path = EVAL_OUT_ROOT / args.compare / "report.json"
        if base_path.exists():
            md += "\n" + render_comparison(json.loads(base_path.read_text()), report)
        else:
            logger.warning("--compare report not found: %s", base_path)

    (outdir / "report.md").write_text(md)
    logger.info("Report written to %s", outdir / "report.md")
    if "aggregate" in report:
        logger.info("Aggregate: %s", report["aggregate"])
    return 0


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", required=True, help="Run label, becomes output/eval/<label>/")
    parser.add_argument("--only", default=None, help="Comma-separated docCodes to run (smoke tests)")
    parser.add_argument(
        "--from-run", default=None,
        help="Existing eval run dir (relative to python/) whose extracted/*.json to re-score instead of re-extracting",
    )
    parser.add_argument("--compare", default=None, help="Label of a prior run to append a delta table against")
    args = parser.parse_args()
    sys.exit(asyncio.run(main_async(args)))


if __name__ == "__main__":
    main()
