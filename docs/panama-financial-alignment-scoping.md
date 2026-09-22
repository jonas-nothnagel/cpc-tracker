# Panama Financial Alignment — Scoping Decisions

Working doc capturing decisions for integrating Panama's biodiversity expenditure data into the budget-to-target alignment pipeline. Locked decisions feed the implementation plan.

## Feedback round — 2026-07-29 (BIOFIN Panama focal point)

Panama's BIOFIN technical focal point reviewed the shipped financial module and sent structured feedback (`docs/feedback/panama-financing-2026-07.txt`). Decisions taken in response (branch `feat/panama-financing-feedback`):

1. **Terminology**: "Well-funded / Funded / Under-funded" replaced with "High / Medium / Low / No aligned spend" (their proposed wording). The tiers were always rank-based volume cutoffs, never adequacy judgments; the labels now say so. The `FundingTier` enum was renamed to match (`high|medium|low|none`).
2. **Linking-language copy rule**: all text describing a programme↔target link must name both sides of the comparison — the AI aligns the funding line's *description* with the target's *text* — and never phrase links as money flowing to / funding / spent on a target. Applied across UI strings, provenance, methodology notes, and the public methodology pages.
3. **Provenance made explicit**: the grid now carries a DataProvenance badge stating the BER identifies expenditure but does not connect it to targets; every link is Tracker-AI-generated.
4. **Double counting disclosed and totals fixed**: per-target aligned-spend figures intentionally overlap (a programme backs every target it aligns with); document-level totals now count each programme once (`dedupeContributorSpend`). Spend apportionment across targets was considered and deferred — it is a methodology change requiring BIOFIN validation.
5. **Descriptions surfaced**: institution + Tablas description now show on the collapsed contributor row (they were two clicks deep), disambiguating duplicate programme names ("Transferencias Varias" ×2).
6. **Interim GLOBE breakdown shipped**: reviewed spend grouped by primary GLOBE category on the financing slide, explicitly labeled Tracker-AI-assigned. When Panama's own thematic classification (8 categories, near-1:1 with GLOBE) is ready, ingest it as authoritative and replace/complement the AI-assigned view. Required a single-level fallback in `computeBudgetByGlobeCategory` (Panama BER programmes carry primary `globe` tags, no `globe_sub`).
7. **In-UI methodology note**: "How these figures are produced" expander on the financing slide answers the focal point's four questions (aligned-programme definition, multi-target treatment, per-target interpretation, double counting), gated on grid presence rather than country id so future BER countries inherit it.
8. **Declined for now**: expenditure-first navigation rebuild (framing copy covers the lens-over-expenditure point; `ProgramDetailTable` exists in `/prototypes` if demand returns).

## Source pivot — 2026-06-17

Originally we picked `Base de datos FINAL.xlsx` (the raw MEF transactional database) as the canonical source. After implementing the BD-based ingest and validating quality, Magda (BIOFIN Panama) clarified that Tablas_adicionales is her preferred view — both files reflect the same underlying budget executions; Tablas adds three augmentations BD lacks:

1. An auxiliary descriptive layer per expenditure line (LLM-generated, but project-validated for interpretability).
2. An English translation column to support non-Spanish-speaking dashboard users.
3. Indicative reference URLs per institution.

Decision: **pivot to Tablas as canonical**. The CLAUDE.md "no LLM-drafted pipeline content" guardrail still applies, but is satisfied by explicit source labeling in every pseudo-target description (each emitted text includes "Description sourced from Tablas_adicionales descriptive layer (LLM-generated, Panama BIOFIN team preferred)"). What we lose: explicit BIOFIN attribution code per line, modified-budget tracking for execution-rate KPI, second-source reconciliation against an independent headline. The lost signals are recoverable downstream — the descriptions themselves convey attribution semantics implicitly — and the execution-rate tile was already out of scope for v1 per Decision 9.

## Context

- **Source file**: `data/Panama/Panama Materials/Financial data/Tablas_adicionales_desagregacion_descripciones (1).xlsx`, sheet `Desagregación_descrita`
- **Scale**: 500 rows × 15 cols, 2015–2024, pre-pivoted (institution → programme → subprogramme → activity)
- **Granularity decided**: **programme-level** (~33 pseudo-targets). Subprogramme/activity carried as drill-down only.
- **Pipeline reuse**: `python/src/budget_align.py` + Step 8 in `run_analysis.py:552-629` accept the Mongolia-shape `{programs, expenditure, currency, unit, period}` JSON unchanged.
- **Currency / unit / period**: Balboas (PAB, pegged 1:1 USD), millions, 2015–2024.
- **Hierarchy reconstruction**: numeric balance (parent value = sum of direct children), recursive subtree absorption with overshoot detection. Ambiguous data structures produce loud warnings (~9% unattributed spend across 6 institutions in real data; reviewers see deltas per institution).

