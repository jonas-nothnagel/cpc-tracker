"""Cross-model alignment analyzer.

Reads per-model alignment outputs under ``python/output/{country}/{model}/``
and emits ``python/output/{country}/_model_comparison.json`` describing how
the models differ from each other (no model treated as ground truth):

- Label distributions per model (the "detection personality")
- Pairwise agreement + Cohen's κ across all model pairs (descriptive only)
- Flagging overlap — pairs flagged by exactly 1 / 2 / 3 / 4 models
- Unique signal per model — top-N pairs only that model flagged
- Top-N most-contested pairs with every model's label and rationale
- Flagged-pair mechanism distribution per model
- Rationale character proxies (length, numeric citations, doc citations)
- Cost / footprint summary lifted from each model's ``status.json``
- Vocabulary compliance counts (banned ``tension`` / ``contradiction`` words)
- (optional, ``--with-judge``) LLM-judged rationale comparison on a sample
  of disagreement pairs, with anonymized model identities

Usage::

    uv run python -m src.analyze_model_comparison --country mongolia
    uv run python -m src.analyze_model_comparison --country mongolia --with-judge

The dashboard's ``/{locale}/mongolia/model-comparison`` page reads the
resulting JSON via ``src/lib/dashboard-data.ts:loadModelComparison``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from .compare_alignments import index_by_pair
from .config import OUTPUT_DIR

ALIGNMENT_LEVELS: list[str] = ["none", "low", "medium", "high", "flagged"]

# Mirror src/lib/dashboard-data.ts:PREFERRED_DEFAULT_SLUGS — flagship-first.
PREFERRED_DEFAULT_SLUGS: list[str] = ["gpt-5-4", "gpt-5-5"]

_MODEL_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
_TENSION_RE = re.compile(r"\btension[a-z]*", re.IGNORECASE)
_CONTRADICTION_RE = re.compile(r"\bcontradict[a-z]*", re.IGNORECASE)

# Ordinal mapping used to break ties when ranking disagreement spread.
# Flagged sits off-axis: we treat it as a 5th category whose distance to
# any ordinal label is one full step beyond the high end, so a (none,
# flagged) split ranks above a (low, high) split.
_ORDINAL_MAP: dict[str, float] = {
    "none": 0.0,
    "low": 1.0,
    "medium": 2.0,
    "high": 3.0,
    "flagged": 4.0,
}


def list_model_slugs(country_dir: Path) -> list[str]:
    """Enumerate per-model output dirs.

    Mirrors ``src/lib/dashboard-data.ts:listAvailableModels`` so the Python
    artifact uses the same model ordering the UI does (flagship-first when
    one of ``PREFERRED_DEFAULT_SLUGS`` exists, alphabetical otherwise).
    """
    if not country_dir.exists():
        return []
    found = sorted(
        d.name
        for d in country_dir.iterdir()
        if d.is_dir()
        and _MODEL_SLUG_RE.match(d.name)
        and (d / "alignment.json").exists()
    )
    for preferred in PREFERRED_DEFAULT_SLUGS:
        if preferred in found:
            return [preferred] + [s for s in found if s != preferred]
    return found


def load_model_alignment(
    country_dir: Path, slug: str
) -> dict[tuple[str, str], dict[str, Any]]:
    """Read one model's alignment.json and index by canonical pair key."""
    raw = json.loads((country_dir / slug / "alignment.json").read_text())
    return index_by_pair(raw)


def _label_counts(idx: dict[tuple[str, str], dict[str, Any]]) -> dict[str, int]:
    counts = Counter(r.get("alignment") for r in idx.values())
    return {lvl: counts.get(lvl, 0) for lvl in ALIGNMENT_LEVELS}


