"""Tests for document parsing, scanned-PDF detection, dedup, and the
consolidation-safety parsing added after the baseline eval.

The baseline run surfaced the load-bearing failure mode these guard: a
truncated consolidation response used to parse to [] and silently discard
every Phase-1 candidate (PNSH: 79 -> 0).
"""

from __future__ import annotations

import pytest

from src.extract import (
    PageSpan,
    _expected_count,
    _extract_text_docx,
    _extract_text_pdf,
    _parse_json_array_status,
    dedupe_candidates,
    pdf_text_layer_stats,
)


# ---------------------------------------------------------------------------
# Fixtures: synthetic documents built in-test
# ---------------------------------------------------------------------------


def _make_pdf(path, page_texts):
    """Build a PDF with one page per entry; None/"" = image-only (blank) page."""
    pymupdf = pytest.importorskip("pymupdf")
    doc = pymupdf.open()
    for text in page_texts:
        page = doc.new_page()
        if text:
            page.insert_text((72, 72), text, fontsize=11)
    doc.save(str(path))
    doc.close()
    return path


def _make_docx(path):
    docx = pytest.importorskip("docx")
    doc = docx.Document()
    doc.add_heading("Chapter 1 Water policy", level=1)
    doc.add_paragraph("Increase reservoir capacity to secure supply.")
    doc.add_paragraph("Expand irrigation coverage in drought-prone regions.")
    doc.add_heading("Chapter 2 Forests", level=1)
    doc.add_paragraph("Increase forest area to 9% by 2030.")
    table = doc.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Measure"
    table.cell(0, 1).text = "Deadline"
    table.cell(1, 0).text = "Reforestation"
    table.cell(1, 1).text = "2030"
    doc.save(str(path))
    return path


# ---------------------------------------------------------------------------
# Scanned-PDF detection
# ---------------------------------------------------------------------------


class TestPdfTextLayerStats:
    def test_fully_blank_pdf(self, tmp_path):
        pdf = _make_pdf(tmp_path / "scan.pdf", [None, None, None])
        stats = pdf_text_layer_stats(pdf)
        assert stats["pages"] == 3
        assert stats["emptyPages"] == 3
        assert stats["emptyRatio"] == 1.0
        assert stats["totalChars"] == 0

    def test_partial_text_layer(self, tmp_path):
        long_text = "A policy commitment to expand protected areas. " * 4
        pdf = _make_pdf(tmp_path / "partial.pdf", [long_text, None, long_text, None, None])
        stats = pdf_text_layer_stats(pdf)
        assert stats["pages"] == 5
        assert stats["emptyPages"] == 3
        assert stats["emptyRatio"] == 0.6

    def test_short_scraps_count_as_empty(self, tmp_path):
        # A page with only a few characters (page number artifacts) is empty.
        pdf = _make_pdf(tmp_path / "scraps.pdf", ["17"])
        stats = pdf_text_layer_stats(pdf)
        assert stats["emptyPages"] == 1

    def test_extract_skips_blank_pages_with_correct_numbering(self, tmp_path):
        long_text = "Extractable policy text for the parser to find here. " * 3
        pdf = _make_pdf(tmp_path / "mixed.pdf", [None, long_text])
        spans = _extract_text_pdf(pdf)
        assert len(spans) == 1
        assert spans[0].page == 2  # 1-indexed, blank page skipped


# ---------------------------------------------------------------------------
# DOCX parsing
# ---------------------------------------------------------------------------


class TestDocxParsing:
    def test_headings_create_sections(self, tmp_path):
        docx_path = _make_docx(tmp_path / "doc.docx")
        spans = _extract_text_docx(docx_path)
        assert len(spans) == 2  # one span per Heading-delimited section
        assert spans[0].text.startswith("## Chapter 1 Water policy")
        assert "Increase reservoir capacity" in spans[0].text
        assert spans[1].text.startswith("## Chapter 2 Forests")
        assert all(s.page == 0 for s in spans)

    def test_tables_preserved(self, tmp_path):
        docx_path = _make_docx(tmp_path / "doc.docx")
        spans = _extract_text_docx(docx_path)
        combined = "\n\n".join(s.text for s in spans)
        assert "[TABLE]" in combined
        assert "Reforestation | 2030" in combined

    def test_large_docx_parses_completely(self, tmp_path):
        docx = pytest.importorskip("docx")
        doc = docx.Document()
        for i in range(500):
            doc.add_paragraph(f"Paragraph number {i} with policy content.")
        path = tmp_path / "large.docx"
        doc.save(str(path))
        spans = _extract_text_docx(path)
        combined = "\n\n".join(s.text for s in spans)
        assert "Paragraph number 0 " in combined
        assert "Paragraph number 499 " in combined


