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
- `gbfTargets` is the Kunming-Montreal GBF global target(s) the country filed
  each national target under, with the CBD's heading text verbatim. It is
  the country-agnostic axis the UI groups national targets by; nothing is
  mapped by hand here.
"""

from __future__ import annotations

import csv
import difflib
import html
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
            # The GBF global target(s) the country itself filed the national
            # target under, as the tool's own "GBF-T03. <heading>" strings
            # (several are "; "-joined). Verified returned 2026-09-11.
            "globalTargets": "GBF Targets",
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
            # The questionnaire wording, from the reporting tool itself. It is
            # the only source of question text this project uses; nothing is
            # typed by hand (verified to be returned, 2026-09-09).
            "questionTitle": "Question",
            "responseTitle": "Response",
        },
    },
}

# Questionnaire answers on the standard four-step scale, as the tool spells
# them (one export used the camelCase key). Anything else (enum keys such as
# "forTerrestrialPlanning", free text) keeps its raw response and no scale
# value; the UI shows those verbatim under "other answers".
RESPONSE_VALUES: dict[str, str] = {
    "yes": "yes",
    # The tool's wording on some questions for the top of the same scale.
    "fully": "yes",
    "partially": "partially",
    "under development": "under_development",
    "underdevelopment": "under_development",
    "no": "no",
}

# GBF indicator codes as they lead the ORT title: "3.1 Coverage of ...",
# "A.3 Red List Index", "A.CT.10 Living Planet Index". National indicators
# ("Ecosystem Category (WWF Mongolia)") carry no code.
_INDICATOR_CODE_RE = re.compile(r"^([A-D]\.(?:CT\.)?\d+|\d+\.\d+)\s+(.*)$", re.S)

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

# National targets as countries head them in the report: "NT03. By 2030, ..."
# (Mongolia), "Meta Nacional 13. ..." and "National Goal 1. ..." (Panama),
# "National Target 1: ..." and "National Target 2 - ..." (Sri Lanka).
_TARGET_RE = re.compile(
    r"^\s*(?:NT|Meta Nacional\s+|National (?:Goal|Target)\s+)0*(\d{1,2})\s*(?:[.:\-–]\s*)?(.*)$",
    re.S | re.I,
)
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
    """'NT03. By 2030, ...' -> ('NT03', 'By 2030, ...'); every country's heading
    lands on the same NTnn id, the number the country gave the target."""
    m = _TARGET_RE.match(str(target or ""))
    if not m:
        raise ValueError(f"Target does not start with a national target number: {target!r}")
    return f"NT{int(m.group(1)):02d}", _clean(m.group(2)) or ""


# One GBF global target as the ORT writes it: "GBF-T03. 30% of areas are
# effectively conserved". The heading is the CBD's own wording, kept verbatim.
_GBF_TARGET_RE = re.compile(r"GBF-T(\d{1,2})\.?\s*")


def parse_gbf_targets(raw: Any) -> list[dict[str, str]]:
    """The "GBF Targets" cell -> [{id: "T03", code: "GBF-T03", title: ...}],
    in the order filed; [] for a blank cell. A "; " joins several targets
    (Mongolia's NT09 sits under T11 and T12)."""
    text = _clean(raw) or ""
    out: list[dict[str, str]] = []
    for part in text.split(";"):
        # The national-target export leads each with its degree of alignment.
        part = re.sub(r"^(?:high|medium|low|none)\s*-\s*", "", part.strip(), flags=re.I)
        if not part:
            continue
        m = _GBF_TARGET_RE.match(part)
        if not m:
            logger.warning(f"Unrecognised GBF target cell {part!r}; skipped")
            continue
        number = int(m.group(1))
        out.append(
            {
                "id": f"T{number:02d}",
                "code": f"GBF-T{number:02d}",
                "title": _WS.sub(" ", part[m.end() :]).strip(),
            }
        )
    return out


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
    return sorted(best.values(), key=lambda r: split_target(r["Target"])[0])


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


# Words too common in target wording to say which target a title restates.
_MATCH_STOP = {"para", "panamá", "panama", "habrá", "will", "have", "with", "that", "this", "from", "their"}
# A title and its target share at least this share of the title's words.
IN_ORDER_MIN_SCORE = 0.5


def _match_words(text: Any) -> set[str]:
    joined = re.sub(r"(?<=\d)[,.](?=\d)", "", str(text or "").lower())
    return {
        w[:6]
        for w in re.findall(r"[^\W_]+", joined)
        if (len(w) > 3 or w[0].isdigit()) and w not in _MATCH_STOP
    }


def match_in_order(
    titles: list[tuple[str, str]],
    corpus: list[dict[str, Any]],
    min_score: float = IN_ORDER_MIN_SCORE,
) -> dict[str, tuple[str | None, float]]:
    """National targets that restate a corpus document in short titles (Panama's
    30 against the Nature Pledge): text similarity cannot see them, so the shared
    words decide, and both lists keep the document's order. The best alignment
    that never goes back in either list; a pair under the minimum stays
    unmatched rather than guessed."""
    probes = [_match_words(t) for _, t in titles]
    words = [_match_words(t.get("textOriginal")) | _match_words(t.get("text")) for t in corpus]
    best = [[0.0] * (len(words) + 1) for _ in range(len(probes) + 1)]
    for i, probe in enumerate(probes, 1):
        for j, w in enumerate(words, 1):
            pair = len(probe & w) / max(1, len(probe))
            best[i][j] = max(best[i - 1][j - 1] + pair, best[i - 1][j], best[i][j - 1])
    out: dict[str, tuple[str | None, float]] = {nt: (None, 0.0) for nt, _ in titles}
    i, j = len(probes), len(words)
    while i and j:
        pair = len(probes[i - 1] & words[j - 1]) / max(1, len(probes[i - 1]))
        if best[i][j] == best[i - 1][j - 1] + pair and pair > 0:
            score = round(pair, 3)
            out[titles[i - 1][0]] = (str(corpus[j - 1]["id"]) if pair >= min_score else None, score)
            i, j = i - 1, j - 1
        elif best[i][j] == best[i - 1][j]:
            i -= 1
        else:
            j -= 1
    return out


def build_progress_items(
    rows: list[dict[str, str]],
    nbsap_targets: list[dict[str, Any]],
    threshold: float = 0.85,
    match: str = "text",
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    used: dict[str, str] = {}
    latest = latest_per_target(rows)
    in_order = (
        match_in_order([split_target(r.get("Target")) for r in latest], nbsap_targets) if match == "in-order" else {}
    )
    for row in latest:
        nt_id, target_text = split_target(row.get("Target"))
        main_actions = _clean(row.get("Main Actions Summary"))
        challenges = _clean(row.get("Key Challenges Summary"))
        effectiveness = _clean(row.get("Action Effectiveness Summary"))
        nbsap_id, score = in_order[nt_id] if in_order else match_nbsap(target_text, nbsap_targets, threshold)
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
                # The GBF global target(s) the report files this national
                # target under (the country's own alignment, from the tool).
                "gbfTargets": parse_gbf_targets(row.get("GBF Targets")),
                "ortUniqueId": (row.get("Unique ID") or "").strip() or None,
                "publishedOn": published.date().isoformat() if published else None,
            }
        )
    return items


