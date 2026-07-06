"""
Corpus-level synthesis: distil cross-cutting themes from the per-doc-pair
syntheses for one country.

One LLM call per country takes every doc-pair synthesis as input, plus
deterministic evidence tables computed directly from the scored target pairs
(per-document misalignment shares, most-affected document pairs and targets,
the greedy >=50% flagged-cover target set, contested resources), and produces
up to three reinforcement themes plus up to three potential-misalignment
themes, each named as a noun phrase, with a one-sentence hedged pathway and
anchor targets drawn from the evidence tables. A 3-4 sentence briefing-style
summary paragraph accompanies them.

Counts are computed in Python from contributing_doc_pairs against the
deterministic doc-pair counts, never asked of the LLM. Friction themes claim
disjoint doc pairs, so each flagged link is counted once under its dominant
theme. Style violations (imperative names, banned vocabulary, malformed
pathways) trigger ONE corrective retry, then deterministic sanitization;
style problems never crash a run.

Module entrypoint:
    `synthesize_corpus(doc_pair_syntheses, country_name,
                       targets=None, alignment=None, classifications=None)`
Without the optional args it still works (no evidence tables, no aggregates),
which keeps old callers valid.

CLI:
    cd python && python -m src.synthesize_corpus --country mongolia
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
from collections import Counter
from typing import Any, Callable

from .config import ACTIVE_TAXONOMIES, DATA_DIR, OUTPUT_DIR
from .llm import call_llm
from .synthesis_states import (
    canonical_hidden_key,
    filter_doc_pair_records,
    filter_targets_alignment,
)
from .synthesis_style import (
    check_pathway,
    check_prose,
    check_theme_name,
    corrections_block,
    sanitize_name,
    sanitize_prose,
)

logger = logging.getLogger(__name__)

CACHE_NAMESPACE = "corpus_themes"

SCHEMA_VERSION = 2

MAX_THEMES_PER_TYPE = 3
MAX_ANCHOR_TARGETS = 6
MAX_CORRECTIONS_IN_RETRY = 40

FLAGGED_LEVELS = {"flagged"}
ALIGNED_LEVELS = {"medium", "high"}

# Evidence-table bounds. Excerpts stay short; the tables anchor the LLM, they
# don't replace the doc-pair syntheses.
EXCERPT_CHARS = 160
TARGET_TABLE_SIZE = 15
DOC_PAIR_TABLE_SIZE = 8
RESOURCE_TABLE_SIZE = 12
GREEDY_COVER_SHARE = 0.5


SYSTEM_PROMPT = (
    "You distil recurring cross-cutting themes from a country's policy coherence\n"
    "analysis. You are given the per-document-pair syntheses already produced for\n"
    "this country, plus deterministic evidence tables computed directly from the\n"
    "scored target pairs. Output up to three themes where documents consistently\n"
    "align and up to three themes of potential misalignment that may warrant review.\n"
    "\n"
    "Voice rules (strict):\n"
    "- Institutional register, third person. Never address the reader; no \"you\" or \"we\".\n"
    "- Hedged and neutral. No blame toward any document, sector, or ministry. These\n"
    "  are prompts for human review, not verdicts.\n"
    "- Negative-side vocabulary: say \"potential misalignment\" or \"possible\n"
    "  misalignment\". NEVER use the words \"tension\", \"contradiction\", \"friction\",\n"
    "  \"conflict\", or the phrase \"flagged for review\" in any name, description,\n"
    "  pathway, or summary text.\n"
    "- Positive-side vocabulary: say \"aligns with\", \"pulls in the same direction\",\n"
    "  \"supports\". Do not use the word \"reinforces\" in prose.\n"
    "- Never use \"should\" or \"must\". For suggestions use \"could\", \"may\", or\n"
    "  \"worth a closer look\".\n"
    "- NO em dashes anywhere. Use commas or full stops.\n"
    "- Theme names are NOUN PHRASES of 5 to 9 words that name a pattern, for\n"
    "  example \"Use of governance and monitoring systems across sectors\" or\n"
    "  \"Land requirements of expansion incentives\". A name must never begin with\n"
    "  an imperative verb such as Review, Embed, Link, Rely, Align,\n"
    "  Strengthen, Ensure, or Flag. It names what recurs, not an action to take.\n"
    "- Every theme must trace to the doc-pair syntheses and evidence tables\n"
    "  provided. Never invent documents, document pairs, targets, or claims.\n"
    "- Be data-driven about how many themes to return: if the evidence supports\n"
    "  fewer than three on a side, return fewer. Never pad to reach three.\n"
    "- Descriptions are 1-2 sentences with concrete mechanisms, not abstract\n"
    "  categories.\n"
    "- The pathway field is exactly one sentence: a hedged process pointer (for\n"
    "  example joint monitoring, boundary review, indicator alignment) that could\n"
    "  be a starting point for review. It may name specific documents from the\n"
    "  input. It must never name ministries, agencies, or individual actors.\n"
    "- The summary_paragraph is for a senior official to read first thing.\n"
    "  3-4 sentences, balanced across both sides, no prescription, same\n"
    "  vocabulary rules."
)


def _format_input_synthesis(record: dict[str, Any]) -> str:
    s = record.get("synthesis") or {}
    doc_a = record.get("doc_a", "?")
    doc_b = record.get("doc_b", "?")
    label_a = record.get("label_a", doc_a)
    label_b = record.get("label_b", doc_b)
    return (
        f"### {label_a} ({doc_a}) <-> {label_b} ({doc_b})\n"
        f"  Aligned: {record.get('aligned_count', 0)}, "
        f"Identified for review: {record.get('flagged_count', 0)}\n"
        f"  Storyline: {s.get('storyline_name', '?')}\n"
        f"  Aligned pattern: {s.get('reinforce', '?')}\n"
        f"  Possible misalignment: {s.get('clash', '?')}\n"
        f"  Coordination: {s.get('coordination_hint', '?')}\n"
        f"  Confidence: {s.get('confidence', '?')}"
    )


# ---------------------------------------------------------------------------
# Evidence tables (deterministic, computed before the LLM call)
# ---------------------------------------------------------------------------


def _pair_key(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def build_evidence_tables(
    targets: list[dict[str, Any]],
    alignment: list[dict[str, Any]],
    doc_pair_records: list[dict[str, Any]],
) -> dict[str, Any]:
    """Compute evidence tables A-F from the scored pairs.

    A: per-document share of scored cross-doc pairs identified for review.
    B: top doc pairs by flagged count (from the doc-pair records).
    C: top targets by participation in flagged pairs.
    D: greedy >=50% flagged-cover target set. Exact port of the frontend's
       `computeTargetConcentration` (coherence-briefing.ts): rank by distinct
       flagged pairs desc, ties by target id asc, add until the covered share
       reaches the threshold, counting each pair once.
    E: top targets by participation in medium/high pairs.
    F: contested-resource histogram over flagged pairs.

    C+D ids form the allowed anchor set for friction themes; E ids the allowed
    set for reinforcement themes.
    """
    targets_by_id = {t["id"]: t for t in targets}

    flagged_pairs_by_target: dict[str, set[tuple[str, str]]] = {}
    aligned_pairs_by_target: dict[str, set[tuple[str, str]]] = {}
    all_flagged_keys: set[tuple[str, str]] = set()
    doc_flagged: Counter[str] = Counter()
    doc_scored: Counter[str] = Counter()
    resource_counter: Counter[str] = Counter()

    for r in alignment:
        level = r.get("alignment")
        if level in (None, "none"):
            continue
        t_a = targets_by_id.get(r.get("targetAId"))
        t_b = targets_by_id.get(r.get("targetBId"))
        if not t_a or not t_b:
            continue
        key = _pair_key(r["targetAId"], r["targetBId"])
        cross_doc = t_a["sourceDocument"] != t_b["sourceDocument"]
        if cross_doc:
            for d in (t_a["sourceDocument"], t_b["sourceDocument"]):
                doc_scored[d] += 1
        if level in FLAGGED_LEVELS:
            all_flagged_keys.add(key)
            for tid in key:
                flagged_pairs_by_target.setdefault(tid, set()).add(key)
            if cross_doc:
                for d in (t_a["sourceDocument"], t_b["sourceDocument"]):
                    doc_flagged[d] += 1
            for res in r.get("contestedResources") or []:
                if isinstance(res, str) and res.strip():
                    resource_counter[res.strip().casefold()] += 1
        elif level in ALIGNED_LEVELS:
            for tid in key:
                aligned_pairs_by_target.setdefault(tid, set()).add(key)

    def _target_table(pairs_by_target: dict[str, set]) -> list[dict[str, Any]]:
        ranked = sorted(
            pairs_by_target.items(), key=lambda kv: (-len(kv[1]), kv[0])
        )[:TARGET_TABLE_SIZE]
        table = []
        for tid, keys in ranked:
            t = targets_by_id[tid]
            table.append({
                "id": tid,
                "label": t.get("sourceLabel", tid),
                "count": len(keys),
                "excerpt": (t.get("text") or "")[:EXCERPT_CHARS],
            })
        return table

    top_flagged_targets = _target_table(flagged_pairs_by_target)
    top_aligned_targets = _target_table(aligned_pairs_by_target)

    # D: greedy cover, exact port of computeTargetConcentration.
    total_flagged = len(all_flagged_keys)
    greedy: list[dict[str, Any]] = []
    covered: set[tuple[str, str]] = set()
    if total_flagged:
        ranked = sorted(
            flagged_pairs_by_target.items(), key=lambda kv: (-len(kv[1]), kv[0])
        )
        for tid, keys in ranked:
            if len(covered) / total_flagged >= GREEDY_COVER_SHARE:
                break
            marginal = sum(1 for k in keys if k not in covered)
            covered.update(keys)
            t = targets_by_id[tid]
            greedy.append({
                "id": tid,
                "label": t.get("sourceLabel", tid),
                "count": len(keys),
                "marginal": marginal,
            })

    doc_shares = [
        {
            "doc": d,
            "flagged": doc_flagged.get(d, 0),
            "scored": doc_scored[d],
            "share": doc_flagged.get(d, 0) / doc_scored[d],
        }
        for d in doc_scored
    ]
    doc_shares.sort(key=lambda row: (-row["share"], row["doc"]))

    top_flagged_doc_pairs = sorted(
        doc_pair_records,
        key=lambda rec: (-rec.get("flagged_count", 0), rec.get("doc_a", ""), rec.get("doc_b", "")),
    )[:DOC_PAIR_TABLE_SIZE]
    top_flagged_doc_pairs = [
        {
            "pair": f"{rec['doc_a']}<->{rec['doc_b']}",
            "label_a": rec.get("label_a", rec["doc_a"]),
            "label_b": rec.get("label_b", rec["doc_b"]),
            "flagged": rec.get("flagged_count", 0),
            "aligned": rec.get("aligned_count", 0),
        }
        for rec in top_flagged_doc_pairs
        if rec.get("flagged_count", 0) > 0
    ]

    contested_resources = [
        {"resource": res, "count": n}
        for res, n in resource_counter.most_common(RESOURCE_TABLE_SIZE)
    ]

    return {
        "doc_shares": doc_shares,
        "top_flagged_doc_pairs": top_flagged_doc_pairs,
        "top_flagged_targets": top_flagged_targets,
        "greedy_cover": {
            "targets": greedy,
            "share": (len(covered) / total_flagged) if total_flagged else 0.0,
            "total_flagged": total_flagged,
        },
        "top_aligned_targets": top_aligned_targets,
        "contested_resources": contested_resources,
        "allowed_friction_anchors": (
            {row["id"] for row in top_flagged_targets}
            | {row["id"] for row in greedy}
        ),
        "allowed_reinforcement_anchors": {row["id"] for row in top_aligned_targets},
    }


def _format_evidence_tables(ev: dict[str, Any]) -> str:
    lines: list[str] = []

    lines.append("A. Share of scored cross-document pairs identified for review, per document:")
    if ev["doc_shares"]:
        for row in ev["doc_shares"]:
            lines.append(
                f"  {row['doc']}: {row['share'] * 100:.1f}% "
                f"({row['flagged']} of {row['scored']} scored pairs touching it)"
            )
    else:
        lines.append("  (none)")

    lines.append("")
    lines.append("B. Document pairs with the most pairs identified for review:")
    if ev["top_flagged_doc_pairs"]:
        for row in ev["top_flagged_doc_pairs"]:
            lines.append(
                f"  {row['pair']} ({row['label_a']} <-> {row['label_b']}): "
                f"{row['flagged']} identified for review, {row['aligned']} aligned"
            )
    else:
        lines.append("  (none)")

    lines.append("")
    lines.append(
        "C. Targets participating in the most pairs identified for review "
        "(allowed anchors for potential-misalignment themes):"
    )
    if ev["top_flagged_targets"]:
        for row in ev["top_flagged_targets"]:
            lines.append(
                f"  {row['id']} ({row['label']}): {row['count']} pairs. "
                f"\"{row['excerpt']}\""
            )
    else:
        lines.append("  (none)")

    lines.append("")
    gc = ev["greedy_cover"]
    lines.append(
        f"D. Smallest target set covering >={GREEDY_COVER_SHARE * 100:.0f}% of all "
        f"{gc['total_flagged']} pairs identified for review "
        f"({len(gc['targets'])} targets, {gc['share'] * 100:.1f}% covered; "
        f"also allowed anchors for potential-misalignment themes):"
    )
    if gc["targets"]:
        for row in gc["targets"]:
            lines.append(
                f"  {row['id']} ({row['label']}): {row['count']} pairs, "
                f"{row['marginal']} not covered by the targets above"
            )
    else:
        lines.append("  (none)")

    lines.append("")
    lines.append(
        "E. Targets participating in the most medium/high aligned pairs "
        "(allowed anchors for alignment themes):"
    )
    if ev["top_aligned_targets"]:
        for row in ev["top_aligned_targets"]:
            lines.append(
                f"  {row['id']} ({row['label']}): {row['count']} pairs. "
                f"\"{row['excerpt']}\""
            )
    else:
        lines.append("  (none)")

    lines.append("")
    lines.append("F. Contested resources named across pairs identified for review:")
    if ev["contested_resources"]:
        for row in ev["contested_resources"]:
            lines.append(f"  {row['resource']}: {row['count']}")
    else:
        lines.append("  (none)")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------


def _field_spec(with_evidence: bool) -> str:
    anchor_line = (
        "    anchor_target_ids: up to 6 target ids copied VERBATIM from the "
        "evidence tables. For \"friction\" themes only ids from tables C or D; "
        "for \"reinforcement\" themes only ids from table E.\n"
        if with_evidence
        else ""
    )
    return (
        "Produce a JSON object with these fields:\n"
        "  storylines: array with AT MOST 3 objects of type \"reinforcement\" and "
        "AT MOST 3 of type \"friction\", ordered by importance (most consequential "
        "first). Return fewer when the evidence is thin; never pad. Each object:\n"
        "    name: noun phrase of 5 to 9 words naming the recurring pattern\n"
        "    type: 'reinforcement' or 'friction' (machine value, never used in prose)\n"
        "    description: 1-2 sentence explanation, concrete mechanisms\n"
        "    pathway: exactly one hedged sentence (\"could\", \"may\", \"worth a "
        "closer look\") pointing at a process, for example joint monitoring, "
        "boundary review, or indicator alignment, that could be a starting point "
        "for review. It may name documents; never ministries, agencies, or "
        "individual actors.\n"
        "    contributing_doc_pairs: array of doc-pair strings like 'FSS<->NBSAP'. "
        "MUST be drawn from doc pairs that actually appear in the input; never "
        "invent doc pairs. For \"friction\" themes the doc pairs MUST be disjoint "
        "across themes: assign each doc pair to the single friction theme that "
        "best explains it.\n"
        + anchor_line +
        "    confidence: low|medium|high\n"
        "  summary_paragraph: 3-4 sentence briefing-style paragraph a senior "
        "official reads first thing. Balanced across both sides. Hedged. No em "
        "dashes. No prescription.\n"
        "Return ONLY the JSON object."
    )


def build_user_prompt(
    country_name: str,
    syntheses: list[dict[str, Any]],
    evidence: dict[str, Any] | None = None,
) -> str:
    blocks = [_format_input_synthesis(r) for r in syntheses]
    body = "\n\n".join(blocks)
    parts = [
        f"COUNTRY: {country_name}",
        f"DOC-PAIR SYNTHESES ({len(syntheses)} total):\n\n{body}",
    ]
    if evidence is not None:
        parts.append(
            "EVIDENCE TABLES (deterministic, computed directly from the scored "
            "target pairs):\n\n" + _format_evidence_tables(evidence)
        )
    parts.append(_field_spec(with_evidence=evidence is not None))
    return "\n\n".join(parts)


REQUIRED_TOP_FIELDS = ("storylines", "summary_paragraph")
REQUIRED_STORYLINE_FIELDS = (
    "name", "type", "description", "pathway", "contributing_doc_pairs", "confidence",
)
VALID_TYPES = {"reinforcement", "friction"}


def parse_corpus(raw: str) -> dict[str, Any] | None:
    if not raw:
        return None
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    if not cleaned.startswith("{"):
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not m:
            return None
        cleaned = m.group(0)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.warning(f"synthesize_corpus: JSON decode failed: {e}")
        return None
    if not isinstance(data, dict):
        return None
    for k in REQUIRED_TOP_FIELDS:
        if k not in data:
            logger.warning(f"synthesize_corpus: missing top-level field: {k}")
    return data


# ---------------------------------------------------------------------------
# Doc-pair cite canonicalization (shared by validation and augmentation)
# ---------------------------------------------------------------------------


def _build_cite_resolver(
    doc_pair_records: list[dict[str, Any]],
) -> Callable[[str], dict[str, Any] | None]:
    """Resolve a cite string like 'FSS<->NBSAP' (or with human labels, any
    order, various separators) to its doc-pair record, or None.

    Human labels are accepted as aliases for ids ('Vision 2050' resolves to
    its underlying doc id). Ambiguous labels resolve to None so we never
    guess.
    """
    by_unordered_pair: dict[frozenset[str], dict[str, Any]] = {}
    term_to_doc_ids: dict[str, set[str]] = {}

    def _register(term: str | None, doc_id: str) -> None:
        if not term:
            return
        key = term.strip().casefold()
        if not key:
            return
        term_to_doc_ids.setdefault(key, set()).add(doc_id)

    for rec in doc_pair_records:
        by_unordered_pair[frozenset([rec["doc_a"], rec["doc_b"]])] = rec
        _register(rec.get("doc_a"), rec["doc_a"])
        _register(rec.get("doc_b"), rec["doc_b"])
        _register(rec.get("label_a"), rec["doc_a"])
        _register(rec.get("label_b"), rec["doc_b"])

    def _resolve_term(term: str) -> str | None:
        candidates = term_to_doc_ids.get(term.strip().casefold())
        if candidates and len(candidates) == 1:
            return next(iter(candidates))
        return None

    def resolve(cite: str) -> dict[str, Any] | None:
        if not isinstance(cite, str):
            return None
        parts = re.split(r"<->|↔|<-|->|/|,|\|", cite)
        parts = [p.strip() for p in parts if p.strip()]
        if len(parts) != 2:
            return None
        resolved_a = _resolve_term(parts[0])
        resolved_b = _resolve_term(parts[1])
        if not resolved_a or not resolved_b:
            return None
        return by_unordered_pair.get(frozenset([resolved_a, resolved_b]))

    return resolve


# ---------------------------------------------------------------------------
# Validation + enforcement
# ---------------------------------------------------------------------------


def _normalize_anchor(anchor: Any, allowed: set[str]) -> str | None:
    """Resolve an anchor cite to a bare allowed target id, or None.

    The evidence tables render ids with decoration ("NMP_52 (7 b)): 315
    pairs. ..."), and models tend to copy the whole visual line despite the
    verbatim-id instruction. The id is deterministically recoverable (ids are
    whitespace-free tokens), so accept it instead of burning a retry or
    dropping the anchor.
    """
    if not isinstance(anchor, str):
        return None
    stripped = anchor.strip()
    if stripped in allowed:
        return stripped
    tokens = stripped.split()
    if tokens:
        first = tokens[0].rstrip(":,;")
        if first in allowed:
            return first
    return None


def validate_corpus(
    parsed: dict[str, Any],
    evidence: dict[str, Any] | None,
    doc_pair_records: list[dict[str, Any]],
) -> list[str]:
    """Collect rule violations for the corrective retry. Does not mutate."""
    violations: list[str] = []
    storylines = parsed.get("storylines") or []

    by_type: Counter[str] = Counter()
    for s in storylines:
        by_type[s.get("type")] += 1
    for theme_type in VALID_TYPES:
        if by_type.get(theme_type, 0) > MAX_THEMES_PER_TYPE:
            violations.append(
                f"storylines: at most {MAX_THEMES_PER_TYPE} themes of type "
                f"'{theme_type}', got {by_type[theme_type]}"
            )
    for s in storylines:
        if s.get("type") not in VALID_TYPES:
            violations.append(
                f'theme "{s.get("name", "?")}": type must be '
                f"'reinforcement' or 'friction', got {s.get('type')!r}"
            )

    resolve = _build_cite_resolver(doc_pair_records)
    claimed: set[frozenset[str]] = set()
    for i, s in enumerate(storylines):
        label = f'theme {i + 1} ("{s.get("name", "?")}")'
        violations += check_theme_name(s.get("name"), field=f"{label} name")
        violations += check_prose(s.get("name"), f"{label} name")
        violations += check_prose(s.get("description"), f"{label} description")
        violations += check_pathway(s.get("pathway"), field=f"{label} pathway")
        violations += check_prose(s.get("pathway"), f"{label} pathway")

        if s.get("type") == "friction":
            for cite in s.get("contributing_doc_pairs") or []:
                rec = resolve(cite)
                if rec is None:
                    continue
                key = frozenset([rec["doc_a"], rec["doc_b"]])
                if key in claimed:
                    violations.append(
                        f"{label}: doc pair {rec['doc_a']}<->{rec['doc_b']} is "
                        f"already assigned to an earlier friction theme; friction "
                        f"doc pairs must be disjoint"
                    )
                else:
                    claimed.add(key)

        if evidence is not None:
            allowed = (
                evidence["allowed_friction_anchors"]
                if s.get("type") == "friction"
                else evidence["allowed_reinforcement_anchors"]
            )
            anchors = s.get("anchor_target_ids") or []
            bad = [a for a in anchors if _normalize_anchor(a, allowed) is None]
            if bad:
                violations.append(
                    f"{label}: anchor_target_ids must be bare target ids (for "
                    f"example the id before the parenthesis in the tables) from "
                    f"the polarity-matched evidence tables; not allowed: {bad}"
                )
            if len(anchors) > MAX_ANCHOR_TARGETS:
                violations.append(
                    f"{label}: at most {MAX_ANCHOR_TARGETS} anchor_target_ids, "
                    f"got {len(anchors)}"
                )

    violations += check_prose(parsed.get("summary_paragraph"), "summary_paragraph")
    return violations


def enforce_corpus_rules(
    parsed: dict[str, Any],
    evidence: dict[str, Any] | None,
    doc_pair_records: list[dict[str, Any]],
) -> list[str]:
    """Deterministically enforce structure after the corrective retry.

    Caps themes per type (keeping LLM order), makes friction doc pairs
    disjoint (first claim wins, emptied themes dropped), filters anchors to
    the polarity-matched allowed sets, and sanitizes all prose. Returns
    human-readable warnings describing every change made.
    """
    warnings: list[str] = []
    storylines = parsed.get("storylines") or []
    resolve = _build_cite_resolver(doc_pair_records)

    kept: list[dict[str, Any]] = []
    per_type: Counter[str] = Counter()
    claimed: set[frozenset[str]] = set()
    for s in storylines:
        name = s.get("name", "?")
        theme_type = s.get("type")
        if theme_type not in VALID_TYPES:
            warnings.append(f'dropped theme "{name}": unknown type {theme_type!r}')
            continue
        per_type[theme_type] += 1
        if per_type[theme_type] > MAX_THEMES_PER_TYPE:
            warnings.append(
                f'dropped theme "{name}": exceeds {MAX_THEMES_PER_TYPE} '
                f"{theme_type} themes"
            )
            continue

        if theme_type == "friction":
            cites = s.get("contributing_doc_pairs") or []
            kept_cites: list[str] = []
            had_resolved = False
            has_kept_resolved = False
            for cite in cites:
                rec = resolve(cite)
                if rec is None:
                    kept_cites.append(cite)  # augmentation reports it as unknown
                    continue
                had_resolved = True
                key = frozenset([rec["doc_a"], rec["doc_b"]])
                if key in claimed:
                    warnings.append(
                        f'theme "{name}": dropped doc pair '
                        f"{rec['doc_a']}<->{rec['doc_b']} already claimed by an "
                        f"earlier friction theme"
                    )
                    continue
                claimed.add(key)
                kept_cites.append(cite)
                has_kept_resolved = True
            s["contributing_doc_pairs"] = kept_cites
            if had_resolved and not has_kept_resolved:
                warnings.append(
                    f'dropped friction theme "{name}": every contributing doc '
                    f"pair was already claimed by an earlier friction theme"
                )
                continue

        if evidence is not None:
            allowed = (
                evidence["allowed_friction_anchors"]
                if theme_type == "friction"
                else evidence["allowed_reinforcement_anchors"]
            )
            anchors = s.get("anchor_target_ids") or []
            filtered: list[str] = []
            dropped: list[Any] = []
            for a in anchors:
                normalized = _normalize_anchor(a, allowed)
                if normalized is None:
                    dropped.append(a)
                elif normalized not in filtered:
                    filtered.append(normalized)
            if dropped:
                warnings.append(
                    f'theme "{name}": dropped anchor targets outside the allowed '
                    f"evidence set: {dropped}"
                )
            s["anchor_target_ids"] = filtered[:MAX_ANCHOR_TARGETS]

        kept.append(s)

    for s in kept:
        if isinstance(s.get("name"), str):
            s["name"] = sanitize_name(s["name"])
        for field in ("description", "pathway"):
            if isinstance(s.get(field), str):
                s[field] = sanitize_prose(s[field])
    if isinstance(parsed.get("summary_paragraph"), str):
        parsed["summary_paragraph"] = sanitize_prose(parsed["summary_paragraph"])

    parsed["storylines"] = kept
    return warnings


# ---------------------------------------------------------------------------
# Deterministic augmentation
# ---------------------------------------------------------------------------


def _augment_with_deterministic_counts(
    parsed: dict[str, Any],
    doc_pair_records: list[dict[str, Any]],
    targets: list[dict[str, Any]] | None = None,
    alignment: list[dict[str, Any]] | None = None,
    classifications: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Compute pair_count, unique documents, and per-theme aggregates from the
    contributing_doc_pairs claim, using the deterministic doc-pair counts.

    The LLM is never asked for a count. Friction themes claim disjoint doc
    pairs (enforced upstream), so each flagged link counts once under its
    dominant theme and friction pair_counts are exact and non-overlapping.
    Reinforcement pair_count keeps its coverage semantics: the aligned pairs
    inside the doc pairs the theme cites (doc pairs may repeat across
    reinforcement themes; the UI labels these counts as coverage, not as a
    partition).
    """
    resolve = _build_cite_resolver(doc_pair_records)

    # Optional per-theme aggregates need alignment records grouped by doc pair.
    records_by_doc_pair: dict[frozenset[str], list[dict[str, Any]]] = {}
    targets_by_id: dict[str, dict[str, Any]] = {}
    primary_by_target: dict[str, list[tuple[str, str]]] = {}
    if targets is not None and alignment is not None:
        targets_by_id = {t["id"]: t for t in targets}
        for r in alignment:
            level = r.get("alignment")
            if level not in FLAGGED_LEVELS and level not in ALIGNED_LEVELS:
                continue
            t_a = targets_by_id.get(r.get("targetAId"))
            t_b = targets_by_id.get(r.get("targetBId"))
            if not t_a or not t_b:
                continue
            if t_a["sourceDocument"] == t_b["sourceDocument"]:
                continue
            key = frozenset([t_a["sourceDocument"], t_b["sourceDocument"]])
            records_by_doc_pair.setdefault(key, []).append(r)
        for c in classifications or []:
            if not c.get("isPrimary"):
                continue
            taxonomy = c.get("taxonomyType")
            if taxonomy not in ACTIVE_TAXONOMIES:
                continue
            primary_by_target.setdefault(c.get("targetId"), []).append(
                (taxonomy, c.get("categoryId"))
            )

    for s in parsed.get("storylines", []) or []:
        cites = s.get("contributing_doc_pairs", []) or []
        pair_count = 0
        doc_union: set[str] = set()
        verified_pairs: list[str] = []
        unknown_pairs: list[str] = []
        member_keys: list[frozenset[str]] = []
        for cite in cites:
            rec = resolve(cite) if isinstance(cite, str) else None
            if rec is None:
                unknown_pairs.append(cite)
                continue
            verified_pairs.append(f"{rec['doc_a']}<->{rec['doc_b']}")
            doc_union.update([rec["doc_a"], rec["doc_b"]])
            member_keys.append(frozenset([rec["doc_a"], rec["doc_b"]]))
            if s.get("type") == "friction":
                pair_count += rec.get("flagged_count", 0)
            elif s.get("type") == "reinforcement":
                pair_count += rec.get("aligned_count", 0)
            else:
                pair_count += rec.get("aligned_count", 0) + rec.get("flagged_count", 0)
        # Dedupe verified_pairs while preserving order
        seen: set[str] = set()
        deduped: list[str] = []
        for p in verified_pairs:
            if p not in seen:
                seen.add(p)
                deduped.append(p)
        s["contributing_doc_pairs"] = deduped
        s["unknown_doc_pairs"] = unknown_pairs
        s["pair_count"] = pair_count
        s["spans_documents"] = sorted(doc_union)

        if targets is not None and alignment is not None:
            s["aggregates"] = _build_theme_aggregates(
                s.get("type"),
                set(member_keys),
                records_by_doc_pair,
                primary_by_target,
            )
    return parsed


def _build_theme_aggregates(
    theme_type: str | None,
    member_keys: set[frozenset[str]],
    records_by_doc_pair: dict[frozenset[str], list[dict[str, Any]]],
    primary_by_target: dict[str, list[tuple[str, str]]],
) -> dict[str, Any]:
    """Bounded per-theme breakdowns from the theme's doc-pair membership.

    Membership rule matches the drawer: friction themes own the flagged pairs
    of their doc pairs, reinforcement themes the medium/high pairs. Cross-doc
    only (records_by_doc_pair is built cross-doc).
    """
    wanted_levels = FLAGGED_LEVELS if theme_type == "friction" else ALIGNED_LEVELS
    doc_counter: Counter[str] = Counter()
    target_counter: Counter[str] = Counter()
    resource_counter: Counter[str] = Counter()
    mechanism_counter: Counter[str] = Counter()
    participating_targets: set[str] = set()
    total = 0

    for key in member_keys:
        for r in records_by_doc_pair.get(key, []):
            if r.get("alignment") not in wanted_levels:
                continue
            total += 1
            for d in key:
                doc_counter[d] += 1
            for tid in (r.get("targetAId"), r.get("targetBId")):
                if tid:
                    target_counter[tid] += 1
                    participating_targets.add(tid)
            if theme_type == "friction":
                mechanism_counter[r.get("mechanism") or "unspecified"] += 1
                for res in r.get("contestedResources") or []:
                    if isinstance(res, str) and res.strip():
                        resource_counter[res.strip().casefold()] += 1

    taxonomy_counters: dict[str, Counter[str]] = {}
    for tid in participating_targets:
        for taxonomy, category_id in primary_by_target.get(tid, []):
            taxonomy_counters.setdefault(taxonomy, Counter())[category_id] += 1
    sector_tags = [
        {"taxonomy": taxonomy, "category_id": category_id, "count": n}
        for taxonomy in sorted(taxonomy_counters)
        for category_id, n in taxonomy_counters[taxonomy].most_common(3)
    ]

    aggregates: dict[str, Any] = {
        "pair_total": total,
        "doc_shares": [
            {
                "doc": d,
                "count": n,
                "share": round(n / total, 4) if total else 0.0,
            }
            for d, n in doc_counter.most_common()
        ],
        "top_targets": [
            {"id": tid, "count": n} for tid, n in target_counter.most_common(6)
        ],
        "sector_tags": sector_tags,
    }
    if theme_type == "friction":
        aggregates["contested_resources"] = [
            {"resource": res, "count": n}
            for res, n in resource_counter.most_common(6)
        ]
        aggregates["mechanisms"] = dict(mechanism_counter.most_common())
    return aggregates


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------


async def synthesize_corpus(
    doc_pair_syntheses: list[dict[str, Any]],
    country_name: str,
    targets: list[dict[str, Any]] | None = None,
    alignment: list[dict[str, Any]] | None = None,
    classifications: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Produce one corpus-themes record for the country.

    `targets` and `alignment` should be pre-filtered to the visibility state
    being synthesized (see `filter_targets_alignment`); when provided they
    power the evidence tables in the prompt and the per-theme aggregates in
    the output. Without them the call still works (legacy mode: no tables,
    no aggregates).

    Returns the LLM JSON augmented with deterministic per-theme counts,
    `schema_version`, and `validation_warnings`.
    """
    # Only feed records that actually have a usable synthesis.
    valid = [r for r in doc_pair_syntheses if r.get("synthesis")]
    if not valid:
        logger.warning("synthesize_corpus: no doc-pair syntheses available")
        return {
            "storylines": [],
            "summary_paragraph": "No doc-pair syntheses available to compose corpus themes.",
            "doc_pair_count": 0,
            "schema_version": SCHEMA_VERSION,
        }

    evidence: dict[str, Any] | None = None
    if targets is not None and alignment is not None:
        evidence = build_evidence_tables(targets, alignment, valid)

    user = build_user_prompt(country_name, valid, evidence)
    raw = await call_llm(SYSTEM_PROMPT, user, cache_namespace=CACHE_NAMESPACE)
    parsed = parse_corpus(raw)
    violations = (
        validate_corpus(parsed, evidence, valid)
        if parsed is not None
        else ["response was not a valid JSON object"]
    )

    if violations:
        logger.warning(
            f"synthesize_corpus: {len(violations)} rule violation(s); "
            f"issuing one corrective retry. First: {violations[0]}"
        )
        retry_user = user + corrections_block(violations, limit=MAX_CORRECTIONS_IN_RETRY)
        retry_raw = await call_llm(
            SYSTEM_PROMPT, retry_user, cache_namespace=CACHE_NAMESPACE
        )
        retry_parsed = parse_corpus(retry_raw)
        if retry_parsed is not None:
            retry_violations = validate_corpus(retry_parsed, evidence, valid)
            if parsed is None or len(retry_violations) <= len(violations):
                parsed = retry_parsed
                violations = retry_violations

    if parsed is None:
        return {
            "storylines": [],
            "summary_paragraph": "Synthesis failed to parse.",
            "doc_pair_count": len(valid),
            "schema_version": SCHEMA_VERSION,
            "parse_error": True,
        }

    warnings = enforce_corpus_rules(parsed, evidence, valid)
    if violations:
        warnings += [f"style (auto-sanitized after retry): {v}" for v in violations]

    parsed["doc_pair_count"] = len(valid)
    parsed = _augment_with_deterministic_counts(
        parsed, valid, targets=targets, alignment=alignment,
        classifications=classifications,
    )
    parsed["schema_version"] = SCHEMA_VERSION
    parsed["validation_warnings"] = warnings
    return parsed


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _load_country_inputs(
    country: str,
) -> tuple[
    list[dict[str, Any]] | None,
    list[dict[str, Any]] | None,
    list[dict[str, Any]] | None,
]:
    """Targets / alignment / classifications from disk for evidence tables.

    Any missing file degrades gracefully to legacy mode (None, None, None):
    the corpus prompt simply carries no evidence tables.
    """
    targets_path = DATA_DIR / f"{country}-targets.json"
    align_path = OUTPUT_DIR / country / "alignment.json"
    cls_path = OUTPUT_DIR / country / "classifications.json"
    if not targets_path.exists() or not align_path.exists():
        logger.warning(
            f"synthesize_corpus: no targets/alignment on disk for {country}; "
            f"running without evidence tables"
        )
        return None, None, None
    targets = json.loads(targets_path.read_text())
    alignment = json.loads(align_path.read_text())
    classifications = (
        json.loads(cls_path.read_text()) if cls_path.exists() else None
    )
    return targets, alignment, classifications


async def _cli_run(country: str, hidden_key: str = "") -> None:
    out_dir = OUTPUT_DIR / country
    in_path = out_dir / "doc_pair_synthesis.json"
    if not in_path.exists():
        raise SystemExit(
            f"Missing {in_path}. Run synthesize_doc_pairs first."
        )
    config_path = DATA_DIR / f"{country}-country-config.json"
    country_name = country.capitalize()
    if config_path.exists():
        config = json.loads(config_path.read_text())
        country_name = config.get("name", country_name)

    syntheses = json.loads(in_path.read_text())
    targets, alignment, classifications = _load_country_inputs(country)

    # `--hidden` mode: regenerate corpus themes for an off-path document subset
    # on demand (used by the /api/storyline-state route). Filter the doc-pair
    # syntheses to the visible set, emit ONLY JSON on stdout, and do NOT
    # overwrite corpus_themes.json (which holds the precomputed states). Hits
    # and populates the same .cache/corpus_themes namespace, so each subset is
    # an LLM call at most once.
    hidden = {h for h in hidden_key.split("+") if h}
    if hidden:
        syntheses = filter_doc_pair_records(syntheses, hidden)
        if targets is not None and alignment is not None:
            targets, alignment = filter_targets_alignment(targets, alignment, hidden)
        logger.info(
            f"Synthesising corpus themes for {country_name}, hidden="
            f"{canonical_hidden_key(hidden)}: {len(syntheses)} doc-pair "
            f"syntheses after filter"
        )
        result = await synthesize_corpus(
            syntheses, country_name,
            targets=targets, alignment=alignment, classifications=classifications,
        )
        print(json.dumps(result, ensure_ascii=False))
        return

    logger.info(
        f"Synthesising corpus themes for {country_name}: "
        f"{len(syntheses)} doc-pair syntheses as input"
    )

    result = await synthesize_corpus(
        syntheses, country_name,
        targets=targets, alignment=alignment, classifications=classifications,
    )

    out_path = out_dir / "corpus_themes.json"
    out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    logger.info(f"Wrote corpus themes to {out_path}")

    print()
    print("=" * 78)
    print(f"CORPUS THEMES  ({country_name})")
    print("=" * 78)
    print(f"\nSummary paragraph:\n{result.get('summary_paragraph', '?')}\n")
    for s in result.get("storylines", []) or []:
        ds = ", ".join(s.get("spans_documents", []))
        print(f"[{s.get('type', '?'):<13}] {s.get('name', '?')}")
        print(f"  {s.get('description', '?')}")
        if s.get("pathway"):
            print(f"  pathway: {s['pathway']}")
        if s.get("anchor_target_ids"):
            print(f"  anchors: {', '.join(s['anchor_target_ids'])}")
        print(f"  spans {len(s.get('spans_documents', []))} docs ({ds}); "
              f"~{s.get('pair_count', 0)} contributing pairs; conf={s.get('confidence', '?')}")
        if s.get("unknown_doc_pairs"):
            print(f"  WARN: unverifiable cites: {s['unknown_doc_pairs']}")
        print()
    for w in result.get("validation_warnings", []) or []:
        print(f"WARN: {w}")


def _cli() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    p = argparse.ArgumentParser(description="Run corpus theme synthesis for one country")
    p.add_argument("--country", required=True, help="Country slug")
    p.add_argument(
        "--hidden",
        default="",
        help=(
            "Canonical hidden-doc key (e.g. 'ENR' or 'HR+PEG'). When set, "
            "regenerate themes for that visible subset and print JSON to "
            "stdout without writing corpus_themes.json."
        ),
    )
    args = p.parse_args()
    asyncio.run(_cli_run(args.country, args.hidden))


if __name__ == "__main__":
    _cli()
