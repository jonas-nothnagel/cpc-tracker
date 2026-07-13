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
    _relevance_sample,
    _restore_original_text,
    dedupe_candidates,
    pdf_text_layer_stats,
    validate_claim_grounding,
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

    def test_localized_heading_style_names_still_split(self, tmp_path):
        # Word localizes style display names ("Título 1") but style_id
        # ("Heading1") is invariant; section splitting must survive both.
        docx = pytest.importorskip("docx")
        doc = docx.Document()
        doc.add_heading("Capítulo 1 Política hídrica", level=1)
        doc.add_paragraph("Aumentar la capacidad de los embalses.")
        doc.add_heading("Capítulo 2 Bosques", level=1)
        doc.add_paragraph("Aumentar la superficie forestal al 9%.")
        # Rename AFTER applying, as a localized Word build would present it;
        # the style_id stays "Heading1".
        doc.styles["Heading 1"].name = "Título 1"
        path = tmp_path / "localized.docx"
        doc.save(str(path))
        spans = _extract_text_docx(path)
        assert len(spans) == 2
        assert spans[0].text.startswith("## Capítulo 1")

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
        items, ok, truncated = _parse_json_array_status('[{"text": "A long enough target"}]')
        assert ok is True
        assert truncated is False
        assert len(items) == 1

    def test_legit_empty_array_is_ok(self):
        items, ok, truncated = _parse_json_array_status("[]")
        assert ok is True
        assert truncated is False
        assert items == []

    def test_truncated_json_is_failure(self):
        truncated_raw = '[{"text": "A long enough target"}, {"text": "cut off he'
        items, ok, truncated = _parse_json_array_status(truncated_raw)
        assert ok is False
        assert truncated is False
        assert items == []

    def test_truncated_json_salvage_recovers_leading_items(self):
        # With salvage enabled (Phase-1 extraction), the complete leading
        # objects of a ceiling-truncated response are recovered and the
        # truncation is reported so the sidecar can warn about lost tails.
        truncated_raw = '[{"text": "A long enough target"}, {"text": "cut off he'
        items, ok, truncated = _parse_json_array_status(
            truncated_raw, salvage_truncated=True
        )
        assert ok is True
        assert truncated is True
        assert len(items) == 1

    def test_empty_response_is_failure(self):
        # Content-filtered calls return "" — never a trustworthy "no targets".
        items, ok, truncated = _parse_json_array_status("")
        assert ok is False
        assert truncated is False

    def test_fenced_json_ok(self):
        items, ok, truncated = _parse_json_array_status('```json\n[{"text": "A long enough target"}]\n```')
        assert ok is True
        assert len(items) == 1


class TestQuoteContextWindows:
    def _chunks(self):
        from src.extract import Chunk
        summary = "Front matter and summary list. Improve irrigation efficiency. " + "x " * 200
        detail = (
            "Section 4. Improve irrigation efficiency.\n"
            "4.1. Rehabilitate canal networks.\n4.2. Promote drip irrigation.\n" + "y " * 3000
        )
        return [Chunk(text=summary, pages=[1]), Chunk(text=detail, pages=[9])]

    def test_window_per_quote_occurrence_includes_detail_section(self):
        from src.extract import _quote_context_windows
        from src.extract_validation import normalise_for_matching
        chunks = self._chunks()
        norm_chunks = [(c, normalise_for_matching(c.text)) for c in chunks]
        target = {
            "text": "Improve irrigation efficiency",
            "sources": [
                {"sourceText": "Improve irrigation efficiency."},          # summary hit (chunk 0)
                {"sourceText": "Section 4. Improve irrigation efficiency."},  # detail hit (chunk 1)
            ],
        }
        windows = _quote_context_windows(target, norm_chunks)
        joined = "\n".join(windows)
        assert "4.1. Rehabilitate canal networks" in joined  # detail actions reached
        assert len(windows) == 2

    def test_unlocatable_quote_yields_no_windows(self):
        from src.extract import _quote_context_windows
        from src.extract_validation import normalise_for_matching
        chunks = self._chunks()
        norm_chunks = [(c, normalise_for_matching(c.text)) for c in chunks]
        target = {"text": "z", "sources": [{"sourceText": "not present anywhere at all"}]}
        assert _quote_context_windows(target, norm_chunks) == []


