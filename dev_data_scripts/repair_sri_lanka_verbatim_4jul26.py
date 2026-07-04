"""One-shot repair: restore document-verbatim spacing for the NWRP and NMP
rows in python/data/sri-lanka-targets.json.

Why: the expert rows ingested on 3 Jul 2026 (ingest_sri_lanka_nmp_3jul26.py,
ingest_sri_lanka_nwrp_swap_3jul26.py) carry the xlsx cell text verbatim, but
many cells contain words fused together without spaces (PDF copy artifacts
introduced when the colleague pasted from the policy PDFs, e.g. "waterresources
fordomestic"). PR #169 review confirmed 18+/33 NWRP and 26/55 NMP rows are
affected while every row's text is space-insensitively locatable in the
corresponding policy PDF's own English text layer. This script recovers the
PDF's spacing so `text` (and the source quote) is verbatim to the PRIMARY
SOURCE, which is what textCleanup: "verbatim" claims. No words are added,
removed, or reordered: a repair is accepted only if the repaired string equals
the xlsx string after stripping all non-alphanumerics (case-insensitive).

Mechanics per row:
  1. Normalise the PDF text and the row text to lowercase alphanumerics,
     keeping an index map from normalised positions back to raw positions.
  2. Find the row's normalised text in the PDF's normalised text (first
     occurrence; occurrence count reported).
  3. Recover the raw PDF span, join hyphenated line breaks ("exam-\\nple" ->
     "example"; occurrences reported for eyeball review), collapse whitespace.
  4. Assert normalised equality between repaired and original xlsx text, then
     write `text` and `sources[0].sourceText`.

Rows whose text cannot be located in the PDF are left byte-for-byte unchanged
and reported; their textCleanup is set to "cleaned" (present corpus vocabulary:
verbatim | cleaned) because "verbatim" cannot be certified against the document.

Sources:
  NWRP: dev_data_scripts/sharepoint_sync/Sri Lanka/Policies/National Water Resource Policy 2023.pdf
  NMP:  dev_data_scripts/sharepoint_sync/Sri Lanka/Policies/National-Mineral-Policy-English.pdf

Usage: uv run --directory python python ../dev_data_scripts/repair_sri_lanka_verbatim_4jul26.py
"""

import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

REPO = Path(__file__).resolve().parent.parent
TARGETS_JSON = REPO / "python/data/sri-lanka-targets.json"
POLICIES = REPO / "dev_data_scripts/sharepoint_sync/Sri Lanka/Policies"
PDFS = {
    "NWRP": POLICIES / "National Water Resource Policy 2023.pdf",
    "NMP": POLICIES / "National-Mineral-Policy-English.pdf",
}


def load_pdf_text(path: Path) -> str:
    doc = fitz.open(path)
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    return text


def normalise_with_map(raw: str) -> tuple[str, list[int]]:
    """Lowercase-alnum normalisation keeping normalised->raw index map."""
    chars: list[str] = []
    posmap: list[int] = []
    for i, c in enumerate(raw):
        if c.isalnum():
            chars.append(c.lower())
            posmap.append(i)
    return "".join(chars), posmap


NORM = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())


def repair_span(span: str, pdf_raw: str) -> tuple[str, int]:
    """Join hyphenated line breaks, collapse whitespace. Returns (text, n_joins).

    A line-break hyphen is dropped ("exam-\\nple" -> "example") unless the
    hyphenated compound also occurs inline elsewhere in the same PDF
    ("long-\\nterm" -> "long-term" when "long-term" appears in running text),
    which distinguishes typographic hyphenation from genuine compounds.
    """
    n = 0

    def _join(m: re.Match) -> str:
        nonlocal n
        n += 1
        a, b = m.group(1), m.group(2)
        if re.search(rf"{re.escape(a)}-{re.escape(b)}", pdf_raw.replace("-\n", "-").replace("- \n", "-"), re.I):
            return f"{a}-{b}"
        return f"{a}{b}"

    joined = re.sub(r"(\w+)-\s*\n\s*(\w+)", _join, span)
    return " ".join(joined.split()), n


MIN_CHUNK = 20


def defuse_with_vocab(text: str, vocab: set[str]) -> tuple[str, int]:
    """Split fused alpha tokens using the document's own vocabulary.
    A token is touched only if it is not itself a document word and exactly
    one split point produces two document words (each >= 2 chars)."""
    n = 0

    def _split(m: re.Match) -> str:
        nonlocal n
        tok = m.group(0)
        if len(tok) < 8 or tok.lower() in vocab:
            return tok
        options = [
            (tok[:i], tok[i:])
            for i in range(2, len(tok) - 1)
            if tok[:i].lower() in vocab and tok[i:].lower() in vocab
        ]
        if len(options) != 1:
            return tok
        n += 1
        return f"{options[0][0]} {options[0][1]}"

    return re.sub(r"[A-Za-z]{8,}", _split, text), n