def agreement_rate(
    idx_a: dict[tuple[str, str], dict[str, Any]],
    idx_b: dict[tuple[str, str], dict[str, Any]],
    common_keys: set[tuple[str, str]],
) -> float:
    """Fraction of common pairs where both models assigned the same label."""
    if not common_keys:
        return 0.0
    n_same = sum(
        1
        for k in common_keys
        if idx_a[k].get("alignment") == idx_b[k].get("alignment")
    )
    return n_same / len(common_keys)


def cohens_kappa(
    idx_a: dict[tuple[str, str], dict[str, Any]],
    idx_b: dict[tuple[str, str], dict[str, Any]],
    common_keys: set[tuple[str, str]],
) -> float:
    """Cohen's κ — chance-adjusted agreement.

    κ = (p_o − p_e) / (1 − p_e), where p_o is observed agreement and p_e is
    the agreement expected from each rater's marginal distribution. Hand-
    rolled (not sklearn) so the pipeline doesn't grow a heavy dep.
    """
    n = len(common_keys)
    if n == 0:
        return 0.0
    p_o = agreement_rate(idx_a, idx_b, common_keys)
    counts_a = Counter(idx_a[k].get("alignment") for k in common_keys)
    counts_b = Counter(idx_b[k].get("alignment") for k in common_keys)
    p_e = sum(
        (counts_a.get(lvl, 0) / n) * (counts_b.get(lvl, 0) / n)
        for lvl in ALIGNMENT_LEVELS
    )
    if p_e >= 1.0:
        return 1.0
    return (p_o - p_e) / (1.0 - p_e)


def confusion_matrix(
    idx_ref: dict[tuple[str, str], dict[str, Any]],
    idx_other: dict[tuple[str, str], dict[str, Any]],
    common_keys: set[tuple[str, str]],
) -> list[list[int]]:
    """Confusion grid where rows = reference label, cols = challenger label.

    Returned as a 5×5 integer matrix in ``ALIGNMENT_LEVELS`` order so the
    frontend can render it directly without resolving label names.
    """
    n = len(ALIGNMENT_LEVELS)
    mat = [[0] * n for _ in range(n)]
    idx_of = {lvl: i for i, lvl in enumerate(ALIGNMENT_LEVELS)}
    for k in common_keys:
        ref_lvl = idx_ref[k].get("alignment")
        oth_lvl = idx_other[k].get("alignment")
        if ref_lvl in idx_of and oth_lvl in idx_of:
            mat[idx_of[ref_lvl]][idx_of[oth_lvl]] += 1
    return mat


def consensus_label(
    labels_by_model: dict[str, str], flagship_slug: str
) -> str:
    """Majority vote across models with flagship tiebreak.

    When the vote ties between two or more labels, prefer whichever label
    the flagship picked so the synthetic baseline never disagrees with the
    production model in a tied case. If the flagship's label isn't among
    the tied labels (rare; only when an even number of models tie *against*
    the flagship), fall back to the lexicographically smallest label for
    determinism.
    """
    counter = Counter(labels_by_model.values())
    max_count = max(counter.values())
    winners = [lvl for lvl, c in counter.items() if c == max_count]
    if len(winners) == 1:
        return winners[0]
    flagship_label = labels_by_model.get(flagship_slug)
    if flagship_label in winners:
        return flagship_label
    return sorted(winners)[0]


def bias_signature(
    idx: dict[tuple[str, str], dict[str, Any]],
    consensus: dict[tuple[str, str], str],
) -> dict[str, int]:
    """Per-label signed delta: count(model_label) − count(consensus_label).

    Positive = model assigns this label MORE often than consensus does.
    """
    model_counts = Counter(idx[k].get("alignment") for k in consensus)
    consensus_counts = Counter(consensus.values())
    return {
        lvl: model_counts.get(lvl, 0) - consensus_counts.get(lvl, 0)
        for lvl in ALIGNMENT_LEVELS
    }


