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
    ANALYST_SYSTEM,
    ANALYST_USER_TEMPLATE,
    DOC_TYPE_LABELS,
    parse_alignment,
)
from .llm import call_llm_batch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Adapted Agent 2 prompt for progress alignment
# ---------------------------------------------------------------------------

NR7_ADVISOR_SYSTEM = (
    "You are a Biodiversity Progress Advisor assessing whether reported "
    "national actions and progress genuinely advance stated biodiversity "
    "targets. You provide factual, grounded assessments."
)

NR7_ADVISOR_USER_TEMPLATE = """\
Role: Biodiversity Progress Advisor
Goal: Compare a national biodiversity target with a reported implementation action from the \
country's National Report (NR7) to the CBD, and assess how well the action advances the target.

Task:
1. Analyze the following:
   - {target_type} target: {target_decomp}
   - NR7 reported action: {action_decomp}
2. Assess whether the reported action directly implements, partially supports, or is unrelated \
to the target.
3. Consider the scope, specificity, and relevance of the reported action to the target's goals.

Classify into one of seven levels. Always use the exact label and format:

**1.** "No alignment" – The action and target operate in unrelated domains.
    Return: No alignment - [Concise 2-sentence explanation.]

**2.** "Low alignment" – Tangential relationship; broad thematic overlap but the action does \
not meaningfully advance the target.
    Return: Low alignment - [Concise 2-sentence explanation.]

**3.** "Medium alignment" – The action partially supports the target with clear thematic \
overlap but incomplete coverage of the target's objectives.
    Return: Medium alignment - [Concise 2-sentence explanation.]

**4.** "High alignment" – The action directly implements or strongly advances the target.
    Return: High alignment - [Concise 2-sentence explanation.]

=== FLAGGED MISALIGNMENT LEVELS ===

The vocabulary is intentionally cautious ("possible" / "likely") because you flag pairs for human review rather \
than establish certain contradictions. Specify contradiction type in parentheses: Goal conflict | Resource competition | \
Implementation tension | Scale/scope mismatch.

**5.** "Possible misalignment" – Minor friction or trade-off.
    Return: Possible misalignment (Type) - [Concise 2-sentence explanation.]

**6.** "Possible conflict" – Clear conflict, though partial coexistence possible.
    Return: Possible conflict (Type) - [Concise 2-sentence explanation.]

**7.** "Likely conflict" – Direct opposition to the target's goals.
    Return: Likely conflict (Type) - [Concise 2-sentence explanation.]

Your output should be in English."""


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

        user = NR7_ADVISOR_USER_TEMPLATE.format(
            target_type=labels.get(
                target["sourceDocument"], target["sourceDocument"]
            ),
            target_decomp=decomp_t,
            action_decomp=decomp_a,
        )
        calls.append({"system": NR7_ADVISOR_SYSTEM, "user": user})
        pair_keys.append((target["id"], action["id"]))

    results = await call_llm_batch(
        calls, cache_namespace="nr7_alignment", desc="NR7 alignment"
    )

    alignment_results = []
    level_counts: dict[str, int] = {}

    for (tid, aid), raw in zip(pair_keys, results):
        level, explanation, contradiction_type = parse_alignment(raw)
        level_counts[level] = level_counts.get(level, 0) + 1
        result: dict[str, Any] = {
            "targetAId": tid,
            "targetBId": aid,
            "alignment": level,
            "description": explanation,
        }
        if contradiction_type:
            result["contradictionType"] = contradiction_type
        alignment_results.append(result)

    logger.info(f"  NR7 alignment done: {level_counts}")
    return alignment_results
