"""
NR7 (7th National Report to the CBD) from the ORT public API.

The CBD Online Reporting Tool (ORT) publishes each country's NR7 as
structured, public data. This module turns its Section III export (one row per
national target) into the `nr7_{iso3}.json` shape the frontend and the NR7
alignment step read. It replaces the March 2026 PDF scrape, which

  - hand-coded the national-target -> NBSAP map and got it wrong from NT04
    onward (17 of 20 for Mongolia), and
  - filed Progress / Challenges / Effectiveness text under `reportedActions`
    instead of the report's own "Main Actions Summary".

Only the pure transformation lives here (unit-tested, no network). The fetch
itself is `fetch_ort_csv`, called by `scripts/fetch_nr7_ort.py`. No government
data leaves the machine: the API is read-only and the report is already
public.

Design notes
- Four narratives per target are kept SEPARATE (mainActionsSummary,
  progressSummary, keyChallengesSummary, actionEffectivenessSummary) so no
  consumer has to guess which sentence is an action.
- `reportedActions` is the list the alignment step pairs against policy
  targets. From this source it is the Main Actions Summary, ONE entry per
  national target. Whether a long actions narrative should be split into
  several reported actions is a calibration decision (see the CALIBRATION
  TODO in nr7_align.py); until it is taken, one entry keeps the choice
  visible and reversible in data, not code.
- `nbsapTargetId` is the CORPUS id of the NBSAP target the national target
  restates (e.g. "NBSAP_4"), matched by text similarity against the country's
  targets file, never hand-coded. Older files carry "NBT_n"; every frontend
  reader accepts both.
- The ORT six-level progress scale is mapped onto the four-level vocabulary
  the UI has labels for; the raw level is preserved in `levelOfProgress`.
"""

from __future__ import annotations

import csv
import difflib
import io
import logging
import re
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

ORT_URL = "https://api.cbd.int/api/v2022/documents/schemas/nationalReport7/download"
ORT_SOURCE_NAME = "CBD Online Reporting Tool (ORT), 7th National Report"

# Solr field list the ORT export endpoint expects (from the ORT web client).
_ORT_FL = (
    "id, recDate:updatedDate_dt, recCreationDate:createdDate_dt, identifier_s, "
    "uniqueIdentifier_s, url_ss, government_s, schema_s, schema_EN_s, government_EN_s, "
    "schemaSort_i, sort1_i, sort2_i, sort3_i, sort4_i, _revision_i, "
    "recCountryName:government_EN_t, recTitle:title_EN_t, recSummary:summary_t, "
    "recType:type_EN_t, recMeta1:meta1_EN_txt, recMeta2:meta2_EN_txt, "
    "recMeta3:meta3_EN_txt, recMeta4:meta4_EN_txt, recMeta5:meta5_EN_txt, "
    "globalTargetAlignment_ss, globalGoalOrTarget_s, globalGoalAlignment_ss, "
    "organization_t, countryReviews_EN_txt, primaryGlobalAlignment_s"
)

# The three NR7 exports. `fields` maps ORT field -> CSV column header.
ORT_SECTIONS: dict[str, dict[str, Any]] = {
    "section3": {
        "solrIdField": "sectionIIIKey_s",
        "mongoIdField": "identifier",
        "fields": {
            "target": "Target",
            "mainActionsSummary": "Main Actions Summary",
            "progressSummary": "Progress Summary",
            "keyChallengesSummary": "Key Challenges Summary",
            "actionEffectivenessSummary": "Action Effectiveness Summary",
            "levelOfProgress": "Level of Progress",
        },
    },
    "headline": {
        "solrIdField": "indicatorDataKey_s",
        "mongoIdField": "nr7IndicatorDataIdentifier",
        "fields": {
            "target": "Target",
            "indicator": "Indicator",
            "indicatorType": "Indicator Type",
            "disaggregation": "Disaggregation",
            "year": "Year",
            "unit": "Unit",
            "value": "Value",
            "footnote": "Footnote",
            "comments": "Comments",
        },
    },
    "binary": {
        "solrIdField": "binaryIndicatorDataKey_s",
        "mongoIdField": "nr7BinaryDataIdentifier",
        "fields": {
            "target": "Target",
            "indicator": "Indicator",
            "indicatorCode": "Indicator Code",
            "questionNumber": "Question Number",
            "responseTitle": "Response",
        },
    },
}

