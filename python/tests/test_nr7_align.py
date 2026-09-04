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
from src.nr7_align import (
    NR7_ADVISOR_SYSTEM,
    NR7_CACHE_NAMESPACE,
    NR7_INTRO_FRAMING,
    _nr7_side_label,
    generate_nr7_pairs,
    nr7_actions_to_pseudo_targets,
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


def test_cache_namespace_is_fresh():
    # No NR7 alignment cache has ever existed; a fresh namespace keeps a
    # post-calibration wording bump isolated from every other cache.
    assert NR7_CACHE_NAMESPACE == "nr7_alignment_v1"


def test_pairing_is_every_target_by_every_action():
    pseudo = nr7_actions_to_pseudo_targets(_PROGRESS_ITEMS)
    targets = [{"id": f"T{i}", "sourceDocument": "NDC"} for i in range(3)]
    pairs = generate_nr7_pairs(targets, pseudo)
    assert len(pairs) == 3 * len(pseudo)
