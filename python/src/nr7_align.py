"""
Step 6b: Target-to-NR7 (biodiversity implementation) alignment.

Compares policy targets with reported actions from a country's 7th National
Report (NR7) to the Convention on Biological Diversity, to assess biodiversity
implementation coherence. This is the Level-3 (implementation) analogue of
`measure_align.py`, which does the same for BTR climate measures.

Design note (2026-09): NR7 reported actions are progress narratives written
against a country's NBSAP targets. Treated as reported implementation actions
(exactly like BTR mitigation/adaptation measures), they can be paired with the
analytical policy targets and scored on the shared five-category alignment
rubric. The advisor prompt, scoring rubric, and decomposition agent are reused
verbatim from `measure_align.py` / `align.py`; only the pair-framing slot and
the side labels differ, so the target-target / budget / BTR prompt caches stay
valid and no new rubric drift is introduced.

CALIBRATION TODO (Julien): the biodiversity-specific framing below
(`NR7_INTRO_FRAMING`) has NOT been calibrated against expert-rated NR7 pairs the
way the BTR/target-target prompts were (prompt v2.2 round-2). Before any results
from this module are surfaced as anything other than a clearly-labelled scaffold
preview, run a calibration pass on a sample of Mongolia NR7 pairs
(`scripts/run_nr7_alignment.py --actions NT01,NT03,...`) and record the outcome
(mirror `project_prompt_v22_calibration`). Open decision for that pass: whether
one national target's Main Actions Summary is one reported action (the current
input, python/src/nr7_ort.py) or should be split into several.

Cost note (2026-09): the NR7 prompt is the measure advisor prompt with the pair
moved to the END (`NR7_ADVISOR_USER_TEMPLATE`), so provider prompt caching can
discount the ~75% of every call that is the unchanged rubric. The cache
namespace is `nr7_alignment_v2` for that reordering; v1 holds the 2026-09-07
run on the PDF-scraped input. Bump again whenever the wording changes.
"""

from __future__ import annotations

import logging
from typing import Any

from .align import (
    ANALYST_SYSTEM,
    ANALYST_USER_TEMPLATE,
    DOC_TYPE_LABELS,
)
from .alignment_schema import parse_alignment
from .llm import call_llm_batch
# The advisor template is reused as-is: its canonical wording ("Compare a policy
# target with a reported implementation action", neutral {target_1_type} side
# labels, "both sides") already fits an NR7 reported action. Only the
# {intro_framing} slot and the side labels are NR7-specific, so there is no need
# to re-do the needle-replacement dance here.
from .measure_align import MEASURE_ADVISOR_USER_TEMPLATE

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# NR7 alignment prompt configuration
# ---------------------------------------------------------------------------

# v1: first run (2026-09-07), pair-in-the-middle prompt, PDF-scraped input.
# v2: rubric-first prompt (see NR7_ADVISOR_USER_TEMPLATE). Bump whenever the
# prompt wording or order changes so revisions never share a cache dir.
NR7_CACHE_NAMESPACE = "nr7_alignment_v2"

NR7_ADVISOR_SYSTEM = (
    "You are an Implementation Alignment Advisor, ensuring factual, graded "
    "assessments of whether reported biodiversity implementation actions "
    "support policy targets. Most reported actions within a national "
    "biodiversity framework share some degree of alignment with the policy "
    "framework they report under."
)

# Framing injected into the {intro_framing} slot for policy-target × NR7
# reported-action pairs. Mirrors MEASURE_INTRO_FRAMING but for biodiversity
# reporting: outcomes are hectares protected, species recovered, sites
# designated — not CO2e — so the advisor is told not to penalise an action for
# lacking emissions numbers, the same asymmetry the adaptation note makes for
# BTR. Wording rule keeps user-facing rationales from calling a reported action
# a "target".
NR7_INTRO_FRAMING = (
    "\n    Context for this comparison: one side of this pair is a policy target "
    "extracted from a national strategy or policy document; the other side is a "
    "REPORTED IMPLEMENTATION ACTION from a country's 7th National Report (NR7) to "
    "the Convention on Biological Diversity. The reported action is progress the "
    "country reports on its biodiversity commitments; it is NOT a policy target. "
    "Apply the same scoring rubric. An action that directly implements the target "
    "is High alignment; an action that operates in the same broad ecosystem or "
    "theme but does not advance the target's specific goals is Low alignment; an "
    "action that creates real-world friction with the target is Flagged for "
    "review, provided the friction meets the flagging gate above.\n"
    "    Biodiversity outcomes are reported as area conserved, species status, "
    "sites designated, or governance measures established, NOT as CO2e "
    "reductions; do not penalize the reported action for lacking emissions "
    "estimates.\n"
    '    Wording rule for the explanation: refer to the policy side as "the '
    'target" (or by its document name) and to the NR7 side as "the reported '
    'action" or "the action". Never call the reported action a target, and never '
    'write "both targets".\n'
)


