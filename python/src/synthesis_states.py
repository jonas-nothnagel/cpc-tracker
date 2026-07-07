"""
Storyline precompute states for the document include/exclude toggle.

The findings-home dashboard lets users hide/show documents client-side. Every
number, wheel ribbon, and matrix cell recomputes live in the browser from the
raw targets + alignment arrays. The one layer that cannot recompute live is the
LLM-written storyline layer (doc-pair / corpus / sector synthesis).

So the pipeline precomputes the states users actually reach -- the full
corpus, every single-document-hidden state (bounded: corpora of at most
`MAX_SINGLE_DOC_STATES` documents; removing one document is the dominant
gesture), each contested (default-hidden) document removed, and the
briefing-default combo (defaultHidden union secondary doc types, the exact
selection the briefing page lands on) -- and the frontend swaps to the
matching precomputed set with no live LLM call at view time. Arbitrary
multi-document subsets stay lazy via the /api/storyline-state route.

Helpers here are pure and unit-testable. The two filter functions mirror the
exact subset rules the frontend applies (a doc-pair drops if either side is
hidden; an alignment pair drops if either endpoint target is hidden), so the
precomputed storylines match what the browser shows.
"""

from __future__ import annotations

from typing import Any

# Cap so a country config that default-hides many documents can never balloon
# the precompute. Each non-full state adds one corpus call plus a handful of
# sector calls (unchanged-prompt sectors hit the disk cache). Two contested
# documents is already generous for the linear toggle model the UI exposes.
MAX_PRECOMPUTE_DOCS = 4

# Per-document single-hidden states are only precomputed for corpora up to
# this many documents; larger corpora fall back to the lazy regen route for
# anything beyond the default-hidden states.
MAX_SINGLE_DOC_STATES = 10


def canonical_hidden_key(hidden: list[str] | set[str]) -> str:
    """Canonical string key for a hidden-doc set. Empty set -> "" (full corpus).

    Must stay byte-identical to the frontend's `canonicalHiddenKey` (sorted,
    "+"-joined) so the client can select the precomputed state that matches its
    current selection.
    """
    return "+".join(sorted(set(hidden)))


def precompute_hidden_states(
    default_hidden: list[str],
    all_doc_types: list[str] | None = None,
    secondary_doc_types: list[str] | None = None,
) -> list[list[str]]:
    """The hidden-doc sets to precompute storylines for.

    Returns, deduplicated by canonical key (order preserved):

    - the full corpus (``[]``), always first;
    - one state per default-hidden document (capped by
      ``MAX_PRECOMPUTE_DOCS``), plus the combined default view when more than
      one document is hidden by default (legacy behaviour, kept so existing
      state keys stay covered);
    - one state per document in ``all_doc_types`` when the corpus has at most
      ``MAX_SINGLE_DOC_STATES`` documents (removing a single document is the
      dominant toggle gesture, so it always gets an exact precomputed match);
    - the briefing-default combo (``default_hidden`` union
      ``secondary_doc_types``), the selection the briefing page actually
      lands on when secondary documents exist.
    """
    capped = list(dict.fromkeys(default_hidden))[:MAX_PRECOMPUTE_DOCS]
    states: list[list[str]] = [[]]  # full corpus first
    for doc in capped:
        states.append([doc])
    if len(capped) > 1:
        states.append(list(capped))
    if all_doc_types is not None and len(all_doc_types) <= MAX_SINGLE_DOC_STATES:
        for doc in dict.fromkeys(all_doc_types):
            states.append([doc])
    briefing_combo = list(dict.fromkeys([*default_hidden, *(secondary_doc_types or [])]))
    if briefing_combo:
        states.append(briefing_combo)
    seen: set[str] = set()
    out: list[list[str]] = []
    for state in states:
        key = canonical_hidden_key(state)
        if key in seen:
            continue
        seen.add(key)
        out.append(state)
    return out


def filter_doc_pair_records(
    records: list[dict[str, Any]],
    hidden: set[str],
) -> list[dict[str, Any]]:
    """Drop doc-pair syntheses that touch a hidden document. No LLM call.

    Doc-pair storylines are pairwise, so a pair survives only if neither side is
    hidden. This is the same filter the client applies live to the flat
    doc_pair_synthesis array.
    """
    if not hidden:
        return list(records)
    return [
        r
        for r in records
        if r.get("doc_a") not in hidden and r.get("doc_b") not in hidden
    ]


def filter_targets_alignment(
    targets: list[dict[str, Any]],
    alignment: list[dict[str, Any]],
    hidden: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Filter targets by sourceDocument and alignment by both endpoints.

    Mirrors the frontend's visibleTargets / visibleAlignment derivation: a
    target drops if its source document is hidden; an alignment pair drops if
    either endpoint target is hidden.
    """
    if not hidden:
        return list(targets), list(alignment)
    visible_targets = [
        t for t in targets if t.get("sourceDocument") not in hidden
    ]
    visible_ids = {t["id"] for t in visible_targets}
    visible_alignment = [
        a
        for a in alignment
        if a.get("targetAId") in visible_ids and a.get("targetBId") in visible_ids
    ]
    return visible_targets, visible_alignment
