"""Rebuild the Mongolia targets file from the partner-curated NDC revision.

Background (TAG dispute + 2026-07-30 provenance audit): six of the 27 targets
stored as `NDC` could not be traced to the official NDC 3.0 submission
(UNFCCC, English). The sector-level GHG tonnage rows (old NDC_22/23/24, incl.
the "meat supply" target) actually come from Government of Mongolia Resolution
No. 91 (10 Sep 2025), the domestic act approving national targets for
implementing the Paris Agreement.

This script consumes the partner spreadsheet
`dev_data_scripts/mongolia/Mongolia Targets - revised NDCs.xlsx`
(sheet `revised_ndcs`, granular: Goal/Target/Measure rows) and rewrites
`python/data/mongolia-targets.json`:

- non-NDC rows are kept byte-identical;
- the 21 audit-verified NDC sentences keep their ids (NDC_1..NDC_21) and
  stored fields (NDC_8's `actions` is repaired: it carried the Forests-sector
  measures instead of its own disaster-risk measures);
- 15 rows new to the corpus (mitigation targets, sector goals, corrected
  inclusion/gender objectives, enabling-environment rows) get ids
  NDC_28..NDC_42 -- NDC_22..NDC_27 are retired and never reused;
- the 16 Resolution 91 targets are added as NITIPA_1..NITIPA_16 with the
  Mongolian original text from the resolution.

Every NDC row (text and measures) is verified against the NDC 3.0 PDF via
8-gram coverage after deterministic fused-word repair (xlsx-from-PDF cells fuse
words across line breaks); rows below the verbatim threshold are stored with
`textCleanup: "cleaned"` instead of `"verbatim"`. The script aborts if any
disputed token (fabricated tonnage figures, "meat supply") survives in an NDC
row or the corpus counts drift from the expected 178.

Usage: python -m scripts.build_mongolia_targets_revision  (from python/)
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

import fitz  # pymupdf
import openpyxl

ROOT = Path(__file__).resolve().parents[2]
XLSX = ROOT / "dev_data_scripts/mongolia/Mongolia Targets - revised NDCs.xlsx"
NDC_PDF = ROOT / "dev_data_scripts/mongolia/Mongolia NDC3_0 under UNFCCC_PA FINAL.pdf"
TARGETS = ROOT / "python/data/mongolia-targets.json"

NDC_URL = "https://unfccc.int/sites/default/files/2025-09/Mongolia%20NDC3_0%20under%20UNFCCC_PA%20FINAL.pdf"
NITIPA_URL = "https://legalinfo.mn/mn/detail?lawId=17433351257372&showType=1"
NITIPA_SOURCE_NOTE = (
    "Government of Mongolia Resolution No. 91 (10 September 2025), annex: "
    "'Парисын хэлэлцээрийг хэрэгжүүлэх үндэсний тодорхойлсон хувь нэмрийн зорилт'"
)

DISPUTED_TOKENS = [
    "5.277", "9.78", "4.15", "7.48", "1.12", "2.29",
    "50 million head", "meat supply",
]

VERBATIM_THRESHOLD = 0.98

# Documented deterministic corrections where the spreadsheet deviates from the
# PDF by a transcription slip; each corrected text must verify as verbatim.
TEXT_CORRECTIONS = {
    # xlsx drops the plural: PDF reads "... resilient to risks."
    "To develop a sustainable and productive animal husbandry that is aligned "
    "with the carrying capacity of pasture and water resources, based on "
    "advanced adaptation technologies, resilient to risk":
        "To develop a sustainable and productive animal husbandry that is "
        "aligned with the carrying capacity of pasture and water resources, "
        "based on advanced adaptation technologies, resilient to risks.",
}

# ---------------------------------------------------------------- text utils

def norm(s: str) -> str:
    """Lowercased, punctuation-collapsed form used for n-gram matching."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = (s.replace("’", "'").replace("‘", "'")
         .replace("“", '"').replace("”", '"')
         .replace("–", "-").replace("—", "-")
         .replace(" ", " "))
    s = re.sub(r"[^a-z0-9%.]+", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def squash(s: str) -> str:
    """Space-free form: tolerant of fused-word and whitespace artifacts."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).lower()
    return re.sub(r"[^a-z0-9%]+", "", s)


def clean_cell(s: str) -> str:
    """Collapse cell-internal line breaks and stray whitespace."""
    if not s:
        return ""
    s = unicodedata.normalize("NFC", s).replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip()


def coverage(text: str, haystack: str, n: int = 8) -> float:
    words = norm(text).split()
    if len(words) < n:
        return 1.0 if norm(text) in haystack else 0.0
    grams = [" ".join(words[i:i + n]) for i in range(len(words) - n + 1)]
    return sum(1 for g in grams if g in haystack) / len(grams)


def build_repairer(pdf_norm: str):
    """Deterministic fused-word splitter validated against the PDF text."""
    vocab = set(pdf_norm.replace(".", " ").split()) | set(pdf_norm.split())

    def known(w: str) -> bool:
        wl = w.lower().strip(".,;:()")
        return (not wl or len(wl) <= 2 or wl in vocab
                or re.fullmatch(r"[\d.,%–-]+", wl) is not None)

    def repair_token(tok: str) -> str:
        if known(tok):
            return tok
        m = re.match(r"^(\W*)(.*?)(\W*)$", tok, re.S)
        lead, core, trail = m.groups()
        candidates = []
        for i in range(2, len(core) - 1):
            a, b = core[:i], core[i:]
            if known(a) and known(b):
                candidates.append((a, b))
        if not candidates:
            return tok
        # prefer the split whose bigram actually occurs in the PDF
        preferred = [c for c in candidates
                     if f"{norm(c[0])} {norm(c[1])}" in pdf_norm]
        pick = preferred[0] if len(preferred) >= 1 else None
        if pick is None and len(candidates) == 1:
            pick = candidates[0]
        if pick is None:
            return tok
        return f"{lead}{pick[0]} {pick[1]}{trail}"

    def repair(text: str) -> str:
        return " ".join(repair_token(t) for t in text.split(" "))

    return repair

# ---------------------------------------------------------------- xlsx parse

def load_granular():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["revised_ndcs"]
    rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        vals = [clean_cell(str(c)) if c is not None else "" for c in row]
        if not any(vals):
            continue
        rows.append({
            "document": vals[0], "source": vals[1], "mna": vals[2],
            "sector": vals[3], "title": vals[4], "target": vals[5],
            "desc": vals[6], "mn": vals[7], "en": vals[8],
        })
    return rows


NDC_MEASURE_RE = re.compile(r"(?i)^\s*(?:conditional\s+|consitional\s+)?measures?\s*(?:\d|$)")
NITIPA_TOP_RE = re.compile(r"^(?:Target \d+|Conditional Measure \d+|Cross-sector objective \d+)$")


def group_rows(rows, is_measure):
    groups = []
    for r in rows:
        if is_measure(r):
            if not groups:
                raise SystemExit(f"measure row before any target: {r}")
            groups[-1][1].append(r)
        else:
            groups.append((r, []))
    return groups

# ---------------------------------------------------------------- NDC build

SECTOR_LABEL = {
    "Animal husbandry and pasteurland": "Animal husbandry and pastureland",
    "Inclusive Goal and Measures Ensuring Participation of Children, Youth, VulnerableGroups, and Gender Equality": "Inclusion",
    "Establish a favorable legal, institutional and financial environment, and providestakeholders with knowledge and information": "Enabling environment",
}


def ndc_source_label(top) -> str:
    sector = SECTOR_LABEL.get(top["sector"], top["sector"])
    if not sector:
        return top["target"]  # mitigation rows carry descriptive titles
    return f"{sector} {top['target']}"


def format_actions(measures, repair) -> str:
    if not measures:
        return ""
    plain = [m for m in measures if "condi" not in m["target"].lower()]
    cond = [m for m in measures if "condi" in m["target"].lower()]
    lines, n = ["Measures:"], 0
    for m in plain:
        n += 1
        lines.append(f"{n}. {repair(m['desc'])}")
    if cond:
        lines.append("Conditional measures:" if len(cond) > 1 else "Conditional measure:")
        for m in cond:
            n += 1
            lines.append(f"{n}. {repair(m['desc'])}")
    return "\n".join(lines)


def extract_pdf_text() -> str:
    """PDF text with standalone page-number lines removed (they interrupt
    sentences that span page breaks and would break verbatim checks)."""
    pages = []
    for page in fitz.open(NDC_PDF):
        lines = [l for l in page.get_text().split("\n")
                 if not re.fullmatch(r"\s*\d{1,3}\s*", l)]
        pages.append("\n".join(lines))
    return " ".join(pages)


def main() -> None:
    current = json.loads(TARGETS.read_text())
    pdf_text = extract_pdf_text()
    pdf_norm = norm(pdf_text)
    repair = build_repairer(pdf_norm)

    rows = load_granular()
    ndc_rows = [r for r in rows if r["document"] == "NDC"]
    nit_rows = [r for r in rows if r["document"] != "NDC"]

    ndc_groups = group_rows(ndc_rows, lambda r: bool(NDC_MEASURE_RE.match(r["target"])))
    nit_groups = group_rows(nit_rows, lambda r: not NITIPA_TOP_RE.match(r["target"]))
    assert len(ndc_groups) == 36, f"expected 36 NDC groups, got {len(ndc_groups)}"
    assert len(nit_groups) == 16, f"expected 16 NITIPA groups, got {len(nit_groups)}"

    kept_by_text = {squash(t["text"]): t for t in current if t["sourceDocument"] == "NDC"}

    pdf_squash = squash(pdf_text)

    def is_verbatim(text: str) -> bool:
        return squash(text) in pdf_squash or coverage(text, pdf_norm) >= VERBATIM_THRESHOLD

    new_ndc, next_id, kept_ids, non_verbatim = [], 28, [], []
    for top, measures in ndc_groups:
        text = repair(top["desc"])
        text = TEXT_CORRECTIONS.get(text, text)
        existing = kept_by_text.get(squash(text))
        if existing is not None:
            # byte-identical to the audited row except the NDC_8 measures repair;
            # textCleanup keeps its audit-verified value.
            row = dict(existing)
            if row["id"] == "NDC_8":
                row["actions"] = format_actions(measures, repair)
            kept_ids.append(row["id"])
        else:
            row = {
                "id": f"NDC_{next_id}",
                "text": text,
                "sourceDocument": "NDC",
                "sourceLabel": ndc_source_label(top),
                "country": "Mongolia",
                "sources": [{"sourceText": text, "url": NDC_URL}],
            }
            next_id += 1
            actions = format_actions(measures, repair)
            if actions:
                row["actions"] = actions
            row["textCleanup"] = "verbatim" if is_verbatim(text) else "cleaned"
            if row["textCleanup"] != "verbatim":
                non_verbatim.append(row["id"])
        new_ndc.append(row)

    assert sorted(kept_ids, key=lambda s: int(s.split("_")[1])) == [
        f"NDC_{i}" for i in range(1, 22)
    ], f"kept ids drifted: {sorted(kept_ids)}"

    trailing = re.compile(r"\s*(?:Including:|These include:|It includes:|Үүнд:)\s*$", re.I)
    new_nit = []
    for i, (top, measures) in enumerate(nit_groups, start=1):
        text_en = trailing.sub("", top["en"]).strip()
        text_mn = trailing.sub("", top["mn"]).strip()
        act_en = [re.sub(r"^-\s*", "", m["en"]).rstrip(";").strip() for m in measures]
        act_mn = [re.sub(r"^-\s*", "", m["mn"]).rstrip(";").strip() for m in measures]
        row = {
            "id": f"NITIPA_{i}",
            "text": text_en,
            "sourceDocument": "NITIPA",
            "sourceLabel": top["target"],
            "country": "Mongolia",
            "sources": [{
                "sourceText": "\n".join([text_mn] + act_mn),
                "url": NITIPA_URL,
                "note": NITIPA_SOURCE_NOTE,
            }],
            "textCleanup": "verbatim",
            "textOriginal": text_mn,
            "language": "mn",
            "textOriginalSource": "source",
        }
        if act_en:
            row["activities"] = "\n".join(act_en)
        new_nit.append(row)

    # ------------------------------------------------------------ assemble
    out, inserted = [], False
    for t in current:
        if t["sourceDocument"] == "NDC":
            if not inserted:
                out.extend(new_ndc)
                out.extend(new_nit)
                inserted = True
            continue
        out.append(t)

    # ------------------------------------------------------------ verify
    counts = {}
    for t in out:
        counts[t["sourceDocument"]] = counts.get(t["sourceDocument"], 0) + 1
    expected = {"FSS": 41, "NDC": 36, "NRVTS": 27, "NBSAP": 20, "NAP": 15,
                "SECTORAL": 15, "NITIPA": 16, "ILDN": 8}
    assert counts == expected, f"count drift: {counts}"
    assert len(out) == 178, len(out)
    ids = [t["id"] for t in out]
    assert len(ids) == len(set(ids)), "duplicate ids"
    assert not any(t["id"] in {f"NDC_{i}" for i in range(22, 28)} for t in out), \
        "retired ids NDC_22..27 must not reappear"

    for t in out:
        if t["sourceDocument"] != "NDC":
            continue
        blob = " ".join([t["text"], t.get("actions", "")])
        for tok in DISPUTED_TOKENS:
            assert tok.lower() not in blob.lower(), f"disputed token {tok!r} in {t['id']}"
    nit_blob = " ".join(t["text"] + " " + t.get("activities", "") for t in new_nit)
    assert "5,277" in nit_blob and "meat supply" in nit_blob.lower(), \
        "Resolution 91 livestock content missing from NITIPA"

    for corrected in TEXT_CORRECTIONS.values():
        assert any(t["text"] == corrected for t in new_ndc), "correction not applied"
        assert squash(corrected) in pdf_squash, "corrected text is not verbatim PDF text"
    print("new NDC rows stored as 'cleaned' (not fully traceable verbatim):",
          non_verbatim or "none")
    measure_lines = [
        line[line.index(". ") + 2:]
        for t in new_ndc if t.get("actions")
        for line in t["actions"].split("\n") if re.match(r"^\d+\. ", line)
    ]
    unverified = [l for l in measure_lines if squash(l.rstrip(".,;")) not in pdf_squash]
    print(f"measure lines not squash-verbatim in PDF: {len(unverified)}/{len(measure_lines)}")
    for l in unverified[:10]:
        print("   ~", l[:110])

    TARGETS.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {TARGETS} with {len(out)} targets "
          f"(NDC {counts['NDC']}, NITIPA {counts['NITIPA']}); kept {len(kept_ids)} NDC ids")


if __name__ == "__main__":
    sys.exit(main())
