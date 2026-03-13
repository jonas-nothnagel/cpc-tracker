"""
Parse a CBD NR7 (National Report 7) PDF exported from the ORT into structured JSON.

The ORT PDF follows a strict template per national target (NT01-NTxx).
This parser uses the known section markers to deterministically extract:
  - Target text and ID
  - Progress level
  - Actions taken (narrative)
  - Progress summary
  - Challenges

Usage:
    python -m src.parse_nr7_pdf --file path/to/nr7.pdf --country Mongolia --iso3 MNG
"""

from __future__ import annotations

import argparse
import json
import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "external"

# ---------------------------------------------------------------------------
# ORT section markers (appear verbatim in the PDF text)
# ---------------------------------------------------------------------------

SECTION_MARKERS = [
    "Briefly describe the main actions taken to implement the target",
    "Indicate the current level of progress towards the target",
    "Provide a summary of progress towards the target, including the main outcomes",
    "Provide a summary of key challenges encountered and different approaches",
    "Provide examples or cases to illustrate the effectiveness",
    "Briefly describe how the implementation of the target relates to progress",
    "Indicator Data",
]

# Canonical progress levels in the ORT
PROGRESS_LEVELS = {
    "on track to achieve target": "on_track",
    "progress towards target but at an insufficient rate": "limited",
    "no significant change": "no_progress",
    "unknown": "unknown",
}

# NT -> NBT mapping for Mongolia (verified by comparing target texts)
# Multiple NTs can map to one NBT where targets were split in the ORT
NT_TO_NBT: dict[str, str] = {
    "NT01": "NBT_1",   # Protected areas / spatial planning
    "NT02": "NBT_2",   # Restore 30% degraded ecosystems
    "NT03": "NBT_3",   # Species extinction, genetic diversity
    "NT04": "NBT_3",   # Species extinction (second part)
    "NT05": "NBT_4",   # Invasive alien species
    "NT06": "NBT_5",   # Pollution
    "NT07": "NBT_6",   # Climate adaptation, GHG, carbon sinks
    "NT08": "NBT_7",   # Sustainable forestry/agriculture
    "NT09": "NBT_8",   # Ecosystem services
    "NT10": "NBT_9",   # Urban green/blue infrastructure
    "NT11": "NBT_10",  # Genetic resources / traditional knowledge
    "NT12": "NBT_11",  # Biodiversity mainstreaming across sectors
    "NT13": "NBT_12",  # Business activities monitoring
    "NT14": "NBT_13",  # Sustainable consumption / waste reduction
    "NT15": "NBT_14",  # GMO regulation / biosafety
    "NT16": "NBT_15",  # Harmful subsidies reform
    "NT17": "NBT_16",  # Biodiversity finance mobilisation
    "NT18": "NBT_17",  # Technology transfer / innovation
    "NT19": "NBT_18",  # Biodiversity information access
    "NT20": "NBT_19",  # Inclusive governance, gender, youth
}


def extract_text_from_pdf(path: Path) -> str:
    """Extract full text from a PDF using pymupdf."""
    try:
        import pymupdf
    except ImportError:
        import fitz as pymupdf  # type: ignore[no-redef]

    doc = pymupdf.open(str(path))
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n".join(pages)