class TestLanguageMajority:
    def test_majority_wins(self):
        from src.extract import _majority_language
        code, name, agreed = _majority_language(
            [("si", "Sinhala"), ("en", "English"), ("en", "English")]
        )
        assert (code, agreed) == ("en", False)
        assert name == "English"

    def test_unanimous(self):
        from src.extract import _majority_language
        code, _, agreed = _majority_language([("es", "Spanish")] * 3)
        assert (code, agreed) == ("es", True)

    def test_full_disagreement_falls_back_to_head(self):
        from src.extract import _majority_language
        code, _, agreed = _majority_language(
            [("tn", "Tswana"), ("ta", "Tamil"), ("en", "English")]
        )
        assert (code, agreed) == ("tn", False)

    def test_samples_cover_three_positions(self):
        from src.extract import _language_samples
        text = "A" * 6000 + "B" * 6000 + "C" * 6000
        samples = _language_samples(text, 5000)
        assert len(samples) == 3
        assert samples[0][0] == "A" and samples[1][2500] == "B" and samples[2][-1] == "C"
        assert _language_samples("short", 5000) == ["short"]


class TestActivityContext:
    def test_small_document_gets_whole_text(self):
        from src.extract import DocumentText, PageSpan, _activity_context
        doc = DocumentText(pages=[
            PageSpan(page=1, text="Objectives: 1. Increase aquaculture production."),
            PageSpan(page=5, text="4.2 Aquaculture actions\n4.2.14. Develop fisheries in inland waters."),
        ])
        target = {"text": "Increase aquaculture production", "pageNumbers": [1],
                  "sources": [{"sourceText": "Increase aquaculture production."}]}
        ctx = _activity_context(target, doc, [], {})
        assert "4.2.14. Develop fisheries in inland waters" in ctx  # far section included

    def test_large_document_uses_windows(self, monkeypatch):
        from src import extract as ex
        from src.extract import Chunk, DocumentText, PageSpan, _activity_context
        from src.extract_validation import normalise_for_matching
        monkeypatch.setattr(ex, "ACTIVITY_FULLDOC_CHARS", 100)
        big = "filler " * 2000 + "The quoted target sentence here." + " trailer " * 2000
        doc = DocumentText(pages=[PageSpan(page=1, text=big)])
        chunks = [Chunk(text=big, pages=[1])]
        norm_chunks = [(c, normalise_for_matching(c.text)) for c in chunks]
        target = {"text": "t", "pageNumbers": [1],
                  "sources": [{"sourceText": "The quoted target sentence here."}]}
        ctx = _activity_context(target, doc, norm_chunks, {1: [big]})
        assert "The quoted target sentence here." in ctx
        assert len(ctx) < len(big)  # windowed, not the whole document


class TestRelevanceSample:
    def test_short_chunk_passes_through(self):
        assert _relevance_sample("short text", 8000) == "short text"

    def test_long_chunk_samples_head_middle_tail(self):
        # A goals list buried mid-chunk behind boilerplate must reach the
        # filter (the Sri Lanka NAP failure mode: goals on page 4 behind
        # three pages of front matter, whole chunk dropped).
        head_boiler = "c" * 8000
        goals = " GOALS: double resource productivity by 2030 "
        tail_boiler = "b" * 8000
        text = head_boiler + goals + tail_boiler
        sample = _relevance_sample(text, 2000)
        assert len(sample) < 2200
        assert sample.startswith("c")
        assert "resource productivity" in sample
        assert sample.rstrip().endswith("b")


# ---------------------------------------------------------------------------
# English-first multilingual schema
# ---------------------------------------------------------------------------


