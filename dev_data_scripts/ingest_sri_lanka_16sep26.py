"""Rebuild python/data/sri-lanka-targets.json from data_sri_lanka_16Sep26.xlsx.

This REPLACES the corpus rather than extending it. Per the CO: "this list of policies
replaces that which we currently have, meaning that we would no longer include the fisheries
or minerals targets." Live goes from 404 targets / 8 documents to 225 / 12.

Target set is `targets_1` exactly as delivered. Where the CO merged a statement together with
its numbered sub-items, and the document itself supplies that statement as its own row in
`targets_0`, the statement becomes the target text and the sub-items become `activities`
(NAgP 15, NEneP 10, NBSAP 16 = 41 targets). Where no such row exists the cell is left exactly
as delivered, because the only alternative would be to manufacture a target by cutting a
heading out of the string, and that heading is a chapter title rather than a commitment. See
dev_data_scripts/decompose_sri_lanka_16sep26.py, whose `decompose()` this imports so the
reviewed workbook and the ingested corpus cannot drift.

NBSAP's 16 targets are unchanged from the previous corpus, and its actions are the same
content the CO delivered on 17 Jul. They are carried forward from the previous corpus (commit
--baseline-ref), which keeps the per-action section numbers and the documented repair of one
split row, after asserting that the content matches the new sheet.

Text repair is conservative and evidence-based. Invisible characters are handled
deterministically in `sq()`. A run-together word is separated only when (a) the separated
phrase appears in an independent source (the policy's own PDF text, the committed PPPP
executive summary, or the previous corpus for the same document) and (b) the joined form is
not a word in the PDF or the dictionary. Nothing is dropped, added or substituted.

PDF text is extracted at run time with `pdftotext` from the Policies folder. A missing PDF or
a missing `pdftotext` aborts the run: silently skipping the repair would produce a different
corpus labelled 'verbatim'.

Dry run by default. Run from the repo root:

    python3 dev_data_scripts/ingest_sri_lanka_16sep26.py --xlsx <path>
    python3 dev_data_scripts/ingest_sri_lanka_16sep26.py --xlsx <path> --write
"""

from __future__ import annotations

import argparse
import glob
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from collections import Counter
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from decompose_sri_lanka_16sep26 import (  # noqa: E402
    EXPECTED_CONTENT_SHA256,
    EXPECTED_T1,
    content_digest,
    decompose,
    has_bad_characters,
    read_sheet,
    sq,
)

REPO = Path(__file__).resolve().parent.parent
TARGETS_JSON = REPO / "python/data/sri-lanka-targets.json"
PPPP_EXEC_SUMMARY = REPO / "python/data/eval/sri-lanka-pppp-exec-summary.txt"

# The last commit carrying the previous 404-target corpus.
DEFAULT_BASELINE_REF = "7006442"

# OneDrive has remounted the shared library under a different folder name more than once
# (2026-09-18, 2026-09-20), so find it by pattern rather than a fixed path.
POLICIES_GLOBS = [
    str(Path.home() / "Library/CloudStorage/*/*AIFlagship*/Sri Lanka/Policies"),
    str(Path.home() / "Library/CloudStorage/*AIFlagship*/Sri Lanka/Policies"),
]

# Document order in the output file. Convention commitments first, then sector instruments.
DOC_ORDER = ["NDC", "NBSAP", "LDN", "NAgP", "NEnvP", "NEneP", "NWRP",
             "NLTP", "NTP", "NPWM", "NWP", "NPPPP"]

# Source PDF per document. NPPPP's PDF is a scan with no text layer; its independent text
# source is the committed executive summary instead. NDC, NBSAP and LDN have no PDF here.
POLICY_PDFS = {
    "NAgP": "National Agriculture Policy.pdf",
    "NEnvP": "National_Environment_Policy_-_English.pdf",
    "NEneP": "national-energy-policy-2019-en.pdf",
    "NWRP": "National Water Resource Policy 2023.pdf",
    "NLTP": "National Transport Policy (draft).pdf",
    "NTP": "National_Tourism_Policy_of_Sri_Lanka-_English_Book.pdf",
    "NPWM": "National_Policy_on_Waste_Management_English.pdf",
    "NWP": "national_wildlife_policy.pdf",
}

# Previous-corpus document codes, for the new codes that were renamed.
BASELINE_CODE = {"NAgP": "NAP", "NPPPP": "PPPP"}

