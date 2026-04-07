"""
Document-to-target extraction.

Accepts a PDF, DOCX, or plain text file, extracts text, and uses the LLM to
identify high-level policy targets — the kind a human expert would pick out
for a cross-document coherence analysis.

Three-phase approach:
  0. (Optional) Relevance filter — discard chunks unlikely to contain targets.
  1. Per-chunk extraction of candidate targets (concurrent).
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
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .llm import call_llm, call_llm_batch, get_footprint_tracker

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_CHUNK_CHARS = int(os.getenv("CPC_MAX_CHUNK_CHARS", "30000"))
OVERLAP_CHARS = int(os.getenv("CPC_OVERLAP_CHARS", "2000"))
MIN_TARGET_LENGTH = int(os.getenv("CPC_MIN_TARGET_LENGTH", "10"))

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
- "Reduce Soil Organic Carbon loss by restoring 10% of heavily degraded rangelands within \
the forest-steppe (3%) and steppe (7%) ecological zones, moving land from Recovery Class IV \
(heavily degraded) to Recovery Class III (moderately degraded)."
- "Strengthen the health care system for early detection, warning, and response to climate \
change related threats to human health."
- "The agricultural sector will reduce 5.277 million tons of CO2 until 2030 and 9.78 million \
tons of CO2 until 2035 by adhering (national livestock herd to 50 million head) ecological \
carrying capacity of rangelands and improving livestock economic turnover through increasing \
export and meat supply to the domestic."

NBSAP examples:
- "Restore at least 30 percent of degraded ecosystems and improve ecological integrity and \
connectivity"
- "Ensure that each representative type of the main ecosystems is included and that 30% of \
the country's total land area is effectively conserved within the National Protected Area \
Network, while strengthening ecological connectivity across the landscape."
- "Redesign subsidies and incentives that negatively impact biodiversity to be environment \
and biodiversity-friendly."

NAP examples:
- "Minimize risks from climate change induced disasters and improve resilience"
- "Develop multi-hazard, impact-based early warning systems to enable quick and effective \
responses to extreme events."
- "Sustainably develop high-yield crops through climate-adapted technologies and soil \
conservation."

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
7. If the document explicitly labels targets (e.g. "Target 1", "Goal 2.3"), \
   use those exact names as the label — do not rephrase or replace them.
8. When possible, begin the target text with an action verb to phrase it as \
   an actionable goal.
9. Include all measurable details in the target text: percentages, quantities, \
   deadlines, years, baselines, or geographic scope.
10. Do not extract each itemized line as its own target unless it is \
    independently tracked or measured. Group related items under a single target.
11. If a table contains policy targets, extract from the full table context — \
    do not ignore targets just because they appear in tabular format.

Return a JSON array. Each object must have:
- "text": the policy target (verbatim or lightly cleaned)
- "label": a short descriptive label (max 8 words; use document-provided \
  names verbatim when available)

Output valid JSON only — no markdown fences, no explanation."""

EXTRACT_USER = """\
Extract the high-level policy targets from the following section of a {doc_type} document:

---
{text}
---

Return a JSON array of extracted targets."""

# ---------------------------------------------------------------------------
# Relevance filter prompt
# ---------------------------------------------------------------------------

RELEVANCE_FILTER_SYSTEM = """\
You are filtering a section of a policy document for a target extraction \
pipeline. Your task is to classify whether this section is likely to contain \
policy targets, goals, or commitments.

Sections that are NOT relevant (return false):
- Table of contents, lists of abbreviations, acknowledgments, forewords
- Administrative/procedural text (stakeholder lists, meeting schedules)
- Background/context with no policy commitments or goals
- Annexes with only reference data, indicators, or methodology descriptions
- Repeated headers/footers, formatting artifacts, cover pages

Sections that ARE relevant (return true):
- Chapters describing policy goals, targets, or commitments
- Sections with measurable objectives, timelines, or deadlines
- Strategy/action sections with specific interventions
- Tables listing targets, measures, or actions
- Sections referencing specific policies, laws, or frameworks with goals

When uncertain, return true — it is better to keep a section than miss a target.

Return ONLY a JSON object: {"relevant": true} or {"relevant": false}
No explanation, no markdown fences."""

