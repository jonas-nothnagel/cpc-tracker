# Pairwise alignment methodology v2.1 — changelog

**Effective**: this PR (worktree branch `feat/coherence-findings-home`).
**Affects**: every alignment family — target↔target, BTR measure↔target, BER programme↔target, NR7 action↔target.

## What changed

### Output schema

| | v1 | v2.1 |
|---|---|---|
| Alignment level values | `none`, `low`, `medium`, `high`, `possible_misalignment`, `possible_conflict`, `likely_conflict` (7) | `none`, `low`, `medium`, `high`, `flagged` (5) |
| Contradiction subtype field | `contradictionType`, one of 4 values | replaced by three independent sub-fields (see below) |
| Sub-field A: `mechanism` | absent | `goal_conflict` / `resource_competition` / `delivery_friction` |
| Sub-field B: `manageability` | absent | `manageable` / `fundamental` |
| Sub-field C: `confidence` | absent | `low` / `medium` / `high` |

Positive-side levels (`none` / `low` / `medium` / `high`) are unchanged.

### Why the change

The v1 production data showed a flat collapse on the negative side:
- Mongolia: 99.4% of flagged pairs at `possible_misalignment` (lowest level); zero at `likely_conflict`.
- Panama: 100% of flagged pairs at `possible_misalignment`.
- `scale_scope_mismatch` never fired in either country (0 records).
- `implementation_tension` accounted for 75–98% of all flags.

Diagnosis: the LLM was asked to grade *severity from text alone*, but policy text is aspirational and the cautious prompt framing acted as a ceiling. The severity ladder did not carry signal; the mechanism field did.

v2.1 keeps the mechanism signal (refined into 3 cleaner categories) and replaces severity with two independent dimensions a reviewer actually needs:
- **Manageability** — can coordination resolve this, or does a target need to be rewritten? (the decision-relevant question the v1 ladder was trying to answer)
- **Confidence** — how strongly does the *text* support the flag? (epistemic humility, made explicit)

### Mechanism mapping (v1 → v2)

| v1 | v2.1 |
|---|---|
| `goal_conflict` | `goal_conflict` (unchanged) |
| `resource_competition` | `resource_competition` (unchanged) |
| `implementation_tension` | `delivery_friction` |
| `scale_scope_mismatch` | `delivery_friction` (absorbed; this category had no examples and never fired) |

### Backward compatibility

Legacy v1 records continue to load, both in the Python pipeline and in the TypeScript frontend:

| v1 alignment + contradictionType | → v2.1 (alignment, mechanism, manageability, confidence) |
|---|---|
| `possible_misalignment` + `*` | (`flagged`, `manageable`, mapped mechanism, `medium`) |
| `possible_conflict` + `*` | (`flagged`, `fundamental`, mapped mechanism, `medium`) |
| `likely_conflict` + `*` | (`flagged`, `fundamental`, mapped mechanism, `high`) |

Implementation:
- Python: `python/src/alignment_schema.py::migrate_legacy_record`
- TypeScript: `src/lib/alignment-migration.ts::migrateLegacyAlignmentRecord`

The migration is deterministic (no LLM call). New `alignment.json` files written by the v2.1 pipeline contain the v2.1 shape directly; legacy records on `main` migrate transparently at load time.

## Prompt changes

The v2.1 prompt lives in `python/src/align.py::ADVISOR_USER_TEMPLATE` and is reused by all four alignment families through an `{intro_framing}` slot. Highlights:

- **Single negative state**. Only one negative label: "Flagged for review". The LLM characterises the friction via three sub-fields inline in parentheses.
- **Explicit boundary rule**. Flag only when a specific friction can be named (goal opposition, resource competition, delivery undermining). If you can only say "loosely related" or "different domains", use Low or No alignment instead. *Reason for the change:* prevents inflating the flagged set with unrelated-domain noise.
- **Hedge rationale**. The prompt explains *why* the pipeline flags rather than asserts: policy text is aspirational, so we observe text-level friction signals, not implementation outcomes. *Reason for the change:* makes the cautious framing principled rather than arbitrary, reducing the LLM's tendency to "lower its claim" to compensate.
- **Conditional manageability**. v1 defaulted Manageable/Fundamental based on severity; v2.1 applies an explicit test: "could coordination, safeguards, or sequencing fully resolve the friction?" If yes, Manageable. If at least one target would need to be revised or dropped, Fundamental.
- **Confidence calibration anchors**. Each confidence level has a text-level definition (e.g. "Low: inferred from indirect signals, the policy text does not name it directly"). *Reason for the change:* without anchors, LLMs default to Medium for ~80% of ambiguous calls; explicit anchors push usage of all three levels.
- **Six worked examples for Flagged for review**, all with source-target provenance annotations inline in the prompt comments:
  - A — Mongolia FSS_11 + NAP_3 (Delivery friction, Manageable, Medium)
  - B — Mongolia FSS_21 + NAP_4 (Resource competition, Manageable, Medium) *— replaces the v1 draft's fabricated Target 1*
  - C — Mongolia FSS_15 + NAP_7 (Goal conflict, Fundamental, High)
  - D — Panama CNR + PEG (Delivery friction, Manageable, High)
  - E — Mongolia FSS_11 + NAP_4 (Delivery friction, Manageable, Low) *— new, anchors Confidence: Low*
  - F — Mongolia FSS_29 + NDC_22 (Resource competition, Fundamental, High) *— new, anchors Fundamental*; the v1 pipeline mistyped this as `implementation_tension`, missing that the 50M head cap is a finite-resource constraint