# Source label defect: targets_1 labels one NEnvP section "4.3." but its numbered statements
# are 4.3.1.n and the PDF numbers the section 4.3.1. Corrected only if the PDF confirms it.
NENVP_LABEL_FIX = {"4.3": ("4.3.1", "conservation of coastal and marine ecosystems")}


def flatten(raw: str) -> str:
    """Text normalised for phrase tests: de-hyphenated, lowercased, punctuation to spaces."""
    raw = re.sub(r"-\s*\n\s*", "", raw)
    raw = unicodedata.normalize("NFKC", raw).lower().replace("’", "'").replace("‘", "'")
    return " " + re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]+", " ", raw)) + " "


def find_policies_dir(explicit: Path | None) -> Path:
    if explicit:
        if not explicit.is_dir():
            raise SystemExit(f"--policies-dir not found: {explicit}")
        return explicit
    hits = sorted({h for g in POLICIES_GLOBS for h in glob.glob(g)})
    if len(hits) != 1:
        raise SystemExit("could not locate the Sri Lanka Policies folder under "
                         f"~/Library/CloudStorage (found {len(hits)}); pass --policies-dir")
    return Path(hits[0])


def extract_pdf_text(policies: Path) -> dict[str, str]:
    """PDF text per document, extracted now. Aborts rather than silently skipping."""
    if not shutil.which("pdftotext"):
        raise SystemExit("pdftotext not found (brew install poppler); refusing to skip the repair")
    out: dict[str, str] = {}
    with tempfile.TemporaryDirectory() as tmp:
        for doc, name in POLICY_PDFS.items():
            pdf = policies / name
            if not pdf.exists():
                raise SystemExit(f"missing source PDF for {doc}: {pdf}")
            txt = Path(tmp) / f"{doc}.txt"
            subprocess.run(["pdftotext", "-q", str(pdf), str(txt)], check=True)
            text = txt.read_text(errors="ignore")
            if len(text) < 1000:
                raise SystemExit(f"{doc}: {pdf.name} yielded no text layer; refusing to continue")
            out[doc] = text
    return out


def load_baseline(ref: str) -> list[dict]:
    raw = subprocess.run(["git", "show", f"{ref}:python/data/sri-lanka-targets.json"],
                         cwd=REPO, check=True, capture_output=True, text=True).stdout
    return json.loads(raw)


# --- run-together word repair ------------------------------------------------------------

@lru_cache(maxsize=1)
def dictionary() -> frozenset[str]:
    words = Path("/usr/share/dict/words")
    return frozenset(w.strip().lower() for w in words.read_text().split()) if words.exists() else frozenset()


def is_known_word(low: str, attested: str) -> bool:
    """A real word, as the document writes it or as the dictionary knows it (with inflections)."""
    if f" {low} " in attested:
        return True
    d = dictionary()
    if low in d:
        return True
    for suffix in ("s", "es", "ed", "d", "ing", "er", "ers", "ly", "al", "ment", "ments"):
        if low.endswith(suffix) and len(low) - len(suffix) >= 3 and low[: -len(suffix)] in d:
            return True
    return False


def segmentations(low: str, vocab: frozenset[str], max_parts: int = 4):
    """Ways to split `low` into 2..max_parts evidence-vocabulary words, fewest parts first."""
    results: list[list[str]] = []

    def walk(rest: str, acc: list[str]) -> None:
        if not rest:
            if len(acc) >= 2:
                results.append(acc)
            return
        if len(acc) >= max_parts:
            return
        for i in range(len(rest), 0, -1):
            head = rest[:i]
            if (len(head) >= 2 or head == "a") and head in vocab:
                walk(rest[i:], acc + [head])

    walk(low, [])
    return sorted(results, key=len)


def repair_fusions(text: str, evidence: str, vocab: frozenset[str], attested: str,
                   log: Counter) -> str:
    """Separate run-together words where the separated phrase is in the evidence."""
    def fix(match: re.Match) -> str:
        token = match.group(0)
        low = token.lower()
        if is_known_word(low, attested):
            return token
        for words in segmentations(low, vocab):
            if f" {' '.join(words)} " in evidence:
                parts, i = [], 0
                for w in words:
                    parts.append(token[i:i + len(w)])
                    i += len(w)
                repaired = " ".join(parts)
                log[f"{token} -> {repaired}"] += 1
                return repaired
        return token

    return re.sub(r"[A-Za-z]{5,}", fix, text)


