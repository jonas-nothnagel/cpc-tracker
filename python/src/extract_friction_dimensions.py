"""
Friction-dimension extraction.

Surfaces the concrete dimension each flagged coherence pair concerns — the
contested resource(s) for ``resource_competition`` and the shared geography for
``delivery_friction`` — by reading the alignment rationale the pipeline already
wrote. This is a transformation of pipeline OUTPUT (the ``description`` field),
not new prompt content: every label must be grounded in words the rationale
already states. Anything the model returns that does not appear in the
rationale is dropped (see ``_grounded``), so a chip can never claim a resource
or place the analyst text never mentioned.

It runs as its own cached step (``cache_namespace="friction_dimensions"``) and
never touches the ``alignment_v2`` cache, so:
  - it does not trigger an alignment re-run (no verdict churn), and
  - adding a document only extracts the handful of newly-flagged pairs; every
    previously-seen rationale is served from cache.

Two entry points share one code path:
  - ``enrich_with_friction_dimensions`` — called from ``run_analysis`` right
    after alignment, so new runs write the fields into ``alignment.json``.
  - the ``__main__`` CLI — backfills an existing ``alignment.json`` without
    re-running alignment, and offers ``--sample`` to preview chips-with-sources.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
from typing import Any

from .config import OUTPUT_DIR
from .llm import call_llm_batch

logger = logging.getLogger(__name__)

# Only these mechanisms get a dimension chip in the UI. goal_conflict is
# self-explanatory ("Conflicting goals") and carries no resource/place, so we
# skip it to save calls.
_MECHANISMS_WITH_DIMENSIONS = {"resource_competition", "delivery_friction"}

_MAX_RESOURCES = 3
_MAX_RESOURCE_LEN = 24
_MAX_CONTEXT_LEN = 64
_MAX_RATIONALE_CHARS = 1500

SYSTEM = """You label an already-classified policy-coherence finding with the concrete dimension it concerns, using ONLY what the rationale text states.

You are given one flagged pair: its friction MECHANISM and the analyst RATIONALE explaining why two policy targets may be misaligned. Return two optional fields, each strictly grounded in the rationale:

- "contestedResources": a short list (max 3) of the finite resource(s) the rationale says BOTH targets need or compete for. Each item is a single common noun, lowercase and singular (e.g. land, water, forest, rangeland, energy, budget, staff capacity). Never an activity, plan, or process (not "land use", not "planning", not "management", not "development"). Include a resource ONLY if the rationale frames it as shared, finite, or competed-for; empty list otherwise.
- "sharedContext": the specific shared place or geography the rationale says both targets operate in, written as a clean, self-contained name as it would appear in a plan or on a map (e.g. "Panama Canal watershed", "river basins", "western steppe rangelands"). Do NOT include relational qualifiers such as "same", "those", "overlapping", "affected", "shared", or "broader". Empty string if no specific place is named.

Rules:
- Never invent. Every item must be supported by words present in the rationale. When unsure, leave it out.
- Do NOT infer from the mechanism name or from general knowledge. Read only the rationale.
- Output strict JSON and nothing else: {"contestedResources": [...], "sharedContext": "..."}"""

# An item whose final word is one of these is an activity/process, not a
# resource — drop it (e.g. "land use", "land-use planning", "water management").
_ACTIVITY_TAIL = {
    "use", "planning", "management", "development", "governance",
    "policy", "strategy", "infrastructure", "investment", "reform",
    "reforms", "services", "production",
}

# Relational lead-ins that make a place phrase read poorly as a standalone
# chip ("some of those same basins" -> "basins"). Stripped from the front.
_CONTEXT_LEADING = {
    "the", "a", "an", "same", "those", "these", "some", "of", "overlapping",
    "affected", "shared", "broader", "certain", "both", "their", "that",
    "this", "in", "within", "across",
}

USER_TEMPLATE = """MECHANISM: {mechanism}
RATIONALE: {description}

