"""The AI's contract explanations in the agreed vocabulary.

CLAUDE.md: the pipeline flags pairs for review; its wording is "possible
misalignment / possible conflict / likely conflict", never "tension" or
"contradiction". The team's vocabulary rule also drops "friction" and the
verbs "pull against" / "work against" for the flagged relation. The August
comparisons of contracts with targets predate both rules, so the bake rewords
them. Every case below is a sentence (or its core) from the record.
"""

from __future__ import annotations

import gzip
import json
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from contract_wording import BANNED, agreed_wording  # noqa: E402

REPO = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    ("before", "after"),
    [
        # "tension", by what qualifies it
        (
            "and that tension would require changing or limiting one side rather than simple coordination.",
            "and that possible conflict would require changing or limiting one side rather than simple coordination.",
        ),
        (
            "so the tension is inherent in the pair rather than resolvable through simple coordination.",
            "so the possible conflict is inherent in the pair rather than resolvable through simple coordination.",
        ),
        (
            "This is a direct tension in stated implementation direction, not just a sectoral difference.",
            "This is a likely conflict in stated implementation direction, not just a sectoral difference.",
        ),
        (
            "This is a concrete implementation tension rather than a completely separate activity.",
            "This is a likely implementation conflict rather than a completely separate activity.",
        ),
        (
            "This creates a clear implementation tension, though it could be managed.",
            "This creates a likely implementation conflict, though it could be managed.",
        ),
        (
            "This is a concrete delivery tension around mode choice rather than a different geography.",
            "This is a likely delivery conflict around mode choice rather than a different geography.",
        ),
        (
            "This is a direct implementation-level tension in the same broad buildings and heat-supply space.",
            "This is a likely implementation-level conflict in the same broad buildings and heat-supply space.",
        ),
        (
            "This is a concrete opposing-goal tension, not just a sector difference.",
            "This is a likely conflict between goals, not just a sector difference.",
        ),
        (
            "and creates a clear emissions-reduction tension, though it could be managed.",
            "and creates a likely conflict with emissions reduction, though it could be managed.",
        ),
        (
            "the core tension is not just delivery coordination but the opposing direction",
            "the likely conflict is not just delivery coordination but the opposing direction",
        ),
        # "contradiction": in the record it is always negated, so it becomes "conflict"
        (
            "This is best treated as a manageable delivery friction rather than a fundamental contradiction, because",
            "This is best treated as a manageable delivery misalignment rather than a fundamental conflict, because",
        ),
        (
            "rather than an unavoidable contradiction across the whole transport sector",
            "rather than an unavoidable conflict across the whole transport sector",
        ),
        (
            "may be manageable as a short-term heating need rather than a permanent policy contradiction.",
            "may be manageable as a short-term heating need rather than a permanent policy conflict.",
        ),
        (
            "so this is a concrete delivery contradiction worth review",
            "so this is a likely delivery conflict worth review",
        ),
        (
            "the friction is not just sectoral difference but a direct contradiction between expanding low-carbon supply and",
            "the possible misalignment is not just sectoral difference but a likely conflict between expanding low-carbon supply and",
        ),
        (
            "with the playground component complementary rather than contradictory to the greening objective.",
            "with the playground component complementary rather than at odds with the greening objective.",
        ),
        # "friction"
        (
            "This creates a direct implementation friction because expanding road haulage can undermine the pathway.",
            "This creates a likely implementation conflict because expanding road haulage can undermine the pathway.",
        ),
        (
            "and the friction is manageable only if the contract is transitional.",
            "and the possible misalignment is manageable only if the contract is transitional.",
        ),
        (
            "The friction is concrete because mining excavation works against the land-protection outcomes",
            "The possible misalignment is concrete because mining excavation may conflict with the land-protection outcomes",
        ),
        # "clash"
        (
            "so this is not a shared-geography resource clash, but",
            "so this is not a shared-geography resource conflict, but",
        ),
        (
            "This is a concrete implementation clash in the same coal export transport space",
            "This is a likely implementation conflict in the same coal export transport space",
        ),
        # verbs for the flagged relation
        (
            "enables coal logistics in a way that pulls against the target's emissions-reduction objective",
            "enables coal logistics in a way that may conflict with the target's emissions-reduction objective",
        ),
        (
            "Procuring coal directly pulls against the target's stated decarbonisation pathway.",
            "Procuring coal likely conflicts with the target's stated decarbonisation pathway.",
        ),
        (
            "the contract supports the coal supply chain which directly works against the target's objective",
            "the contract supports the coal supply chain which likely conflicts with the target's objective",
        ),
        (
            "a fossil fuel whose use in building heat supply runs against that emissions-reduction path",
            "a fossil fuel whose use in building heat supply may conflict with that emissions-reduction path",
        ),
        (
            "the contract operationally enables movement of coal logistics, pulling against the target's objective",
            "the contract operationally enables movement of coal logistics, potentially conflicting with the target's objective",
        ),
        (
            "expanding coal logistics can work against the target's emissions-reduction objective",
            "expanding coal logistics can conflict with the target's emissions-reduction objective",
        ),
        (
            "whose use in building heat supply would directly work against that decarbonisation objective",
            "whose use in building heat supply would directly conflict with that decarbonisation objective",
        ),
        (
            "this contract appears to work against a core measure of the target",
            "this contract appears to conflict with a core measure of the target",
        ),
        (
            "the contract would need to be limited to avoid working against the target.",
            "the contract would need to be limited to avoid conflicting with the target.",
        ),
        (
            "appears ancillary to protecting the new green areas rather than pulling against the target",
            "appears ancillary to protecting the new green areas rather than conflicting with the target",
        ),
    ],
)
def test_the_agreed_wording_replaces_the_retired_terms(before: str, after: str) -> None:
    assert agreed_wording(before) == after


@pytest.mark.parametrize(
    "text",
    [
        # "work" as a noun, not the flagged relation
        "the contracted activity carries out protective forest belt and afforestation work against desertification",
        "the contracted activity directly funds on-the-ground control work against forest pests",
        # words that merely contain the letters
        "An extension of the rail line, with attention to high-voltage lines.",
    ],
)
def test_other_uses_are_left_alone(text: str) -> None:
    assert agreed_wording(text) == text


def test_an_article_follows_the_new_word() -> None:
    assert agreed_wording("This is an implementation tension.") == "This is a possible implementation conflict."


def test_a_capital_at_the_start_of_a_sentence_stays() -> None:
    assert agreed_wording("Tension remains in delivery.") == "Possible conflict remains in delivery."


def test_every_explanation_on_the_page_uses_the_agreed_wording() -> None:
    path = REPO / "python/output/mongolia/gpt-5-4/contract-details.json.gz"
    details = json.loads(gzip.decompress(path.read_bytes()))
    left = [
        (cid, kind, m.group(0))
        for cid, record in details.items()
        for kind in ("strong", "misaligned")
        for item in record[kind]
        for m in [re.search(BANNED, item["text"])]
        if m
    ]
    assert not left, f"{len(left)} explanations still use a retired term, e.g. {left[:3]}"
