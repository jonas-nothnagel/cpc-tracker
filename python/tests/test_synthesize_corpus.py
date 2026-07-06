"""Unit tests for corpus theme synthesis v2 (evidence tables, validation,
corrective retry, deterministic counts + aggregates)."""

from __future__ import annotations

import json

import pytest

import src.synthesize_corpus as sc
from src.synthesize_corpus import (
    build_evidence_tables,
    build_user_prompt,
    enforce_corpus_rules,
    synthesize_corpus,
    validate_corpus,
)


def _target(tid: str, doc: str, label: str | None = None) -> dict:
    return {
        "id": tid,
        "sourceDocument": doc,
        "sourceLabel": label or f"Target {tid}",
        "text": f"Verbatim policy text for {tid} about land, forests and water systems.",
    }


@pytest.fixture
def targets() -> list[dict]:
    return [
        _target("NDC_1", "NDC"),
        _target("NDC_2", "NDC"),
        _target("NAP_1", "NAP"),
        _target("NAP_2", "NAP"),
        _target("NMP_1", "NMP", label="Mineral expansion target"),
        _target("NMP_2", "NMP"),
        _target("NMP_3", "NMP"),
    ]


def _pair(a: str, b: str, level: str, **extra) -> dict:
    return {"targetAId": a, "targetBId": b, "alignment": level, **extra}


@pytest.fixture
def alignment() -> list[dict]:
    return [
        # 5 flagged pairs. NMP_1 participates in 3, NAP_1 in 2.
        _pair("NMP_1", "NDC_1", "flagged", mechanism="resource_competition",
              contestedResources=["land"]),
        _pair("NMP_1", "NDC_2", "flagged", mechanism="resource_competition",
              contestedResources=["land"]),
        _pair("NMP_1", "NAP_1", "flagged", mechanism="resource_competition",
              contestedResources=["land"]),
        _pair("NMP_2", "NAP_1", "flagged", mechanism="delivery_friction",
              contestedResources=["water"]),
        _pair("NMP_3", "NAP_2", "flagged", mechanism="delivery_friction"),
        # 4 aligned (medium/high) pairs.
        _pair("NDC_1", "NAP_1", "high"),
        _pair("NDC_2", "NAP_1", "medium"),
        _pair("NDC_1", "NAP_2", "medium"),
        _pair("NDC_2", "NMP_2", "medium"),
        # Non-signal levels.
        _pair("NDC_2", "NAP_2", "none"),
        _pair("NMP_2", "NAP_2", "low"),
    ]


@pytest.fixture
def classifications() -> list[dict]:
    return [
        {"targetId": "NMP_1", "taxonomyType": "globe", "categoryId": "G1", "isPrimary": True},
        {"targetId": "NMP_2", "taxonomyType": "globe", "categoryId": "G1", "isPrimary": True},
        {"targetId": "NDC_1", "taxonomyType": "sector", "categoryId": "S1", "isPrimary": True},
        {"targetId": "NAP_1", "taxonomyType": "gga", "categoryId": "T1", "isPrimary": True},
        # Non-primary and inactive-taxonomy records are ignored.
        {"targetId": "NMP_3", "taxonomyType": "globe", "categoryId": "G2", "isPrimary": False},
        {"targetId": "NMP_3", "taxonomyType": "nbs", "categoryId": "N1", "isPrimary": True},
    ]


def _synth() -> dict:
    return {
        "storyline_name": "Placeholder storyline",
        "reinforce": "r",
        "clash": "c",
        "coordination_hint": "h",
        "confidence": "medium",
    }


@pytest.fixture
def doc_pair_records() -> list[dict]:
    return [
        {"doc_a": "NDC", "doc_b": "NMP", "label_a": "Climate Plan",
         "label_b": "Mineral Policy", "aligned_count": 1, "flagged_count": 2,
         "synthesis": _synth()},
        {"doc_a": "NAP", "doc_b": "NMP", "label_a": "Adaptation Plan",
         "label_b": "Mineral Policy", "aligned_count": 0, "flagged_count": 3,
         "synthesis": _synth()},
        {"doc_a": "NAP", "doc_b": "NDC", "label_a": "Adaptation Plan",
         "label_b": "Climate Plan", "aligned_count": 3, "flagged_count": 0,
         "synthesis": _synth()},
    ]


