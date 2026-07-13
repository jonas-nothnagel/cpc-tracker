"""
NR7 Progress Alignment: cross-references NR7-reported actions with NBSAP targets.

Follows the same pattern as measure_align.py:
  1. Convert NR7 reported actions into pseudo-targets
  2. Pair with NBSAP targets by shared NBS category or theme
  3. Decompose (Agent 1) + assess alignment (Agent 2*)
"""

from __future__ import annotations

import logging
import re
from typing import Any

from .align import (
    ADVISOR_SYSTEM,
    ADVISOR_USER_TEMPLATE,
    ANALYST_SYSTEM,
    ANALYST_USER_TEMPLATE,
    DOC_TYPE_LABELS,
)
from .alignment_schema import parse_alignment
from .llm import call_llm_batch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# NR7 progress alignment: reuses canonical v2.2 advisor prompt via intro_framing
# ---------------------------------------------------------------------------

NR7_ADVISOR_SYSTEM = ADVISOR_SYSTEM  # Reuse the canonical system prompt.

# Bumped with the canonical prompt version so responses from different prompt
# revisions never share a cache dir.
NR7_CACHE_NAMESPACE = "nr7_alignment_v3"

NR7_INTRO_FRAMING = (
    "\n    Context for this comparison: one side of this pair is a national biodiversity "
    "target from an NBSAP; the other side is a reported implementation action from the "
    "country's National Report (NR7) to the CBD. Apply the same scoring rubric. An action "
    "that directly implements the target is High alignment; an action in the same broad "
    "theme that does not meaningfully advance the target is Low alignment; an action that "
    "works against the target is Flagged for review, provided the friction meets "
    "the flagging gate above.\n"
)


def nr7_actions_to_pseudo_targets(
    progress_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Convert NR7 progress items into pseudo-targets for the pipeline."""
    pseudo: list[dict[str, Any]] = []
    idx = 0

    for item in progress_items:
        actions = item.get("reportedActions", [])
        target_text = item.get("targetText", "")
        progress_status = item.get("progressStatus", "unknown")

        for action_text in actions:
            if not action_text.strip():
                continue
            idx += 1
            pseudo.append({
                "id": f"NR7_action_{idx}",
                "sourceDocument": "NR7",
                "sourceLabel": f"NR7 Action {idx}",
                "text": action_text.strip(),
                "country": "",
                "isQuantitative": False,
                "isTimeBound": False,
                "relatedTarget": target_text,
                "progressStatus": progress_status,
            })

    return pseudo


def _keyword_set(text: str) -> set[str]:
    words = re.sub(r"[^\w\s]", " ", text.lower()).split()
    return {word for word in words if len(word) > 3}


def _best_related_target(
    related_target_text: str,
    candidate_targets: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """
    Match an NR7-reported target text to the closest policy target.

    The match is intentionally conservative: it requires both a minimum
    overlap score and a clear margin over the second-best match.
    """
    source_words = _keyword_set(related_target_text)
    if not source_words:
        return None

    scored: list[tuple[float, dict[str, Any]]] = []
    for target in candidate_targets:
        target_words = _keyword_set(target.get("text", ""))
        if not target_words:
            continue
        shared = len(source_words & target_words)
        score = shared / max(len(source_words), len(target_words))
        if shared >= 3:
            scored.append((score, target))

    if not scored:
        return None

    scored.sort(key=lambda item: item[0], reverse=True)
    best_score, best_target = scored[0]
    second_score = scored[1][0] if len(scored) > 1 else 0.0
    if best_score < 0.35 or (best_score - second_score) < 0.10:
        return None
    return best_target


def generate_nr7_pairs(
    targets: list[dict[str, Any]],
    pseudo_targets: list[dict[str, Any]],
    classifications: list[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Pair NR7 actions with the most plausible related NBSAP target."""
    _ = classifications
    nbsap_targets = [t for t in targets if t.get("sourceDocument") == "NBSAP"]
    if not nbsap_targets:
        nbsap_targets = targets

    pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    seen: set[tuple[str, str]] = set()

    for pt in pseudo_targets:
        matched_target = _best_related_target(pt.get("relatedTarget", ""), nbsap_targets)
        if not matched_target:
            continue
        key = (matched_target["id"], pt["id"])
        if key not in seen:
            seen.add(key)
            pairs.append((matched_target, pt))

    logger.info(
        f"Generated {len(pairs)} target-action pairs "
        f"from {len(nbsap_targets)} NBSAP targets × {len(pseudo_targets)} NR7 actions"
    )
    return pairs


async def decompose_nr7_actions(
    pseudo_targets: list[dict[str, Any]],
) -> dict[str, str]:
    """Run Agent 1 on NR7 actions."""
    logger.info(f"Decomposing {len(pseudo_targets)} NR7 actions (Agent 1)")

    calls = []
    ids = []
    for pt in pseudo_targets:
        user = ANALYST_USER_TEMPLATE.format(target_text=pt["text"])
        calls.append({"system": ANALYST_SYSTEM, "user": user})
        ids.append(pt["id"])

    results = await call_llm_batch(
        calls, cache_namespace="decompose", desc="NR7 action decomposition"
    )

    decomps: dict[str, str] = {}
    for tid, raw in zip(ids, results):
        decomps[tid] = raw

    logger.info(f"  Decomposed {len(decomps)} NR7 actions")
    return decomps


async def assess_nr7_alignment(
    pairs: list[tuple[dict[str, Any], dict[str, Any]]],
    decompositions: dict[str, str],
    doc_type_labels: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Run adapted Agent 2 on target-action pairs."""
    logger.info(f"Assessing NR7 progress alignment for {len(pairs)} pairs")

    labels = doc_type_labels or DOC_TYPE_LABELS
    calls = []
    pair_keys: list[tuple[str, str]] = []

    for target, action in pairs:
        decomp_t = decompositions.get(target["id"], "")
        decomp_a = decompositions.get(action["id"], "")

        user = ADVISOR_USER_TEMPLATE.format(
            intro_framing=NR7_INTRO_FRAMING,
            target_1_type=labels.get(
                target["sourceDocument"], target["sourceDocument"]
            ),
            target_1_decomp=decomp_t,
            target_2_type="NR7 reported action",
            target_2_decomp=decomp_a,
        )
        calls.append({"system": NR7_ADVISOR_SYSTEM, "user": user})
        pair_keys.append((target["id"], action["id"]))

    results = await call_llm_batch(
        # v3: canonical prompt v2.2 (flagging gate tightened).
        calls, cache_namespace=NR7_CACHE_NAMESPACE, desc="NR7 alignment"
    )

    alignment_results = []
    level_counts: dict[str, int] = {}

    for (tid, aid), raw in zip(pair_keys, results):
        level, explanation, mechanism, manageability, confidence = parse_alignment(raw)
        level_counts[level] = level_counts.get(level, 0) + 1
        result: dict[str, Any] = {
            "targetAId": tid,
            "targetBId": aid,
            "alignment": level,
            "description": explanation,
        }
        if mechanism:
            result["mechanism"] = mechanism
        if manageability:
            result["manageability"] = manageability
        if confidence:
            result["confidence"] = confidence
        alignment_results.append(result)

    logger.info(f"  NR7 alignment done: {level_counts}")
    return alignment_results
