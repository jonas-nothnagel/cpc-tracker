"""Step 3 of the BER plan, the official chain: each budget line's expenditure
type in BIOFIN's GLOBE taxonomy (level 3, python/data/globe-expenditure-types
.json), and through it the targets of the Kunming-Montreal Global
Biodiversity Framework (GBF) that BIOFIN files the type under. A country's
7th National Report files each national target under GBF targets too, so a
line and a national target meet where they share a GBF target.

The two models of step 2 read the same description of each line, with the
same project-defined prompt (src/ber_areas.py), and score the types instead
of the areas. A line links to a GBF target only where both models place it
in a type that BIOFIN files under that target, each at the tool's relevance
mark (RELEVANCE_THRESHOLD, 0.5); every other line is kept apart. Two models
agreeing is not a person's check: the types stay AI-suggested until one.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from .classify import RELEVANCE_THRESHOLD
from .config import DATA_DIR

PROMPT_VERSION = 1
PIPELINE_NAMESPACE = f"ber_line_type_v{PROMPT_VERSION}"
CLAUDE_NAMESPACE = f"ber_line_type_claude_v{PROMPT_VERSION}"
LENS_NAME = "GLOBE expenditure types (level 3 of BIOFIN's Global Biodiversity Expenditure taxonomy)"
TYPES_FILE = DATA_DIR / "globe-expenditure-types.json"


def load_types(path: Path = TYPES_FILE) -> dict[str, Any]:
    return json.loads(path.read_text())


def type_categories(types: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """The types as the prompt's catalogue: BIOFIN's name, definition and the
    expenditure it may include, verbatim."""
    out = []
    for t in types:
        parts = [t["definition"]] if t["definition"] else []
        if t["examples"]:
            parts.append(f"May include: {t['examples']}")
        out.append({"id": t["id"], "name": t["name"], "description": " ".join(parts)})
    return out


def relevant_gbf(ranked: Sequence[dict[str, Any]], gbf_of: dict[str, list[int]]) -> set[int]:
    """The GBF targets of every type a model scores at the relevance mark."""
    return {g for r in ranked if r["score"] >= RELEVANCE_THRESHOLD for g in gbf_of.get(r["id"], [])}


def chain_reading(
    first: Sequence[dict[str, Any]], second: Sequence[dict[str, Any]] | None, gbf_of: dict[str, list[int]]
) -> dict[str, Any]:
    """A line's place in the official chain: its type (the pipeline's model's
    top type at the relevance mark, and whether the second model's top type is
    the same), and the GBF targets both models' relevant types share."""
    top = first[0] if first and first[0]["score"] >= RELEVANCE_THRESHOLD else None
    other = second[0] if second and second[0]["score"] >= RELEVANCE_THRESHOLD else None
    if top is None:
        type_status = "no-clear-type"
    elif second is None:
        type_status = "one-model"
    else:
        type_status = "models-agree" if other and other["id"] == top["id"] else "models-differ"
    shared = relevant_gbf(first, gbf_of) & (relevant_gbf(second, gbf_of) if second is not None else relevant_gbf(first, gbf_of))
    return {
        "type": top["id"] if top else None,
        "typeStatus": type_status,
        "gbf": sorted(shared),
        "status": "linked" if shared else "apart",
    }