def _disagreement_score(labels: dict[str, str]) -> tuple[int, float]:
    """Score a pair's disagreement.

    Primary sort: number of distinct labels assigned across models (more
    distinct = more contested). Tiebreak: ordinal spread (max − min on the
    ordinal map, treating flagged as a 5th rung beyond high).
    """
    distinct = len(set(labels.values()))
    vals = [_ORDINAL_MAP.get(lbl, 0.0) for lbl in labels.values()]
    spread = max(vals) - min(vals) if vals else 0.0
    return (distinct, spread)


def top_disagreement_pairs(
    all_idx: dict[str, dict[tuple[str, str], dict[str, Any]]],
    common_keys: set[tuple[str, str]],
    top_n: int = 50,
) -> list[dict[str, Any]]:
    """The N most-contested pairs with each model's label + rationale inline.

    Filters out perfect-consensus pairs (only one distinct label). Sorted
    descending by (distinctLabelCount, ordinalSpread) so the front of the
    list is "everyone disagrees" and the back is "only a slight 3-way split."
    """
    scored: list[tuple[tuple[str, str], tuple[int, float]]] = []
    for k in common_keys:
        labels = {slug: idx[k].get("alignment") for slug, idx in all_idx.items()}
        if len(set(labels.values())) < 2:
            continue
        scored.append((k, _disagreement_score(labels)))
    scored.sort(key=lambda x: x[1], reverse=True)
    return [_row_from_pair(all_idx, key) for key, _score in scored[:top_n]]


def mechanism_distribution(
    idx: dict[tuple[str, str], dict[str, Any]],
) -> dict[str, int]:
    """For each flagged record, count the mechanism assigned (or 'unspecified')."""
    c: Counter[str] = Counter()
    for r in idx.values():
        if r.get("alignment") == "flagged":
            c[r.get("mechanism") or "unspecified"] += 1
    return dict(c)


def vocab_compliance(
    idx: dict[tuple[str, str], dict[str, Any]],
) -> dict[str, Any]:
    """Banned-vocabulary audit per CLAUDE.md alignment guardrails.

    Counts word occurrences AND the number of records that contain at
    least one banned word. The rate is per-record (not per-word) because
    one record using 'tension' five times is qualitatively similar to
    one record using it once for guardrail purposes.
    """
    n = len(idx)
    tension_hits = 0
    contradiction_hits = 0
    pairs_with_violation = 0
    for r in idx.values():
        desc = r.get("description", "") or ""
        t = len(_TENSION_RE.findall(desc))
        c = len(_CONTRADICTION_RE.findall(desc))
        tension_hits += t
        contradiction_hits += c
        if t + c > 0:
            pairs_with_violation += 1
    return {
        "tensionWordHits": tension_hits,
        "contradictionWordHits": contradiction_hits,
        "pairsWithViolation": pairs_with_violation,
        "violationRate": (pairs_with_violation / n) if n else 0.0,
    }


def flagging_overlap(
    all_idx: dict[str, dict[tuple[str, str], dict[str, Any]]],
    common_keys: set[tuple[str, str]],
) -> dict[str, Any]:
    """Bucket pairs by how many models flagged them.

    For the union of all flagged pair-keys across all models, count pairs
    flagged by exactly 1 / 2 / … / N models. The consensus bucket (all N
    models flagged) is the highest-confidence concern; the 1-model bucket
    is each model's distinctive read on a pair the others didn't see as
    contested.
    """
    n_models = len(all_idx)
    counts = [0] * (n_models + 1)
    for k in common_keys:
        n_flagged = sum(
            1 for idx in all_idx.values() if idx[k].get("alignment") == "flagged"
        )
        if 1 <= n_flagged <= n_models:
            counts[n_flagged] += 1
    return {
        "flaggedByCount": {str(i): counts[i] for i in range(1, n_models + 1)},
        "consensusFlaggedCount": counts[n_models],
        "unionFlaggedCount": sum(counts[1:]),
    }