# ORT "Level of Progress" (six levels) -> the four-level vocabulary the UI has
# labels and colours for (src/lib/labels.ts). "Achieved" folds into on_track
# and "Not applicable" into unknown because neither has its own UI state yet;
# the raw level survives in `levelOfProgress` so nothing is lost.
LEVEL_TO_STATUS: dict[str, str] = {
    "on track to achieve target": "on_track",
    "achieved": "on_track",
    "progress towards target but at an insufficient rate": "limited",
    "no significant change": "no_progress",
    "unknown": "unknown",
    "not applicable": "unknown",
}

_TARGET_RE = re.compile(r"^\s*(NT\d{2})\.?\s*(.*)$", re.S)
_WS = re.compile(r"\s+")


def _clean(value: Any) -> str | None:
    """Verbatim source text, minus export artefacts: NBSP, CRLF, runs of
    blank lines. Empty -> None so JSON consumers can test truthiness."""
    if value is None:
        return None
    text = str(value).replace("\xa0", " ").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text or None


def normalise_level(raw: Any) -> str:
    return _WS.sub(" ", str(raw or "")).strip()


def map_level(raw: Any) -> str:
    """Six-level ORT scale -> on_track | limited | no_progress | unknown."""
    key = normalise_level(raw).lower()
    status = LEVEL_TO_STATUS.get(key)
    if status is None:
        if key:
            logger.warning(f"Unknown ORT level of progress {raw!r}; recording as unknown")
        return "unknown"
    return status


def split_target(target: Any) -> tuple[str, str]:
    """'NT03. By 2030, ...' -> ('NT03', 'By 2030, ...')."""
    m = _TARGET_RE.match(str(target or ""))
    if not m:
        raise ValueError(f"Target does not start with an NTnn id: {target!r}")
    return m.group(1), _clean(m.group(2)) or ""


def parse_ort_csv(csv_text: str) -> list[dict[str, str]]:
    """Rows of an ORT CSV export (BOM-tolerant)."""
    return list(csv.DictReader(io.StringIO(csv_text.lstrip("﻿"))))


