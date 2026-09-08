"""Guards for the NR7 (biodiversity implementation) alignment scaffold.

NR7 reused-action alignment mirrors measure alignment: reported actions from a
7th National Report to the CBD are converted to pseudo-targets and scored on the
shared five-category rubric. These tests pin the pseudo-target conversion, the
side-labelling (a reported action must never be framed as a policy target), the
biodiversity framing, and the fresh cache namespace so a drift in
measure_align.py / align.py fails loudly instead of silently mis-rendering.
"""

from src.align import DOC_TYPE_LABELS
from src.measure_align import MEASURE_ADVISOR_USER_TEMPLATE
import asyncio

import src.nr7_align as nr7_align
from src.nr7_align import (
    _MEASURE_PAIR_BLOCK,
    _NR7_PAIR_POINTER,
    _NR7_PAIR_TAIL,
    NR7_ADVISOR_SYSTEM,
    NR7_ADVISOR_USER_TEMPLATE,
    NR7_CACHE_NAMESPACE,
    NR7_INTRO_FRAMING,
    _nr7_side_label,
    assess_nr7_alignment,
    generate_nr7_pairs,
    nr7_actions_to_pseudo_targets,
    nr7_prompt_shared_prefix,
    render_nr7_prompt,
    warm_up_order,
)

# A minimal NR7 progress-item fixture shaped like python/data/external/nr7_mng.json.
_PROGRESS_ITEMS = [
    {
        "targetId": "NT01",
        "targetText": "By 2030, reduce biodiversity loss.",
        "progressStatus": "limited",
        "nbsapTargetId": "NBT_1",
        "reportedActions": [
            "69 Key Biodiversity Areas covering 9.9M hectares identified.",
            "11 Ramsar wetland sites designated.",
        ],
    },
    {
        "targetId": "NT02",
        "targetText": "Summary-only item, nothing to pair.",
        "progressStatus": "on_track",
        "nbsapTargetId": "NBT_2",
        "reportedActions": [],  # skipped
    },
]


def test_each_reported_action_becomes_one_pseudo_target():
    pseudo = nr7_actions_to_pseudo_targets(_PROGRESS_ITEMS)
    # 2 actions from NT01, 0 from the summary-only NT02.
    assert len(pseudo) == 2
    assert [p["id"] for p in pseudo] == ["NR7_1", "NR7_2"]
    assert all(p["sourceDocument"] == "NR7" for p in pseudo)
    assert all(p["actionType"] == "nr7" for p in pseudo)
    # Parent NBSAP provenance is carried through for frontend grouping.
    assert pseudo[0]["nbsapTargetId"] == "NBT_1"
    assert pseudo[0]["nr7ParentTargetId"] == "NT01"
    assert pseudo[0]["nr7Status"] == "limited"


def test_pseudo_target_ids_are_unique():
    pseudo = nr7_actions_to_pseudo_targets(_PROGRESS_ITEMS)
    assert len({p["id"] for p in pseudo}) == len(pseudo)


def test_side_labels_distinguish_targets_from_reported_actions():
    pseudo = nr7_actions_to_pseudo_targets(_PROGRESS_ITEMS)
    # A reported action (marked by measureStatus) is never called a target.
    assert _nr7_side_label(pseudo[0], DOC_TYPE_LABELS) == (
        "Reported biodiversity action (NR7)"
    )
    assert _nr7_side_label({"sourceDocument": "NDC"}, DOC_TYPE_LABELS) == (
        "Policy target (NDC)"
    )


def test_framing_never_calls_the_action_a_target_and_notes_co2e_asymmetry():
    assert "NOT a policy target" in NR7_INTRO_FRAMING
    assert 'never write "both targets"' in NR7_INTRO_FRAMING
    # Biodiversity outcomes are not CO2e; the action must not be penalised for it.
    assert "do not penalize" in NR7_INTRO_FRAMING
    assert "National Report (NR7)" in NR7_INTRO_FRAMING
    assert "Implementation Alignment Advisor" in NR7_ADVISOR_SYSTEM


def test_advisor_template_renders_with_nr7_framing():
    # No KeyError ⇒ every slot the NR7 assessor fills is present in the reused
    # measure advisor template.
    rendered = MEASURE_ADVISOR_USER_TEMPLATE.format(
        intro_framing=NR7_INTRO_FRAMING,
        target_1_type="Policy target (NDC)",
        target_1_decomp="X",
        target_2_type="Reported biodiversity action (NR7)",
        target_2_decomp="Y",
    )
    assert "National Report (NR7)" in rendered