# ---------------------------------------------------------------------------
# Questionnaire (binary indicators) and indicator series (headline export)
# ---------------------------------------------------------------------------


def normalise_response(raw: Any) -> str | None:
    """Standard-scale answer key, or None for enum / free-text answers."""
    key = _WS.sub(" ", str(raw or "")).strip().lower()
    return RESPONSE_VALUES.get(key)


def split_indicator(title: Any) -> tuple[str | None, str]:
    """'3.1 Coverage of protected areas' -> ('3.1', 'Coverage of protected areas');
    a title with no GBF code -> (None, title)."""
    text = _clean(title) or ""
    m = _INDICATOR_CODE_RE.match(text)
    if not m:
        return None, text
    return m.group(1), _WS.sub(" ", m.group(2)).strip()


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "indicator"


def parse_value(raw: Any) -> float | None:
    """Numeric value of an indicator cell; None for blanks and non-numbers
    (the raw text is kept separately as `valueText`)."""
    s = str(raw if raw is not None else "").replace("\xa0", "").strip()
    if not s or s.lower() in ("nan", "na", "n/a"):
        return None
    s = s.replace(" ", "").replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _target_id_of(row: dict[str, str], gbf_to_target: dict[str, str] | None = None) -> str | None:
    target = (row.get("Target") or "").strip()
    if not target:
        return None
    gbf = _GBF_TARGET_RE.match(target)
    if gbf:
        # Filed under the GBF target itself (Sri Lanka): its national target.
        return (gbf_to_target or {}).get(f"T{int(gbf.group(1)):02d}")
    try:
        return split_target(target)[0]
    except ValueError:
        return None


