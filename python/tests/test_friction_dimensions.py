"""Unit tests for friction-dimension extraction helpers (no LLM).

These cover the faithfulness guards: a chip may only carry a resource or place
that the rationale text actually states.
"""

from __future__ import annotations

import json

from src.extract_friction_dimensions import _clean_context, _clean_fields, _grounded


class TestGrounded:
    def test_token_present(self):
        assert _grounded("land", "compete for the same finite land base")

    def test_token_absent(self):
        assert not _grounded("uranium", "compete for the same finite land base")

    def test_short_token_never_grounds(self):
        # tokens < 4 chars are ignored, so a bare "oil" cannot ground
        assert not _grounded("oil", "land and water management")


class TestCleanContext:
    def test_strips_leading_qualifiers(self):
        assert _clean_context("some of those same basins") == "basins"

    def test_keeps_clean_place(self):
        assert _clean_context("Panama Canal watershed") == "Panama Canal watershed"

    def test_strips_overlapping(self):
        assert _clean_context("overlapping watershed-linked areas") == "watershed-linked areas"


def _raw(resources=None, context=""):
    return json.dumps({"contestedResources": resources or [], "sharedContext": context})


class TestCleanFields:
    def test_keeps_grounded_resources(self):
        res, _ = _clean_fields(_raw(["land", "water"]), "compete for the same land and water")
        assert res == ["land", "water"]

    def test_drops_hallucinated_resource(self):
        res, _ = _clean_fields(_raw(["diamonds"]), "compete for the same land base")
        assert res == []

    def test_rejects_activity_phrases(self):
        res, _ = _clean_fields(
            _raw(["land use", "land-use planning"]),
            "incentive-based land-use planning across basins",
        )
        assert res == []

    def test_keeps_plural_faithfully(self):
        # No singularization: show the plural the rationale actually used.
        res, _ = _clean_fields(_raw(["lands"]), "plantations on private and state lands")
        assert res == ["lands"]

    def test_does_not_mangle_non_plural(self):
        # "species" must not become "specie" (a word the rationale never wrote).
        res, _ = _clean_fields(_raw(["species"]), "habitat for endemic species")
        assert res == ["species"]

    def test_non_list_resources_safe(self):
        # A scalar/null for contestedResources must not crash.
        res, ctx = _clean_fields(
            json.dumps({"contestedResources": 2, "sharedContext": ""}), "land base"
        )
        assert res == [] and ctx == ""

    def test_dedupes_and_caps_at_three(self):
        res, _ = _clean_fields(
            _raw(["land", "land", "water", "forest", "energy"]),
            "land water forest energy all named here",
        )
        assert res == ["land", "water", "forest"]

    def test_context_cleaned_and_grounded(self):
        _, ctx = _clean_fields(
            _raw([], "some of those same basins"),
            "development pressure in the same basins",
        )
        assert ctx == "basins"

    def test_context_dropped_if_ungrounded(self):
        _, ctx = _clean_fields(_raw([], "Atlantic seaboard"), "land and water in the watershed")
        assert ctx == ""

    def test_partial_place_fabrication_dropped(self):
        # Every significant word of a place must appear in the rationale; a
        # phrase with only one matching token is dropped whole.
        _, ctx = _clean_fields(
            _raw([], "coastal mining zones"), "development pressure on protected zones"
        )
        assert ctx == ""

    def test_empty_on_non_json(self):
        res, ctx = _clean_fields("not json at all", "land base")
        assert res == [] and ctx == ""