class TestEnglishFirstParsing:
    def test_new_schema_passthrough(self):
        raw = (
            '[{"text": "Restore 1,500 hectares of forest by 2030", '
            '"label": "Objective 3.2", '
            '"textOriginal": "Restaurar 1.500 hectáreas de bosque para 2030", '
            '"labelOriginal": "Objetivo 3.2", '
            '"sources": [{"sourceText": "Restaurar 1.500 hectáreas de bosque para 2030"}]}]'
        )
        items, ok, _truncated = _parse_json_array_status(raw)
        assert ok
        item = items[0]
        assert item["text"].startswith("Restore")
        assert item["textOriginal"].startswith("Restaurar")
        assert item["labelOriginal"] == "Objetivo 3.2"
        # textCleanup default compares the ORIGINAL against the source
        assert item["textCleanup"] == "verbatim"

    def test_legacy_text_eng_schema_inverts(self):
        raw = (
            '[{"text": "Restaurar 1.500 hectáreas de bosque", '
            '"label": "Objetivo 3.2", '
            '"text_eng": "Restore 1,500 hectares of forest", '
            '"label_eng": "Objective 3.2"}]'
        )
        items, ok, _truncated = _parse_json_array_status(raw)
        assert ok
        item = items[0]
        assert item["text"] == "Restore 1,500 hectares of forest"
        assert item["label"] == "Objective 3.2"
        assert item["textOriginal"] == "Restaurar 1.500 hectáreas de bosque"
        assert item["labelOriginal"] == "Objetivo 3.2"


class TestCrossLanguageClaimGrounding:
    def test_translated_units_ground_via_numeric_fallback(self):
        target = {
            "text": "Restore 1,500 hectares of degraded forest by 2030",
            "textOriginal": "Restaurar 1.500 hectáreas de bosque degradado para 2030",
            "sources": [
                {"sourceText": "Restaurar 1.500 hectáreas de bosque degradado para 2030"}
            ],
        }
        assert validate_claim_grounding(target) == []

    def test_fabricated_number_still_flags(self):
        target = {
            "text": "Restore 9,999 hectares of degraded forest by 2030",
            "sources": [
                {"sourceText": "Restaurar 1.500 hectáreas de bosque degradado para 2030"}
            ],
        }
        missing = validate_claim_grounding(target)
        assert any("9999" in c for c in missing)

    def test_fabricated_number_in_original_flags(self):
        target = {
            "text": "Restore forest areas",
            "textOriginal": "Restaurar 7.777 hectáreas de bosque",
            "sources": [{"sourceText": "Restaurar zonas de bosque"}],
        }
        missing = validate_claim_grounding(target)
        assert any("7777" in c for c in missing)


class TestRestoreOriginalText:
    CAND = {
        "text": "Restore 1,500 hectares of forest",
        "textOriginal": "Restaurar 1.500 hectáreas de bosque",
        "labelOriginal": "Objetivo 3.2",
        "sources": [{"sourceText": "Restaurar 1.500 hectáreas de bosque para 2030"}],
    }

    def test_restores_from_unique_candidate(self):
        item = {
            "text": "Restore 1,500 hectares of forest",
            "textCleanup": "verbatim",
            "sources": [{"sourceText": "Restaurar 1.500 hectáreas de bosque para 2030"}],
        }
        _restore_original_text([item], [dict(self.CAND)])
        assert item["textOriginal"] == self.CAND["textOriginal"]
        assert item["labelOriginal"] == "Objetivo 3.2"

    def test_synthesis_items_not_restored(self):
        item = {
            "text": "Merged synthesis",
            "textCleanup": "synthesis",
            "sources": [{"sourceText": "Restaurar 1.500 hectáreas de bosque para 2030"}],
        }
        _restore_original_text([item], [dict(self.CAND)])
        assert "textOriginal" not in item

    def test_ambiguous_quote_not_restored(self):
        cand2 = dict(self.CAND, textOriginal="Otra meta distinta")
        item = {
            "text": "x" * 20,
            "textCleanup": "cleaned",
            "sources": [{"sourceText": "Restaurar 1.500 hectáreas de bosque para 2030"}],
        }
        _restore_original_text([item], [dict(self.CAND), cand2])
        assert "textOriginal" not in item

    def test_model_provided_original_untouched(self):
        item = {
            "text": "Restore forests",
            "textOriginal": "Model kept this",
            "sources": [{"sourceText": "Restaurar 1.500 hectáreas de bosque para 2030"}],
        }
        _restore_original_text([item], [dict(self.CAND)])
        assert item["textOriginal"] == "Model kept this"


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