## Decisions

### 1. Pseudo-target description template
**Status**: ✅ locked
**Recommendation**: Compact narrative (~60 words). Institution + programme + top sectorial codes + functional area + BIOFIN attribution with one-line explainer + 10-year executed total and per-year avg.
**Decision**: Compact narrative. Reference template:
> Programme "Desarrollo y Conservación de Recursos Acuáticos" under the Autoridad de los Recursos Acuáticos de Panamá. Sectorial classifications: Desarrollo Pesquero, Conservación Flora y Fauna. Functional area: Servicios del Medio Ambiente. BIOFIN attribution: Directo — expenditure with a direct biodiversity objective. Executed expenditure 2015–2024: 47.3M Balboas total (avg 4.7M/year).

**Implementation notes**:
- "Top sectorial codes" = `desc_sectorial` values aggregated across the programme's children, ranked by share of executed spend, top 2–3.
- Functional area = `desc_grupo_fun` (similarly aggregated, top 1–2).
- BIOFIN one-line explainer text is decided in #2.
- Money totals are in Balboas (PAB ≈ USD 1:1), millions, weighted per #4.

### 2. BIOFIN attribution framing
**Status**: ✅ locked
**Recommendation**: Methodology-sourced explainer, one short sentence per code, quoted/paraphrased from the BIOFIN methodology docs in the Panama folder. Fall back to project-defined-and-labeled if no quotable source is found.
**Decision**: Methodology-sourced explainer.

**Reference text (placeholder until methodology PDF is consulted)**:
- `Directo` — expenditure whose primary objective is biodiversity conservation or sustainable use.
- `Indirecto` — expenditure whose primary objective is not biodiversity but which produces measurable biodiversity benefits.
- `Saneamiento` — sanitation, water and waste expenditure attributed partially to biodiversity because it reduces pressures on ecosystems.

**Implementation notes**:
- Ingest step must consult `DICCIONARIO DE TERMINOS.pdf` and `Manual-de-Clasificaciones-Presupuestarias-del-Gasto-Publico.pdf` in `data/Panama/Panama Materials/Financial data/` and either:
  - Use the official wording with `_source` annotation pointing to the PDF page, OR
  - Mark the wording as project-defined (`_source: "project-defined paraphrase of BIOFIN methodology"`) per the LLM-input-pollution guardrail in CLAUDE.md.
- Weighting rule (how Saneamiento gets ponderado) does NOT enter the LLM text — that's a pipeline mechanic handled in #4.
- Treat the explainer as a constant lookup table loaded at ingest time, not regenerated per programme.

### 3. Administrative-overhead programmes
**Status**: ✅ locked
**Recommendation**: Per-institution rollup — sum all overhead programmes at each institution into ONE "Institutional support" pseudo-target per institution.
**Decision**: Per-institution rollup.

**Implementation notes**:
- Overhead detection criteria (apply during ingest):
  - `desc_sectorial == "Administración General"` OR
  - `desc_sectorial == "Administración y Regulación"` OR
  - `desc_prog` matches a stoplist: "Dirección y Administración General", "Servicios Administrativos", "Despacho Superior", etc. Stoplist seeded from observed values in BIOFIN-tagged rows, reviewed during ingest QA.