GOOD_RESPONSE = {
    "storylines": [
        {
            "name": "Land requirements of mineral expansion incentives",
            "type": "friction",
            "description": (
                "Mineral expansion targets and restoration goals draw on the "
                "same land base, which may pull implementation in different directions."
            ),
            "pathway": (
                "Joint land-use mapping between the Mineral Policy and the "
                "Adaptation Plan could be a starting point for review."
            ),
            "contributing_doc_pairs": ["NDC<->NMP", "NAP<->NMP"],
            "anchor_target_ids": ["NMP_1"],
            "confidence": "high",
        },
        {
            "name": "Shared monitoring frameworks across climate plans",
            "type": "reinforcement",
            "description": (
                "The climate plans anchor delivery in shared monitoring "
                "systems and common indicators."
            ),
            "pathway": (
                "Indicator alignment between the NDC and the Adaptation Plan "
                "may deepen this pattern."
            ),
            "contributing_doc_pairs": ["NAP<->NDC"],
            "anchor_target_ids": ["NAP_1", "NDC_1"],
            "confidence": "medium",
        },
    ],
    "summary_paragraph": (
        "The corpus shows broad alignment on monitoring, with potential "
        "misalignment concentrated around land. Most pairs identified for "
        "review trace to a small set of mineral targets. Alignment between "
        "the climate plans is comparatively steady. A closer look at "
        "land-linked targets may be warranted."
    ),
}

BAD_RESPONSE = {
    "storylines": [
        {
            "name": "Review land competition from expansion incentives",
            "type": "friction",
            "description": "There is a tension between mining and restoration goals.",
            "pathway": "The government must fix this. It should act now.",
            "contributing_doc_pairs": ["NDC<->NMP"],
            "anchor_target_ids": ["NMP_1"],
            "confidence": "high",
        },
    ],
    "summary_paragraph": "Contradictions dominate the corpus.",
}


class StubLLM:
    """Records (system, user) calls and plays back queued responses."""

    def __init__(self, responses: list[dict]):
        self.responses = [json.dumps(r) for r in responses]
        self.calls: list[tuple[str, str]] = []

    async def __call__(self, system: str, user: str, **kwargs) -> str:
        self.calls.append((system, user))
        if len(self.responses) > 1:
            return self.responses.pop(0)
        return self.responses[0]


# ---------------------------------------------------------------------------
# Evidence tables
# ---------------------------------------------------------------------------


class TestEvidenceTables:
    def test_deterministic(self, targets, alignment, doc_pair_records):
        ev1 = build_evidence_tables(targets, alignment, doc_pair_records)
        ev2 = build_evidence_tables(targets, alignment, doc_pair_records)
        assert ev1 == ev2

    def test_doc_shares(self, targets, alignment, doc_pair_records):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        rows = {r["doc"]: r for r in ev["doc_shares"]}
        # NMP: 5 flagged of 7 scored; NAP: 3 of 7; NDC: 2 of 6.
        assert rows["NMP"]["flagged"] == 5 and rows["NMP"]["scored"] == 7
        assert rows["NAP"]["flagged"] == 3 and rows["NAP"]["scored"] == 7
        assert rows["NDC"]["flagged"] == 2 and rows["NDC"]["scored"] == 6
        # Sorted by share desc.
        assert [r["doc"] for r in ev["doc_shares"]] == ["NMP", "NAP", "NDC"]

    def test_top_flagged_targets(self, targets, alignment, doc_pair_records):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        top = ev["top_flagged_targets"]
        assert top[0]["id"] == "NMP_1" and top[0]["count"] == 3
        assert top[1]["id"] == "NAP_1" and top[1]["count"] == 2
        assert top[0]["label"] == "Mineral expansion target"
        assert len(top[0]["excerpt"]) <= 160

    def test_greedy_cover_threshold_stop(self, targets, alignment, doc_pair_records):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        gc = ev["greedy_cover"]
        # NMP_1 alone covers 3 of 5 pairs (60% >= 50%) -> greedy stops there.
        assert [t["id"] for t in gc["targets"]] == ["NMP_1"]
        assert gc["targets"][0]["marginal"] == 3
        assert gc["total_flagged"] == 5
        assert gc["share"] == pytest.approx(0.6)

    def test_greedy_port_parity_ties_and_marginal(self):
        """Hand-derived parity case for the computeTargetConcentration port:
        rank by count desc then id asc; marginal counts only newly covered
        pairs; stop once covered share reaches 50%."""
        docs = {"A": "D1", "B": "D2", "C": "D1", "D": "D2",
                "E": "D1", "F": "D2", "G": "D1", "H": "D1", "I": "D2"}
        targets = [_target(t, d) for t, d in docs.items()]
        flagged = [("A", "B"), ("A", "C"), ("A", "D"), ("B", "C"),
                   ("E", "F"), ("E", "G"), ("F", "G"), ("H", "I")]
        alignment = [_pair(a, b, "flagged") for a, b in flagged]
        ev = build_evidence_tables(targets, alignment, [])
        gc = ev["greedy_cover"]
        # A(3) first; then B, C, E, F, G all tie at 2 -> B wins by id; B adds
        # only B<->C (A<->B already covered) -> marginal 1; share hits 4/8.
        assert [(t["id"], t["count"], t["marginal"]) for t in gc["targets"]] == [
            ("A", 3, 3),
            ("B", 2, 1),
        ]
        assert gc["share"] == pytest.approx(0.5)

    def test_contested_resources(self, targets, alignment, doc_pair_records):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        assert ev["contested_resources"][0] == {"resource": "land", "count": 3}

    def test_allowed_anchor_sets(self, targets, alignment, doc_pair_records):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        assert "NMP_1" in ev["allowed_friction_anchors"]
        assert "NMP_1" not in ev["allowed_reinforcement_anchors"]
        assert "NAP_1" in ev["allowed_reinforcement_anchors"]

    def test_prompt_includes_tables_only_with_evidence(
        self, targets, alignment, doc_pair_records
    ):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        with_tables = build_user_prompt("Testland", doc_pair_records, ev)
        without = build_user_prompt("Testland", doc_pair_records, None)
        assert "EVIDENCE TABLES" in with_tables
        assert "anchor_target_ids" in with_tables
        assert "EVIDENCE TABLES" not in without
        assert "anchor_target_ids" not in without