RELEVANCE_FILTER_USER = """\
Classify whether the following section of a {doc_type} document is likely to \
contain policy targets:

---
{text}
---"""

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

Each candidate includes a "pageNumbers" array showing which pages it was \
found on. When merging candidates, combine their page numbers (union of all \
pages from merged items).

Return a JSON array. Each object must have:
- "text": the policy target
- "label": a short descriptive label (max 8 words)
- "pageNumbers": array of page numbers where this target appears

Output valid JSON only — no markdown fences, no explanation."""

CONSOLIDATE_USER = """\
Here are {count} candidate targets extracted from a {doc_type} document. \
Produce the final consolidated list.

{candidates_json}"""

# ---------------------------------------------------------------------------
# Multi-language extraction prompt addendum
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Activities extraction prompt (Phase 3)
# ---------------------------------------------------------------------------

ACTIVITIES_SYSTEM = """\
You are a policy analyst extracting implementation details for policy targets.

Given a policy target and the surrounding source text where it was found, \
extract any explicitly listed sub-activities, measures, or actions that fall \
under this target.

RULES:
1. Extract ONLY sub-items that are explicitly listed in the source text \
   (numbered lists, bullet points, or clearly delineated measures).
2. Do NOT invent, infer, or paraphrase activities that are not in the text.
3. If there are no explicit sub-activities, return an empty array: []
4. Each activity should be a concise one-line summary preserving key details.
5. Include numbering from the source document when present (e.g. "2.1", "a)").

Return a JSON object: {{"activities": ["activity 1", "activity 2", ...]}}
Output valid JSON only — no markdown fences, no explanation."""

ACTIVITIES_USER = """\
Target: {target_text}

Source text (from pages {pages}):
---
{context}
---

Extract any explicitly listed sub-activities, measures, or actions for this target."""

MULTILANG_ADDENDUM = """\

LANGUAGE NOTE: This document is written in {language_name} (not English).
- Extract "text" and "label" in the document's original language.
- Additionally provide:
  - "text_eng": English translation of the target text
  - "label_eng": English translation of the label
"""

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class PageSpan:
    """A span of text mapped to its source page number."""
    page: int
    text: str


@dataclass
class DocumentText:
    """Full document text with page-level provenance."""
    pages: list[PageSpan] = field(default_factory=list)

    @property
    def full_text(self) -> str:
        return "\n\n".join(p.text for p in self.pages)

    def pages_for_range(self, start: int, end: int) -> list[int]:
        """Return page numbers that overlap with the character range [start, end)."""
        result: list[int] = []
        offset = 0
        for page_span in self.pages:
            page_end = offset + len(page_span.text) + 2  # +2 for \n\n separator
            if offset < end and page_end > start:
                if page_span.page not in result:
                    result.append(page_span.page)
            offset = page_end
        return result


@dataclass
class Chunk:
    """A text chunk with provenance metadata."""
    text: str
    pages: list[int]


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------


def _table_to_text(table) -> str:
    """Convert a pymupdf table to pipe-delimited text."""
    try:
        rows = table.extract()
        if not rows:
            return ""
        lines = []
        for row in rows:
            cells = [str(c or "").strip().replace("\n", " ") for c in row]
            lines.append(" | ".join(cells))
        return "\n".join(lines)
    except Exception:
        return ""


def _extract_text_pdf(path: Path) -> list[PageSpan]:
    """Extract text from PDF with page-level tracking and table support."""
    try:
        import pymupdf
    except ImportError:
        import fitz as pymupdf  # type: ignore[no-redef]

    doc = pymupdf.open(str(path))
    result: list[PageSpan] = []

    for i, page in enumerate(doc):
        page_num = i + 1
        text = page.get_text("text") or ""

        # Extract tables and append as structured text
        try:
            tables = page.find_tables()
            for table in tables:
                table_text = _table_to_text(table)
                if table_text:
                    text += f"\n\n[TABLE]\n{table_text}\n"
        except Exception:
            pass  # fall back to text-only if table extraction fails

        if text.strip():
            result.append(PageSpan(page=page_num, text=text.strip()))

    doc.close()
    return result


def _docx_table_to_text(table) -> str:
    """Convert a python-docx table to pipe-delimited text."""
    lines = []
    for row in table.rows:
        cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
        lines.append(" | ".join(cells))
    return "\n".join(lines)


def _extract_text_docx(path: Path) -> list[PageSpan]:
    """Extract text from DOCX with table support.

    DOCX does not have reliable page boundaries, so we return a single
    PageSpan with page=0 (unknown).
    """
    from docx import Document

    doc = Document(str(path))
    parts: list[str] = []

    for element in doc.element.body:
        tag = element.tag.split("}")[-1] if "}" in element.tag else element.tag
        if tag == "p":
            # Paragraph
            text = element.text or ""
            # python-docx element.text only gets direct text; use the paragraph API
            for para in doc.paragraphs:
                if para._element is element:
                    text = para.text
                    break
            if text.strip():
                parts.append(text.strip())
        elif tag == "tbl":
            # Table
            for table in doc.tables:
                if table._element is element:
                    table_text = _docx_table_to_text(table)
                    if table_text:
                        parts.append(f"[TABLE]\n{table_text}")
                    break

    full_text = "\n\n".join(parts)
    if not full_text.strip():
        # Fallback: just paragraphs
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        full_text = "\n\n".join(paragraphs)

    return [PageSpan(page=0, text=full_text)] if full_text.strip() else []


def extract_text(path: Path) -> DocumentText:
    """Extract text from a PDF, DOCX, or plain-text file with provenance."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        pages = _extract_text_pdf(path)
    elif suffix == ".docx":
        pages = _extract_text_docx(path)
    else:
        text = path.read_text(encoding="utf-8", errors="replace")
        pages = [PageSpan(page=0, text=text)] if text.strip() else []

    return DocumentText(pages=pages)


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------