def locate_chunked(needle: str, norm: str, posmap: list[int], raw: str) -> tuple[str, int] | None:
    """Greedy longest-prefix recovery for texts the expert concatenated from
    non-contiguous document clauses (e.g. a clause plus its roman-numeral
    sub-clauses). Returns (repaired text, n_chunks) or None. Every chunk is
    document-verbatim; the assembly order is the expert's."""
    pieces: list[str] = []
    rest = needle
    while rest:
        lo, hi = 0, len(rest)
        best = 0
        while lo <= hi:  # binary search longest findable prefix
            mid = (lo + hi) // 2
            if mid and norm.find(rest[:mid]) != -1:
                best = mid
                lo = mid + 1
            else:
                hi = mid - 1
        if best < min(MIN_CHUNK, len(rest)):
            return None
        start = norm.find(rest[:best])
        span = raw[posmap[start] : posmap[start + best - 1] + 1]
        pieces.append(repair_span(span, raw)[0])
        rest = rest[best:]
    return " ".join(pieces), len(pieces)


def main() -> int:
    targets = json.loads(TARGETS_JSON.read_text())
    ids_before = [t["id"] for t in targets]

    report = {"changed": [], "unchanged": [], "unlocatable": [], "hyphen_joins": [], "chunked": [], "defused": []}
    pdf_cache: dict[str, tuple[str, str, list[int]]] = {}
    for doc_code, pdf_path in PDFS.items():
        raw = load_pdf_text(pdf_path)
        norm, posmap = normalise_with_map(raw)
        pdf_cache[doc_code] = (raw, norm, posmap)

    for t in targets:
        doc_code = t["sourceDocument"]
        if doc_code not in PDFS:
            continue
        raw, norm, posmap = pdf_cache[doc_code]
        needle = NORM(t["text"])
        if not needle:
            continue
        start = norm.find(needle)
        if start == -1:
            # Non-contiguous expert assembly: recover chunk-by-chunk. The text
            # is then document-verbatim per chunk but not one contiguous quote,
            # so textCleanup becomes "cleaned" (not certifiable as verbatim).
            chunked = locate_chunked(needle, norm, posmap, raw)
            if chunked is None:
                # Last resort for rows whose wording diverges from the PDF
                # (expert paraphrase): de-fuse tokens using the PDF's own
                # vocabulary. A token is split only if it is NOT a PDF word
                # and exactly ONE split point yields two PDF words, so no
                # content is ever invented.
                vocab = {w.lower() for w in re.findall(r"[A-Za-z]{2,}", raw)}
                defused, n_splits = defuse_with_vocab(t["text"], vocab)
                t["textCleanup"] = "cleaned"
                if n_splits and NORM(defused) == needle:
                    t["text"] = defused
                    if t.get("sources"):
                        t["sources"][0]["sourceText"] = defused
                    report["defused"].append((t["id"], n_splits))
                else:
                    report["unlocatable"].append(t["id"])
                continue
            repaired, n_chunks = chunked
            if NORM(repaired) != needle:
                print(f"ABORT: {t['id']} chunked repair lost normalised equality")
                return 1
            t["textCleanup"] = "cleaned"
            report["chunked"].append((t["id"], n_chunks))
            if repaired != t["text"]:
                t["text"] = repaired
                if t.get("sources"):
                    t["sources"][0]["sourceText"] = repaired
                report["changed"].append((t["id"], 0))
            continue
        occurrences = norm.count(needle)
        end = start + len(needle) - 1
        span = raw[posmap[start] : posmap[end] + 1]
        repaired, n_joins = repair_span(span, raw)
        if NORM(repaired) != needle:
            print(f"ABORT: {t['id']} repaired text lost normalised equality")
            return 1
        if n_joins:
            report["hyphen_joins"].append((t["id"], n_joins))
        if repaired != t["text"]:
            t["text"] = repaired
            if t.get("sources"):
                t["sources"][0]["sourceText"] = repaired
            report["changed"].append((t["id"], occurrences))
        else:
            report["unchanged"].append(t["id"])

    ids_after = [t["id"] for t in targets]
    if ids_after != ids_before:
        print("ABORT: id set or order changed")
        return 1

    TARGETS_JSON.write_text(json.dumps(targets, indent=2, ensure_ascii=False) + "\n")
    print(f"changed: {len(report['changed'])} rows")
    print(f"unchanged (already document-verbatim): {len(report['unchanged'])}")
    print(f"unlocatable (textCleanup -> cleaned): {report['unlocatable']}")
    print(f"chunked non-contiguous recoveries (textCleanup -> cleaned): {report['chunked']}")
    print(f"vocabulary-defused (textCleanup -> cleaned): {report['defused']}")
    print(f"hyphen line-break joins (eyeball these): {report['hyphen_joins']}")
    multi = [(i, n) for i, n in report["changed"] if n > 1]
    print(f"multiple-occurrence matches (first taken): {multi}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