# ---------------------------------------------------------------------------
# Validation + enforcement
# ---------------------------------------------------------------------------


class TestValidateCorpus:
    def test_good_response_clean(self, targets, alignment, doc_pair_records):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        parsed = json.loads(json.dumps(GOOD_RESPONSE))
        assert validate_corpus(parsed, ev, doc_pair_records) == []

    def test_bad_response_collects_violations(
        self, targets, alignment, doc_pair_records
    ):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        parsed = json.loads(json.dumps(BAD_RESPONSE))
        violations = validate_corpus(parsed, ev, doc_pair_records)
        joined = "\n".join(violations)
        assert "imperative verb" in joined
        assert "tension" in joined
        assert "one sentence" in joined
        assert "contradiction" in joined

    def test_cap_and_disjointness_violations(
        self, targets, alignment, doc_pair_records
    ):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        theme = GOOD_RESPONSE["storylines"][0]
        parsed = {
            "storylines": [json.loads(json.dumps(theme)) for _ in range(4)],
            "summary_paragraph": "Fine.",
        }
        violations = validate_corpus(parsed, ev, doc_pair_records)
        joined = "\n".join(violations)
        assert "at most 3 themes of type 'friction'" in joined
        assert "disjoint" in joined

    def test_anchor_violations(self, targets, alignment, doc_pair_records):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        parsed = json.loads(json.dumps(GOOD_RESPONSE))
        # NAP_1 is a reinforcement anchor, not a friction one; NOPE_1 unknown.
        parsed["storylines"][0]["anchor_target_ids"] = ["NAP_1", "NOPE_1"]
        violations = validate_corpus(parsed, ev, doc_pair_records)
        assert any("anchor_target_ids" in v for v in violations)