def _int_year(raw: Any) -> int | None:
    s = str(raw if raw is not None else "").strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def build_questionnaire(
    binary_rows: list[dict[str, str]], gbf_to_target: dict[str, str] | None = None
) -> dict[str, Any]:
    """The GBF binary-indicator questionnaire: one answer per (target,
    indicator, question), latest revision wins, wording verbatim from the
    export's Question column when the tool returned it."""
    best: dict[tuple[str, str, str], dict[str, str]] = {}
    for row in binary_rows:
        number = (row.get("Question Number") or "").strip()
        target_id = _target_id_of(row, gbf_to_target)
        if not number or not target_id:
            continue
        key = (target_id, (row.get("Indicator Code") or "").strip(), number)
        cur = best.get(key)
        if cur is None or (_published(row) or datetime.min) >= (_published(cur) or datetime.min):
            best[key] = row
    answers: list[dict[str, Any]] = []
    for (target_id, code, number), row in best.items():
        published = _published(row)
        response = _clean(row.get("Response")) or ""
        answers.append(
            {
                "targetId": target_id,
                "indicatorCode": code or None,
                "indicatorTitle": _clean(row.get("Indicator")),
                "questionNumber": number,
                "questionTitle": _clean(row.get("Question")),
                "response": response,
                "responseValue": normalise_response(response),
                "ortUniqueId": (row.get("Unique ID") or "").strip() or None,
                "publishedOn": published.date().isoformat() if published else None,
            }
        )
    answers.sort(key=lambda a: (a["targetId"], _question_sort_key(a["questionNumber"])))
    return {"answers": answers}


def _question_sort_key(number: str) -> tuple:
    parts = re.findall(r"[A-Za-z]+|\d+", number)
    return tuple((0, int(p)) if p.isdigit() else (1, p.lower()) for p in parts)


