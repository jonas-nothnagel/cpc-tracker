# Extraction Pipeline: Document → Targets

This document explains how a policy document (PDF, DOCX, or plain text) becomes
the structured list of policy targets that the dashboard analyses. It is meant
for stakeholders, vendors, and reviewers who need to understand and stress-test
how the AI produces the text that ends up in the tool — and to verify that
nothing is fabricated along the way.

*Last verified against the pipeline (`python/src/`) on 2026-07-10
(extraction-multilingual-hardening branch: language-block handling for
parallel-translation documents, truncation salvage, document-order output,
document-native label restoration, section-anchor validation, per-chunk run
diagnostics). Re-verify and bump this stamp whenever extraction behaviour
changes.*

The audit principle, in one line:

> **Every word the dashboard shows must be traceable back to a verbatim quote
> from a source document.** When the AI synthesises text from multiple
> sentences, the provenance trail and a claim-grounding check accompany it.

The implementation lives in `python/src/extract.py` (shared text-matching
helpers in `python/src/extract_validation.py`). The HTTP entry point is
`POST /api/extract` (see `src/app/api/extract/route.ts`); the CLI entry point
is `python -m src.extract --file <doc> --source-document NDC --country <name>`.

---

## At a glance

```mermaid
flowchart TD
    U[User uploads PDF / DOCX / TXT] --> S{Scanned-PDF\ncheck}
    S -->|no text layer| ERR[(Structured error:\nNO_TEXT_LAYER, exit 3)]
    S -->|ok / partial warning| P[Parse + page-aware text]
    P --> L{Language blocks\nparallel-translation check}
    L -->|confirmed parallel block| XL[Skipped pages\nloud warning]
    L -->|working / kept blocks| C[Chunk per block:\n~30k chars, 2k overlap]
    C --> R{Phase 0\nRelevance filter}
    R -->|relevant| E[Phase 1\nPer-chunk target extraction\nwith truncation salvage]
    R -->|drop| X[Discarded chunks]
    E --> D[Deterministic near-dup merge]
    D --> Con[Phase 2\nWindowed consolidation\nwith parse-failure fallback]
    Con --> Lbl[Doc-native label restore\n+ document-order sort]
    Lbl --> Val[Claim-grounding validator]
    Val --> Act[Phase 3\nActivities extraction]
    Act --> QV[Quote-in-document validator]
    QV --> Out[(JSON output:\ntext EN + textOriginal + sources[] + textCleanup)]

    classDef llm fill:#eef,stroke:#669;
    classDef io  fill:#efe,stroke:#696;
    classDef val fill:#fee,stroke:#966;
    class R,E,Con,Act llm
    class P,C,D,Lbl,Out io
    class Val,QV,S,L val
```

Boxes coloured blue are LLM calls. Green boxes are deterministic local code.
Red boxes are deterministic validators: the claim-grounding check flags
concrete claims in the display text that are missing from the source quotes,
and the quote-in-document check verifies that every claimed verbatim quote
actually occurs in the parsed document.

---

## Output schema (the contract)

Extraction output is corpus-shaped: the same field convention as the curated
targets files in `python/data/*-targets.json`, minus the `id` (assigned at
promotion or by `/api/analyze`, after human review has removed or edited
items).

```json
{
  "text":        "ENGLISH working text (machine-translated when the source is not English)",
  "label":       "short descriptive label (≤ 8 words, document numbering preserved)",
  "labelSource": "\"document\" when the label is the document's own name/numbering (restored deterministically when consolidation rephrased it)",
  "sourceDocument": "NDC | NBSAP | NAP | LDN | SECTORAL | OTHER",
  "country":     "(when --country was given)",
  "pageNumbers": [12, 13],
  "sources": [
    {
      "sourceText": "verbatim quote in the document's ORIGINAL language — no edits",
      "section":    "optional document numbering, e.g. \"Goal 2\"",
      "_quoteMatch": "exact | normalized | fuzzy | not_found"
    }
  ],
  "textCleanup": "verbatim | cleaned | synthesis",
  "textOriginal": "the target text in the original language (non-English documents)",
  "labelOriginal": "the label in the original language",
  "language": "es",
  "textOriginalSource": "source",
  "_provenanceFlag": "(only when a validator caught an unsourced claim or unlocatable quote)"
}
```