class TestEnforceCorpusRules:
    def test_caps_drop_excess_keep_order(self, targets, alignment, doc_pair_records):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        themes = []
        for i, pair in enumerate(["NDC<->NMP", "NAP<->NMP", "NAP<->NDC", "NDC<->NMP"]):
            t = json.loads(json.dumps(GOOD_RESPONSE["storylines"][1]))
            t["name"] = f"Shared monitoring frameworks across plans {i}"
            t["contributing_doc_pairs"] = [pair]
            themes.append(t)
        parsed = {"storylines": themes, "summary_paragraph": "Fine."}
        warnings = enforce_corpus_rules(parsed, ev, doc_pair_records)
        kept = parsed["storylines"]
        assert len(kept) == 3
        assert [t["name"][-1] for t in kept] == ["0", "1", "2"]
        assert any("exceeds 3 reinforcement" in w for w in warnings)

    def test_friction_disjointness_first_claim_wins(
        self, targets, alignment, doc_pair_records
    ):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        first = json.loads(json.dumps(GOOD_RESPONSE["storylines"][0]))
        second = json.loads(json.dumps(GOOD_RESPONSE["storylines"][0]))
        second["name"] = "Water demands of processing facilities nearby"
        second["contributing_doc_pairs"] = ["NAP<->NMP"]  # claimed by first
        parsed = {"storylines": [first, second], "summary_paragraph": "Fine."}
        warnings = enforce_corpus_rules(parsed, ev, doc_pair_records)
        assert len(parsed["storylines"]) == 1
        assert any("dropped friction theme" in w for w in warnings)

    def test_disjointness_partial_drop_keeps_theme(
        self, targets, alignment, doc_pair_records
    ):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        first = json.loads(json.dumps(GOOD_RESPONSE["storylines"][0]))
        first["contributing_doc_pairs"] = ["NDC<->NMP"]
        second = json.loads(json.dumps(GOOD_RESPONSE["storylines"][0]))
        second["name"] = "Water demands of processing facilities nearby"
        second["contributing_doc_pairs"] = ["NDC<->NMP", "NAP<->NMP"]
        parsed = {"storylines": [first, second], "summary_paragraph": "Fine."}
        enforce_corpus_rules(parsed, ev, doc_pair_records)
        assert len(parsed["storylines"]) == 2
        assert parsed["storylines"][1]["contributing_doc_pairs"] == ["NAP<->NMP"]

    def test_label_alias_counts_as_same_pair(
        self, targets, alignment, doc_pair_records
    ):
        """Disjointness resolves human labels to the same underlying doc pair."""
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        first = json.loads(json.dumps(GOOD_RESPONSE["storylines"][0]))
        first["contributing_doc_pairs"] = ["Mineral Policy<->Climate Plan"]
        second = json.loads(json.dumps(GOOD_RESPONSE["storylines"][0]))
        second["name"] = "Water demands of processing facilities nearby"
        second["contributing_doc_pairs"] = ["NDC<->NMP"]
        parsed = {"storylines": [first, second], "summary_paragraph": "Fine."}
        warnings = enforce_corpus_rules(parsed, ev, doc_pair_records)
        assert len(parsed["storylines"]) == 1
        assert any("already claimed" in w for w in warnings)

    def test_anchor_filtering(self, targets, alignment, doc_pair_records):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        parsed = json.loads(json.dumps(GOOD_RESPONSE))
        # Reinforcement theme: NMP_1 participates in flagged pairs only, so it
        # is a friction-side anchor; NOPE_1 is unknown -> both dropped.
        parsed["storylines"][1]["anchor_target_ids"] = ["NAP_1", "NMP_1", "NOPE_1"]
        warnings = enforce_corpus_rules(parsed, ev, doc_pair_records)
        assert parsed["storylines"][1]["anchor_target_ids"] == ["NAP_1"]
        assert any("dropped anchor targets" in w for w in warnings)

    def test_anchor_normalization_recovers_decorated_ids(
        self, targets, alignment, doc_pair_records
    ):
        """Models copy the whole evidence-table line; the leading bare id is
        deterministically recoverable and must survive without a warning."""
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        parsed = json.loads(json.dumps(GOOD_RESPONSE))
        parsed["storylines"][0]["anchor_target_ids"] = [
            "NMP_1 (Mineral expansion target)",
            'NMP_1 (Mineral expansion target): 3 pairs. "Verbatim..."',
            "NMP_2:",
        ]
        # Decorated forms raise no validation violation...
        assert validate_corpus(parsed, ev, doc_pair_records) == []
        warnings = enforce_corpus_rules(parsed, ev, doc_pair_records)
        # ...and normalize to deduped bare ids with no drop warning.
        assert parsed["storylines"][0]["anchor_target_ids"] == ["NMP_1", "NMP_2"]
        assert warnings == []

    def test_sanitizes_prose(self, targets, alignment, doc_pair_records):
        ev = build_evidence_tables(targets, alignment, doc_pair_records)
        parsed = json.loads(json.dumps(BAD_RESPONSE))
        enforce_corpus_rules(parsed, ev, doc_pair_records)
        theme = parsed["storylines"][0]
        assert theme["name"] == "Land competition from expansion incentives"
        assert "tension" not in theme["description"]
        assert "must" not in theme["pathway"] and "should" not in theme["pathway"]
        assert "Contradiction" not in parsed["summary_paragraph"]


# ---------------------------------------------------------------------------
# End-to-end with stubbed LLM
# ---------------------------------------------------------------------------


