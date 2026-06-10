# Project audit: 2026-06 zoom-out

Date: 2026-06-10. Scope: full sanity and integrity check of the application against the proposal ("UNDP's AI Sprint: Nature-Climate Policy Coherence Progress Analysis Tool"), the authoritative feedback log (108 items, March to June 2026), and recent TAG / country-office discussions. Method: three parallel codebase/document audits plus a design review, with every load-bearing claim re-verified directly. Sibling of `docs/audit/2026-04-zoom-out/`.

Sources: proposal and feedback log under `dev_data_scripts/sharepoint_sync/` (paths in the appendix). Quality gates at audit time: 253 vitest tests pass, `tsc --noEmit` clean, lint clean in `src/` (noise only in build artifacts).

## Verdict

The tool substantially delivers Level 1 (policy coherence) and is honest where it counts: no fabricated labels found, classifications all flow through the pipeline, slides hide rather than fake when data is missing, and the chat prompt enforces the agreed vocabulary and hedging. Level 2 exists for Mongolia only. Level 3 is arriving (BTR measure alignment for both pilots, coordination map in progress, NR7 still a prototype).

Two findings are red: the live-upload path is broken for non-English documents, and the pipeline's default LLM provider contradicts the documented sovereignty posture. Both sit exactly under the proposal's August 2026 commitments (COP17 Mongolia preview, "standalone webapp usable for 5-country demos").

The proposal's second core question (return on investment of interventions on development priorities) has not been started and is not honestly answerable with this architecture; a reframe memo is included below.

## Mission vs delivery scorecard

| Promise (proposal) | Status | Evidence |
|---|---|---|
| L1: coherence across NDC/NBSAP/NAP/NDP/sectoral | Strong, shipped | Mongolia 153 targets / 9,678 pairs; Panama 368 / 44,474; 9-section briefing live on /dashboard |
| L2: finance follows ambition | Partial | Mongolia BER only (4,284 budget pairs); Panama none; "reviewed biodiversity spending" framing required (BER program-filter reconciliation still open with the BER team) |
| L3: implementation tracking | In progress | 39 Mongolia + 27 Panama BTR measures with measure alignment; coordination map in development; NR7 page still prototype (`/sustainability`) |
| Standalone webapp, input via upload (WP3, Aug 2026) | Exists, broken for non-English | Integrity register items 1 and 2 |
| 3 to 5 pilot countries | 2 active | Mongolia, Panama; Armenia exploratory |
| 100% transparency / traceability | Largely held | Verbatim extraction contract, source chips, taxonomy `_sources`; but `_provenanceFlag` never surfaces (register item 6) |
| Under 10% hallucination complaints | Unmeasurable | No complaint-capture mechanism exists anywhere in the app |
| Minimal environmental footprint | Shipped | EcoLogits tracking, footprint ledger, per-analysis footprint |
| Multilingual | Shipped with one gap | en/es/mn UI; Mongolia narratives have `.mn.json`; Panama narratives are English-only (no `.es.json`) |
| ROI on development priorities (proposal question 2) | Not started | See reframe memo below |

## Integrity register

Ranked. RED needs action before the August commitments; AMBER is real debt with a planned home; MINOR is hygiene.