Return the JSON only."""


def _parse(text: str) -> dict[str, Any]:
    """Extract the JSON object from an LLM response, tolerating code fences."""
    text = (text or "").strip()
    if not text:
        return {}
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else {}
    except (json.JSONDecodeError, ValueError):
        return {}


def _grounded(term: str, description_lc: str) -> bool:
    """True if any alphabetic token (>=4 chars) of `term` appears in the
    rationale. A cheap hallucination guard: keeps "land"/"water"/"watershed"
    that the analyst actually wrote, drops anything the model invented. The
    >=4-char floor is deliberate: 2-3 char tokens substring-match too loosely
    (e.g. "oil" would ground on "soil"), so we trade a little recall for
    precision in a faithfulness-critical label."""
    tokens = re.findall(r"[a-z]{4,}", term.lower())
    if not tokens:
        return False
    return any(tok in description_lc for tok in tokens)


def _fully_grounded(phrase: str, description_lc: str) -> bool:
    """Stricter than `_grounded`: EVERY significant (>=4-char) token of `phrase`
    must appear in the rationale. Used for place labels, where a single shared
    token is too weak — a partly-invented phrase ("coastal mining zones" when
    only "zones" was written) must not pass through whole."""
    tokens = re.findall(r"[a-z]{4,}", phrase.lower())
    if not tokens:
        return False
    return all(tok in description_lc for tok in tokens)


def _clean_context(ctx: str) -> str:
    """Strip leading relational qualifiers so the place reads as a standalone
    chip ("some of those same basins" -> "basins")."""
    words = ctx.strip().split()
    while words and re.sub(r"[^a-z]", "", words[0].lower()) in _CONTEXT_LEADING:
        words.pop(0)
    return " ".join(words).strip()


def _clean_fields(raw: str, description: str) -> tuple[list[str], str]:
    """Parse + ground the model output against the rationale text."""
    obj = _parse(raw)
    description_lc = description.lower()

    resources: list[str] = []
    seen: set[str] = set()
    # Coerce defensively: the model occasionally returns a scalar or null for
    # contestedResources, and `for item in <scalar>` would raise.
    raw_resources = obj.get("contestedResources")
    for item in raw_resources if isinstance(raw_resources, list) else []:
        term = str(item or "").strip().lower()
        if not term or len(term) > _MAX_RESOURCE_LEN:
            continue
        # Reject activity/process phrases ("land use", "land-use planning").
        if re.split(r"[\s-]+", term)[-1] in _ACTIVITY_TAIL:
            continue
        if not _grounded(term, description_lc):
            continue
        # No singularization: displaying the plural the rationale used ("lands")
        # is faithful, whereas stripping a trailing "s" mangles non-plurals
        # ("species" -> "specie") and would show a word the analyst never wrote.
        if term in seen:
            continue
        seen.add(term)
        resources.append(term)
        if len(resources) >= _MAX_RESOURCES:
            break

    context = _clean_context(str(obj.get("sharedContext") or ""))
    if len(context) > _MAX_CONTEXT_LEN or not _fully_grounded(context, description_lc):
        context = ""

    return resources, context


async def enrich_with_friction_dimensions(
    alignment_results: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Add `contestedResources` / `sharedContext` to flagged pairs in place.

    Mutates and returns `alignment_results`. Only pairs whose mechanism is in
    `_MECHANISMS_WITH_DIMENSIONS` are sent to the LLM; everything else is left
    untouched. Cached per-pair, so re-runs and incremental document-adds only
    pay for genuinely new rationales.
    """
    flagged = [
        r
        for r in alignment_results
        if r.get("mechanism") in _MECHANISMS_WITH_DIMENSIONS and (r.get("description") or "").strip()
    ]
    if not flagged:
        logger.info("  Friction dimensions: no flagged pairs to enrich")
        return alignment_results

    calls = [
        {
            "system": SYSTEM,
            "user": USER_TEMPLATE.format(
                mechanism=r["mechanism"],
                description=(r.get("description") or "")[:_MAX_RATIONALE_CHARS],
            ),
        }
        for r in flagged
    ]

    results = await call_llm_batch(
        calls,
        cache_namespace="friction_dimensions",
        desc="Friction dimensions",
    )

    enriched = 0
    for r, raw in zip(flagged, results):
        resources, context = _clean_fields(raw, r.get("description") or "")
        # Only attach non-empty fields so the JSON stays lean and the UI can
        # treat "absent" and "empty" identically.
        if resources:
            r["contestedResources"] = resources
        if context:
            r["sharedContext"] = context
        if resources or context:
            enriched += 1

    logger.info(
        f"  Friction dimensions: enriched {enriched}/{len(flagged)} flagged pairs"
    )
    return alignment_results


# ---------------------------------------------------------------------------
# CLI: backfill an existing alignment.json, or preview a sample
# ---------------------------------------------------------------------------


def _alignment_path(country: str):
    return OUTPUT_DIR / country / "alignment.json"


async def _run_cli(country: str, sample: int | None) -> None:
    path = _alignment_path(country)
    if not path.exists():
        raise SystemExit(f"No alignment.json at {path}")
    rows: list[dict[str, Any]] = json.loads(path.read_text())

    if sample:
        # Preview only: a diverse slice (resource first, then delivery), no write.
        picks: list[dict[str, Any]] = []
        for mech in ("resource_competition", "delivery_friction"):
            for r in rows:
                if r.get("mechanism") == mech and (r.get("description") or "").strip():
                    picks.append(r)
                    if len([p for p in picks if p.get("mechanism") == mech]) >= sample:
                        break
        enriched = await enrich_with_friction_dimensions([dict(p) for p in picks])
        print(f"\n=== {country}: friction-dimension preview ({len(enriched)} pairs) ===\n")
        for r in enriched:
            print(f"[{r.get('targetAId')} <-> {r.get('targetBId')}]  ({r.get('mechanism')})")
            print(f"  contestedResources: {r.get('contestedResources', [])}")
            print(f"  sharedContext:      {r.get('sharedContext', '')!r}")
            print(f"  RATIONALE: {(r.get('description') or '')[:320]}...\n")
        return

    await enrich_with_friction_dimensions(rows)
    path.write_text(json.dumps(rows, indent=2))
    print(f"Wrote friction dimensions into {path} ({len(rows)} rows)")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description="Extract friction dimensions from alignment rationales")
    parser.add_argument("--country", required=True, help="output subdir, e.g. panama or mongolia")
    parser.add_argument(
        "--sample",
        type=int,
        default=None,
        help="preview N pairs per mechanism without writing",
    )
    args = parser.parse_args()
    asyncio.run(_run_cli(args.country, args.sample))


if __name__ == "__main__":
    main()