# ---------------------------------------------------------------------------
# Deterministic dedup
# ---------------------------------------------------------------------------


def _cand(text, pages, source, label="L"):
    return {
        "text": text,
        "label": label,
        "pageNumbers": pages,
        "sources": [{"sourceText": source}],
        "textCleanup": "verbatim",
    }


class TestDedupeCandidates:
    def test_exact_duplicates_merge_with_unions(self):
        a = _cand("Increase forest area to 9% by 2030", [3], "quote A")
        b = _cand("Increase forest area to 9% by 2030", [3, 4], "quote B")
        out = dedupe_candidates([a, b])
        assert len(out) == 1
        assert out[0]["pageNumbers"] == [3, 4]
        assert {s["sourceText"] for s in out[0]["sources"]} == {"quote A", "quote B"}

    def test_near_duplicate_keeps_longer_text(self):
        short = _cand(
            "Increase forest area to 9% by 2030 through reforestation", [3], "q1"
        )
        long = _cand(
            "Increase forest area to 9% by 2030 through reforestation activities "
            "and rehabilitate degraded forest areas across the country",
            [4],
            "q2",
        )
        out = dedupe_candidates([short, long])
        assert len(out) == 1
        assert out[0]["text"] == long["text"]
        assert out[0]["pageNumbers"] == [3, 4]

    def test_distinct_candidates_survive(self):
        a = _cand("Increase forest area to 9% by 2030", [1], "q1")
        b = _cand("Reduce bare fallow to 30% and rotate crops", [2], "q2")
        c = _cand("Strengthen early warning systems for disasters", [3], "q3")
        out = dedupe_candidates([a, b, c])
        assert len(out) == 3

    def test_identical_source_entries_not_duplicated(self):
        a = _cand("Same target text repeated", [1], "the quote")
        b = _cand("Same target text repeated", [1], "the quote")
        out = dedupe_candidates([a, b])
        assert len(out) == 1
        assert len(out[0]["sources"]) == 1


# ---------------------------------------------------------------------------
# Consolidation-safety parsing
# ---------------------------------------------------------------------------


class TestParseJsonArrayStatus:
    def test_valid_array(self):
        items, ok = _parse_json_array_status('[{"text": "A long enough target"}]')
        assert ok is True
        assert len(items) == 1

    def test_legit_empty_array_is_ok(self):
        items, ok = _parse_json_array_status("[]")
        assert ok is True
        assert items == []

    def test_truncated_json_is_failure(self):
        truncated = '[{"text": "A long enough target"}, {"text": "cut off he'
        items, ok = _parse_json_array_status(truncated)
        assert ok is False
        assert items == []

    def test_empty_response_is_failure(self):
        # Content-filtered calls return "" — never a trustworthy "no targets".
        items, ok = _parse_json_array_status("")
        assert ok is False

    def test_fenced_json_ok(self):
        items, ok = _parse_json_array_status('```json\n[{"text": "A long enough target"}]\n```')
        assert ok is True
        assert len(items) == 1


# ---------------------------------------------------------------------------
# Expected-count lookup
# ---------------------------------------------------------------------------


class TestExpectedCount:
    def test_source_document_is_primary_key(self):
        assert _expected_count("NDC", "some free-form label") == "15-30"

    def test_doc_type_fallback(self):
        assert _expected_count("PNSH", "LDN") == "5-15"

    def test_default(self):
        assert _expected_count("PNSH", "water security plan") == "10-30"

    def test_case_insensitive(self):
        assert _expected_count("ndc", "x") == "15-30"