1. **RED: live-upload contract break (non-English).** `extract.py` MULTILANG_ADDENDUM puts original-language text in `text` and English in `text_eng`/`label_eng`; the frontend canon is English in `text` plus original in `textOriginal`/`sourceLabelOriginal` (`src/types/index.ts:90-95`). No normalizer exists in `/api/extract` or `/api/analyze`. Consequence: classification and alignment run on untranslated text while the translations sit in fields nothing reads. The static Mongolia/Panama data is pre-normalized, which is why the dashboard looks fine today. Fix home: roadmap item 2.
2. **RED: sovereignty default contradicts documentation.** `python/src/config.py:23` defaults `LLM_BASE_URL` to OpenRouter; CLAUDE.md claimed "LLM provider: Azure OpenAI" (corrected in this PR). Our deployments override via `.env`, but a handover or dev deployment without one would send uploaded government documents to a third-party router, and the upload screen carries no notice about where document text goes. Fix home: roadmap item 2 (notice + prod assertion), CLAUDE.md corrected now.
3. **AMBER: prompt mislabel in GLOBE classification.** Few-shot scores `[0.9, 0.7, 0.55, 0.4, 0.3]` (`classify_globe.py`) are positional, not expert-assigned, but sit under an "Expert Calibration Examples" prompt header. One-sentence fix; rides with the next pipeline-touching build because prompt edits invalidate the LLM cache (paid re-runs).
4. **AMBER: adaptation asymmetry is prompt-level only.** `ADAPTATION_CONTEXT_NOTE` in `measure_align.py` is the only thing preventing adaptation actions from being penalized for missing CO2e; no schema field records action type on the alignment record. Regression-fragile. Fix gated on the regression harness (item 9c).
5. **AMBER: arbitrary multi-label threshold.** `RELEVANCE_THRESHOLD = 0.5` in `classify.py` drives every `relevant` tag across all taxonomies; round number, no sensitivity analysis. Future work: per-taxonomy derivation from data.
6. **AMBER: provenance flags never surface.** `extract.py` stamps `_provenanceFlag` on targets with ungrounded numeric claims; zero references in `src/`. The audit trail exists but users never see it.
7. **AMBER: core alignment prompts not provenance-labeled.** The analyst/advisor prompts (used for target-target, measure-target, budget-target scoring) are annotated "from old scripts" rather than explicitly "project-defined" as the guardrail requires. Label fix rides with item 3.
8. **MINOR hygiene.** One dead component (`src/components/viz/financing-gaps.tsx`, removed in this PR; note `coherence-table.tsx` is alive via `financing-coherence.tsx`). Dead route `src/app/[locale]/[country]/upload` (left for the upload rework to delete or revive). CLAUDE.md cited a non-existent file and a stale "L2 still pending" line (both corrected in this PR). PROJECT_GUIDELINES had a stale "not focusing on extracting from docs" line (corrected).
9. **Gaps with no guard:**
   - a. Narrative snapshot drift: `.mn.json` files (and future `.es.json`) can silently desync from the English source on pipeline re-runs; no structure-parity test exists.
   - b. Hallucination-complaint KPI: nothing captures user complaints; the contradiction-review build (roadmap item 1) is the natural capture mechanism.
   - c. No LLM-behavior regression harness: the 253 tests never call the LLM. Before any prompt surgery (items 3, 4, 7), freeze a golden set of 20 to 30 scored pairs with expected level bands.

## Feedback coverage

Major asks from the feedback log (108 items reviewed; recurring or high-weight ones below).

**Delivered**