def _clean_text(text: str) -> str:
    """Remove page markers, normalise whitespace."""
    text = re.sub(r"\n-- \d+ of \d+ --\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _detect_progress(text: str) -> str:
    """Find the progress level string within a section of text."""
    lower = text.lower()
    for phrase, status in PROGRESS_LEVELS.items():
        if phrase in lower:
            return status
    return "unknown"


def _extract_en_blocks(section_text: str) -> list[str]:
    """
    Extract all 'EN' content blocks from a section.

    The ORT format uses 'EN' on its own line (or followed by tab) as a marker
    before substantive answer content. This collects all such content blocks.
    """
    blocks: list[str] = []
    # Split on EN markers: EN followed by newline, or EN followed by tab
    parts = re.split(r"\nEN\n|\nEN\t", section_text)
    # Skip the first part (it's the header/template text before first EN)
    for part in parts[1:]:
        text = part.strip()
        # Truncate at next section marker or boilerplate
        for cutoff in [
            "Briefly describe the main actions",
            "Indicate the current level of progress",
            "Provide a summary of progress",
            "Provide a summary of key challenges",
            "Provide examples or cases",
            "Briefly describe how the implementation",
            "Indicator Data",
            "Please note that all indicator data",
            "GBF-INDICATOR-",
            "KMGBF-INDICATOR-",
        ]:
            idx = text.find(cutoff)
            if idx >= 0:
                text = text[:idx].strip()
        if len(text) > 30:
            blocks.append(text)
    return blocks


def _extract_between_markers(section_text: str, start_marker: str, end_markers: list[str]) -> str:
    """Extract text between a start marker and any of the end markers."""
    start = section_text.find(start_marker)
    if start < 0:
        return ""
    start += len(start_marker)

    end = len(section_text)
    for marker in end_markers:
        pos = section_text.find(marker, start)
        if pos >= 0 and pos < end:
            end = pos

    content = section_text[start:end].strip()
    content = re.sub(r"^EN[\t ]*", "", content).strip()
    content = re.sub(r"Please note that all indicator data.*$", "", content, flags=re.DOTALL).strip()
    content = re.sub(r"GBF-INDICATOR-.*$", "", content, flags=re.DOTALL).strip()
    content = re.sub(r"KMGBF-INDICATOR-.*$", "", content, flags=re.DOTALL).strip()
    return content


def parse_nr7_pdf(path: Path, country: str = "Mongolia") -> dict[str, Any]:
    """Parse an NR7 PDF into structured progress data per national target."""
    logger.info(f"Extracting text from {path.name}...")
    raw_text = extract_text_from_pdf(path)
    text = _clean_text(raw_text)
    logger.info(f"  Extracted {len(text)} chars of text")

    # Split into per-target sections using NT\d+ headers
    nt_pattern = re.compile(
        r"(NT(\d{2}))\.\s*(.*?)(?=\nBriefly describe the main actions)",
        re.DOTALL,
    )

    # Find all NT headers and their positions
    nt_headers: list[tuple[int, str, str, str]] = []
    for match in nt_pattern.finditer(text):
        nt_id = match.group(1)          # e.g. "NT01"
        nt_num = match.group(2)         # e.g. "01"
        target_text = match.group(3).strip()
        # Remove trailing "(National)" marker
        target_text = re.sub(r"\s*\(National\)\s*$", "", target_text).strip()
        nt_headers.append((match.start(), nt_id, nt_num, target_text))

    logger.info(f"  Found {len(nt_headers)} national targets")

    # For each NT, extract the full section text (from header to next header or section IV)
    section_end_marker = "Section IV"
    progress_items: list[dict[str, Any]] = []

    for i, (start_pos, nt_id, _, target_text) in enumerate(nt_headers):
        if i + 1 < len(nt_headers):
            end_pos = nt_headers[i + 1][0]
        else:
            section_iv_pos = text.find(section_end_marker, start_pos)
            end_pos = section_iv_pos if section_iv_pos > 0 else len(text)

        section_text = text[start_pos:end_pos]

        progress = _detect_progress(section_text)

        # Collect all EN-prefixed content blocks (the actual answers)
        en_blocks = _extract_en_blocks(section_text)

        # Also try marker-based extraction for challenges/examples
        challenges = _extract_between_markers(
            section_text,
            "may be taken for further implementation",
            ["Provide examples", "Briefly describe how", "Indicator Data"],
        )
        examples = _extract_between_markers(
            section_text,
            "publications, as needed.",
            ["Briefly describe how", "Indicator Data"],
        )

        item: dict[str, Any] = {
            "targetId": nt_id,
            "targetText": target_text,
            "progressStatus": progress,
            "reportedActions": en_blocks,
            "progressSummary": en_blocks[0][:500] if en_blocks else None,
            "challenges": challenges if len(challenges) > 20 else None,
            "examples": examples if len(examples) > 20 else None,
        }

        # Add NBSAP mapping if available
        nbt_id = NT_TO_NBT.get(nt_id)
        if nbt_id:
            item["nbsapTargetId"] = nbt_id

        progress_items.append(item)
        total_chars = sum(len(b) for b in en_blocks)
        logger.info(f"  {nt_id}: {progress} ({len(en_blocks)} blocks, {total_chars} chars)")

    result = {
        "country": country,
        "reportingPeriod": "2024-2026",
        "progressItems": progress_items,
    }

    # Summary
    by_status: dict[str, int] = {}
    for item in progress_items:
        by_status[item["progressStatus"]] = by_status.get(item["progressStatus"], 0) + 1
    logger.info(f"  Progress breakdown: {by_status}")

    return result


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="Parse NR7 PDF into structured JSON")
    parser.add_argument("--file", required=True, help="Path to NR7 PDF file")
    parser.add_argument("--country", default="Mongolia", help="Country name")
    parser.add_argument("--iso3", default="MNG", help="ISO3 code")
    parser.add_argument("--output", default=None, help="Output JSON file path (default: python/data/external/nr7_{iso3}.json)")
    args = parser.parse_args()

    path = Path(args.file)
    if not path.exists():
        logger.error(f"File not found: {path}")
        return

    result = parse_nr7_pdf(path, args.country)

    if args.output:
        out_path = Path(args.output)
    else:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        out_path = OUTPUT_DIR / f"nr7_{args.iso3.lower()}.json"

    out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    logger.info(f"Saved {len(result['progressItems'])} targets to {out_path}")


if __name__ == "__main__":
    main()