def _published(row: dict[str, str]) -> datetime | None:
    raw = (row.get("Published on") or "").strip()
    for fmt in ("%d-%b-%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def latest_per_target(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """The ORT export repeats a target for every revision; keep the most
    recently published row per target, in NT order."""
    best: dict[str, dict[str, str]] = {}
    for row in rows:
        target = (row.get("Target") or "").strip()
        if not target:
            continue
        cur = best.get(target)
        if cur is None or (_published(row) or datetime.min) >= (_published(cur) or datetime.min):
            best[target] = row
    return sorted(best.values(), key=lambda r: r["Target"])


def _norm_text(s: str) -> str:
    return _WS.sub(" ", s or "").strip().rstrip(".").lower()


def match_nbsap(
    target_text: str,
    nbsap_targets: list[dict[str, Any]],
    threshold: float = 0.85,
) -> tuple[str | None, float]:
    """Best NBSAP corpus target by text similarity. A national target in the
    NR7 restates an NBSAP target, so a real match is near-identical; below the
    threshold we return None rather than guess."""
    if not nbsap_targets:
        return None, 0.0
    probe = _norm_text(target_text)
    best_id, best_score = None, 0.0
    for t in nbsap_targets:
        score = difflib.SequenceMatcher(None, probe, _norm_text(str(t.get("text", "")))).ratio()
        if score > best_score:
            best_id, best_score = str(t["id"]), score
    if best_score < threshold:
        return None, round(best_score, 3)
    return best_id, round(best_score, 3)


def build_progress_items(
    rows: list[dict[str, str]],
    nbsap_targets: list[dict[str, Any]],
    threshold: float = 0.85,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    used: dict[str, str] = {}
    for row in latest_per_target(rows):
        nt_id, target_text = split_target(row.get("Target"))
        main_actions = _clean(row.get("Main Actions Summary"))
        challenges = _clean(row.get("Key Challenges Summary"))
        effectiveness = _clean(row.get("Action Effectiveness Summary"))
        nbsap_id, score = match_nbsap(target_text, nbsap_targets, threshold)
        if nbsap_id and nbsap_id in used:
            logger.warning(
                f"{nt_id} and {used[nbsap_id]} both match {nbsap_id}; keeping both, check the corpus"
            )
        if nbsap_id:
            used.setdefault(nbsap_id, nt_id)
        published = _published(row)
        items.append(
            {
                "targetId": nt_id,
                "targetText": target_text,
                "progressStatus": map_level(row.get("Level of Progress")),
                "levelOfProgress": normalise_level(row.get("Level of Progress")) or None,
                # The list the alignment step pairs: the report's own actions
                # narrative, one entry per target until splitting is calibrated.
                "reportedActions": [main_actions] if main_actions else [],
                "mainActionsSummary": main_actions,
                "progressSummary": _clean(row.get("Progress Summary")),
                "keyChallengesSummary": challenges,
                "actionEffectivenessSummary": effectiveness,
                # Legacy keys still read by the NR7 progress panel.
                "challenges": challenges,
                "examples": effectiveness,
                "nbsapTargetId": nbsap_id,
                "nbsapMatchScore": score,
                "ortUniqueId": (row.get("Unique ID") or "").strip() or None,
                "publishedOn": published.date().isoformat() if published else None,
            }
        )
    return items


def build_nr7_data(
    country: str,
    iso3: str,
    section3_rows: list[dict[str, str]],
    nbsap_targets: list[dict[str, Any]],
    fetched_at: datetime | None = None,
    threshold: float = 0.85,
) -> dict[str, Any]:
    items = build_progress_items(section3_rows, nbsap_targets, threshold)
    published = sorted(p for p in (i["publishedOn"] for i in items) if p)
    latest = published[-1] if published else None
    fetched = (fetched_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return {
        "country": country,
        "iso3": iso3.upper(),
        # Shown as the citation "NR7 (…)"; the report's own publication year.
        "reportingPeriod": latest[:4] if latest else "",
        "source": {
            "name": ORT_SOURCE_NAME,
            "url": ORT_URL,
            "section": "Section III (national targets)",
            "publishedOn": latest,
            "fetchedAt": fetched.replace(microsecond=0).isoformat(),
        },
        "progressItems": items,
    }


def fetch_ort_csv(iso2: str, section: str, timeout: int = 90) -> str:
    """POST the ORT export endpoint for one NR7 section; returns CSV text.
    Public data, read-only; imported lazily so the pure functions above stay
    importable without `requests`."""
    import requests  # noqa: PLC0415

    spec = ORT_SECTIONS[section]
    payload = {
        "query": {
            "df": "text_EN_txt",
            "fq": ["_state_s:public", "realm_ss:ort"],
            "q": f"(schema_s : (nationalReport7) AND government_s : ({iso2.lower()}))",
            "sort": "updatedDate_dt desc",
            "fl": _ORT_FL,
            "wt": "json",
            "start": 0,
            "rows": 10000,
        },
        "fields": {"publishedOn": "Published on", "uniqueId": "Unique ID", **spec["fields"]},
        "newRowForArrayValues": False,
        "solrIdField": spec["solrIdField"],
        "mongoIdField": spec["mongoIdField"],
    }
    resp = requests.post(
        ORT_URL,
        json=payload,
        headers={"accept": "text/csv", "content-type": "application/json", "realm": "ORT"},
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.text