# ---------------------------------------------------------------------------
# Rubric-first advisor prompt (provider prompt-cache friendly)
# ---------------------------------------------------------------------------
#
# The measure advisor template puts the pair in the MIDDLE: ~2.3k chars of role
# text, then the two decompositions, then ~14.5k chars of rubric and worked
# examples. Provider prompt caching (OpenAI / Azure OpenAI) discounts only an
# identical prefix of at least 1,024 tokens, so with the pair in the middle no
# call qualifies and the same rubric is billed in full on every one of
# thousands of calls (the 2026-09-07 run: ~5.2k input tokens per pair, 76% of
# them the rubric).
#
# The NR7 prompt therefore moves the pair to the END. The rubric wording is
# untouched (pinned by tests/test_nr7_align.py); the only project-defined edits
# are the one-line pointer that replaces step 1's inline pair and the
# "The pair:" heading. The reported action is listed BEFORE the policy target
# so that, with calls grouped action by action (generate_nr7_pairs), everything
# except the target decomposition is a shared prefix across each group of
# len(targets) calls.
_MEASURE_PAIR_BLOCK = (
    "    1. Analyze the following pair (structured analysis from Target Analyst):\n"
    "       - {target_1_type}: {target_1_decomp}\n"
    "       - {target_2_type}: {target_2_decomp}\n"
)
_NR7_PAIR_POINTER = (
    '    1. Analyze the pair given under "The pair" at the end of this message '
    "(structured analysis from Target Analyst).\n"
)
_NR7_PAIR_TAIL = (
    "\n    The pair:\n"
    "       - {target_2_type}: {target_2_decomp}\n"
    "       - {target_1_type}: {target_1_decomp}\n"
)
if _MEASURE_PAIR_BLOCK not in MEASURE_ADVISOR_USER_TEMPLATE:
    raise RuntimeError(
        "measure_align.MEASURE_ADVISOR_USER_TEMPLATE no longer contains the pair "
        "block nr7_align relocates; update _MEASURE_PAIR_BLOCK to match"
    )
NR7_ADVISOR_USER_TEMPLATE = (
    MEASURE_ADVISOR_USER_TEMPLATE.replace(_MEASURE_PAIR_BLOCK, _NR7_PAIR_POINTER)
    + _NR7_PAIR_TAIL
)


def render_nr7_prompt(
    target: dict[str, Any],
    action: dict[str, Any],
    decompositions: dict[str, str],
    doc_type_labels: dict[str, str] | None = None,
) -> str:
    """The user message for one policy-target × NR7-action pair."""
    labels = doc_type_labels or DOC_TYPE_LABELS
    return NR7_ADVISOR_USER_TEMPLATE.format(
        intro_framing=NR7_INTRO_FRAMING,
        target_1_type=_nr7_side_label(target, labels),
        target_1_decomp=decompositions.get(target["id"], ""),
        target_2_type=_nr7_side_label(action, labels),
        target_2_decomp=decompositions.get(action["id"], ""),
    )


def nr7_prompt_shared_prefix(rendered: str, target: dict[str, Any], doc_type_labels: dict[str, str] | None = None) -> int:
    """Chars of `rendered` that are identical for every pair sharing the same
    action: everything before the policy-target line of the tail."""
    labels = doc_type_labels or DOC_TYPE_LABELS
    marker = f"       - {_nr7_side_label(target, labels)}: "
    idx = rendered.rfind(marker)
    return idx if idx >= 0 else 0


def warm_up_order(action_ids: list[str]) -> tuple[list[int], list[int]]:
    """Split call indices into (one call per distinct action, the rest).

    Provider prompt caches are seeded by the first completed call carrying a
    prefix; running the first pair of every action group on its own first means
    the other len(targets)-1 calls in the group arrive to a warm cache instead
    of racing each other as cold misses under the concurrency limit."""
    seen: set[str] = set()
    warm: list[int] = []
    for i, aid in enumerate(action_ids):
        if aid not in seen:
            seen.add(aid)
            warm.append(i)
    warm_set = set(warm)
    rest = [i for i in range(len(action_ids)) if i not in warm_set]
    return warm, rest


# ---------------------------------------------------------------------------
# NR7 action → pseudo-target conversion
# ---------------------------------------------------------------------------