def unique_signal(
    all_idx: dict[str, dict[tuple[str, str], dict[str, Any]]],
    slug: str,
    common_keys: set[tuple[str, str]],
    top_n: int = 20,
) -> list[dict[str, Any]]:
    """Top-N pairs that ``slug`` flagged and no other model did.

    Ranked by the average ordinal of the *other* models' labels — lowest
    average first, so the head of the list is "this model flags, everyone
    else says none/low" (the most distinctive reads). Output shape mirrors
    ``top_disagreement_pairs`` so the same frontend row component renders
    both lists.
    """
    candidates: list[tuple[tuple[str, str], float]] = []
    other_slugs = [s for s in all_idx if s != slug]
    for k in common_keys:
        if all_idx[slug][k].get("alignment") != "flagged":
            continue
        other_labels = [all_idx[s][k].get("alignment") for s in other_slugs]
        if any(lbl == "flagged" for lbl in other_labels):
            continue
        ordinals = [_ORDINAL_MAP.get(lbl, 0.0) for lbl in other_labels if lbl in _ORDINAL_MAP]
        mean_other = (sum(ordinals) / len(ordinals)) if ordinals else 0.0
        candidates.append((k, mean_other))
    candidates.sort(key=lambda x: (x[1], x[0]))
    return [_row_from_pair(all_idx, key) for key, _mean_other in candidates[:top_n]]


def _build_doc_marker_regex(
    common_keys: set[tuple[str, str]],
) -> re.Pattern[str] | None:
    """Build a regex matching the uppercase prefixes observed in target IDs.

    Mongolia target IDs are shaped like ``FSS_1``, ``ILDN_3``, ``NDC_5``;
    Panama uses ``BTR_<n>`` etc. The prefix is the strongest in-rationale
    signal that the model is actually pointing at a specific source target,
    so we use the set of observed prefixes as the document-citation
    dictionary. Returns ``None`` if no prefixes can be extracted.
    """
    prefix_re = re.compile(r"^([A-Z]{2,})")
    prefixes: set[str] = set()
    for pair in common_keys:
        for tid in pair:
            m = prefix_re.match(tid)
            if m:
                prefixes.add(m.group(1))
    if not prefixes:
        return None
    # Sort by length descending so longer prefixes match before shorter
    # ones (e.g., ILDN before any hypothetical IL prefix).
    pattern = r"\b(" + "|".join(sorted(prefixes, key=len, reverse=True)) + r")\b"
    return re.compile(pattern)