- Per-institution rollup forms one pseudo-target with id `BER_PA_{entidad_code}_OVERHEAD`, name `"Apoyo institucional — {entity name}"`, summing executed (and ponderado where applicable) across all flagged overhead programmes.
- Description template (compact narrative variant of #1) makes the institutional-support nature explicit: e.g. "Cross-cutting institutional support and general administration at the {entity name}, covering programmes such as: {top 3 overhead programme names}. BIOFIN attribution: mixed (Directo/Indirecto/Saneamiento as recorded). Executed 2015–2024: {total} Balboas."
- Total expected: ~14 overhead rollups + ~36–40 substantive programmes after overhead pull-out = ~50 pseudo-targets total. (Roughly the same headline count, just composition changes.)
- The rollups still pair with every target — but the LLM is expected to assign Low/Emerging alignment naturally given the framing, without needing a `programType` hint.

### 4. Money fields surfaced to LLM and UI
**Status**: ✅ locked
**Recommendation**: Simple LLM input, rich UI surfaces.
**Decision**: Simple LLM, rich UI.

**LLM input** (in pseudo-target text per #1):
- 10-year executed total in millions of Balboas (weighted).
- Per-year average (executed total / 10).

**UI surfaces**:
- Per-year executed time series (10 data points 2015–2024) — feeds existing budget surfaces and any new timeseries view.
- Execution rate KPI per programme: `presupuesto_ejecutado / presupuesto_modificado` over the 10-year window. A meaningful "budget assigned vs actually spent" signal for policymakers.

**Weighting rule (confirmed)**:
- `Directo` rows: full `presupuesto_ejecutado`.
- `Indirecto` rows: full `presupuesto_ejecutado`.
- `Saneamiento` rows: `Ejecutado_ponderado` (the file's weighted column, ~50%).
- For execution rate, modificado is similarly weighted (`Mod_ponderado` for Saneamiento, full `presupuesto_modificado` for Directo/Indirecto).

**Carried fields per programme in `panama-ber.json`**:
- `expenditure.values`: `{year: weighted_executed}` (year-by-year, for UI timeseries).
- `expenditure.modified`: `{year: weighted_modified}` (for execution-rate UI).
- `expenditure.total_executed`, `expenditure.total_modified`: convenience totals.
- `expenditure.execution_rate`: precomputed `total_executed / total_modified` for UI.

**Notes**:
- Currency string: `"PAB"` (Balboas) with a note `"PAB pegged 1:1 with USD"` in country config to let the UI display either.
- Unit: `"millions"` to match Mongolia precedent.

### 5. Native Panama sectorial / functional codes
**Status**: ✅ locked
**Recommendation**: Metadata + cross-validation. Carry native codes per programme; still run pipeline NBS/IPCC/GLOBE classifiers as canonical; quietly flag disagreements.
**Decision**: Metadata + cross-validation.

**Implementation notes**:
- Per programme in `panama-ber.json`, carry:
  - `nativeClassifications.sectorial`: list of `desc_sectorial` values across the programme's children, with share-of-spend weights.
  - `nativeClassifications.functional`: list of `desc_grupo_fun` values similarly weighted.
  - `nativeClassifications.economic`: list of `desc_economica` values similarly weighted.
- These are *included in the pseudo-target description text* (per #1 — top 2–3 sectorial codes are already part of the compact narrative template).
- Pipeline classifiers (NBS, IPCC sectors, GLOBE) still run unchanged in Step 8 (`run_analysis.py:578-602`).
- A new lightweight ingest-time check `classification_cross_validation.py` compares native `desc_sectorial` (mapped through a small lookup, e.g. "Conservación Flora y Fauna" → expected IPCC sector "Land use / Biodiversity") against the pipeline's top IPCC sector. Disagreements written to `panama-classification-disagreements.json` for human review. Does NOT block the pipeline.
- UI: no new pivot; surface disagreements only in a developer/QA view or in proposal-review UI.

**Lookup mapping** to define during implementation (small, hand-curated, primary-source from Panama BIOFIN methodology):
- "Conservación Flora y Fauna" → expected IPCC: Land use / Biodiversity
- "Desarrollo Pesquero" → expected IPCC: Fisheries
- "Desarrollo Agrícola" / "Desarrollo Ganadero" → expected IPCC: Agriculture
- "Dotación de Agua Potable" → expected IPCC: Water
- "Servicios del Medio Ambiente" → expected IPCC: Land use (catch-all)
- (etc. — covered by ~10 mappings for the 16 BIOFIN-relevant sectorial codes observed.)

### 6. HITL review of generated pseudo-targets
**Status**: ✅ locked
**Recommendation**: Lightweight self-review checkpoint via a generated preview doc. User reviews before pipeline run; no Panama-team coordination required.
**Decision**: Lightweight self-review checkpoint.

**Implementation notes**:
- Ingest writes `python/output/panama/panama-ber-pseudo-targets-preview.md` rendering all ~50 pseudo-targets in human-readable form. Each entry shows:
  - Programme name and institution.
  - The exact pseudo-target description text the LLM will see.
  - Native classifications (sectorial, functional) with shares.
  - Money totals (executed, modified, execution rate) per year.
  - Row count this aggregation is derived from (e.g. `derived from 87 rows`).
- Generation does NOT block — the file is for human eyes only.
- User reviews this file before running Step 8 (budget alignment). A simple convention: if the preview file is older than the source Excel, the pipeline refuses to start. (Cheap freshness guard; can be overridden with a `--skip-preview-check` flag.)
- Doesn't extend to Panama-team review for this iteration. If quality issues surface, escalate to option B later.

### 7. Reconciliation guardrail
**Status**: ✅ locked
**Recommendation**: Hard fail with 1% tolerance against Tablas_adicionales headline totals.
**Decision**: Hard fail with tolerance.

**Implementation notes**:
- Reconciliation source: `Tablas_adicionales_desagregacion_descripciones (1).xlsx`, sheet `Gasto total en BD`, column `Gasto total en biodiversidad`, rows for 2015–2024.
- Reconciliation method: sum aggregated weighted-executed (Directo + Indirecto full executed + Saneamiento ponderado) per year from `Base de datos FINAL`. Compare to `Gasto total en BD` per year.
- Tolerance: ±1% per year. (Absorbs unit rounding without masking real drift. Mongolia tolerance can be revisited if 1% turns out tight.)
- Failure mode: structured `ReconciliationError` listing each offending year, expected vs computed, absolute and relative deltas. No fallback / no silent continue.
- The reconciliation check lives in the ingest script (`python/src/parse_panama_ber.py`), gated behind `--strict-reconcile` (default on). Allows local dev override with `--strict-reconcile false` for explicitly accepted upstream changes.
- If the source `Tablas_adicionales` file is absent or unreadable, ingest WARNS but does NOT fail (the reconciliation target itself is optional). Cuts coupling — losing one of the two source files shouldn't break the other.

**Known divergence (2026-06-16)**: Initial Panama ingest produces year totals 33-109% above the `Tablas_adicionales` headline. No single column-substitution (devengado, pagado, Directo-only, Saneamiento-only-with-ponderado) reproduces the headline within tolerance. This strongly suggests a BIOFIN-Panama methodology layer between the BD transactional data and the analyst-curated headline that isn't documented in the shipped corpus (DICCIONARIO DE TERMINOS.pdf / Manual de Clasificaciones). **Action**: this iteration runs with `--strict-reconcile=false` and flags the discrepancy prominently in the preview doc; ask Panama-BIOFIN team for methodology to tighten reconciliation in a follow-up. The reconcile machinery stays in place so when methodology lands we can re-enable strict mode.

### 8. Data sovereignty consent
**Status**: ✅ confirmed
**Recommendation**: n/a — consent question, not a design decision.
**Decision**: Consent is in place. Plan proceeds end-to-end including the live Step 8 LLM run on real Panama data.

**Implementation notes**:
- No artificial gating required in the pipeline. Step 8 runs end-to-end like Mongolia.
- The standing project guardrail (no external API calls with government data without consent — CLAUDE.md) is satisfied because consent has been given for THIS dataset.
- If consent scope is later questioned (e.g. additional data sources), revisit before adding new ingest sources.

### 9. Frontend scope for this iteration
**Status**: ✅ locked
**Recommendation**: Reuse existing financing surfaces only. No new components. Fix two known gotchas.
**Decision**: Reuse existing surfaces only.

**Existing surfaces being reused (no changes beyond gotcha fixes)**:
- `src/components/viz/financing-coherence.tsx` — main "Level 2" coherence viz with taxonomy pivot
- `src/components/viz/coherence-table.tsx` — hierarchical table
- `src/components/viz/program-detail-table.tsx` — programme detail panel
- `src/components/viz/funding-network/` — funding network viz
- `src/components/dashboard/coherence-briefing/sections/financing.tsx` — briefing Level-2 slide
- `src/components/dashboard/coherence-briefing/centerpiece/financing-centerpiece.tsx` — budget centerpiece
- `src/lib/financing-coherence.ts` + `src/lib/coherence-budget.ts` — coverage calculations

**Gotcha fixes required**:
1. **Unit scale**: `formatMoney` (`financing-coherence.tsx:65`) assumes input is in **billions**. Panama BER will be in **millions** of Balboas. Two options during implementation:
   - Scale Panama values to billions in `panama-ber.json` (divide by 1000) and set `unit: "billion"` — minimal code change, but loses precision and feels wrong (Mongolia natively in billions, Panama natively in millions).
   - Generalize `formatMoney` to accept a unit hint (`billion` | `million`) and scale accordingly. Cleaner, ~30 lines.
   - **Recommend the second** during implementation; it's the principled path and small.
2. **i18n briefing copy**: `coherence-briefing/sections/financing.tsx` is biodiversity-framed already, fits Panama. Verify Panama `messages/*.json` includes the right translations for the briefing's "reviewed biodiversity spending" headline and any units strings ("M PAB" instead of "B MNT"). Already partly covered by the i18n work that landed in `feat/i18n` (merged).

**Explicitly out of scope this iteration**:
- Execution-rate KPI tile (data IS in the model per D4, can be added in a follow-up; not blocking).
- Native-taxonomy (Panama MEF sectorial) pivot in the taxonomy switcher.
- Any new Panama-specific viz component.

**Verification path** (covers in D10):
- Run pipeline on Panama; confirm `budget_alignment.json` and `budget_pseudo_targets.json` render in all listed surfaces without crashes or hardcoded Mongolia copy leaks.
- Visual smoke test: financing-coherence taxonomy pivot, programme detail click-through, briefing slide. No bespoke Panama dashboard route needed.

### 10. E2E test plan layering
**Status**: ✅ locked
**Recommendation**: Full layered plan, baked into the implementation plan as discrete deliverables.
**Decision**: Full layered plan.

**Five layers**:

1. **Ingest unit tests** (`python/src/tests/test_parse_panama_ber.py`)
   - BIOFIN filter excludes `N/A` and keeps `Directo`/`Indirecto`/`Saneamiento`.
   - Weighting per code: `Directo`/`Indirecto` use full `presupuesto_ejecutado`; `Saneamiento` uses `Ejecutado_ponderado`. Modificado weighted analogously.
   - Overhead detection: sectorial-based + stoplist correctly identifies "Dirección y Administración General" etc.; rollup produces one pseudo-target per institution.
   - Native classification aggregation: `desc_sectorial` / `desc_grupo_fun` rollups carry the right share-of-spend weights.
   - Reconciliation tolerance: ±1% per year accepted, beyond raises `ReconciliationError`.

2. **Integration test on hand-curated Excel fixture** (`python/src/tests/fixtures/panama-ber-fixture.xlsx` + `test_ingest_integration.py`)
   - Small fixture (~30 rows) reproducing one institution, one programme with multiple subprogrammes, one overhead programme. Includes Directo, Indirecto, Saneamiento mixed.
   - End-to-end `parse_panama_ber.py` reproduces a known-good `panama-ber-fixture.json` byte-for-byte (or via canonicalized comparison).
   - Covers all branches of the ingest in one pass.

3. **Pipeline dry-run on 5 targets × 5 programmes**
   - Run `run_analysis.py` against a constructed minimal `panama-targets-sample.json` (5 representative Panama targets) and a stub `panama-ber.json` containing 5 programmes.
   - Verify Step 8 produces `budget_alignment.json` with expected structure (`targetAId`, `targetBId`, `alignment`, `description`, etc.).
   - Cost predictor: emits expected total LLM cost for full run (4,750 pairs).
   - Saves output as a regression baseline.

4. **Playwright smoke on financing surfaces with Panama data**
   - Run the dev server with Panama data wired through.
   - Verify all six existing surfaces render: `financing-coherence`, `coherence-table`, `program-detail-table`, `funding-network`, briefing `financing` section, `financing-centerpiece`.
   - Assertions: no JS errors, no `undefined` displayed, currency string shows "PAB" or equivalent, taxonomy switcher works in financing-coherence, programme detail click-through shows execution figures.
   - Covers the unit-scale fix and i18n string updates from D9.

5. **Guardrail CI check — no LLM-drafted descriptions in panama-ber.json**
   - Pytest assertion that traverses `panama-ber.json` and confirms:
     - Programme descriptions are constructed from MEF code fields (deterministic), not from LLM output.
     - BIOFIN explainer text matches the project-defined / methodology-sourced lookup table exactly (no LLM substitutions).
   - Mechanism: regenerate `panama-ber.json` in CI from `Base de datos FINAL.xlsx` and `diff` against the committed version (or a hash). Drift = guardrail failure.
   - This is the structural defense against the `categories.json` class of mistake.

**Plan-integration**:
- Layers 1, 2 ship alongside `parse_panama_ber.py` itself — same PR.
- Layer 3 is a one-off pre-launch validation, not a CI permanent. Documented as a runbook step.
- Layers 4, 5 ship as CI in the implementation PR.
- All five layers blocked-by complete ingest implementation; layered tests run during implementation, not after.