## Model + temperature

- **Model**: `gpt-5.4` (Azure deployment `cpc-tracker-ai-c657`). v1 production runs were against `gpt-4o-mini`.
- **Temperature**: 0 (unchanged).
- **Concurrency**: dropped from 20 to 6 to stay under Azure's TPM ceiling for gpt-5.4 on this deployment.
- **Cache namespace**: bumped to `*_v2` for all four families so no v1 cache entries are reused even by accident.

## Pipeline robustness

A single LLM call rejected by Azure's content filter no longer crashes the pipeline. The retry loop short-circuits on `content_filter` errors, caches an empty result so subsequent runs don't re-trigger the filter, and lets downstream stages degrade gracefully (an empty decomposition results in `none` alignment, which is a valid outcome per the no-force-results rule). Implementation: `python/src/llm.py:555`.

## Frontend rollout

- `AlignmentLevel` type: collapsed from 7 values to 5.
- New types: `AlignmentMechanism`, `AlignmentManageability`, `AlignmentConfidence`.
- `ContradictionType` aliased to `AlignmentMechanism` for one migration PR.
- Load-time migration in `src/app/api/dashboard/route.ts` runs every v1 record through the migration helper before the rest of the API sees it. New records pass through unchanged.
- Display labels: "Flagged for review" for the flagged state; positive-side "Low" renders as "Partial" per CLAUDE.md guardrail.

## Files changed (high-level)

**New**
- `python/src/alignment_schema.py` — shared maps + parser + migration helper.
- `python/src/report_distribution.py` — post-run distribution-collapse check.
- `python/src/compare_alignments.py` — v1-vs-v2 diff report generator.
- `python/tests/test_alignment_schema.py` — schema unit tests.
- `src/lib/alignment-migration.ts` — frontend load-time migration.
- `docs/v2-methodology-changelog.md` — this doc.
- `docs/v2-comparison-mongolia.md` — generated after the Mongolia run.
- `docs/v2-comparison-panama.md` — generated after the Panama run.

**Replaced**
- `python/src/align.py` — v2.1 prompt + 5-tuple parser + new cache namespace.
- `python/src/measure_align.py`, `python/src/budget_align.py`, `python/src/nr7_align.py` — share the canonical advisor template via `intro_framing` slot.
- `python/src/synthesize_doc_pairs.py`, `python/src/synthesize_by_sector.py` — read `mechanism` (with v1 fallback) and use `TENSION_LEVELS = {"flagged"}`.
- `python/src/llm.py` — content-filter graceful degradation.

**Removed**
- `python/src/align_v2_prompt_draft.py` (folded into `align.py` + `alignment_schema.py`).

**Updated (frontend)**
- `src/types/index.ts` — new types + legacy alias.
- `src/lib/utils.ts` — labels and color/weight maps.
- `src/lib/coherence-briefing.ts`, `src/lib/coherence-chat.ts`, `src/lib/vision-anchor.ts`, `src/lib/target-atlas-signals.ts`.
- `src/components/prototypes/coherence-briefing/*` — pair drawer + sector drawer surface `mechanism`/`manageability`/`confidence`.
- `src/components/viz/policy-coherence-explorer.tsx`, `src/components/viz/vision-anchor-sunburst.tsx`, `src/components/viz/funding-network/index.tsx`.

## Open questions to escalate to the methodology expert

These do not block the re-run; flag them for review when an expert is available:

1. Should `manageability` be ternary (`manageable` / `requires_trade_off` / `fundamental`)? Re-evaluate after seeing v2.1 distribution.
2. Is `delivery_friction` the right label, or `implementation_friction` / `coordination_gap`?
3. Should the synthesis layer surface mechanism distributions in narratives directly (currently it reads them but doesn't call them out by name)?

## Verification

After both country runs complete:

1. `python -m src.report_distribution python/output/{country}/alignment.json` — fails non-zero if any field collapsed past >95% (the same v1 failure mode we are fixing).
2. `python -m src.compare_alignments --country {country}` — writes `docs/v2-comparison-{country}.md` with pair flips and mechanism reassignments vs `main`.
3. `pnpm test` and `pnpm dev` — confirm the new schema renders correctly in the prototypes and atlas.