Language convention (matches the curated corpora and the dashboard): `text`
is always the English analysis/working text; for non-English documents,
`textOriginal` + `language` carry the verbatim original and
`textOriginalSource: "source"` records that the original came from the
document while the English is a machine translation. The dashboard's
bilingual display keys off exactly these fields.

`textCleanup` makes the AI's edits explicit. For non-English documents it
describes the relationship between the ORIGINAL-language text and its source
quote; translation is orthogonal and signalled by `language`/`textOriginal`:

| Value | What it means | What is allowed |
|---|---|---|
| `verbatim` | the (original-language) text equals one source after whitespace normalisation. | Whitespace collapse only. |
| `cleaned` | a deterministic light cleanup of one source. | Drop a leading numeric label (`"Target 1."`); join PDF-broken lines; collapse whitespace; drop trailing footnote markers (`[1]`, `¹`). |
| `synthesis` | text combines wording from multiple sources. | Every concrete claim (numbers, percentages, deadlines, named frameworks, geographic scope) must appear in at least one source. The validator enforces this. |

`sources[]` is the audit trail. The dashboard renders it on demand so a
reviewer can always see the original wording and decide whether the AI's edit
was reasonable. `_quoteMatch` is stamped by the quote-in-document validator
(see stage 7).

---

## Stage by stage

### 0. Scanned-PDF detection + text extraction

Before any LLM call, `pdf_text_layer_stats(path)` counts extractable
characters per page. A PDF whose pages have no machine-readable text (a scan)
fails fast with a structured `NO_TEXT_LAYER` error (CLI exit 3; the API route
maps it to HTTP 422 and the wizard shows a human-readable message). A
document where more than 30% of pages are empty proceeds, but a
`PARTIAL_TEXT_LAYER` warning is written to the `<output>.meta.json` sidecar
and surfaced above the review panel — targets on scanned pages cannot be
extracted, and the reviewer should know that.

`extract_text(path)` then reads the document with format-aware parsers:

- **PDF**: `pymupdf` per-page text with table extraction (tables become
  pipe-delimited blocks tagged `[TABLE]`). Each page becomes a `PageSpan` so
  page numbers survive the rest of the pipeline.
- **DOCX**: `python-docx` paragraphs interleaved with tables, split at
  Heading-style paragraphs into sections (the heading is kept as a `## ` line
  so the prompts see section context and can fill `sources[].section`). DOCX
  has no reliable page boundaries, so spans carry `page=0`.
- **TXT**: read verbatim as a single `PageSpan`.

### 0b. Language blocks (parallel-translation handling)

Some national policies publish the same content two or three times in
sequential language blocks (observed: the Sri Lanka National Water Resources
Policy 2023 — Sinhala, Tamil, then English, with the Sinhala/Tamil pages in
legacy font encodings that extract as Latin gibberish). Extracting every
block yields machine-translated duplicates of the working-language content;
the 2 Jul 2026 expert review traced "re-written text", invented titles, and
scrambled order on that document to exactly this.

`split_language_blocks(doc)` classifies each page deterministically (Unicode
script ranges, then an en/es/fr stopword-density vote; statistical detectors
like lingua are deliberately NOT used per page — they return arbitrary
languages at high confidence on legacy-font gibberish) and groups contiguous
pages with run-length smoothing. Low-signal "und" runs absorb into their
neighbouring block unless they are substantial relative to the largest
known-language block — the parallel-translation signature.

Documents that resolve to a single block behave exactly as before (and keep
their LLM cache). For multi-block documents, a non-working-language block is
skipped ONLY as a confirmed parallel translation: it must be substantial
(≥ 5 pages or 10 k chars), share the working block's numeric fingerprint
(digit-token Jaccard ≥ 0.35; measured 0.44–0.78 for true translations vs
0.22 for unrelated documents), AND be confirmed by a small LLM check
(`parallel_check` namespace). Anything less is kept and extracted in
translate mode with a warning. Skips are never silent: the sidecar records
`PARALLEL_TRANSLATION_SKIPPED` with the page range, and every block decision
lands in `languageBlocks`.

