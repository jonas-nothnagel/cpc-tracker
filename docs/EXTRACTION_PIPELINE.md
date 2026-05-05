# Extraction Pipeline: Document → Targets

This document explains how a policy document (PDF, DOCX, or plain text) becomes
the structured list of policy targets that the dashboard analyses. It is meant
for stakeholders, vendors, and reviewers who need to understand and stress-test
how the AI produces the text that ends up in the tool — and to verify that
nothing is fabricated along the way.

The audit principle, in one line:

> **Every word the dashboard shows must be traceable back to a verbatim quote
> from a source document.** When the AI synthesises text from multiple
> sentences, the provenance trail and a claim-grounding check accompany it.

The implementation lives in `python/src/extract.py`. The HTTP entry point is
`POST /api/extract` (see `src/app/api/extract/route.ts`); the CLI entry point
is `python -m src.extract --file <doc> --doc-type NDC`.

---

## At a glance

```mermaid
flowchart TD
    U[User uploads PDF / DOCX / TXT] --> P[Parse + page-aware text]
    P --> C[Chunk: ~30k chars, 2k overlap]
    C --> R{Phase 0\nRelevance filter}
    R -->|relevant| E[Phase 1\nPer-chunk target extraction]
    R -->|drop| X[Discarded chunks]
    E --> Cand[Candidate targets\nwith verbatim sources]
    Cand --> Con[Phase 2\nConsolidation]
    Con --> Val[Claim-grounding validator]
    Val --> Act[Phase 3\nActivities extraction]
    Act --> Out[(JSON output:\ntext + sources[] + textCleanup)]

    classDef llm fill:#eef,stroke:#669;
    classDef io  fill:#efe,stroke:#696;
    classDef val fill:#fee,stroke:#966;
    class R,E,Con,Act llm
    class P,C,Cand,Out io
    class Val val
```

Boxes coloured blue are LLM calls. Green boxes are deterministic local code.
The red box is the post-LLM grounding validator that flags any concrete claim
in the display `text` that is not present in the source quotes.

---

## Output schema (the contract)

Every extracted target is a JSON object with these fields:

```json
{
  "text":        "the policy target as it should be displayed",
  "label":       "short descriptive label (≤ 8 words)",
  "sourceDocument": "NDC | NBSAP | NAP | LDN | SECTORAL | OTHER",
  "pageNumbers": [12, 13],
  "sources": [
    {
      "sourceText": "verbatim quote from the document — no edits",
      "section":    "optional document numbering, e.g. \"Goal 2\""
    }
  ],
  "textCleanup": "verbatim | cleaned | synthesis",
  "_provenanceFlag": "(only when validator caught an unsourced claim)"
}
```

`textCleanup` makes the AI's edits explicit:

| Value | What it means | What is allowed |
|---|---|---|
| `verbatim` | `text` equals one source after whitespace normalisation. | Whitespace collapse only. |
| `cleaned` | `text` is a deterministic light cleanup of one source. | Drop a leading numeric label (`"Target 1."`); join PDF-broken lines; collapse whitespace; drop trailing footnote markers (`[1]`, `¹`). |
| `synthesis` | `text` combines wording from multiple sources. | Every concrete claim in `text` (numbers, percentages, deadlines, named frameworks, geographic scope) must appear in at least one source. The validator enforces this. |

`sources[]` is the audit trail. The dashboard renders it on demand so a
reviewer can always see the original wording and decide whether the AI's edit
was reasonable.

---

## Stage by stage

### 0. Text extraction

`extract_text(path)` reads the document with format-aware parsers:

- **PDF**: `pymupdf` per-page text with table extraction (tables become
  pipe-delimited blocks tagged `[TABLE]`). Each page becomes a `PageSpan` so
  page numbers survive the rest of the pipeline.
- **DOCX**: `python-docx` paragraphs interleaved with tables. DOCX has no
  reliable page boundaries, so we emit a single `PageSpan` with `page=0`.
- **TXT**: read verbatim as a single `PageSpan`.

### 1. Chunking

`chunk_text(doc, max_chars=30000, overlap_chars=2000)` splits the document on
double-newlines (paragraph boundaries) into chunks of ≤ 30 k characters with
2 k of overlap. Each chunk carries the list of source page numbers it touches.

### 2. Phase 0 — Relevance filter

For documents large enough to span multiple chunks, every chunk is classified
by a small LLM call into "likely contains policy targets" vs. "boilerplate /
context / annex". The filter is conservative — it defaults to *keep* on
uncertainty, so the cost is missed efficiency, not missed targets.

This phase is cached by chunk content (`cache_namespace="relevance_filter"`),
so re-running the same document is free.

### 3. Phase 1 — Per-chunk target extraction

This is the core LLM call. For each kept chunk, the prompt:

- explains what a "policy target" is, with a few-shot block of human-curated
  Mongolia examples spanning NDC / NBSAP / NAP;