| Ask (date, source) | Where |
|---|---|
| Replace "low tension" vocabulary (7 May TAG, 8 May, 28 May) | Canonical "potential misalignment" vocabulary across UI, chat, pipeline schema |
| Mongolian-language dashboard and chat (13 May, 2 Jun) | mn locale + per-locale narrative snapshots (PRs #122, #128, #129) |
| LDN policies integration (13 May, 18 May) | ILDN document type in Mongolia corpus |
| Acronym explanations (23 Mar) | abbr tooltips with first-use expansion |
| Prototype to live dashboard, loading times, accessibility (29 May) | Live on /dashboard since 1 June |
| Footprint transparency (proposal, 29 May) | EcoLogits + /sustainability footprint view |
| Detailed wheel restored, clickable misalignment types, most-contested-first (28 May) | Full-view wheel, FlagProfileDrawer, ranked Where-to-Focus |
| Nature of competition (29 May) | Friction-dimension chips on flagged pairs |
| Mongolia food security targets (8 May) | FSS document type in Mongolia corpus |
| BER finance layer connected to targets (TAG, positive) | Financing section, Mongolia |

**Partial**

| Ask | State |
|---|---|
| Practical recommendations, not just gaps (3 Mar, 5 Mar, 11 May CBD) | Hedged pathway pointers in chat and insight callouts, by guardrail design; static surfaces stay factual |
| Implementation layer strengthening (11 May, 2 Jun) | Measure alignment shipped both pilots; coordination map in development; NR7 prototype |
| Sectoral policy expansion (7 May TAG, 13 May) | Mongolia has sectoral docs (FSS, NRVTS, SECTORAL); Panama sectoral drop partially integrated |
| Adaptation incorporation (7 Apr) | Mongolia BTR adaptation shipped (24 actions); asymmetry handling is prompt-level (register item 4) |
| Chatbot expansion (13 May, 14 May) | Trilingual chat live; response theming / feedback grouping not built |
| NDP as central anchor (7 May TAG, 8 May) | Any document can be focused; NDP-first default ordering not implemented (small UX change, unscoped) |

**Open**

| Ask | Notes |
|---|---|
| Contradiction-review mechanism (17 Apr, recurring) | Chosen next build (roadmap item 1) |
| Harmful subsidies / incentives module (5 Mar first TAG, 17 Apr) | Starter scripts only; OECD leg infeasible as written (see roadmap item 5) |
| Delivery by whom: actor attribution (29 May Panama) | Known data gap, deferred 5 June; revisit if Panama supplies actor data |
| Panama wheel REDD+-heaviness (29 May) | Open; bundled into roadmap item 3 |
| Reporting-streamlining exploration (11 May CBD) | Parked; needs scoping conversation |
| Geographic representation (9 Apr internal) | Addressed honestly by roadmap item 4 (indicators first, map later) |
| Climate Policy Radar data pull (11 May) | Data-source conversation, not a build |
| Green budget tagging, SCALA, INFF, KIP, raw BIOFIN (Mar to May, Mongolia) | All blocked on data access, not engineering |
| Human rights taxonomy (24 Mar) | Never scoped; needs a primary-source taxonomy before any pipeline use |
| Replace Panama targets with nationally-provided set (8 May) | Unverified whether the national set was received |

## ROI reframe memo (proposal question 2)

The proposal commits to answering "what was the return on investment of climate / nature interventions on national development priorities, such as job creation, foreign direct investment, agriculture productivity". As stated this requires causal attribution: a counterfactual estimate of what jobs or FDI would have been without the intervention. Nothing in this architecture (policy text alignment, budget-line matching, self-reported BTR statuses) can support that claim, and any chart implying it would fabricate certainty, in direct conflict with the tool's decision-support positioning and the no-overclaim guardrails.

Salvageable version: **documented co-benefit linkage**. The corpus already contains targets and measures whose own text claims development co-benefits (employment, productivity, investment). The tool can surface "which nature-climate commitments explicitly link to which development priorities, and which of those have a matching budget line or reported measure" as a descriptive map, clearly labeled as stated linkage, never measured impact. This keeps the spirit of question 2 (connecting nature-climate action to development outcomes) without the dishonest causal claim.

Recommendation: take this reframe to the proposal stakeholders before the December 2026 reporting cycle so expectations are reset on paper, not at review time.

## Roadmap (decided 2026-06-10)

1. **Contradiction-review UI** (next build). Recurring country-office ask since 17 April; the human-in-the-loop promise made concrete. Design decisions carried in from this audit: server-side per-country JSON store (file-based, fits the no-database architecture, persistent volume on Azure) rather than localStorage, so "reviewed by country team" is honest across devices; dismiss-with-note doubles as the complaint capture that makes the under-10%-hallucination KPI measurable; review states are an audit trail layered over AI output, never overwriting it.
2. **Live-upload contract + sovereignty** (must land before COP17 prep if August demos involve uploading). Field normalizer at the API boundary (`text` to `textOriginal`, `text_eng` to `text` when language is not English), country-config fallback for unknown countries, sector-filter resilience when classifications are missing, an upload-screen sentence stating where document text goes, a production environment assertion. Bundle the prompt-label fixes (register items 3 and 7) here since the LLM cache invalidates anyway. Acceptance test: a non-pilot country's NDC in a non-English language flows upload to dashboard with zero hand edits.
3. **Panama credibility + deadline audit** (two small items). Generate Panama `.es.json` narratives via the snapshot pattern from commit 8abe078, this time with a committed translation script and a structure-parity test (closes register item 9a for `.mn` too); investigate the REDD+ wheel-weighting complaint. Then a deadline/measurability view from existing `quantitative_flags.json`: 83% of Mongolia targets and 88% of Panama targets carry no deadline; among dated ones a 2030 cliff. Year parsing must distinguish deadlines from baseline mentions (Panama's "1994" is a baseline), unit-tested. Say "no deadline / not quantified", never "no baseline" (no baseline field exists).
4. **Independent-evidence layer** (October Biodiversity COP timing; 1-day data spike first). For targets with satellite-measurable subjects, show public country-level indicators next to self-reported BTR status, framed as "context indicators", never "verification": Global Forest Watch tree-cover loss (Panama forest / REDD+ targets), Protected Planet / WDPA coverage (area-based targets, both countries), UNCCD land degradation (Mongolia; weakest source, may need hand-curation). No GIS map in v1; a map is v2 once the numbers prove value. This is the honest answer to the 9 April "geographic representation" ask.
5. **Rescoped subsidies layer.** IMF explicit fossil-fuel subsidies only, Mongolia first, juxtaposed with energy/NDC targets; implicit subsidy estimates shown separately and labeled as modeled externalities, not money flows. The OECD agriculture leg is dropped: the starter script itself notes Mongolia and Panama are not covered, and it targets the decommissioned `stats.oecd.org` endpoint. TAG / sounding-board sign-off on framing before any demo.
6. **Then:** NR7 page promotion from prototype (validated ask, October-aligned); cross-document redundancy view ("the same commitment appears in several documents with different deadlines") as phase 2 of the deadline audit; methodology hardening (adaptation schema field, data-derived thresholds, surfacing `_provenanceFlag`) gated on the golden-set LLM regression harness (register item 9c).
7. **Not built, handled elsewhere:** ROI reframe memo (above) goes to stakeholders; reporting-streamlining stays parked; Climate Policy Radar is a data-source conversation.

## Appendix: key evidence paths

- Proposal: `dev_data_scripts/sharepoint_sync/AI Flagships - Proposal - Nature-Climate Policy coherence insights - Clean.docx`
- Feedback log: `dev_data_scripts/sharepoint_sync/Scoping materials/Feedback log for AI Flagship.docx`
- TAG notes: `dev_data_scripts/sharepoint_sync/TAG/TAG - Meeting_ 7 May 2026.docx`
- Upload contract: `python/src/extract.py` (MULTILANG_ADDENDUM), `src/types/index.ts:90-95`, `src/app/api/extract/route.ts`, `src/app/api/analyze/route.ts`
- Sovereignty default: `python/src/config.py:23-25`
- Thresholds and scores: `python/src/classify.py` (RELEVANCE_THRESHOLD), `python/src/classify_globe.py` (_FEWSHOT_SCORES)
- Adaptation note: `python/src/measure_align.py` (ADAPTATION_CONTEXT_NOTE)
- Provenance flag: `python/src/extract.py` (_provenanceFlag; no consumers in `src/`)
- Data counts: `python/data/*-targets.json`, `python/output/{mongolia,panama}/` (alignment.json, measure_alignment.json, measure_pseudo_targets.json, quantitative_flags.json)
- Narrative locale files: `python/output/mongolia/*.mn.json` present; `python/output/panama/` English-only
- Subsidies starters: `python/src/data_sources/imf_subsidies.py` (live endpoint), `python/src/data_sources/oecd_agri.py` (pilots not covered, decommissioned endpoint)
