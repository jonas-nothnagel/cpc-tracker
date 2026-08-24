"""Invariant guards for the v2.2 advisor-prompt revision (2026-07).

Background: under the v2.1 template DeepSeek-V4-Pro flagged 9,537 of 9,678
Mongolia target pairs (98.5%). Root cause was a set of prompt features a
literalist model can generalize from: "This is the most common case" under
Delivery friction, a Low-confidence rubric that legitimized flagging pure
hunches, and worked Example E demonstrating a flag for a friction "two steps
removed... inferred rather than named". v2.2 removes each feature and adds a
text-grounding gate. These tests pin the load-bearing edits and the parser
contract so a later template change cannot silently reintroduce them.

Deliberately NOT a full snapshot test: wording is expected to be tuned during
calibration; only the invariants below must hold.
"""

import re

from src.align import (
    ADVISOR_SYSTEM,
    ADVISOR_USER_TEMPLATE,
    ALIGNMENT_CACHE_NAMESPACE,
    PROMPT_VERSION,
)
from src.budget_align import BUDGET_CACHE_NAMESPACE, BUDGET_INTRO_FRAMING
from src.measure_align import (
    MEASURE_ADVISOR_USER_TEMPLATE,
    MEASURE_CACHE_NAMESPACE,
    MEASURE_INTRO_FRAMING,
)

_DUMMY_FIELDS = dict(
    intro_framing="",
    target_1_type="Policy A",
    target_1_decomp="decomp a",
    target_2_type="Policy B",
    target_2_decomp="decomp b",
)

# The parser contract: these Return lines are what parse_alignment anchors on
# and what the regression tests in test_parse.py exercise. They must survive
# any prompt tuning byte-for-byte.
_RETURN_LINES = [
    "Return: No alignment - [Concise 2-sentence explanation.]",
    "Return: Low alignment - [Concise 2-sentence explanation.]",
    "Return: Medium alignment - [Concise 2-sentence explanation.]",
    "Return: High alignment - [Concise 2-sentence explanation.]",
    "Return: Flagged for review (<Goal conflict | Resource competition | "
    "Delivery friction>, <Manageable | Fundamental>, Confidence: "
    "<High | Medium | Low>) - [Concise 2-sentence explanation.]",
]


def test_prompt_version_is_stamped():
    assert PROMPT_VERSION == "2.2"


def test_return_format_lines_unchanged():
    for line in _RETURN_LINES:
        assert line in ADVISOR_USER_TEMPLATE, f"parser-contract line missing: {line}"


def test_exploitable_features_removed():
    # Delivery friction must not present itself as the default/common bucket.
    assert "This is the most common case" not in ADVISOR_USER_TEMPLATE
    # The Low-confidence rubric must not legitimize inference-only flags.
    assert "hunch worth checking" not in ADVISOR_USER_TEMPLATE
    assert "you are extrapolating" not in ADVISOR_USER_TEMPLATE
    # The old boundary-rule closer that read as "any friction signal is
    # flagged" must stay gone.
    assert "even a clearly named friction is flagged" not in ADVISOR_USER_TEMPLATE


def test_grounding_gate_present():
    # The flag gate: friction ingredients named in the text or one direct step
    # from named activities, plus the confidence-never-substitutes rule.
    assert "single direct step" in ADVISOR_USER_TEMPLATE
    assert "do not flag at any confidence" in ADVISOR_USER_TEMPLATE
    # The alignment-scale-first decision procedure.
    assert "Work down the alignment scale first" in ADVISOR_USER_TEMPLATE


def test_flagged_examples_include_a_counter_example():
    assert "COUNTER-EXAMPLE" in ADVISOR_USER_TEMPLATE
    # The counter-example must demonstrate a non-flag verdict inside the
    # flagged section (Example E outputs Low alignment).
    counter_idx = ADVISOR_USER_TEMPLATE.index("COUNTER-EXAMPLE")
    tail = ADVISOR_USER_TEMPLATE[counter_idx:]
    assert "Low alignment -" in tail.split("Example F")[0]


def test_no_banned_vocabulary_in_prompt():
    # Models echo prompt language; guardrail-banned display vocabulary must
    # not appear anywhere the model could imitate it.
    for template in (
        ADVISOR_SYSTEM,
        ADVISOR_USER_TEMPLATE,
        MEASURE_INTRO_FRAMING,
        BUDGET_INTRO_FRAMING,
    ):
        assert not re.search(r"tension|contradict", template, re.IGNORECASE)


def test_templates_format_cleanly():
    for template in (ADVISOR_USER_TEMPLATE, MEASURE_ADVISOR_USER_TEMPLATE):
        rendered = template.format(**_DUMMY_FIELDS)
        assert "{" not in rendered and "}" not in rendered, (
            "unformatted placeholder or stray brace survived .format()"
        )


def test_cache_namespaces_bumped_for_v22():
    # v2.1 responses live in the retired namespaces; v2.2 must never read them.
    retired = {
        "alignment_v2",
        "measure_alignment_v3",
        "budget_alignment_v2",
    }
    current = {
        ALIGNMENT_CACHE_NAMESPACE,
        MEASURE_CACHE_NAMESPACE,
        BUDGET_CACHE_NAMESPACE,
    }
    assert current.isdisjoint(retired)
    assert len(current) == 3
