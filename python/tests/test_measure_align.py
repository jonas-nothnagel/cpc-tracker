"""Guards for the measure-alignment prompt adaptation (v3, 2026-06-10).

The measure advisor reuses the canonical v2.1 rubric but must never frame the
reported BTR action as a policy target: ~70% of v2 rationales opened with
"Both targets ..." because the canonical template labelled both sides as
targets and gave no wording instruction. These tests pin the rewrites and the
side-labelling so a drift in align.py or a refactor here fails loudly.
"""

from src.align import ADVISOR_USER_TEMPLATE, DOC_TYPE_LABELS
from src.measure_align import (
    CROSS_TYPE_INTRO_FRAMING,
    MEASURE_ADVISOR_SYSTEM,
    MEASURE_ADVISOR_USER_TEMPLATE,
    MEASURE_INTRO_FRAMING,
    _side_label,
    measures_to_pseudo_targets,
)


def test_measure_template_never_calls_the_action_a_target():
    # The pair-framing lines are rewritten ...
    assert "Compare a policy target with a reported implementation action" in (
        MEASURE_ADVISOR_USER_TEMPLATE
    )
    assert "- {target_1_type}: {target_1_decomp}" in MEASURE_ADVISOR_USER_TEMPLATE
    assert "- {target_2_type}: {target_2_decomp}" in MEASURE_ADVISOR_USER_TEMPLATE
    assert "impact of both sides" in MEASURE_ADVISOR_USER_TEMPLATE
    # ... while the canonical target-target template stays untouched (its
    # prompt cache must not be invalidated by the measure adaptation).
    assert "Compare two structured targets" in ADVISOR_USER_TEMPLATE
    assert "- {target_1_type} target: {target_1_decomp}" in ADVISOR_USER_TEMPLATE


def test_rubric_and_examples_stay_shared_with_canonical_template():
    # Everything outside the three rewritten framing lines is byte-identical,
    # so verdict churn from the v3 change is limited to framing, not rubric.
    canon = ADVISOR_USER_TEMPLATE.splitlines()
    measure = MEASURE_ADVISOR_USER_TEMPLATE.splitlines()
    assert len(canon) == len(measure)
    diff = [i for i, (a, b) in enumerate(zip(canon, measure)) if a != b]
    assert 0 < len(diff) <= 5  # goal line + 3-line task block + step 2


def test_wording_rules_present_in_both_framings():
    for framing in (MEASURE_INTRO_FRAMING, CROSS_TYPE_INTRO_FRAMING):
        assert 'never write "both targets"' in framing
    assert "NOT a policy target" in MEASURE_INTRO_FRAMING
    assert "neither side is a policy target" in CROSS_TYPE_INTRO_FRAMING
    assert "Implementation Alignment Advisor" in MEASURE_ADVISOR_SYSTEM


def test_side_labels_distinguish_targets_from_reported_actions():
    assert _side_label({"sourceDocument": "NDC"}, DOC_TYPE_LABELS) == (
        "Policy target (NDC)"
    )
    # Pseudo-actions are marked by their measureStatus field.
    mit = measures_to_pseudo_targets(
        [{"name": "Wind farms", "status": "Adopted"}], action_type="mitigation"
    )[0]
    adp = measures_to_pseudo_targets(
        [{"name": "Pasture management", "status": "Ongoing"}],
        action_type="adaptation",
    )[0]
    assert _side_label(mit, DOC_TYPE_LABELS) == "Reported mitigation action (BTR)"
    assert _side_label(adp, DOC_TYPE_LABELS) == "Reported adaptation action (BTR)"