### 1. Chunking

`chunk_text(doc, max_chars=30000, overlap_chars=2000)` splits the document on
double-newlines (paragraph boundaries) into chunks of ≤ 30 k characters with
2 k of overlap. Each chunk carries the list of source page numbers it touches.
Multi-block documents chunk per retained language block, so no chunk straddles
a language boundary and each chunk knows its block's language (the translate-
mode addendum is applied per chunk, not per document).

### 2. Phase 0 — Relevance filter

For documents large enough to span multiple chunks, every chunk is classified
by a small LLM call into "likely contains policy targets" vs. "boilerplate /
context / annex". The filter is conservative — it defaults to *keep* on
uncertainty, so the cost is missed efficiency, not missed targets. The filter
judges a head + middle + tail sample of the chunk, not just its head: a chunk
that opens with cover pages and a table of contents may still hold the goals
section further in (observed on the Sri Lanka National Agriculture Policy,
whose 12 goals sat on page 4 behind three pages of front matter). Pages
dropped by the filter are recorded in the run's `.meta.json` sidecar
(`relevanceFilteredPages`) so reviewers can see what was skipped.

This phase is cached by chunk content (`cache_namespace="relevance_filter"`),
so re-running the same document is free.

### 3. Phase 1 — Per-chunk target extraction

This is the core LLM call. For each kept chunk, the prompt:

- explains what a "policy target" is, with a few-shot block drawn verbatim
  from the human-curated corpora of several countries (Mongolia, Sri Lanka,
  Côte d'Ivoire) spanning NDC / NBSAP / NAP genres and structurally distinct
  patterns (sector-numbered short targets, Goal/Target/Benchmark tri-part
  targets, 3-level resolution hierarchies). Documents whose curated targets
  appear as examples are excluded from tier-1 eval gold (see the manifest);
- enforces the **verbatim contract** (Rule 3): the `sourceText` field MUST be
  copied character-for-character from the chunk; the `text` field MAY be a
  light deterministic cleanup, but rewording / action-verb prefacing /
  summarising / abbreviation expansion are forbidden;
- requires `sources[]` and `textCleanup` on every returned target;
- demands that quantitative details (percentages, years, units, geography)
  already be present in the source — never injected;
- caps the level of abstraction at the policy-target level (not measures /
  activities / indicators / background).

For non-English documents, a language addendum instructs the model to return
`text`/`label` as faithful English translations and to additionally return
`textOriginal`/`labelOriginal` in the source language, while
`sources[].sourceText` stays strictly original-language verbatim. (Legacy
cached responses with the older `text_eng` convention are inverted into this
shape at parse time.)

**Truncation salvage:** a response cut off at the completion-token ceiling
ends mid-JSON; previously the whole chunk extracted to zero (observed: 4 of
6 NWRP chunks, including the entire English Section-7 policy table, died at
the old 4 000-token ceiling). The ceiling is now 12 000
(`CPC_EXTRACT_MAX_TOKENS`), and when a response still truncates, the complete
leading objects are salvaged deterministically, the chunk record is marked
`truncated`, and a `TRUNCATED_EXTRACTION` warning (with the recovered count)
lands in the sidecar. Salvage is Phase-1 only — consolidation keeps its
safer keep-the-window fallback.

Section anchors the model claims (`sources[].section`) are validated by
`_clean_section`: document numbering, known section words, or plausible
natural-language headings pass; echoed `[TABLE]` markers and legacy-font
gibberish (`"nfhs;if"`) are dropped, never invented, and counted in the
sidecar (`sectionsDropped`).

Cached by chunk content (`cache_namespace="extract"`).

### 4. Deterministic near-duplicate merge

The 2 k-character chunk overlap re-extracts targets that straddle a chunk
boundary, so the same target routinely appears twice. `dedupe_candidates()`
merges exact and near-duplicates locally (no LLM): normalised-equal texts,
one text fully contained in the other, or sequence similarity ≥ 0.92. The
merge unions `sources` and `pageNumbers` and keeps the more complete text.
This always runs, so small documents that skip LLM consolidation are
deduplicated too.

### 5. Phase 2 — Windowed consolidation

Consolidation runs over page-ordered windows of at most 24 candidates
(`CPC_CONSOLIDATE_WINDOW`). One giant call would have to re-emit every
candidate in a single response; past roughly 25 candidates that reliably
truncates at the completion-token limit — the baseline evaluation caught a
170-page document whose 79 candidates consolidated to zero targets this way.
Per window, the LLM:

1. drops duplicates / near-duplicates the deterministic pass missed;
2. merges candidates that clearly refer to the same objective, **preserving
   every source entry from the merged candidates**, and (for non-English
   documents) merging `textOriginal` under the same rules;
3. drops items that are not real policy targets (background, indicators in
   isolation, procedural text);
4. keeps abstraction at the policy-objective level.

**Parse-failure fallback:** a window whose response cannot be parsed keeps
its un-consolidated candidates — Phase 1 output is never discarded silently —
and the run's `.meta.json` sidecar records `consolidationFallbacks`.
Cross-window duplicates are merged by a second deterministic pass.

When the merged `text` combines wording from several sources, `textCleanup`
becomes `"synthesis"`. The prompt is explicit that **every concrete claim in
the merged text must appear in at least one merged source** — and that
contradicting numbers should be kept as separate targets, never invented away.
It also requires document-provided names ("Policy 1", "Goal 2.3") to be kept
verbatim as labels and output order to follow input (document) order.

Cached by candidate content (`cache_namespace="extract_consolidate"`).

### 5b. Deterministic post-passes: label restore + document order

Model compliance with the label and order instructions is not guaranteed, so
two local passes run after consolidation:

- `_restore_doc_labels`: a final item whose label does not look
  document-provided gets one derived, in order of preference, from its first
  source's section anchor, the leading hierarchical numbering of its first
  source quote, or the label of the unique Phase-1 candidate sharing that
  quote. On success `labelSource: "document"` is recorded; otherwise the LLM
  label stays — a label is never invented.
- `_sort_by_document_position`: the final list is stable-sorted by the
  character offset of each target's first locatable source quote (fallback:
  first page), so reviewers read the sheet top-to-bottom like the document.