def nr7_actions_to_pseudo_targets(
    progress_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Convert NR7 reported actions into target-like dicts for the pipeline.

    Each element of a progress item's ``reportedActions`` list is one reported
    action and becomes one pseudo-target. Items with no ``reportedActions`` are
    skipped (they carry only a narrative summary, nothing to pair). The parent
    NBSAP target id/text is carried through so the frontend can group NR7
    actions under the NBSAP target they report against.

    Shape mirrors `measure_align.measures_to_pseudo_targets`:
    `sourceDocument="NR7"`, `actionType="nr7"`, and a `measureStatus` field so
    the shared `_side_label`-style helpers treat it as a reported action, never
    a policy target.
    """
    pseudo: list[dict[str, Any]] = []
    seq = 0
    for item in progress_items:
        actions = item.get("reportedActions") or []
        if not actions:
            continue
        parent_target_id = (item.get("targetId") or "").strip()
        parent_target_text = (item.get("targetText") or "").strip()
        nbsap_target_id = (item.get("nbsapTargetId") or "").strip()
        status = (item.get("progressStatus") or "").strip()

        for action in actions:
            text = (action or "").strip()
            if not text:
                continue
            seq += 1
            pid = f"NR7_{seq}"

            # Short label from the first sentence/line of the action narrative.
            first = text.split(". ")[0].split("\n")[0].strip()
            label = first if len(first) <= 60 else first[:57] + "..."

            entry: dict[str, Any] = {
                "id": pid,
                "sourceDocument": "NR7",
                "sourceLabel": label,
                "text": text,
                "country": "",
                "isQuantitative": False,
                "isTimeBound": False,
                "sector": "",
                # measureStatus present ⇒ the shared side-label logic treats
                # this row as a reported action, not a policy target.
                "measureStatus": status or "reported",
                "actionType": "nr7",
                # NR7-specific provenance for frontend grouping.
                "nr7Status": status,
                "nbsapTargetId": nbsap_target_id,
                "nr7ParentTargetId": parent_target_id,
                "nr7ParentTargetText": parent_target_text,
            }
            pseudo.append(entry)

    logger.info(
        f"  {len(progress_items)} NR7 progress items → {len(pseudo)} reported-action pseudo-targets"
    )
    return pseudo


# ---------------------------------------------------------------------------
# Pairing
# ---------------------------------------------------------------------------


def generate_nr7_pairs(
    targets: list[dict[str, Any]],
    pseudo_targets: list[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Pair every NR7 reported action with every policy target.

    As with measure alignment, classification is not used as a pairing filter;
    the alignment LLM decides relevance directly.
    """
    pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for pt in pseudo_targets:
        for t in targets:
            pairs.append((t, pt))

    logger.info(
        f"Generated {len(pairs)} target-NR7 pairs "
        f"from {len(targets)} targets × {len(pseudo_targets)} reported actions"
    )
    return pairs


# ---------------------------------------------------------------------------
# Decompose + Assess
# ---------------------------------------------------------------------------


async def decompose_nr7_actions(
    pseudo_targets: list[dict[str, Any]],
) -> dict[str, str]:
    """Run Agent 1 on NR7 reported actions (reuses the shared analyst prompt).

    Shares the ``decompose`` cache namespace with every other decomposition, so
    an NR7 action decomposed once is reused everywhere it appears.
    """
    logger.info(f"Decomposing {len(pseudo_targets)} NR7 reported actions (Agent 1)")

    calls = []
    ids = []
    for pt in pseudo_targets:
        text = (
            "[BIODIVERSITY IMPLEMENTATION ACTION — frame Outcome as area "
            "conserved, species/ecosystem status, sites designated, or "
            "governance established, not CO2e.] "
            + pt["text"]
        )
        user = ANALYST_USER_TEMPLATE.format(
            target_text=text,
            activities_block="",
            actions_block="",
            action_instruction="",
        )
        calls.append({"system": ANALYST_SYSTEM, "user": user})
        ids.append(pt["id"])

    results = await call_llm_batch(
        calls,
        cache_namespace="decompose",
        desc="NR7 decomposition",
    )

    decomps: dict[str, str] = {}
    for tid, raw in zip(ids, results):
        decomps[tid] = raw

    logger.info(f"  Decomposed {len(decomps)} NR7 reported actions")
    return decomps


def _nr7_side_label(row: dict[str, Any], labels: dict[str, str]) -> str:
    """How the advisor prompt names one side of an NR7 pair.

    NR7 rows (marked by `measureStatus`) are named as reported actions; real
    policy targets carry their document label.
    """
    if "measureStatus" in row:
        return "Reported biodiversity action (NR7)"
    doc = row["sourceDocument"]
    return f"Policy target ({labels.get(doc, doc)})"


async def assess_nr7_alignment(
    pairs: list[tuple[dict[str, Any], dict[str, Any]]],
    decompositions: dict[str, str],
    doc_type_labels: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Run adapted Agent 2 on policy-target × NR7-action pairs."""
    logger.info(f"Assessing NR7 implementation alignment for {len(pairs)} pairs")

    calls = []
    pair_keys: list[tuple[str, str]] = []

    for target, action in pairs:
        user = render_nr7_prompt(target, action, decompositions, doc_type_labels)
        calls.append({"system": NR7_ADVISOR_SYSTEM, "user": user})
        pair_keys.append((target["id"], action["id"]))

    # Two batches: seed the provider prompt cache with one call per action,
    # then the rest. Results are reassembled in pair order. Local cache hits
    # are unaffected either way.
    warm, rest = warm_up_order([aid for _, aid in pair_keys])
    results: list[str] = [""] * len(calls)
    for desc, idx in (("NR7 alignment (cache warm-up)", warm), ("NR7 alignment", rest)):
        if not idx:
            continue
        out = await call_llm_batch(
            [calls[i] for i in idx],
            cache_namespace=NR7_CACHE_NAMESPACE,
            desc=desc,
        )
        for i, raw in zip(idx, out):
            results[i] = raw

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