def chunk_text(
    doc: DocumentText,
    max_chars: int = MAX_CHUNK_CHARS,
    overlap_chars: int = OVERLAP_CHARS,
) -> list[Chunk]:
    """Split document text into chunks with overlap, tracking source pages."""
    full_text = doc.full_text
    paragraphs = re.split(r"\n{2,}", full_text)
    chunks: list[Chunk] = []
    current = ""
    current_start = 0
    char_offset = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if len(current) + len(para) + 2 > max_chars and current:
            # Save this chunk
            current_end = char_offset
            pages = doc.pages_for_range(current_start, current_end)
            chunks.append(Chunk(text=current, pages=pages))

            # Overlap: keep the tail of the current chunk
            if overlap_chars > 0 and len(current) > overlap_chars:
                overlap_text = current[-overlap_chars:]
                current_start = current_end - overlap_chars
                current = overlap_text + "\n\n" + para
            else:
                current_start = char_offset
                current = para
        else:
            current = f"{current}\n\n{para}" if current else para

        char_offset += len(para) + 2  # +2 for \n\n separator

    if current.strip():
        pages = doc.pages_for_range(current_start, char_offset)
        chunks.append(Chunk(text=current, pages=pages))

    return chunks


# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------


def detect_language(text: str) -> tuple[str, str]:
    """Detect language of text. Returns (iso_code, language_name).

    Uses lingua-language-detector if available, falls back to langdetect,
    and ultimately defaults to English.
    """
    sample = text[:5000]  # Only need a sample for detection

    try:
        from lingua import Language, LanguageDetectorBuilder
        detector = LanguageDetectorBuilder.from_all_languages().build()
        detected = detector.detect_language_of(sample)
        if detected and detected != Language.ENGLISH:
            return detected.iso_code_639_1.name.lower(), detected.name.title()
        return "en", "English"
    except ImportError:
        pass

    try:
        from langdetect import detect
        code = detect(sample)
        if code and code != "en":
            # langdetect returns ISO 639-1 codes
            return code, code.upper()
        return "en", "English"
    except ImportError:
        pass

    return "en", "English"


# ---------------------------------------------------------------------------
# JSON parsing
# ---------------------------------------------------------------------------


