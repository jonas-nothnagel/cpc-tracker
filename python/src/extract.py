"""
Document-to-target extraction.

Accepts a PDF, DOCX, or plain text file, extracts text, and uses the LLM to
identify high-level policy targets — the kind a human expert would pick out
for a cross-document coherence analysis.

Two-pass approach:
  1. Per-chunk extraction of candidate targets.
  2. Consolidation pass that deduplicates, merges, and filters candidates
     across the whole document into a final expert-quality list.

Usage:
    python -m src.extract --file path/to/document.pdf --doc-type NDC
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Any

from .llm import call_llm

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Expected target counts by document type (order of magnitude guidance)
# ---------------------------------------------------------------------------
EXPECTED_COUNTS: dict[str, str] = {
    "NDC": "15-30",
    "NBSAP": "15-25",
    "NAP": "10-20",
    "LDN": "5-15",
    "SECTORAL": "5-20",
}

# ---------------------------------------------------------------------------
# Few-shot examples (drawn from human-curated Mongolia targets)
# ---------------------------------------------------------------------------
FEW_SHOT_EXAMPLES = """\
Here are examples of correctly extracted targets from real policy documents. \
Use these as a reference for the level of abstraction and specificity expected.

NDC examples:
- "Protect natural forests, improve forest health, and enhance forest regeneration capacity"
- "Reduce Soil Organic Carbon loss by restoring 10% of heavily degraded rangelands within the forest-steppe (3%) and steppe (7%) ecological zones, moving land from Recovery Class IV (heavily degraded) to Recovery Class III (moderately degraded)."
- "Strengthen the health care system for early detection, warning, and response to climate change related threats to human health."
- "The agricultural sector will reduce 5.277 million tons of CO2 until 2030 and 9.78 million tons of CO2 until 2035 by adhering (national livestock herd to 50 million head) ecological carrying capacity of rangelands and improving livestock economic turnover through increasing export and meat supply to the domestic."

NBSAP examples:
- "Restore at least 30 percent of degraded ecosystems and improve ecological integrity and connectivity"
- "Ensure that each representative type of the main ecosystems is included and that 30% of the country's total land area is effectively conserved within the National Protected Area Network, while strengthening ecological connectivity across the landscape."
- "Redesign subsidies and incentives that negatively impact biodiversity to be environment and biodiversity-friendly."

NAP examples:
- "Minimize risks from climate change induced disasters and improve resilience"
- "Develop multi-hazard, impact-based early warning systems to enable quick and effective responses to extreme events."
- "Sustainably develop high-yield crops through climate-adapted technologies and soil conservation."

Notice that these are policy-level OBJECTIVES, not:
- Individual implementation measures or activities (too granular)
- Background context or situation descriptions
- Indicator metrics in isolation (e.g. "Percentage of land under protection")
- Procedural text about stakeholder consultation or reporting
- Generic aspirational statements without a clear policy goal"""

# ---------------------------------------------------------------------------
# System and user prompts
# ---------------------------------------------------------------------------

EXTRACT_SYSTEM = """\
You are a senior policy analyst preparing structured data for a national \
policy coherence assessment. Your task is to extract the HIGH-LEVEL POLICY \
TARGETS from a section of a national policy document.

A "target" is a discrete policy-level objective, goal, or commitment that a \
government has set — the kind of statement that would appear in a summary \
table of a country's policy ambitions. Targets may be quantitative \
(e.g. "reduce emissions by 30% by 2030") or qualitative \
(e.g. "strengthen early warning systems for disaster risk").

{few_shot}

RULES:
1. Extract ONLY high-level policy targets/objectives/goals. NOT individual \
   measures, activities, indicators, background, or context.
2. When a document lists a "Goal" with sub-"Targets" or sub-"Measures", \
   extract at the TARGET level, not at the measure/activity level. Combine \
   closely related sub-points into one coherent target.
3. Preserve the original wording. Lightly clean if needed, but do not \
   paraphrase or embellish.
4. Do NOT extract background descriptions, context, definitions, procedural \
   text, or stakeholder lists.
5. If a section has no policy targets, return an empty array: []
6. A typical {doc_type} document contains {expected_count} targets total. \
   This section may contain 0-5. Be selective.

Return a JSON array. Each object must have:
- "text": the policy target (verbatim or lightly cleaned)
- "label": a short descriptive label (max 8 words)

Output valid JSON only — no markdown fences, no explanation."""

EXTRACT_USER = """\
Extract the high-level policy targets from the following section of a {doc_type} document:

---
{text}
---

Return a JSON array of extracted targets."""

# ---------------------------------------------------------------------------
# Consolidation prompt (second pass)
# ---------------------------------------------------------------------------

CONSOLIDATE_SYSTEM = """\
You are a senior policy analyst finalising the target list for a national \
policy coherence assessment. You have received candidate targets extracted \
from different sections of a {doc_type} document.

Your task is to produce the FINAL, CLEAN list of distinct policy targets by:
1. Removing duplicates or near-duplicates (keep the most complete version).
2. Merging overlapping targets that clearly refer to the same objective.
3. Removing items that are NOT real policy targets (background text, \
   indicators in isolation, procedural statements, generic filler).
4. Keeping the list at the right level of abstraction — each item should be \
   a distinct policy objective suitable for cross-document coherence analysis.

A typical {doc_type} contains roughly {expected_count} targets. If you have \
significantly more, you are likely including too many sub-measures or context.

Return a JSON array. Each object must have:
- "text": the policy target
- "label": a short descriptive label (max 8 words)

Output valid JSON only — no markdown fences, no explanation."""

CONSOLIDATE_USER = """\
Here are {count} candidate targets extracted from a {doc_type} document. \
Produce the final consolidated list.