def rationale_character(
    idx: dict[tuple[str, str], dict[str, Any]],
    doc_marker_re: re.Pattern[str] | None,
) -> dict[str, float]:
    """Cheap proxies for "how is this model writing its rationales?"

    - ``avgWords`` / ``medianWords`` over whitespace-split tokens
    - ``pctNumeric`` — fraction of rationales containing any digit
    - ``pctPolicyCitation`` — fraction matching one of the observed
      target-ID prefixes (see ``_build_doc_marker_regex``)
    """
    descriptions = [r.get("description", "") or "" for r in idx.values()]
    n = len(descriptions)
    if n == 0:
        return {
            "avgWords": 0.0,
            "medianWords": 0.0,
            "pctNumeric": 0.0,
            "pctPolicyCitation": 0.0,
        }
    word_counts = sorted(len(d.split()) for d in descriptions)
    avg = sum(word_counts) / n
    if n % 2:
        median = float(word_counts[n // 2])
    else:
        median = (word_counts[n // 2 - 1] + word_counts[n // 2]) / 2.0
    numeric_count = sum(1 for d in descriptions if re.search(r"\d", d))
    citation_count = (
        sum(1 for d in descriptions if doc_marker_re.search(d))
        if doc_marker_re is not None
        else 0
    )
    return {
        "avgWords": round(avg, 1),
        "medianWords": round(median, 1),
        "pctNumeric": round(numeric_count / n, 3),
        "pctPolicyCitation": round(citation_count / n, 3),
    }


def _seeded_sample(
    pool: list[tuple[str, str]], seed_key: str, k: int
) -> list[tuple[str, str]]:
    """Deterministically sample up to ``k`` items from ``pool``.

    Seed = first 16 hex digits of SHA-256(seed_key) interpreted as int.
    Sorts the pool first so the sample is invariant to pool insertion
    order (sets/dicts don't preserve order across Python invocations).
    Returns the original tuples in selection order so the per-pair record
    builder upstream sees a stable sequence.
    """
    if k <= 0 or not pool:
        return []
    sorted_pool = sorted(pool)
    seed = int(hashlib.sha256(seed_key.encode()).hexdigest()[:16], 16)
    rng = random.Random(seed)
    return rng.sample(sorted_pool, k=min(k, len(sorted_pool)))


def _row_from_pair(
    all_idx: dict[str, dict[tuple[str, str], dict[str, Any]]],
    key: tuple[str, str],
) -> dict[str, Any]:
    """Build a ``ModelDisagreementRow``-shaped dict for one pair.

    Attaches ``flagDetails[slug]`` for any model whose record on this pair
    has ``alignment == "flagged"`` — pulls the mechanism / manageability /
    confidence / contestedResources fields that the alignment schema only
    populates on the flagged side. Non-flagged models are absent from
    ``flagDetails``.
    """
    labels: dict[str, str] = {}
    descriptions: dict[str, str] = {}
    flag_details: dict[str, dict[str, Any]] = {}
    for slug, idx in all_idx.items():
        rec = idx[key]
        labels[slug] = rec.get("alignment", "")
        descriptions[slug] = rec.get("description", "") or ""
        if rec.get("alignment") == "flagged":
            flag_details[slug] = {
                "mechanism": rec.get("mechanism") or "unspecified",
                "manageability": rec.get("manageability") or "unknown",
                "confidence": rec.get("confidence") or "unknown",
                "contestedResources": list(rec.get("contestedResources") or []),
            }
    distinct = len(set(labels.values()))
    vals = [_ORDINAL_MAP.get(lbl, 0.0) for lbl in labels.values()]
    spread = max(vals) - min(vals) if vals else 0.0
    return {
        "targetAId": key[0],
        "targetBId": key[1],
        "labels": labels,
        "descriptions": descriptions,
        "flagDetails": flag_details,
        "distinctLabelCount": distinct,
        "ordinalSpread": round(spread, 3),
    }


def _load_target_map(country: str) -> dict[str, dict[str, Any]]:
    """Load the country's targets file and index by target ID.

    Returns ``{id → {id, text, sourceDocument, sourceLabel, activities?}}``.
    Path convention: ``python/data/{country}-targets.json`` (matches what
    ``run_analysis.py --targets-file`` produces by default). Returns an
    empty dict when the file is missing or unreadable — the UI degrades
    gracefully to showing only target IDs.
    """
    candidates = [
        Path(__file__).resolve().parent.parent / "data" / f"{country}-targets.json",
        Path(__file__).resolve().parent.parent / "data" / "targets.json",
    ]
    for path in candidates:
        if not path.exists():
            continue
        try:
            raw = json.loads(path.read_text())
        except Exception:
            continue
        if not isinstance(raw, list):
            continue
        out: dict[str, dict[str, Any]] = {}
        for t in raw:
            if not isinstance(t, dict) or "id" not in t:
                continue
            out[t["id"]] = {
                "id": t["id"],
                "text": t.get("text", "") or "",
                "sourceDocument": t.get("sourceDocument") or "",
                "sourceLabel": t.get("sourceLabel") or "",
                # ``activities`` carries concrete implementation actions —
                # often the most decision-relevant context for a reviewer.
                # Kept when present so the UI can surface it next to the
                # target text.
                **(
                    {"activities": t["activities"]}
                    if isinstance(t.get("activities"), str) and t["activities"].strip()
                    else {}
                ),
            }
        return out
    return {}


def unique_signal_random_sample(
    all_idx: dict[str, dict[tuple[str, str], dict[str, Any]]],
    slug: str,
    common_keys: set[tuple[str, str]],
    country: str,
    k: int = 30,
) -> tuple[list[dict[str, Any]], int]:
    """Random sample from a model's FULL solo-flag set (not just top-N).

    Returns ``(sample_rows, total_solo_flag_count)``. The sample is drawn
    deterministically from every pair where ``slug`` flagged and no other
    model did — so reruns of the analyzer produce the same sample, which
    is necessary for human ratings to remain meaningful across analyses.
    """
    other_slugs = [s for s in all_idx if s != slug]
    solo_keys: list[tuple[str, str]] = []
    for k_pair in common_keys:
        if all_idx[slug][k_pair].get("alignment") != "flagged":
            continue
        other_labels = [all_idx[s][k_pair].get("alignment") for s in other_slugs]
        if any(lbl == "flagged" for lbl in other_labels):
            continue
        solo_keys.append(k_pair)
    sampled = _seeded_sample(solo_keys, f"{country}|unique|{slug}", k)
    return [_row_from_pair(all_idx, key) for key in sampled], len(solo_keys)


def consensus_flagged_random_sample(
    all_idx: dict[str, dict[tuple[str, str], dict[str, Any]]],
    common_keys: set[tuple[str, str]],
    country: str,
    k: int = 30,
) -> list[dict[str, Any]]:
    """Random sample from the set of pairs every model flagged.

    Deterministic by country (same seed key across reruns).
    """
    consensus_keys: list[tuple[str, str]] = []
    for k_pair in common_keys:
        if all(
            idx[k_pair].get("alignment") == "flagged" for idx in all_idx.values()
        ):
            consensus_keys.append(k_pair)
    sampled = _seeded_sample(consensus_keys, f"{country}|consensus", k)
    return [_row_from_pair(all_idx, key) for key in sampled]


def prompt_version(country_dir: Path, slug: str) -> str | None:
    """Advisor-prompt revision recorded in the model's status.json (None if the
    run predates provenance stamping)."""
    status_path = country_dir / slug / "status.json"
    if not status_path.exists():
        return None
    try:
        return json.loads(status_path.read_text()).get("promptVersion")
    except Exception:
        return None


def cost_summary(country_dir: Path, slug: str) -> dict[str, Any]:
    """Pull headline cost + footprint figures from the model's status.json."""
    status_path = country_dir / slug / "status.json"
    if not status_path.exists():
        return {}
    try:
        status = json.loads(status_path.read_text())
    except Exception:
        return {}
    summary = status.get("summary", {}) or {}
    footprint = status.get("footprint", {}) or {}
    return {
        "elapsedSeconds": summary.get("elapsedSeconds"),
        "callCount": footprint.get("call_count"),
        "trackedCallCount": footprint.get("tracked_call_count"),
        "estimatedCallCount": footprint.get("estimated_call_count"),
        "cachedCallCount": footprint.get("cached_call_count"),
        "energyWh": footprint.get("energy_wh"),
        "waterMl": footprint.get("water_ml"),
        "co2Geq": footprint.get("co2_geq"),
        "footprintSource": footprint.get("source"),
    }


def analyze(
    country: str,
    base_dir: Path,
    evaluation_sample_size: int = 30,
) -> dict[str, Any]:
    """Compute the full cross-model comparison report for one country."""
    country_dir = base_dir / country
    slugs = list_model_slugs(country_dir)
    if not slugs:
        raise RuntimeError(
            f"No model subdirs with alignment.json found under {country_dir}"
        )
    if len(slugs) < 2:
        raise RuntimeError(
            f"Only one model dir present ({slugs[0]}); comparison needs ≥2"
        )
    flagship = slugs[0]

    all_idx: dict[str, dict[tuple[str, str], dict[str, Any]]] = {
        slug: load_model_alignment(country_dir, slug) for slug in slugs
    }
    # Pairs every model evaluated. If a model dropped some pairs (timeout,
    # parse failure) the intersection silently shrinks; the missingPairs
    # field below surfaces that loss so reviewers can see it.
    common_keys = set.intersection(*(set(idx.keys()) for idx in all_idx.values()))
    missing_pairs = {
        slug: sorted(set(idx.keys()) - common_keys)[:20]
        for slug, idx in all_idx.items()
    }

    distributions = {slug: _label_counts(idx) for slug, idx in all_idx.items()}

    agreement_matrix = {
        slug_a: {
            slug_b: agreement_rate(all_idx[slug_a], all_idx[slug_b], common_keys)
            for slug_b in slugs
        }
        for slug_a in slugs
    }

    kappa_matrix = {
        slug_a: {
            slug_b: cohens_kappa(all_idx[slug_a], all_idx[slug_b], common_keys)
            for slug_b in slugs
        }
        for slug_a in slugs
    }

    overlap = flagging_overlap(all_idx, common_keys)

    unique = {
        slug: unique_signal(all_idx, slug, common_keys, top_n=20)
        for slug in slugs
    }

    unique_random: dict[str, list[dict[str, Any]]] = {}
    unique_total: dict[str, int] = {}
    for slug in slugs:
        sample_rows, total = unique_signal_random_sample(
            all_idx, slug, common_keys, country, k=evaluation_sample_size
        )
        unique_random[slug] = sample_rows
        unique_total[slug] = total

    consensus_sample = consensus_flagged_random_sample(
        all_idx, common_keys, country, k=evaluation_sample_size
    )

    disagreements = top_disagreement_pairs(all_idx, common_keys, top_n=50)

    mechanisms = {slug: mechanism_distribution(idx) for slug, idx in all_idx.items()}

    doc_marker_re = _build_doc_marker_regex(common_keys)
    rationale_char = {
        slug: rationale_character(idx, doc_marker_re) for slug, idx in all_idx.items()
    }

    costs = {slug: cost_summary(country_dir, slug) for slug in slugs}

    prompt_versions = {slug: prompt_version(country_dir, slug) for slug in slugs}
    if len(set(prompt_versions.values())) > 1:
        # Agreement/kappa across different advisor-prompt revisions measures the
        # prompt diff, not the models. Surface loudly; the artifact still emits
        # so the mix is inspectable, but it must not ship as a comparison.
        print(
            "WARNING: models were run with different advisor-prompt versions "
            f"({prompt_versions}); cross-model agreement stats are NOT comparable. "
            "Re-run the outdated models before using this artifact."
        )

    vocab = {slug: vocab_compliance(idx) for slug, idx in all_idx.items()}

    # Collect target IDs that appear in any row set, then emit a small map
    # of their text + source-document metadata so the UI can render the
    # actual statements alongside model rationales. Missing IDs fall
    # through to "ID only" rendering — the UI doesn't break on absence.
    target_map = _load_target_map(country)
    used_target_ids: set[str] = set()
    for row in disagreements:
        used_target_ids.update((row["targetAId"], row["targetBId"]))
    for slug_rows in unique.values():
        for row in slug_rows:
            used_target_ids.update((row["targetAId"], row["targetBId"]))
    for slug_rows in unique_random.values():
        for row in slug_rows:
            used_target_ids.update((row["targetAId"], row["targetBId"]))
    for row in consensus_sample:
        used_target_ids.update((row["targetAId"], row["targetBId"]))
    targets_emit = {
        tid: target_map[tid] for tid in used_target_ids if tid in target_map
    }

    return {
        "country": country,
        "models": slugs,
        "targets": targets_emit,
        # `flagship` is the production reference for ordering and pricing
        # heuristics; the analysis does NOT treat it as ground truth.
        "flagship": flagship,
        "alignmentLevels": ALIGNMENT_LEVELS,
        "pairCount": len(common_keys),
        "missingPairs": missing_pairs,
        "distributions": distributions,
        "agreementMatrix": agreement_matrix,
        "kappaMatrix": kappa_matrix,
        "flaggingOverlap": overlap,
        "uniqueSignal": unique,
        "uniqueSignalRandomSample": unique_random,
        "uniqueSignalTotal": unique_total,
        "consensusFlaggedRandomSample": consensus_sample,
        "disagreements": disagreements,
        "mechanisms": mechanisms,
        "rationaleCharacter": rationale_char,
        "costs": costs,
        "promptVersions": prompt_versions,
        "vocabCompliance": vocab,
        # Judge fields are populated by main() when --with-judge is passed.
        "judgeModel": None,
        "judgeSampleSize": None,
        "judgeAggregates": None,
        "judgeVerdicts": None,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Cross-model alignment analysis")
    ap.add_argument(
        "--country",
        required=True,
        help="Country slug, e.g. mongolia or panama. Reads from "
        "python/output/{country}/{model}/alignment.json.",
    )
    ap.add_argument(
        "--with-judge",
        action="store_true",
        help="Also run the LLM-judged rationale comparison on a sample of "
        "disagreement pairs. Off by default because the judge issues real "
        "LLM calls.",
    )
    ap.add_argument(
        "--judge-sample-size",
        type=int,
        default=30,
        help="Number of top-disagreement pairs to send to the judge "
        "(default 30). Only used with --with-judge.",
    )
    ap.add_argument(
        "--evaluation-sample-size",
        type=int,
        default=30,
        help="Size of the random evaluation samples (unique-signal and "
        "consensus). Deterministically seeded by country so reruns "
        "produce the same sample; ratings persist across reruns.",
    )
    args = ap.parse_args()

    report = analyze(
        args.country,
        OUTPUT_DIR,
        evaluation_sample_size=args.evaluation_sample_size,
    )

    if args.with_judge:
        # Imported lazily so the cheap path (no judge) doesn't depend on the
        # async LLM client or its dotenv side effects.
        import asyncio

        from .judge_rationales import run_judge

        judge_result = asyncio.run(
            run_judge(
                report["disagreements"],
                sample_size=args.judge_sample_size,
            )
        )
        report.update(judge_result)

    out_path = OUTPUT_DIR / args.country / "_model_comparison.json"
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    print(f"Wrote {out_path}")
    print(f"  Models compared: {report['models']}")
    print(f"  Common pairs:    {report['pairCount']}")
    print()
    print("  Detection volume (label distribution per model):")
    for slug in report["models"]:
        dist = report["distributions"][slug]
        total = sum(dist.values()) or 1
        flagged_pct = dist.get("flagged", 0) / total
        none_pct = dist.get("none", 0) / total
        print(
            f"    {slug:42s} flagged={dist.get('flagged', 0):>5} "
            f"({flagged_pct:5.1%})  none={dist.get('none', 0):>5} ({none_pct:5.1%})"
        )
    print()
    overlap = report["flaggingOverlap"]
    print("  Flagging overlap:")
    print(
        f"    union flagged across models : {overlap['unionFlaggedCount']:>5}"
    )
    print(
        f"    consensus flagged (all {len(report['models'])})    : "
        f"{overlap['consensusFlaggedCount']:>5}"
    )
    for n_str, count in overlap["flaggedByCount"].items():
        print(f"    flagged by exactly {n_str} model(s) : {count:>5}")
    print()
    print("  Banned-vocab violation rate per model:")
    for slug, v in report["vocabCompliance"].items():
        rate = v["violationRate"]
        print(f"    {slug:42s} {rate:6.1%}  ({v['pairsWithViolation']} pairs)")
    if report.get("judgeModel"):
        print()
        print(
            f"  Judge ({report['judgeModel']}, sample={report['judgeSampleSize']}):"
        )
        for slug, agg in (report["judgeAggregates"] or {}).items():
            print(
                f"    {slug:42s} wins={agg['winCount']:>3} "
                f"useful={agg['avgUseful']:.2f} reasoning={agg['avgReasoning']:.2f}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