### 6. Claim-grounding validator (post-LLM)

`validate_claim_grounding(target)` runs locally (no LLM) on every consolidated
target. It pulls claim tokens out of the English `text` AND (when present)
the original-language `textOriginal`:

- percentages (`30%`, `1.5%`)
- years (`2030`, `2050`, `2025`)
- quantities with policy-relevant units (`tCO2e`, `million tons`, `ha`,
  `km²`, `GW`, `hectáreas`, `га`, ...)
- thousand-separated numbers (`100,000`, `5.277`)

It then checks each claim against the union of `sources[*].sourceText`.
Because the English text is compared against original-language sources, unit
words are language-specific; a numeric-magnitude fallback grounds
`1500hectares` against `1500hectáreas` (exact match is always tried first).
Any claim that cannot be grounded is logged as a warning and the target gets
a `_provenanceFlag`. The dashboard and the review panel surface this as a
review prompt so reviewers know where to focus.

The validator is conservative on purpose — false positives are acceptable
(reviewers verify), false negatives (a fabricated number slipping through
silently) are not.

### 7. Phase 3 — Activities extraction + quote-in-document validation

For each consolidated target, an additional LLM call extracts explicitly
listed sub-activities / sub-measures from context windows anchored on the
target's own verbatim quote occurrences (a window per source quote, extending
mostly forward, because policy layouts elaborate a statement into its action
list immediately after it). Page-chunk dumps are only the fallback for
targets whose quotes cannot be located: they fed the call front matter when a
consolidated target's pages began in an early summary section. Same verbatim
contract as Phase 1: each activity carries its own `sourceText` (original
language) and optional `section` numbering; for non-English documents the
activity `text` is an English translation. If the source has no explicit
sub-activities, the activity list is empty — the LLM is told not to invent.
This phase runs for small documents too (an earlier version skipped it below
6 candidates).