def _parse_json_array(
    raw: str,
    min_length: int = MIN_TARGET_LENGTH,
) -> list[dict[str, Any]]:
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
            if len(text) < min_length:
                logger.debug(f"Skipping short target ({len(text)} chars): {text[:50]}")
                continue
            if min_length < 20 <= len(text):
                pass  # normal
            elif len(text) < 20:
                logger.info(f"Keeping short target ({len(text)} chars): {text[:50]}")

            entry: dict[str, Any] = {
                "text": text,
                "label": str(item.get("label", "")).strip()[:80]
                    or f"Target {len(valid) + 1}",
            }

            # Preserve page numbers if present
            if "pageNumbers" in item and isinstance(item["pageNumbers"], list):
                entry["pageNumbers"] = item["pageNumbers"]

            # Preserve translation fields if present
            for tfield in ("text_eng", "label_eng"):
                if tfield in item and item[tfield]:
                    entry[tfield] = str(item[tfield]).strip()

            valid.append(entry)
    return valid


def _parse_relevance(raw: str) -> bool:
    """Parse relevance filter response. Defaults to True (conservative)."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data.get("relevant", True)
    except json.JSONDecodeError:
        pass
    # Default to relevant when uncertain
    return True


# ---------------------------------------------------------------------------
# Phase 3: Activities extraction
# ---------------------------------------------------------------------------


async def _extract_activities(
    targets: list[dict[str, Any]],
    doc: DocumentText,
    chunks: list[Chunk],
    is_english: bool,
    lang_name: str,
) -> list[dict[str, Any]]:
    """For each target, extract sub-activities from the surrounding source text."""
    # Build a lookup from page number to chunk text for context retrieval
    page_to_chunks: dict[int, list[str]] = {}
    for chunk in chunks:
        for page in chunk.pages:
            page_to_chunks.setdefault(page, []).append(chunk.text)

    activity_calls = []
    for target in targets:
        pages = target.get("pageNumbers", [])
        # Gather context from chunks that cover this target's pages
        context_parts: list[str] = []
        seen: set[int] = set()
        for page in pages:
            for chunk_text in page_to_chunks.get(page, []):
                h = hash(chunk_text)
                if h not in seen:
                    seen.add(h)
                    context_parts.append(chunk_text)

        context = "\n\n---\n\n".join(context_parts)
        if len(context) > 12000:
            context = context[:12000].rsplit("\n\n", 1)[0]  # truncate at paragraph boundary
        pages_str = ", ".join(str(p) for p in pages) if pages else "unknown"

        system = ACTIVITIES_SYSTEM
        if not is_english:
            system += f"\n\nThe source text is in {lang_name}. Return activities in English."

        activity_calls.append({
            "system": system,
            "user": ACTIVITIES_USER.format(
                target_text=target.get("text_eng", target["text"]),
                pages=pages_str,
                context=context,
            ),
            "max_tokens": 2000,
        })

    raw_results = await call_llm_batch(
        activity_calls,
        cache_namespace="extract_activities",
        desc="Activities extraction",
    )

    for target, raw in zip(targets, raw_results):
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        try:
            data = json.loads(raw)
            activities = data.get("activities", [])
            if isinstance(activities, list) and activities:
                target["activities"] = "\n".join(
                    str(a).strip() for a in activities if str(a).strip()
                )
                logger.info(
                    f"  '{target['label']}': {len(activities)} activities extracted"
                )
        except (json.JSONDecodeError, AttributeError):
            pass  # No activities — that's fine

    return targets


# ---------------------------------------------------------------------------
# Main extraction pipeline
# ---------------------------------------------------------------------------


async def extract_from_text(
    text: str | DocumentText,
    doc_type: str = "NDC",
    source_document: str = "NDC",
    *,
    min_length: int = MIN_TARGET_LENGTH,
    max_chunk_chars: int = MAX_CHUNK_CHARS,
    overlap_chars: int = OVERLAP_CHARS,
    skip_relevance_filter: bool = False,
    language: str | None = None,
) -> list[dict[str, Any]]:
    """
    Extract policy targets from document text using a multi-phase LLM approach.

    Returns a list of dicts with keys: text, label, sourceDocument, pageNumbers.
    """
    # Normalize input
    if isinstance(text, str):
        doc = DocumentText(pages=[PageSpan(page=0, text=text)])
    else:
        doc = text

    full_text = doc.full_text
    if not full_text.strip():
        return []

    # Language detection
    lang_code = language or "en"
    lang_name = "English"
    if not language:
        lang_code, lang_name = detect_language(full_text)

    is_english = lang_code == "en"

    # Chunking
    chunks = chunk_text(doc, max_chars=max_chunk_chars, overlap_chars=overlap_chars)
    expected = EXPECTED_COUNTS.get(source_document, "10-30")
    logger.info(
        f"Extracting from {len(chunks)} chunks ({len(full_text)} chars, "
        f"language={lang_code})"
    )

    # Phase 0: Relevance filter (concurrent)
    if not skip_relevance_filter and len(chunks) > 1:
        filterable = [c for c in chunks if len(c.text.strip()) >= 80]
        if filterable:
            filter_calls = [
                {
                    "system": RELEVANCE_FILTER_SYSTEM,
                    "user": RELEVANCE_FILTER_USER.format(
                        doc_type=doc_type,
                        text=chunk.text[:8000],  # limit filter input size
                    ),
                    "max_tokens": 50,
                }
                for chunk in filterable
            ]
            filter_results = await call_llm_batch(
                filter_calls,
                cache_namespace="relevance_filter",
                desc="Relevance filter",
            )
            relevant_chunks = []
            for chunk, raw in zip(filterable, filter_results):
                if _parse_relevance(raw):
                    relevant_chunks.append(chunk)
                else:
                    logger.info(
                        f"  Filtered out chunk (pages {chunk.pages}): irrelevant"
                    )

            # Add back any very short chunks that were skipped
            short_chunks = [c for c in chunks if len(c.text.strip()) < 80]
            chunks = relevant_chunks + short_chunks
            logger.info(
                f"Relevance filter: {len(filterable)} -> {len(relevant_chunks)} "
                f"relevant chunks"
            )
    else:
        logger.info("Skipping relevance filter")

    # Filter out very short chunks
    chunks = [c for c in chunks if len(c.text.strip()) >= 80]
    if not chunks:
        return []

    # Build system prompt with optional language addendum
    system = EXTRACT_SYSTEM.format(
        few_shot=FEW_SHOT_EXAMPLES,
        doc_type=doc_type,
        expected_count=expected,
    )
    if not is_english:
        system += MULTILANG_ADDENDUM.format(language_name=lang_name)

    # Phase 1: Per-chunk extraction (concurrent)
    extract_calls = [
        {
            "system": system,
            "user": EXTRACT_USER.format(doc_type=doc_type, text=chunk.text),
            "max_tokens": 4000,
        }
        for chunk in chunks
    ]
    raw_results = await call_llm_batch(
        extract_calls,
        cache_namespace="extract",
        desc="Target extraction",
    )

    all_candidates: list[dict[str, Any]] = []
    for chunk, raw in zip(chunks, raw_results):
        items = _parse_json_array(raw, min_length=min_length)
        logger.info(f"  Chunk (pages {chunk.pages}): {len(items)} candidates")

        for item in items:
            item["sourceDocument"] = source_document
            item["pageNumbers"] = chunk.pages
            if not is_english:
                item["language"] = lang_code
            all_candidates.append(item)

    logger.info(f"Phase 1 total: {len(all_candidates)} candidates")

    if len(all_candidates) == 0:
        return []

    # Phase 2: Consolidation (skip if very few candidates)
    if len(all_candidates) <= 5:
        logger.info("Skipping consolidation (<=5 candidates)")
        return all_candidates

    candidates_json = json.dumps(
        [
            {
                "text": c["text"],
                "label": c["label"],
                "pageNumbers": c.get("pageNumbers", []),
            }
            for c in all_candidates
        ],
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
    final = _parse_json_array(raw_consolidated, min_length=min_length)
    logger.info(
        f"Phase 2 consolidation: {len(all_candidates)} -> {len(final)} targets"
    )

    for item in final:
        item["sourceDocument"] = source_document
        if not is_english:
            item["language"] = lang_code
        # Ensure pageNumbers survive consolidation
        if "pageNumbers" not in item:
            # Fallback: collect all pages from candidates
            item["pageNumbers"] = sorted(
                set(p for c in all_candidates for p in c.get("pageNumbers", []))
            )

    # Phase 3: Extract activities/sub-measures for each target
    if final:
        final = await _extract_activities(final, doc, chunks, is_english, lang_name)

    return final


async def extract_from_file(
    file_path: Path,
    doc_type: str = "NDC",
    source_document: str = "NDC",
    *,
    min_length: int = MIN_TARGET_LENGTH,
    max_chunk_chars: int = MAX_CHUNK_CHARS,
    overlap_chars: int = OVERLAP_CHARS,
    skip_relevance_filter: bool = False,
    language: str | None = None,
) -> list[dict[str, Any]]:
    """Extract policy targets from a supported document file."""
    logger.info(f"Extracting text from {file_path.name}...")
    doc_text = extract_text(file_path)
    if not doc_text.full_text.strip():
        logger.warning(f"No text extracted from {file_path.name}")
        return []
    return await extract_from_text(
        doc_text,
        doc_type,
        source_document,
        min_length=min_length,
        max_chunk_chars=max_chunk_chars,
        overlap_chars=overlap_chars,
        skip_relevance_filter=skip_relevance_filter,
        language=language,
    )


async def main_async(args: argparse.Namespace) -> None:
    file_path = Path(args.file)
    if not file_path.exists():
        logger.error(f"File not found: {file_path}")
        return

    items = await extract_from_file(
        file_path,
        doc_type=args.doc_type,
        source_document=args.source_document,
        min_length=args.min_length,
        max_chunk_chars=args.max_chunk_chars,
        overlap_chars=args.overlap_chars,
        skip_relevance_filter=args.skip_relevance_filter,
        language=args.language,
    )

    if args.output:
        out = Path(args.output)
    else:
        out = file_path.with_suffix(".extracted.json")

    out.write_text(json.dumps(items, indent=2, ensure_ascii=False))
    logger.info(f"Saved {len(items)} targets to {out}")

    # Persist environmental footprint of the extraction run next to the output
    # so the API route can return it and the total can be threaded into the
    # final analysis.
    footprint = get_footprint_tracker().snapshot()
    footprint_path = out.with_suffix(out.suffix + ".footprint.json")
    footprint_path.write_text(json.dumps(footprint, indent=2))
    if footprint.get("available"):
        logger.info(
            f"Extraction footprint: {footprint['energy_wh']:.4f} Wh, "
            f"{footprint['co2_geq']:.4f} gCO2eq "
            f"({footprint['tracked_call_count']} tracked, "
            f"{footprint['cached_call_count']} cached)"
        )


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s"
    )

    parser = argparse.ArgumentParser(
        description="Extract policy targets from documents"
    )
    parser.add_argument(
        "--file", required=True, help="Path to PDF, DOCX, or text file"
    )
    parser.add_argument(
        "--doc-type", default="NDC", help="Document type label for the prompt"
    )
    parser.add_argument(
        "--source-document",
        default="NDC",
        help="PolicyDocumentType value (NDC, NBSAP, NAP, LDN, SECTORAL, OTHER)",
    )
    parser.add_argument("--output", default=None, help="Output JSON file path")
    parser.add_argument(
        "--min-length",
        type=int,
        default=MIN_TARGET_LENGTH,
        help=f"Minimum target text length (default: {MIN_TARGET_LENGTH})",
    )
    parser.add_argument(
        "--max-chunk-chars",
        type=int,
        default=MAX_CHUNK_CHARS,
        help=f"Maximum characters per chunk (default: {MAX_CHUNK_CHARS})",
    )
    parser.add_argument(
        "--overlap-chars",
        type=int,
        default=OVERLAP_CHARS,
        help=f"Overlap characters between chunks (default: {OVERLAP_CHARS})",
    )
    parser.add_argument(
        "--skip-relevance-filter",
        action="store_true",
        help="Skip the relevance filter pre-processing step",
    )
    parser.add_argument(
        "--language",
        default=None,
        help="ISO 639-1 language code (e.g. 'mn' for Mongolian). "
        "Auto-detected if not provided.",
    )
    args = parser.parse_args()

    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