def test_cache_namespace_matches_the_rubric_first_prompt():
    # v1 holds the 2026-09-07 pair-in-the-middle run; the reordered prompt must
    # never share a cache dir with it.
    assert NR7_CACHE_NAMESPACE == "nr7_alignment_v2"


def test_nr7_template_is_rubric_first_with_unchanged_wording():
    # Everything the model reads is the measure advisor rubric verbatim; the
    # only project-defined edits are the step-1 pointer and the tail heading.
    assert NR7_ADVISOR_USER_TEMPLATE == (
        MEASURE_ADVISOR_USER_TEMPLATE.replace(_MEASURE_PAIR_BLOCK, _NR7_PAIR_POINTER)
        + _NR7_PAIR_TAIL
    )
    # The pair comes after the last rubric sentence, action before target, so
    # the shared prefix across an action group is everything but the target.
    end_of_rubric = NR7_ADVISOR_USER_TEMPLATE.index("Do not invent facts.")
    assert NR7_ADVISOR_USER_TEMPLATE.index("{target_2_decomp}") > end_of_rubric
    assert NR7_ADVISOR_USER_TEMPLATE.index("{target_2_decomp}") < NR7_ADVISOR_USER_TEMPLATE.index("{target_1_decomp}")
    # Step 1 still exists and points at the tail.
    assert 'under "The pair"' in NR7_ADVISOR_USER_TEMPLATE
    assert "{target_1_decomp}" not in NR7_ADVISOR_USER_TEMPLATE.split("The pair:")[0]


def test_render_nr7_prompt_shared_prefix_covers_rubric_and_action():
    pseudo = nr7_actions_to_pseudo_targets(_PROGRESS_ITEMS)
    target = {"id": "NDC_1", "sourceDocument": "NDC"}
    decomps = {"NDC_1": "TARGET-DECOMP", pseudo[0]["id"]: "ACTION-DECOMP"}
    rendered = render_nr7_prompt(target, pseudo[0], decomps)
    prefix = nr7_prompt_shared_prefix(rendered, target)
    assert "ACTION-DECOMP" in rendered[:prefix]
    assert "Do not invent facts." in rendered[:prefix]
    assert "TARGET-DECOMP" not in rendered[:prefix]
    assert "TARGET-DECOMP" in rendered[prefix:]
    assert prefix / len(rendered) > 0.9


def test_warm_up_order_takes_one_call_per_action_first():
    warm, rest = warm_up_order(["A", "A", "A", "B", "B", "C"])
    assert warm == [0, 3, 5]
    assert rest == [1, 2, 4]
    assert warm_up_order([]) == ([], [])


def test_assess_seeds_the_cache_with_one_call_per_action_then_the_rest(monkeypatch):
    pseudo = nr7_actions_to_pseudo_targets(_PROGRESS_ITEMS)
    targets = [{"id": f"T{i}", "sourceDocument": "NDC"} for i in range(3)]
    pairs = generate_nr7_pairs(targets, pseudo)  # action-major: A×T0..2, B×T0..2
    batches: list[list[str]] = []

    async def fake_batch(calls, *, cache_namespace, desc):
        batches.append([c["user"] for c in calls])
        # Echo which pair this is so reassembly can be checked.
        return [f"Low alignment - {c['user'][-40:]}" for c in calls]

    monkeypatch.setattr(nr7_align, "call_llm_batch", fake_batch)
    results = asyncio.run(assess_nr7_alignment(pairs, {}, None))
    assert [len(b) for b in batches] == [2, 4]  # one per action, then the rest
    assert [(r["targetAId"], r["targetBId"]) for r in results] == [
        (t["id"], a["id"]) for t, a in pairs
    ]


def test_pairing_is_every_target_by_every_action():
    pseudo = nr7_actions_to_pseudo_targets(_PROGRESS_ITEMS)
    targets = [{"id": f"T{i}", "sourceDocument": "NDC"} for i in range(3)]
    pairs = generate_nr7_pairs(targets, pseudo)
    assert len(pairs) == 3 * len(pseudo)