{candidates_json}"""

MAX_CHUNK_CHARS = 12000


def _extract_text_pdf(path: Path) -> str:
    try:
        import pymupdf  # noqa: F811
    except ImportError:
        import fitz as pymupdf  # type: ignore[no-redef]

    doc = pymupdf.open(str(path))
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n\n".join(pages)


def _extract_text_docx(path: Path) -> str:
    from docx import Document

    doc = Document(str(path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def extract_text(path: Path) -> str:
    """Extract text from a PDF, DOCX, or plain-text file."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _extract_text_pdf(path)
    elif suffix == ".docx":
        return _extract_text_docx(path)
    else:
        return path.read_text(encoding="utf-8", errors="replace")


def chunk_text(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """Split text into chunks, trying to break at paragraph boundaries."""
    paragraphs = re.split(r"\n{2,}", text)
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current) + len(para) + 2 > max_chars and current:
            chunks.append(current)
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para

    if current.strip():
        chunks.append(current)

    return chunks


def _parse_json_array(raw: str) -> list[dict[str, str]]:
    """Parse LLM JSON response, handling common formatting issues."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if match:
            try:
                items = json.loads(match.group())
            except json.JSONDecodeError:
                logger.warning("Could not parse extraction response as JSON")
                return []
        else:
            return []

    if not isinstance(items, list):
        return []

    valid = []
    for item in items:
        if isinstance(item, dict) and "text" in item:
            text = str(item["text"]).strip()
            if len(text) < 20:
                continue
            valid.append({
                "text": text,
                "label": str(item.get("label", "")).strip()[:80] or f"Target {len(valid) + 1}",
            })
    return valid


async def extract_from_text(
    text: str,
    doc_type: str = "NDC",
    source_document: str = "NDC",
) -> list[dict[str, Any]]:
    """
    Extract policy targets from document text using a two-pass LLM approach.

    Returns a list of dicts with keys: text, label, sourceDocument.
    """
    chunks = chunk_text(text)
    expected = EXPECTED_COUNTS.get(source_document, "10-30")
    logger.info(f"Extracting from {len(chunks)} text chunks ({len(text)} chars total)")

    system = EXTRACT_SYSTEM.format(
        few_shot=FEW_SHOT_EXAMPLES,
        doc_type=doc_type,
        expected_count=expected,
    )

    # Pass 1: per-chunk extraction
    all_candidates: list[dict[str, Any]] = []
    for i, chunk in enumerate(chunks):
        if len(chunk.strip()) < 80:
            continue

        user_msg = EXTRACT_USER.format(doc_type=doc_type, text=chunk)
        raw = await call_llm(
            system=system,
            user=user_msg,
            cache_namespace="extract",
            max_tokens=4000,
        )
        items = _parse_json_array(raw)
        logger.info(f"  Chunk {i + 1}/{len(chunks)}: {len(items)} candidates")

        for item in items:
            item["sourceDocument"] = source_document
            all_candidates.append(item)

    logger.info(f"Pass 1 total: {len(all_candidates)} candidates")

    if len(all_candidates) == 0:
        return []

    # Pass 2: consolidation (skip if very few candidates)
    if len(all_candidates) <= 5:
        logger.info("Skipping consolidation (<=5 candidates)")
        return all_candidates

    candidates_json = json.dumps(
        [{"text": c["text"], "label": c["label"]} for c in all_candidates],
        indent=2,
        ensure_ascii=False,
    )

    consolidate_sys = CONSOLIDATE_SYSTEM.format(
        doc_type=doc_type,
        expected_count=expected,
    )
    consolidate_user = CONSOLIDATE_USER.format(
        count=len(all_candidates),
        doc_type=doc_type,
        candidates_json=candidates_json,
    )

    raw_consolidated = await call_llm(
        system=consolidate_sys,
        user=consolidate_user,
        cache_namespace="extract_consolidate",
        max_tokens=8000,
    )
    final = _parse_json_array(raw_consolidated)
    logger.info(f"Pass 2 consolidation: {len(all_candidates)} -> {len(final)} targets")

    for item in final:
        item["sourceDocument"] = source_document

    return final


async def extract_from_file(
    file_path: Path,
    doc_type: str = "NDC",
    source_document: str = "NDC",
) -> list[dict[str, Any]]:
    """Extract policy targets from a supported document file."""
    logger.info(f"Extracting text from {file_path.name}...")
    text = extract_text(file_path)
    if not text.strip():
        logger.warning(f"No text extracted from {file_path.name}")
        return []
    return await extract_from_text(text, doc_type, source_document)


async def main_async(args: argparse.Namespace) -> None:
    file_path = Path(args.file)
    if not file_path.exists():
        logger.error(f"File not found: {file_path}")
        return

    items = await extract_from_file(
        file_path,
        doc_type=args.doc_type,
        source_document=args.source_document,
    )

    if args.output:
        out = Path(args.output)
    else:
        out = file_path.with_suffix(".extracted.json")

    out.write_text(json.dumps(items, indent=2, ensure_ascii=False))
    logger.info(f"Saved {len(items)} targets to {out}")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="Extract policy targets from documents")
    parser.add_argument("--file", required=True, help="Path to PDF, DOCX, or text file")
    parser.add_argument("--doc-type", default="NDC", help="Document type label for the prompt")
    parser.add_argument(
        "--source-document", default="NDC",
        help="PolicyDocumentType value (NDC, NBSAP, NAP, LDN, SECTORAL, OTHER)",
    )
    parser.add_argument("--output", default=None, help="Output JSON file path")
    args = parser.parse_args()

    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