- enforces the **verbatim contract** (Rule 3): the `sourceText` field MUST be
  copied character-for-character from the chunk; the `text` field MAY be a
  light deterministic cleanup, but rewording / action-verb prefacing /
  summarising / abbreviation expansion are forbidden;
- requires `sources[]` and `textCleanup` on every returned target;
- demands that quantitative details (percentages, years, units, geography)
  already be present in the source — never injected;
- caps the level of abstraction at the policy-target level (not measures /
  activities / indicators / background).

Note: the older "begin with an action verb" rule was removed because it
silently encouraged paraphrase. Targets now read more like the source
documents and less like marketing copy.

The output is a list of *candidate* targets per chunk. Each candidate also
carries `pageNumbers` from its parent chunk and (for non-English documents)
`text_eng` / `label_eng` translations.

Cached by chunk content (`cache_namespace="extract"`).

### 4. Phase 2 — Consolidation

A single LLM call receives all candidates from all chunks and produces the
final list. Its job is to:

1. drop duplicates / near-duplicates (overlapping chunks frequently produce
   the same target twice);
2. merge candidates that clearly refer to the same objective, **preserving
   every source entry from the merged candidates** as a unified `sources[]`
   array;
3. drop items that are not real policy targets (background, indicators in
   isolation, procedural text);
4. keep abstraction at the policy-objective level.

When the merged `text` combines wording from several sources, `textCleanup`
becomes `"synthesis"`. The prompt is explicit that **every concrete claim in
the merged text must appear in at least one merged source** — and that
contradicting numbers should be kept as separate targets, never invented away.

Cached by candidate content (`cache_namespace="extract_consolidate"`).

### 5. Claim-grounding validator (post-LLM)

`validate_claim_grounding(target)` runs locally (no LLM) on every consolidated
target. It pulls the following claim tokens out of `text`:

- percentages (`30%`, `1.5%`)
- years (`2030`, `2050`, `2025`)
- quantities with policy-relevant units (`tCO2e`, `million tons`, `ha`,
  `km²`, `GW`, `MW`, `kWh`, ...)
- thousand-separated numbers (`100,000`, `5.277`)

It then checks each claim against the union of `sources[*].sourceText`. Any
claim that does not appear in any source span is logged as a warning and the
target gets a `_provenanceFlag` describing what was missing. The dashboard can
surface this as a review badge so reviewers know where to focus.

The validator is conservative on purpose — false positives are acceptable
(reviewers verify), false negatives (a fabricated number slipping through
silently) are not.

### 6. Phase 3 — Activities extraction

For each consolidated target, an additional LLM call extracts explicitly
listed sub-activities / sub-measures from the surrounding chunk context. Same
verbatim contract as Phase 1: each activity carries its own `sourceText` and
optional `section` numbering. If the source has no explicit sub-activities,
the activity list is empty — the LLM is told not to invent.

The display string is stored in `target["activities"]` (newline-joined, the
existing UI contract); the structured per-activity provenance lives in
`target["activitySources"]`. After Phase 3 the same claim-grounding validator
runs over each activity entry — any number / year / unit in the activity's
`text` that is missing from its own `sourceText` gets a `_provenanceFlag`,
just like target-level claims.

Cached by `(target_text, context)` (`cache_namespace="extract_activities"`).

---

## Caching, footprint, and re-runs

Every LLM call is keyed by SHA-256 of `(system, user, model, namespace)` and
cached under `python/output/.cache/<namespace>/`. Re-running the same document
is free and deterministic. Changing the prompt — for example by tightening
the verbatim contract — invalidates the relevant namespaces automatically; the
next run produces fresh outputs.

Each run also emits a `*.footprint.json` sidecar with EcoLogits energy / CO₂
estimates so the API route can return the environmental footprint of an
upload.

---

## Failure modes the pipeline guards against

| Risk | Guard |
|---|---|
| LLM rewords a target into something the document never said. | Verbatim contract on `sourceText`; `textCleanup` enum forces an explicit declaration of how `text` was derived. |
| LLM injects a number / year that is not in the document. | Claim-grounding validator runs after consolidation and stamps `_provenanceFlag`. |
| Consolidation drops sources when merging duplicates. | Consolidation prompt explicitly forbids dropping sources; sources are required in the output schema. |
| Activities are invented. | Activities prompt has the same verbatim contract; per-activity `sourceText` carried on `activitySources`; same claim-grounding validator runs after Phase 3. |
| Document upload re-paraphrases on every re-run. | Cache is content-keyed; same input ⇒ same output. |

---

## How to give feedback on this pipeline

If you spot a target whose `text` does not match its `sources[]`, or a number
that does not appear in any source span:

1. Note the target id and which claim is unsourced.
2. File an issue in the repo, or share via the team SharePoint feedback log
   (`Scoping materials/Feedback log for AI Flagship.docx`).
3. The fix typically lands in the prompt rules in `python/src/extract.py` —
   the next pipeline run automatically picks it up via cache invalidation.

The verbatim contract is meant to be auditable line-by-line. If something
slips through, it is a bug, and the validator should grow to catch it.