class TestSynthesizeCorpus:
    async def test_clean_first_answer_single_call(
        self, monkeypatch, targets, alignment, doc_pair_records, classifications
    ):
        stub = StubLLM([GOOD_RESPONSE])
        monkeypatch.setattr(sc, "call_llm", stub)
        result = await synthesize_corpus(
            doc_pair_records, "Testland",
            targets=targets, alignment=alignment, classifications=classifications,
        )
        assert len(stub.calls) == 1
        assert "EVIDENCE TABLES" in stub.calls[0][1]
        assert result["schema_version"] == 2
        assert result["validation_warnings"] == []

    async def test_friction_counts_exact(
        self, monkeypatch, targets, alignment, doc_pair_records, classifications
    ):
        stub = StubLLM([GOOD_RESPONSE])
        monkeypatch.setattr(sc, "call_llm", stub)
        result = await synthesize_corpus(
            doc_pair_records, "Testland",
            targets=targets, alignment=alignment, classifications=classifications,
        )
        friction = next(s for s in result["storylines"] if s["type"] == "friction")
        # Exactly the flagged counts of its two (disjoint) doc pairs: 2 + 3.
        assert friction["pair_count"] == 5
        reinforcement = next(
            s for s in result["storylines"] if s["type"] == "reinforcement"
        )
        assert reinforcement["pair_count"] == 3

    async def test_aggregates(
        self, monkeypatch, targets, alignment, doc_pair_records, classifications
    ):
        stub = StubLLM([GOOD_RESPONSE])
        monkeypatch.setattr(sc, "call_llm", stub)
        result = await synthesize_corpus(
            doc_pair_records, "Testland",
            targets=targets, alignment=alignment, classifications=classifications,
        )
        friction = next(s for s in result["storylines"] if s["type"] == "friction")
        agg = friction["aggregates"]
        assert agg["pair_total"] == 5
        doc_shares = {d["doc"]: d for d in agg["doc_shares"]}
        assert doc_shares["NMP"]["count"] == 5
        assert doc_shares["NMP"]["share"] == pytest.approx(1.0)
        assert doc_shares["NAP"]["count"] == 3
        assert agg["top_targets"][0] == {"id": "NMP_1", "count": 3}
        assert agg["contested_resources"][0] == {"resource": "land", "count": 3}
        assert agg["mechanisms"] == {"resource_competition": 3, "delivery_friction": 2}
        # Primary classifications only, active taxonomies only.
        tags = {(t["taxonomy"], t["category_id"]): t["count"] for t in agg["sector_tags"]}
        assert tags[("globe", "G1")] == 2
        assert ("nbs", "N1") not in tags
        reinforcement = next(
            s for s in result["storylines"] if s["type"] == "reinforcement"
        )
        assert "contested_resources" not in reinforcement["aggregates"]
        assert reinforcement["aggregates"]["pair_total"] == 3

    async def test_corrective_retry_changes_prompt(
        self, monkeypatch, targets, alignment, doc_pair_records, classifications
    ):
        stub = StubLLM([BAD_RESPONSE, GOOD_RESPONSE])
        monkeypatch.setattr(sc, "call_llm", stub)
        result = await synthesize_corpus(
            doc_pair_records, "Testland",
            targets=targets, alignment=alignment, classifications=classifications,
        )
        assert len(stub.calls) == 2
        first_user, second_user = stub.calls[0][1], stub.calls[1][1]
        assert "CORRECTIONS REQUIRED" not in first_user
        assert "CORRECTIONS REQUIRED" in second_user
        assert second_user.startswith(first_user)
        # Retry answer was clean and is what ships.
        names = [s["name"] for s in result["storylines"]]
        assert "Land requirements of mineral expansion incentives" in names
        assert result["validation_warnings"] == []

    async def test_stubborn_model_gets_sanitized(
        self, monkeypatch, targets, alignment, doc_pair_records, classifications
    ):
        stub = StubLLM([BAD_RESPONSE, BAD_RESPONSE])
        monkeypatch.setattr(sc, "call_llm", stub)
        result = await synthesize_corpus(
            doc_pair_records, "Testland",
            targets=targets, alignment=alignment, classifications=classifications,
        )
        assert len(stub.calls) == 2
        theme = result["storylines"][0]
        assert theme["name"] == "Land competition from expansion incentives"
        assert "tension" not in theme["description"]
        assert any("style" in w for w in result["validation_warnings"])

    async def test_legacy_call_without_new_args(
        self, monkeypatch, doc_pair_records
    ):
        stub = StubLLM([GOOD_RESPONSE])
        monkeypatch.setattr(sc, "call_llm", stub)
        result = await synthesize_corpus(doc_pair_records, "Testland")
        assert len(stub.calls) == 1
        assert "EVIDENCE TABLES" not in stub.calls[0][1]
        friction = next(s for s in result["storylines"] if s["type"] == "friction")
        assert friction["pair_count"] == 5  # from doc-pair record counts
        assert "aggregates" not in friction
        assert result["schema_version"] == 2

    async def test_empty_input(self):
        result = await synthesize_corpus([], "Testland")
        assert result["storylines"] == []
        assert result["schema_version"] == 2