def build_indicators(
    headline_rows: list[dict[str, str]], gbf_to_target: dict[str, str] | None = None
) -> list[dict[str, Any]]:
    """Indicator series from the headline export.

    The export repeats every (indicator, disaggregation, year) point once per
    national target the indicator is attached to and once per revision, so
    points are deduped on that triple (latest revision wins, a conflicting
    value at the same revision is logged) and the attachments are collected
    into `targetIds`. Disaggregations are series of their own, each with its
    own unit (indicator 10.2 mixes tonnes/ha and %). Rows with no year and no
    value are the "no data reported" case and keep only the country comment.
    """
    groups: dict[str, list[dict[str, str]]] = {}
    for row in headline_rows:
        title = _clean(row.get("Indicator"))
        if not title:
            continue
        groups.setdefault(title, []).append(row)

    out: list[dict[str, Any]] = []
    for title, rows in groups.items():
        code, name = split_indicator(title)
        target_ids: list[str] = []
        for row in rows:
            tid = _target_id_of(row, gbf_to_target)
            if tid and tid not in target_ids:
                target_ids.append(tid)
        target_ids.sort()
        types = [t for t in ((r.get("Indicator Type") or "").strip().lower() for r in rows) if t]
        # A blank type in the export is a headline indicator (the ORT only
        # labels the component and national ones).
        indicator_type = types[0] if types else "headline"
        comments = next((_clean(r.get("Comments")) for r in rows if _clean(r.get("Comments"))), None)
        latest_row = max(rows, key=lambda r: _published(r) or datetime.min)
        latest_pub = _published(latest_row)

        best_point: dict[tuple[str | None, int], dict[str, str]] = {}
        for row in rows:
            year = _int_year(row.get("Year"))
            if year is None:
                if (row.get("Year") or "").strip():
                    logger.warning(f"{title}: dropping row with non-integer year {row.get('Year')!r}")
                continue
            disagg = _clean(row.get("Disaggregation"))
            key = (disagg, year)
            cur = best_point.get(key)
            if cur is None:
                best_point[key] = row
                continue
            cur_pub, row_pub = _published(cur) or datetime.min, _published(row) or datetime.min
            if row_pub > cur_pub:
                best_point[key] = row
            elif row_pub == cur_pub and (row.get("Value") or "") != (cur.get("Value") or ""):
                logger.warning(
                    f"{title} / {disagg or 'total'} / {year}: conflicting values "
                    f"{cur.get('Value')!r} vs {row.get('Value')!r}; keeping the first"
                )

        by_series: dict[str | None, list[dict[str, Any]]] = {}
        units: dict[str | None, str] = {}
        for (disagg, year), row in best_point.items():
            raw = row.get("Value")
            value = parse_value(raw)
            value_text = _clean(raw) if value is None and _clean(raw) else None
            if value is None and value_text is None:
                continue
            by_series.setdefault(disagg, []).append(
                {"year": year, "value": value, "valueText": value_text, "footnote": _clean(row.get("Footnote"))}
            )
            unit = _clean(row.get("Unit"))
            if unit and disagg not in units:
                units[disagg] = unit
        series = [
            {"disaggregation": disagg, "unit": units.get(disagg), "points": sorted(pts, key=lambda p: p["year"])}
            for disagg, pts in by_series.items()
        ]
        series.sort(key=lambda s: (s["disaggregation"] is not None, s["disaggregation"] or ""))

        out.append(
            {
                "id": code or slugify(title),
                "code": code,
                "name": name,
                "title": title,
                "indicatorType": indicator_type,
                "targetIds": target_ids,
                "comments": comments,
                "ortUniqueId": (latest_row.get("Unique ID") or "").strip() or None,
                "publishedOn": latest_pub.date().isoformat() if latest_pub else None,
                "series": series,
            }
        )
    out.sort(key=lambda i: (i["code"] is None, _question_sort_key(i["code"] or ""), i["title"]))
    return out