Finally, the **quote-in-document validator** checks every claimed verbatim
quote — target sources and activity sources — against the parsed document
text and stamps `_quoteMatch` on each entry: `exact` (substring after
whitespace collapse), `normalized` (substring after case/accent/punctuation
folding), `fuzzy` (≥ 80% of the quote's 8-word shingles occur), or
`not_found`. A `not_found` quote appends a `_provenanceFlag` to its target.
Nothing is dropped: flagging is a review prompt, the human decides.

Cached by `(target_text, context)` (`cache_namespace="extract_activities"`).

---

## The local workflow (extract → review → promote → analyse)

For team-run processing (the near-term mode), the wizard is optional:

```bash
cd python
# 1. Extract (writes doc.extracted.json + .meta.json sidecar on warnings)
uv run python -m src.extract --file <doc.pdf> --source-document PNSH \
    --country Panama --output pnsh.extracted.json

# 2. Human review: edit/delete items in pnsh.extracted.json by hand — or
#    export the expert-review spreadsheet (the "Targets for review" sheet
#    with source text, activities, a machine-translation note for rows whose
#    English is not the document's own wording, and dropdown review columns):
uv run python -m scripts.export_review_xlsx --input pnsh.extracted.json \
    --output pnsh_targets_for_review.xlsx --country Panama \
    --document "Plan Nacional de Seguridad Hídrica" --doc PNSH

# 3. Promote into the curated corpus (strict QC: refuses validator-flagged
#    records unless --allow-flagged), or write a standalone targets file:
uv run python -m scripts.promote_extraction --input pnsh.extracted.json \
    --targets-file data/panama-targets.json --source-url <url> --dry-run
uv run python -m scripts.promote_extraction --input pnsh.extracted.json \
    --output data/panama-pnsh-targets.json --country Panama

# 4. Analyse
uv run python -m src.run_analysis --targets-file panama-pnsh-targets.json
```

Ids are assigned at promotion time, continuing the corpus convention
(`panama_PNSH_18` after an existing `panama_PNSH_17`, or `ILDN_1` for a fresh
standalone file).

---

## Evaluation harness

`python/scripts/eval_extraction.py` measures extraction against the
expert-curated gold targets for source documents that exist locally
(`scripts/eval_manifest.json` defines the set and its caveats — quote-anchored
tier 1 docs, similarity-only tier 2, and a real-world partial-text-layer
fixture). It reports gold reachability (the honest recall ceiling), recall,
a soft precision proxy, granularity, verbatim quote compliance, and a full
match-audit table, and writes committed reports under
`python/output/eval/<label>/`.

```bash
cd python
LLM_CONCURRENCY=4 uv run python -m scripts.eval_extraction --label my-run \
    --compare baseline-480a040
```

Run it before and after any change to the extraction prompts or parsing; the
report header records the model, git sha, and a prompt hash so cache
invalidation (fresh LLM spend) is visible. Never tune prompts toward
over-extraction to chase recall — an honest low count beats a forced match
(see the CLAUDE.md guardrails).

---

## Caching, footprint, and re-runs

Every LLM call is keyed by SHA-256 of `(system, user, model, namespace)` and
cached under `python/output/.cache/<namespace>/`. Re-running the same document
is free and deterministic. Changing the prompt — for example by tightening
the verbatim contract — invalidates the relevant namespaces automatically; the
next run produces fresh outputs.

Each run also emits a `*.footprint.json` sidecar with EcoLogits energy / CO₂
estimates so the API route can return the environmental footprint of an
upload, and a `*.meta.json` sidecar with document warnings and pipeline
self-reports. The sidecar now carries full per-chunk accounting so a chunk
that yields nothing is diagnosable without re-running: `chunks` (page range,
language, relevance verdict, extraction status incl. content-filter hits and
truncation salvage, candidate count), `consolidationWindows`
(candidatesIn/itemsOut/fallback per window), `languageBlocks` (per-block
keep/skip decisions), `sectionsDropped`, plus the existing
`consolidationFallbacks`, `chunkParseFailures`, `quotesNotFound`, and
document warnings (`PARALLEL_TRANSLATION_SKIPPED`, `TRUNCATED_EXTRACTION`,
`CONTENT_FILTER`, `MIXED_LANGUAGE_CONTENT`, `UNKNOWN_LANGUAGE_BLOCK`, ...).
The evaluation harness copies the same accounting into each doc's
`runMeta` in `report.json`.

---

## Failure modes the pipeline guards against

| Risk | Guard |
|---|---|
| LLM rewords a target into something the document never said. | Verbatim contract on `sourceText`; `textCleanup` enum forces an explicit declaration of how `text` was derived. |
| LLM invents a "verbatim" quote that is not in the document. | Quote-in-document validator stamps `_quoteMatch` on every source; `not_found` flags the target for review; promotion refuses flagged records without `--allow-flagged`. |
| LLM injects a number / year that is not in the document. | Claim-grounding validator (English text AND original-language text) stamps `_provenanceFlag`. |
| Consolidation response truncates and parses to nothing, silently zeroing the document. | Windowed consolidation bounds response size; parse-failure fallback keeps the un-consolidated candidates and records it in the sidecar. |
| Extraction response truncates at the completion-token ceiling and the whole chunk yields zero targets. | 12 000-token ceiling (`CPC_EXTRACT_MAX_TOKENS`); deterministic salvage of complete leading objects; `TRUNCATED_EXTRACTION` warning with recovered count. |
| A multilingual document's parallel translations extract as machine-translated duplicates, drowning out the document's own working-language text. | Language-block segmentation; a block is skipped only when size, numeric-fingerprint overlap, AND an LLM check all agree it is a parallel translation — and the skip is a loud sidecar warning, never silent. |
| Labels or section anchors are invented (noun-phrase titles replacing "Policy 1"; gibberish sections echoed from bad text layers). | Consolidation prompt preserves document-provided names; deterministic label restore (`labelSource: "document"`); `_clean_section` drops implausible anchors and counts them in the sidecar. |
| Consolidation drops sources or the original-language text when merging. | Consolidation prompt explicitly forbids dropping sources and requires `textOriginal` preservation; sources are required in the output schema. |
| Scanned/image PDF silently yields zero targets. | Text-layer detection: structured error for image-only documents, reviewer warning for partial text layers. |
| Activities are invented. | Activities prompt has the same verbatim contract; per-activity `sourceText` carried on `activitySources`; claim-grounding and quote-in-document validators run over them. |
| Document upload re-paraphrases on every re-run. | Cache is content-keyed; same input ⇒ same output. |
| Non-English uploads analysed in the original language while the pilots use English. | English-first output convention: `text` is English, `textOriginal` + `language` + `textOriginalSource` carry the original, matching the curated corpora and the dashboard's bilingual display. |

---

## Known limitations (deliberate, documented)

- **No OCR.** Image-only PDFs are rejected with a clear message rather than
  processed badly; OCR is a scoped follow-up.
- **Granularity is the policy-objective level.** Some expert curations ingest
  measure tables as targets (e.g. the Mongolia LDN technical measures); the
  extractor deliberately keeps the objective level per its prompt rules, so
  measure-level curation choices will not be reproduced automatically. The
  evaluation harness makes this divergence visible per document instead of
  hiding it in an average.
- **Page precision is chunk-level.** `pageNumbers` lists the pages of the
  chunk(s) a target came from, not the exact page of the quote.

---

## How to give feedback on this pipeline

If you spot a target whose `text` does not match its `sources[]`, or a number
that does not appear in any source span:

1. Note the target id and which claim is unsourced.
2. File an issue in the repo, or share via the team SharePoint feedback log
   (`Scoping materials/Feedback log for AI Flagship.docx`).
3. The fix typically lands in the prompt rules in `python/src/extract.py` —
   the next pipeline run automatically picks it up via cache invalidation.
   Re-run the evaluation harness before and after to show the effect.

The verbatim contract is meant to be auditable line-by-line. If something
slips through, it is a bug, and the validator should grow to catch it.