def build_evidence(pdf: dict[str, str], baseline: list[dict]) -> dict[str, tuple[str, frozenset, str]]:
    """Per document: (evidence phrases, their vocabulary, text that attests a joined word)."""
    exec_summary = PPPP_EXEC_SUMMARY.read_text() if PPPP_EXEC_SUMMARY.exists() else ""
    out = {}
    for doc in DOC_ORDER:
        base_code = BASELINE_CODE.get(doc, doc)
        base_text = " ".join(
            t["text"] + " " + (t.get("activities") or "")
            for t in baseline if t["sourceDocument"] == base_code
        )
        independent = pdf.get(doc, "") + (" " + exec_summary if doc == "NPPPP" else "")
        evidence = flatten(independent + " " + base_text)
        # Only independent sources can attest that a joined form is a real word: the previous
        # corpus came from the same spreadsheet lineage and carries the same artifacts.
        out[doc] = (evidence, frozenset(evidence.split()), flatten(independent))
    return out


# --- NBSAP actions --------------------------------------------------------------------------

def despace(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", sq(text).lower())


def carry_forward_nbsap(rows: list[dict], baseline: list[dict]) -> dict[str, dict]:
    """Baseline NBSAP activities keyed by target text, after proving the content matches."""
    base = {t["text"]: t for t in baseline if t["sourceDocument"] == "NBSAP"}
    new = [r for r in rows if r["doc"] == "NBSAP"]
    out = {}
    for rec in new:
        text = sq(rec["text"])
        if text not in base:
            raise SystemExit(f"NBSAP target changed since the baseline, cannot carry forward: {text[:60]}")
        old = base[text]
        if despace("".join(rec["activities"])) != despace(old.get("activities") or ""):
            raise SystemExit(f"NBSAP actions differ from the baseline for {old['id']}; "
                             "review before carrying forward")
        out[text] = old
    if len(out) != 16:
        raise SystemExit(f"expected 16 NBSAP targets to carry forward, got {len(out)}")
    return out


# --- build ------------------------------------------------------------------------------------

def fix_label(doc: str, label: str, pdf: dict[str, str], log: list[str]) -> str:
    key = label.rstrip(".").strip()
    if doc == "NEnvP" and key in NENVP_LABEL_FIX:
        corrected, heading = NENVP_LABEL_FIX[key]
        if f" {corrected.replace('.', ' ')} {heading} " not in flatten(pdf.get("NEnvP", "")):
            raise SystemExit(f"PDF does not confirm NEnvP section {corrected} '{heading}'")
        log.append(f"NEnvP label '{label}' -> '{corrected}' (PDF numbers the section {corrected})")
        return corrected
    return key


def build_targets(rows, pdf, baseline):
    fusion_log: Counter = Counter()
    label_log: list[str] = []
    evidence = build_evidence(pdf, baseline)
    nbsap = carry_forward_nbsap(rows, baseline)
    by_doc: dict[str, list[dict]] = {doc: [] for doc in DOC_ORDER}

    for rec in rows:
        doc = rec["doc"]
        if doc not in by_doc:
            raise SystemExit(f"unexpected document code {doc!r}; update DOC_ORDER")
        ev, vocab, attested = evidence[doc]
        raw_text = sq(rec["text"])
        text = repair_fusions(raw_text, ev, vocab, attested, fusion_log)

        target = {
            "id": f"{doc}_{len(by_doc[doc]) + 1}",
            "text": text,
            "sourceDocument": doc,
            "sourceLabel": fix_label(doc, sq(rec["name"]), pdf, label_log),
            "country": "Sri Lanka",
            # The xlsx Source column holds a document reference (NBSAP only), not a URL.
            "sources": [{"sourceText": text, "url": ""}],
            "textCleanup": "verbatim" if text == raw_text else "cleaned",
        }

        if doc == "NBSAP":
            old = nbsap[raw_text]
            target["activities"] = old["activities"]
            target["activitySources"] = old["activitySources"]
        elif rec["activities"]:
            acts = [repair_fusions(sq(a), ev, vocab, attested, fusion_log) for a in rec["activities"]]
            target["activities"] = "\n".join(acts)
            target["activitySources"] = [{"text": a, "sourceText": a} for a in acts]
        by_doc[doc].append(target)

    return [t for doc in DOC_ORDER for t in by_doc[doc]], fusion_log, label_log


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--xlsx", type=Path, required=True)
    parser.add_argument("--policies-dir", type=Path, default=None,
                        help="Sri Lanka 'Policies' folder (default: found under ~/Library/CloudStorage)")
    parser.add_argument("--baseline-ref", default=DEFAULT_BASELINE_REF,
                        help="git ref holding the previous corpus (default: %(default)s)")
    parser.add_argument("--show-repairs", action="store_true", help="list every word separation")
    parser.add_argument("--write", action="store_true", help="write the file (default: dry run)")
    args = parser.parse_args()

    digest = content_digest(args.xlsx)
    print(f"source:   {args.xlsx}")
    print(f"content:  {digest}" + ("" if digest == EXPECTED_CONTENT_SHA256 else "   <- NOT the reviewed version"))
    policies = find_policies_dir(args.policies_dir)
    print(f"policies: {policies}")
    pdf = extract_pdf_text(policies)
    baseline = load_baseline(args.baseline_ref)
    print(f"baseline: {args.baseline_ref} ({len(baseline)} targets)")

    rows = decompose(read_sheet(args.xlsx, "targets_1"), read_sheet(args.xlsx, "targets_0"))
    targets, fusion_log, label_log = build_targets(rows, pdf, baseline)

    ok = True

    def check(label: str, passed: bool, detail: str = "") -> None:
        nonlocal ok
        ok &= passed
        print(f"  [{'PASS' if passed else 'FAIL'}] {label}" + (f"  {detail}" if detail else ""))

    print("\nCorpus")
    counts = Counter(t["sourceDocument"] for t in targets)
    check(f"{len(targets)} targets across {len(counts)} documents", dict(counts) == EXPECTED_T1,
          "" if dict(counts) == EXPECTED_T1 else str(dict(sorted(counts.items()))))
    ids = [t["id"] for t in targets]
    check("target ids unique", len(set(ids)) == len(ids))
    dupes = [t for t, n in Counter(t["text"].lower() for t in targets).items() if n > 1]
    check("no duplicate target text", not dupes, f"{len(dupes)} duplicated" if dupes else "")
    bad = [t["id"] for t in targets
           if has_bad_characters(t["text"] + (t.get("activities") or "")
                                 + "".join(a.get("text", "") for a in t.get("activitySources", [])))]
    check("no zero-width, non-breaking or private-use characters", not bad, str(bad[:5]) if bad else "")
    # A lone letter then a word fragment ("N ational"). Not after & / . or an apostrophe, so
    # "M&E indicators", "GCE O/L examination" and "nature's contributions" are not flagged.
    split = re.compile(r"(?<![\w&/.’'])(?![aAI]\b)[A-Za-z] [a-z]{3,}")
    letters = [(t["id"], m.group(0)) for t in targets
               for s in [t["text"]] + (t.get("activities") or "").split("\n")
               for m in split.finditer(s)]
    check("no letters split off inside words", not letters, str(letters[:5]) if letters else "")
    nb = [t for t in targets if t["sourceDocument"] == "NBSAP"]
    sections = sum(1 for t in nb for a in t["activitySources"] if a.get("section"))
    check("NBSAP actions keep their section numbers", sections == 123, f"{sections}/123")

    with_acts = [t for t in targets if t.get("activities")]
    n_acts = sum(len(t["activities"].split("\n")) for t in with_acts)
    cleaned = sum(1 for t in targets if t["textCleanup"] == "cleaned")
    print(f"\n  {len(with_acts)} targets carry activities, {n_acts} activity lines")
    print(f"  {sum(fusion_log.values())} run-together words separated "
          f"({len(fusion_log)} distinct), {cleaned} targets marked 'cleaned'")
    for line in label_log:
        print(f"  label: {line}")
    if args.show_repairs:
        for fix, count in sorted(fusion_log.items()):
            print(f"      {count}x  {fix}")

    n = len(targets)
    pairs = n * (n - 1) // 2 - sum(v * (v - 1) // 2 for v in counts.values())
    print(f"  cross-document pairs to assess: {pairs:,}")

    if args.write and ok:
        TARGETS_JSON.write_text(json.dumps(targets, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {TARGETS_JSON}")
    elif args.write:
        print("\nchecks FAILED, nothing written")
        return 1
    else:
        print("\nDRY RUN - pass --write to update python/data/sri-lanka-targets.json")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
