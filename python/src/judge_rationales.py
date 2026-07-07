"""LLM-judged rationale comparison.

For each pair in a sample of cross-model disagreements, asks a judge LLM
to evaluate the four candidate rationales on three axes (specificity,
reasoning, decision-usefulness) and pick the most useful one. Model
identities are anonymized to the judge on a per-pair basis (each model
slug maps to a different A/B/C/D letter for each pair, deterministically
seeded by the pair-key) so the judge cannot pattern-match on brand.

The judge is most likely one of the four models being evaluated (default
``LLM_JUDGE_MODEL`` env var falls back to ``LLM_MODEL`` which is GPT-5.4
in prod). Anonymization mitigates brand-recognition bias but does not
eliminate stylistic self-recognition; the UI disclaims this.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from typing import Any

from .config import LLM_MODEL
from .llm import call_llm_batch

logger = logging.getLogger(__name__)

LETTERS: list[str] = ["A", "B", "C", "D", "E", "F"]

JUDGE_SYSTEM = (
    "You are an evaluator of policy-coherence rationales. You will read up to "
    "six AI-written rationales about the SAME policy-pair, each written by a "
    "different model. You do not know which model wrote which rationale. "
    "Evaluate each rationale on three axes:\n"
    "  - specificity: does it cite specific policy provisions, programs, "
    "    quantities, or instruments — or does it stay abstract?\n"
    "  - reasoning: is the chain of inference plausible and policy-coherent?\n"
    "  - useful: would a non-technical policymaker reading this rationale be "
    "    better able to triage the pair?\n"
    "Score each axis 1 (poor) to 5 (excellent). Choose the rationale that is "
    "most useful for decision-support, NOT the one that is longest or most "
    "polished. Respond with strict JSON only."
)


def _shuffle_map_for_pair(
    pair_key: tuple[str, str], slugs: list[str]
) -> dict[str, str]:
    """Deterministically map slugs to letters using a hash of the pair-key.

    Same pair-key → same map (rerun stability). Different pair-key →
    different map (judge can't pattern-match across pairs). Bijective.
    """
    if len(slugs) > len(LETTERS):
        raise ValueError(
            f"Cannot anonymize more than {len(LETTERS)} models (got {len(slugs)})"
        )
    seed_bytes = hashlib.sha256(
        f"{pair_key[0]}|{pair_key[1]}".encode()
    ).digest()
    # Reverse a Fisher-Yates-style shuffle keyed by the seed so the mapping is
    # reproducible without needing the `random` module's global state.
    letters = LETTERS[: len(slugs)]
    permuted = letters[:]
    for i in range(len(permuted) - 1, 0, -1):
        j = seed_bytes[i % len(seed_bytes)] % (i + 1)
        permuted[i], permuted[j] = permuted[j], permuted[i]
    # Sort slugs for stable iteration BEFORE assigning letters — otherwise the
    # input ordering of `slugs` would change which slug got which letter and
    # the mapping wouldn't be a pure function of the pair-key.
    sorted_slugs = sorted(slugs)
    return {slug: permuted[i] for i, slug in enumerate(sorted_slugs)}


def _build_prompt(
    pair: dict[str, Any], shuffle_map: dict[str, str]
) -> tuple[str, str]:
    """Build (system, user) prompt for one pair.

    The user prompt mentions only the target IDs and letter-labeled
    rationales — no model slug appears anywhere in the input the judge
    sees.
    """
    target_a = pair["targetAId"]
    target_b = pair["targetBId"]
    # Order rationales by letter so the judge sees A, B, C, D in order.
    letter_to_slug = {letter: slug for slug, letter in shuffle_map.items()}
    sections: list[str] = [
        f"Pair under evaluation: target {target_a} × target {target_b}.",
        "",
        "Each section below shows one model's verdict for this pair and its",
        "rationale. Treat the letters as opaque identifiers.",
        "",
    ]
    for letter in sorted(letter_to_slug):
        slug = letter_to_slug[letter]
        label = pair["labels"].get(slug, "")
        rationale = pair["descriptions"].get(slug, "")
        sections.append(f"--- Rationale {letter} ---")
        sections.append(f"Alignment verdict: {label}")
        sections.append(f"Rationale: {rationale}")
        sections.append("")
    sections.append(
        "Return ONLY valid JSON in this exact shape (letters limited to the "
        f"ones used above: {sorted(letter_to_slug)}):"
    )
    sections.append(
        '{"scores": {"A": {"specificity": 1-5, "reasoning": 1-5, "useful": 1-5}, ...}, '
        '"winner": "A", "winnerReasoning": "1-2 sentences"}'
    )
    return JUDGE_SYSTEM, "\n".join(sections)


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.+?)\s*```", re.DOTALL)


def _extract_json(raw: str) -> dict[str, Any] | None:
    """Tolerant JSON extraction — judges sometimes wrap output in fences."""
    if not raw:
        return None
    candidate = raw.strip()
    fence = _JSON_FENCE_RE.search(candidate)
    if fence:
        candidate = fence.group(1).strip()
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        # Best-effort: try to find the first {...} block
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(candidate[start : end + 1])
            except json.JSONDecodeError:
                return None
        return None


def parse_verdict(
    raw: str, pair: dict[str, Any], shuffle_map: dict[str, str]
) -> dict[str, Any] | None:
    """Translate the judge's letter-keyed verdict back to slugs.

    Returns ``None`` if the response can't be parsed; the aggregator skips
    null verdicts so one bad response doesn't kill the whole judge pass.
    """
    parsed = _extract_json(raw)
    if not isinstance(parsed, dict):
        return None
    letter_to_slug = {letter: slug for slug, letter in shuffle_map.items()}
    scores_in = parsed.get("scores") or {}
    scores_out: dict[str, dict[str, Any]] = {}
    for letter, axes in scores_in.items():
        slug = letter_to_slug.get(letter)
        if not slug or not isinstance(axes, dict):
            continue
        try:
            scores_out[slug] = {
                "specificity": int(axes.get("specificity", 0)),
                "reasoning": int(axes.get("reasoning", 0)),
                "useful": int(axes.get("useful", 0)),
            }
        except (TypeError, ValueError):
            continue
    winner_letter = parsed.get("winner")
    winner_slug = letter_to_slug.get(winner_letter) if winner_letter else None
    return {
        "targetAId": pair["targetAId"],
        "targetBId": pair["targetBId"],
        "rationales": dict(pair["descriptions"]),
        "shuffleMap": dict(shuffle_map),
        "scores": scores_out,
        "winnerSlug": winner_slug,
        "winnerReasoning": str(parsed.get("winnerReasoning") or "")[:600],
    }


def aggregate(
    verdicts: list[dict[str, Any] | None], slugs: list[str]
) -> dict[str, dict[str, float]]:
    """Per-model averages and win counts across the sampled verdicts."""
    agg = {
        slug: {
            "specificityTotal": 0.0,
            "reasoningTotal": 0.0,
            "usefulTotal": 0.0,
            "scoreSamples": 0,
            "winCount": 0,
        }
        for slug in slugs
    }
    for v in verdicts:
        if not v:
            continue
        for slug, scores in (v.get("scores") or {}).items():
            if slug not in agg:
                continue
            agg[slug]["specificityTotal"] += scores.get("specificity", 0)
            agg[slug]["reasoningTotal"] += scores.get("reasoning", 0)
            agg[slug]["usefulTotal"] += scores.get("useful", 0)
            agg[slug]["scoreSamples"] += 1
        winner = v.get("winnerSlug")
        if winner in agg:
            agg[winner]["winCount"] += 1

    out: dict[str, dict[str, float]] = {}
    for slug, totals in agg.items():
        n = max(1, totals["scoreSamples"])
        out[slug] = {
            "avgSpecificity": round(totals["specificityTotal"] / n, 3),
            "avgReasoning": round(totals["reasoningTotal"] / n, 3),
            "avgUseful": round(totals["usefulTotal"] / n, 3),
            "winCount": int(totals["winCount"]),
            "sampleSize": int(totals["scoreSamples"]),
        }
    return out


async def run_judge(
    disagreements: list[dict[str, Any]],
    *,
    sample_size: int = 30,
    judge_model: str | None = None,
) -> dict[str, Any]:
    """Run the judge pass over the top ``sample_size`` disagreement pairs.

    Returns a dict ready to merge into the main analyzer report::

        {
            "judgeModel": str,
            "judgeSampleSize": int,
            "judgeAggregates": Record[slug, {...}],
            "judgeVerdicts": [JudgeVerdict, ...],
        }
    """
    if not disagreements:
        logger.warning("No disagreement pairs supplied — judge pass is a no-op.")
        return {
            "judgeModel": None,
            "judgeSampleSize": 0,
            "judgeAggregates": {},
            "judgeVerdicts": [],
        }
    judge_model = judge_model or os.getenv("LLM_JUDGE_MODEL") or LLM_MODEL
    sample = disagreements[:sample_size]
    slugs = sorted({s for pair in sample for s in pair["labels"]})

    shuffle_maps: list[dict[str, str]] = []
    calls: list[dict[str, Any]] = []
    for pair in sample:
        pair_key = (pair["targetAId"], pair["targetBId"])
        shuffle_map = _shuffle_map_for_pair(pair_key, list(pair["labels"]))
        shuffle_maps.append(shuffle_map)
        system, user = _build_prompt(pair, shuffle_map)
        calls.append(
            {
                "system": system,
                "user": user,
                "model": judge_model,
                "max_tokens": 600,
            }
        )

    raw_results = await call_llm_batch(
        calls,
        cache_namespace=f"judge_rationales_{judge_model}",
        desc="Judge rationale comparison",
    )

    verdicts: list[dict[str, Any] | None] = []
    for pair, shuffle_map, raw in zip(sample, shuffle_maps, raw_results):
        verdicts.append(parse_verdict(raw, pair, shuffle_map))

    valid = [v for v in verdicts if v is not None]
    if len(valid) < len(verdicts):
        logger.warning(
            "Judge returned %d unparseable response(s) of %d",
            len(verdicts) - len(valid),
            len(verdicts),
        )

    return {
        "judgeModel": judge_model,
        "judgeSampleSize": len(sample),
        "judgeAggregates": aggregate(verdicts, slugs),
        "judgeVerdicts": valid,
    }
