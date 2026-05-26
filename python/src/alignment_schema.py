"""
Shared alignment schema: label maps, parser, and legacy migration helper.

Used by `align.py` (target-target), `measure_align.py` (BTR-target),
`budget_align.py` (BER-target), and `nr7_align.py` (CBD/NR7-target).

v2.1 schema:
  Positive scale (unchanged from v1): none / low / medium / high
  Negative side: single canonical state "flagged" with three sub-fields:
    - mechanism:     goal_conflict | resource_competition | delivery_friction
    - manageability: manageable | fundamental
    - confidence:    low | medium | high

LLM return format for the negative case:
  "Flagged for review (<Mechanism>, <Manageability>, Confidence: <Level>) - <explanation>"

Backward-compat: legacy v1 labels (possible_misalignment / possible_conflict /
likely_conflict and contradiction types implementation_tension /
scale_scope_mismatch / resource_competition / goal_conflict) still parse, and
`migrate_legacy_record()` rewrites stored v1 records into v2 shape without an
LLM call.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Canonical maps (v2.1 LLM outputs map onto these)
# ---------------------------------------------------------------------------

# Alignment level: maps LLM-facing label text to stored enum value.
ALIGNMENT_MAP: dict[str, str] = {
    # v2.1 canonical
    "no alignment": "none",
    "low alignment": "low",
    "medium alignment": "medium",
    "high alignment": "high",
    "flagged for review": "flagged",
    # v1 backward-compat: legacy LLM outputs collapse onto "flagged".
    "likely conflict": "flagged",
    "possible conflict": "flagged",
    "possible misalignment": "flagged",
    # Pre-v1 backward-compat: earlier vocabulary that may still appear if the
    # LLM regresses to it under unusual prompt conditions.
    "high contradiction": "flagged",
    "moderate contradiction": "flagged",
    "low tension": "flagged",
}

# Mechanism: type of friction within a flagged pair.
MECHANISM_MAP: dict[str, str] = {
    "goal conflict": "goal_conflict",
    "resource competition": "resource_competition",
    "delivery friction": "delivery_friction",
    # Legacy aliases (v1 contradiction types)
    "implementation tension": "delivery_friction",
    "scale/scope mismatch": "delivery_friction",
    "scale scope mismatch": "delivery_friction",
}

# Manageability: can coordination resolve it, or is a target redesign needed?
MANAGEABILITY_MAP: dict[str, str] = {
    "manageable": "manageable",
    "fundamental": "fundamental",
}

# Confidence: how strongly the text supports the flag.
CONFIDENCE_MAP: dict[str, str] = {
    "low": "low",
    "medium": "medium",
    "high": "high",
}

# Levels where mechanism/manageability/confidence sub-fields apply.
FLAGGED_LEVELS: set[str] = {"flagged"}


# ---------------------------------------------------------------------------
# Legacy → v2 migration (for stored records that pre-date v2.1)
# ---------------------------------------------------------------------------

# Legacy v1 severity level → (alignment, manageability_default, confidence_default).
# These defaults reflect what the v1 severity ladder was implicitly trying to
# capture: possible_misalignment ≈ a manageable friction the reviewer might
# disagree with; possible_conflict ≈ a fundamental friction with moderate
# confidence; likely_conflict ≈ a fundamental friction with high confidence.
LEGACY_LEVEL_TO_FIELDS: dict[str, tuple[str, str, str]] = {
    "possible_misalignment": ("flagged", "manageable", "medium"),
    "possible_conflict":     ("flagged", "fundamental", "medium"),
    "likely_conflict":       ("flagged", "fundamental", "high"),
}

LEGACY_TYPE_TO_MECHANISM: dict[str, str] = {
    "implementation_tension": "delivery_friction",
    "resource_competition":   "resource_competition",
    "goal_conflict":          "goal_conflict",
    "scale_scope_mismatch":   "delivery_friction",
}

LEGACY_LEVELS: set[str] = set(LEGACY_LEVEL_TO_FIELDS.keys())


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def _split_flagged_parenthetical(text: str) -> tuple[str | None, str | None, str | None]:
    """Extract (mechanism, manageability, confidence) from a "(...)" payload.

    Accepts the v2.1 form  '(Mechanism, Manageability, Confidence: Level)'
    and is tolerant to ordering and case variations. Returns canonical enum
    values, or None for any slot that cannot be matched.
    """
    m = re.search(r"\(([^)]+)\)", text)
    if not m:
        return None, None, None

    raw_parts = [p.strip().lower() for p in m.group(1).split(",")]
    mechanism: str | None = None
    manageability: str | None = None
    confidence: str | None = None

    for p in raw_parts:
        if p in MECHANISM_MAP:
            mechanism = MECHANISM_MAP[p]
            continue
        if p in MANAGEABILITY_MAP:
            manageability = MANAGEABILITY_MAP[p]
            continue
        if p.startswith("confidence:"):
            confidence = CONFIDENCE_MAP.get(p.split(":", 1)[1].strip())
            continue
        # bare confidence value (no "Confidence:" prefix)
        if p in CONFIDENCE_MAP and confidence is None:
            confidence = CONFIDENCE_MAP[p]

    return mechanism, manageability, confidence


def parse_alignment(
    raw: str,
) -> tuple[str, str, str | None, str | None, str | None]:
    """Parse a raw LLM advisor response into v2.1 fields.

    Returns (level, explanation, mechanism, manageability, confidence).

    For positive levels (none / low / medium / high), the three sub-fields are
    None. For "flagged" pairs, sub-fields are filled from the LLM's
    parenthesised payload — any unrecognised sub-field is left None and logged.

    Backward-compat: if the LLM returns a v1 severity label (or pre-v1
    "high/moderate contradiction" / "low tension"), the level maps to
    "flagged" and the three sub-fields are derived from
    LEGACY_LEVEL_TO_FIELDS + LEGACY_TYPE_TO_MECHANISM so legacy and v2.1
    records have the same shape on read.

    Accepts both the v2.1 "Label (...) - explanation" text format and a
    JSON fallback (used by older prompts and tests).
    """
    raw_stripped = raw.strip()
    lower = raw_stripped.lower()

    # If the response is JSON, prefer the JSON parser (avoids matching label
    # text inside a quoted JSON string and getting an empty parenthetical).
    if raw_stripped.startswith("{"):
        json_result = _try_parse_json(raw_stripped)
        if json_result is not None:
            return json_result

    # Primary: "Label - explanation" text format
    for label_text, level_code in ALIGNMENT_MAP.items():
        if label_text in lower:
            mechanism: str | None = None
            manageability: str | None = None
            confidence: str | None = None

            if level_code in FLAGGED_LEVELS:
                # v2.1 canonical "Flagged for review (Mechanism, Manageability, Confidence: Level)"
                if label_text == "flagged for review":
                    mechanism, manageability, confidence = _split_flagged_parenthetical(raw_stripped)
                else:
                    # legacy v1: parenthesised contradiction type only
                    m = re.search(r"\(([^)]+)\)", raw_stripped)
                    legacy_type = MECHANISM_MAP.get(m.group(1).strip().lower()) if m else None

                    # derive manageability + confidence from the legacy severity label
                    # (recover the stored v1 enum key from the label_text the LLM emitted)
                    legacy_level_key = {
                        "likely conflict": "likely_conflict",
                        "possible conflict": "possible_conflict",
                        "possible misalignment": "possible_misalignment",
                        "high contradiction": "likely_conflict",
                        "moderate contradiction": "possible_conflict",
                        "low tension": "possible_misalignment",
                    }.get(label_text)
                    if legacy_level_key and legacy_level_key in LEGACY_LEVEL_TO_FIELDS:
                        _, manageability, confidence = LEGACY_LEVEL_TO_FIELDS[legacy_level_key]
                    mechanism = legacy_type or "delivery_friction"

            # Extract explanation: split on first " - " after the label
            idx = lower.index(label_text)
            after_label = raw_stripped[idx + len(label_text):]
            # Skip past optional "(...)" parenthetical
            after_paren = re.sub(r"^\s*\([^)]*\)\s*", "", after_label)
            parts = after_paren.split("-", 1)
            explanation = (
                parts[1].strip()
                if len(parts) > 1
                else after_paren.strip().lstrip("-").strip()
            )
            return level_code, explanation, mechanism, manageability, confidence

    # Fallback: JSON format (also handles fenced JSON like ```json {...} ```)
    json_result = _try_parse_json(raw_stripped)
    if json_result is not None:
        return json_result

    logger.warning(f"Could not parse alignment from: {raw_stripped[:100]}")
    return "none", "", None, None, None


def _try_parse_json(
    raw_stripped: str,
) -> tuple[str, str, str | None, str | None, str | None] | None:
    """Try to parse the LLM response as JSON. Returns the 5-tuple on success, None on failure."""
    try:
        cleaned = re.sub(r"```(?:json)?\s*", "", raw_stripped).strip().rstrip("`")
        data = json.loads(cleaned)
        label = data.get("alignment", data.get("relationship", "No alignment")).strip().lower()
        explanation = data.get("explanation", data.get("description", ""))
        level = ALIGNMENT_MAP.get(label, "none")

        mech: str | None = None
        mgmt: str | None = None
        conf: str | None = None
        if level in FLAGGED_LEVELS:
            raw_mech = (
                data.get("mechanism")
                or data.get("contradictionType")
                or data.get("contradiction_type")
            )
            if raw_mech:
                key = raw_mech.lower()
                mech = MECHANISM_MAP.get(key) or LEGACY_TYPE_TO_MECHANISM.get(key) or key
            mgmt_raw = data.get("manageability")
            if mgmt_raw:
                mgmt = MANAGEABILITY_MAP.get(mgmt_raw.lower())
            conf_raw = data.get("confidence")
            if conf_raw:
                conf = CONFIDENCE_MAP.get(conf_raw.lower())
        return level, explanation, mech, mgmt, conf
    except (json.JSONDecodeError, AttributeError):
        return None


# ---------------------------------------------------------------------------
# Legacy record migration
# ---------------------------------------------------------------------------

def migrate_legacy_record(record: dict[str, Any]) -> dict[str, Any]:
    """Convert a legacy v1 alignment record to the v2.1 shape without an LLM call.

    Reads `alignment` and `contradictionType`; writes `alignment`,
    `mechanism`, `manageability`, `confidence`; drops `contradictionType`.
    Preserves `description` and any other fields.

    Records already in v2.1 shape pass through unchanged.
    """
    level = record.get("alignment", "none")
    if level not in LEGACY_LEVELS:
        # Already v2.1 (or a positive-side level); pass through.
        return record

    new_level, mgmt_default, conf_default = LEGACY_LEVEL_TO_FIELDS[level]
    legacy_type = record.get("contradictionType")
    mechanism = LEGACY_TYPE_TO_MECHANISM.get(legacy_type, "delivery_friction")

    migrated = dict(record)
    migrated["alignment"] = new_level
    migrated["mechanism"] = mechanism
    migrated["manageability"] = mgmt_default
    migrated["confidence"] = conf_default
    migrated.pop("contradictionType", None)
    return migrated