def build_nr7_data(
    country: str,
    iso3: str,
    section3_rows: list[dict[str, str]],
    nbsap_targets: list[dict[str, Any]],
    fetched_at: datetime | None = None,
    threshold: float = 0.85,
    headline_rows: list[dict[str, str]] | None = None,
    binary_rows: list[dict[str, str]] | None = None,
    match: str = "text",
    gbf_to_target: dict[str, str] | None = None,
) -> dict[str, Any]:
    items = build_progress_items(section3_rows, nbsap_targets, threshold, match)
    published = sorted(p for p in (i["publishedOn"] for i in items) if p)
    latest = published[-1] if published else None
    fetched = (fetched_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    sections = ["Section III (national targets)"]
    if headline_rows:
        sections.append("Headline and other indicators")
    if binary_rows:
        sections.append("Binary indicators (questionnaire)")
    return {
        "country": country,
        "iso3": iso3.upper(),
        # Shown as the citation "NR7 (…)"; the report's own publication year.
        "reportingPeriod": latest[:4] if latest else "",
        "source": {
            "name": ORT_SOURCE_NAME,
            "url": ORT_URL,
            "section": "Section III (national targets)",
            "sections": sections,
            "publishedOn": latest,
            "fetchedAt": fetched.replace(microsecond=0).isoformat(),
        },
        "progressItems": items,
        # Always present so the client shape is stable; empty without the exports.
        "questionnaire": build_questionnaire(binary_rows or [], gbf_to_target),
        "indicators": build_indicators(headline_rows or [], gbf_to_target),
    }


# ---------------------------------------------------------------------------
# Reports filed under the GBF targets themselves
# ---------------------------------------------------------------------------


def national_target_map(national_rows: list[dict[str, str]]) -> dict[str, dict[str, Any]]:
    """The national-target export -> {NTnn: {heading, gbf: {T03: "GBF-T03. ..."}}}."""
    out: dict[str, dict[str, Any]] = {}
    published: dict[str, datetime] = {}
    for row in national_rows:
        heading = _clean(row.get("National target title")) or ""
        nt = split_target(heading)[0]
        when = _published(row) or datetime.min
        # The export sorts newest first: a target's latest revision wins.
        if nt in published and when < published[nt]:
            continue
        published[nt] = when
        out[nt] = {
            "heading": heading,
            "gbf": parse_gbf_targets(row.get("Degree of Alignment by target")),
        }
    return out


def gbf_to_national(national: dict[str, dict[str, Any]]) -> dict[str, str]:
    """{T03: NT03}: which national target a GBF target is filed under. A GBF target
    under two national targets cannot say which one a row belongs to, so it stops
    the build rather than filing the row under either."""
    out: dict[str, str] = {}
    for nt, entry in sorted(national.items()):
        for g in entry["gbf"]:
            if g["id"] in out and out[g["id"]] != nt:
                raise ValueError(f"{g['id']} sits under both {out[g['id']]} and {nt}; a row filed under it has no one home")
            out[g["id"]] = nt
    return out


def _plain_start(text: Any) -> str:
    return re.sub(r"\W+", "", html.unescape(re.sub(r"<[^>]+>", " ", str(text or ""))).lower())[:60]


# Least advanced first: a national target carries its least advanced row.
_LEVEL_ORDER = ["no_progress", "limited", "on_track", "unknown"]
_NARRATIVES = ("Main Actions Summary", "Progress Summary", "Key Challenges Summary", "Action Effectiveness Summary")


def file_under_national_targets(
    section3_rows: list[dict[str, str]],
    keys: list[dict[str, Any]],
    national: dict[str, dict[str, Any]],
) -> list[dict[str, str]]:
    """Sri Lanka filed Section III under the GBF targets themselves, which the
    CSV export leaves blank: the report's own record says which target each row
    is (`keys`, matched on the narrative's opening, never on position alone) and
    the national-target export says which national target that GBF target
    belongs to. One row per national target: the rows of a target that has
    several keep their GBF code in the text, and its rating is the least
    advanced. Rows the export already names pass through."""
    by_start = {k["start"]: k for k in keys if k.get("start")}
    gbf_map = gbf_to_national(national)
    # The export repeats a row for every revision: the latest, before any merge.
    latest: dict[str, dict[str, str]] = {}
    for row in section3_rows:
        key = (row.get("Target") or "").strip() or _plain_start(row.get("Main Actions Summary"))
        cur = latest.get(key)
        if cur is None or (_published(row) or datetime.min) >= (_published(cur) or datetime.min):
            latest[key] = row
    grouped: dict[str, list[tuple[str | None, dict[str, str]]]] = {}
    for row in latest.values():
        target = (row.get("Target") or "").strip()
        if target:
            nt = split_target(target)[0]
            grouped.setdefault(nt, []).append((None, row))
            continue
        key = by_start.get(_plain_start(row.get("Main Actions Summary")))
        if key is None:
            raise ValueError(f"No report record for the row opening {_plain_start(row.get('Main Actions Summary'))!r}")
        m = re.match(r"GBF-TARGET-(\d{1,2})$", str(key.get("target") or ""))
        if not m:
            raise ValueError(f"Unnamed row is not filed under a GBF target: {key.get('target')!r}")
        gbf_id = f"T{int(m.group(1)):02d}"
        if gbf_id not in gbf_map:
            raise ValueError(f"No national target carries {gbf_id}")
        grouped.setdefault(gbf_map[gbf_id], []).append((f"GBF-{gbf_id}", row))
    out: list[dict[str, str]] = []
    for nt, rows in sorted(grouped.items()):
        entry = national[nt]
        merged = dict(rows[0][1])
        merged["Target"] = entry["heading"]
        merged["GBF Targets"] = "; ".join(f'{g["code"]}. {g["title"]}' for g in entry["gbf"])
        merged["Level of Progress"] = min(
            (r.get("Level of Progress") or "" for _, r in rows),
            key=lambda level: _LEVEL_ORDER.index(map_level(level)),
        )
        for field in _NARRATIVES:
            parts = [(code, _clean(r.get(field))) for code, r in rows]
            parts = [(code, text) for code, text in parts if text]
            merged[field] = (
                parts[0][1] if len(parts) == 1 else "\n\n".join(f"{code}: {text}" if code else text for code, text in parts)
            ) if parts else ""
        out.append(merged)
    return out


def fetch_national_targets_csv(iso2: str, timeout: int = 90) -> str:
    """POST the ORT export of the country's national targets: heading and the
    GBF targets it aligns them with. Public data, read-only."""
    import requests  # noqa: PLC0415

    payload = {
        "query": {
            "df": "text_EN_txt",
            "fq": ["_state_s:public", "realm_ss:ort"],
            "q": f"(schema_s : (nationalTarget7) AND government_s : ({iso2.lower()}))",
            "sort": "updatedDate_dt desc",
            "fl": _ORT_FL,
            "wt": "json",
            "start": 0,
            "rows": 10000,
        },
        "fields": {
            "publishedOn": "Published on",
            "uniqueId": "Unique ID",
            "globalTargetAndDegreeOfAlignment": "Degree of Alignment by target",
            "title": "National target title",
        },
        "newRowForArrayValues": False,
    }
    resp = requests.post(
        ORT_URL.replace("nationalReport7", "nationalTarget7"),
        json=payload,
        headers={"accept": "text/csv", "content-type": "application/json", "realm": "ORT"},
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.text


def fetch_section3_keys(iso2: str, timeout: int = 90) -> list[dict[str, Any]]:
    """From the report's own record: what each Section III row is filed under,
    with the opening of its narrative to match it to the CSV row. Public data."""
    import requests  # noqa: PLC0415

    index = requests.get(
        "https://api.cbd.int/api/v2013/index",
        params={
            "q": f"schema_s:nationalReport7 AND government_s:{iso2.lower()}",
            "fl": "identifier_s",
            "rows": 1,
            "wt": "json",
        },
        timeout=timeout,
    )
    index.raise_for_status()
    identifier = index.json()["response"]["docs"][0]["identifier_s"]
    doc = requests.get(
        f"https://api.cbd.int/api/v2013/documents/{identifier}",
        headers={"accept": "application/json", "realm": "ORT"},
        timeout=timeout,
    )
    doc.raise_for_status()
    keys: list[dict[str, Any]] = []
    for row in doc.json().get("sectionIII") or []:
        text = row.get("mainActionsSummary")
        text = text.get("en") if isinstance(text, dict) else text
        keys.append(
            {
                "target": (row.get("target") or {}).get("identifier"),
                "targetType": row.get("targetType"),
                "start": _plain_start(text),
            }
        )
    return keys


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
