# Coherence Pulse experiment: handoff

Branch `experiment/coherence-pulse` (formerly `feat/finding-cards`), local only, never pushed.
Written 2026-08-06 to freeze the state of a three-round design experiment and the reasoning
behind it, so a future session (human or Claude) can resume cold. Companion context lives in
Claude's project memory under `finding-cards-experiment`.

## Status 2026-09-23: long-lived parallel track, now the coherence brief

Jonas decided to develop this track in parallel with `main` for weeks to months. It may
never merge back and may instead overtake main as the product's opening view.

**Round 4 (2026-09-23, free hand from Jonas): the canvas is replaced by the coherence
brief** at `/{country}/brief` (`/pulse` redirects there). Jonas: the canvas was "neither
impressive, nor pretty, nor informative, nor accessible for non technical people, nor
understandable". The brief answers the original dashboard's two questions, what works well
together and what does not, for a reader with no technical background, as a composable
2-3 page policy brief. Spec: `docs/superpowers/specs/2026-09-23-coherence-brief-design.md`;
plan: `docs/superpowers/plans/2026-09-23-coherence-brief.md`.

**Round 5 (`d0cf0b5`):** self-explanatory sections in the team's language. Jonas: keep the
drifting header, the dot field, the left menu and full-screen use. No explanations or text
walls; the theme x document grid and the commitment map were not understandable; faded text
was unreadable; wording too "LLM-like". The rule now lives in CLAUDE.md, DESIGN.md and memory
(`self-explanatory-visuals`).

**Round 6 (`ff89b09`):** Jonas: "too much like a make-a-pdf tool". The screen is now a flowing
page, and A4 pages appear only as a print preview. The dots are clickable into their themes,
there is a "Most aligned targets" section, the documents view is sorted per document with a
richer pair panel, and How it works has a dot-scene left side. Work on Mongolia English only
until Jonas likes a version; es/mn got English placeholders for new strings. A fresh code
review of rounds 5 and 6 led to fix pass `c79bd1e`:
- partner documents stated with counts;
- sentence split safe for "Res. 91";
- hovering no longer restarts the build;
- theme counts back to coverage (pipeline contract, dashboard parity);
- overall links only to kept sections;
- the preview lands on page 1;
- How it works labels wrap, carry full names and name Mongolia.

Deferred minors from that review:
- the tour's dot unit for Sri Lanka;
- dead code;
- no feedback control on the pair synthesis;
- tour targets in preview;
- `#step=N` not reaching the iframe route.

Verdict pending.

- **Where:** worktree `/Users/jonas/github/cpc-tracker/.claude/worktrees/coherence-pulse`
  on branch `experiment/coherence-pulse`. The main checkout stays on `main`, untouched.
  Start chats for this work from inside the worktree folder.
- **Run:** `pnpm dev -p 3100` (keeps 3000 free for main's dev server), then
  `http://localhost:3100/mongolia/brief`. English URLs carry no locale prefix. No sign-in
  locally: the auth gate from #221 is bypassed in dev when no token is configured, and it
  covers `/pulse` and `/findings` automatically (it gates every route except login/health).
- **Syncing main:** `git merge main` from the worktree, never rebase. The branch is
  long-lived and syncs repeatedly; merges keep each sync a single conflict pass.
  Conflict hotspots seen on the first sync (merge of `main` at 943cb89):
  - `messages/{en,es,mn}.json`: sibling keys added at the same spot; keep both.
  - Target normalizer: now single-sourced in `src/lib/normalize-target.ts` (main's
    current whitelist + swap rule), imported by main's `use-dashboard-data.ts`. If main
    edits its normalizer again, the merge conflicts there instead of drifting silently;
    port main's change into `src/lib/normalize-target.ts`.
  - `coherence-dashboard.tsx` and `pair-drawer.tsx`: take main's version (the branch no
    longer changes either; the production drawer's "Open as a page" link was dropped at
    the second sync because it broke main's PairDrawer test).
  - The local `main` ref lives in the main checkout and can lag GitHub. If
    `git log HEAD..origin/main` is non-empty after `git fetch origin`, merge `origin/main`
    instead of `main` (the second sync did this; the main checkout stays untouched).
- **Verification after the second sync** (merge of `origin/main` at 7006442, PRs
  #223-#226, 2026-09-23): 1,011 tests pass (1 skipped), all four countries' `/pulse`
  render with the numbers below unchanged. `tsc` shows one error in
  `src/lib/analytics/store.test.ts`, inherited unchanged from main. Run the suite as
  `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run`: on this Mac's de-DE default, three
  of main's NR7 tests fail because main formats numbers with `toLocaleString(undefined)`
  (a main-side issue, not the branch's). The Turbopack "inferred your workspace root"
  warning in the dev log is harmless (the parent checkout's lockfile).
- **Not pushed anywhere.** A local-only branch for a month is a backup risk; pushing it
  (as a branch, no PR) is Jonas's call.

### Canvas numbers on current data (2026-09-22)

| Country | Flagged / compared | Inflamed pathways | Worst pathway | Hub documents |
|---|---|---|---|---|
| Mongolia (gpt-5.4, 178 targets, 8 docs) | 671 / 13,404 (mean 4.5%) | 13 of 28 | Vision 2050 <-> FSS 85/615 = 14% | Vision 2050 in 7, FSS in 6 |
| Panama | 1,133 / 41,947 (3.1%) | 9 of 28 | PEG <-> PNRF 33/330 = 10% | PEG 5, PIOTA 5 |
| Sri Lanka (old corpus, see below) | 866 / 56,794 (5.2%) | 9 of 28 | NBSAP <-> NFAP 32/144 = 22% | PPPP 4, NMP 4 |
| Cote d'Ivoire | 128 / 5,215 (5.3%) | 1 of 3 | NBT <-> LDN 16/147 = 11% | |

The August numbers further down (1,128 flags, 10 of 21) predate the Mongolia re-curation
(#189: NDC 3.0 split from the Resolution 91 "NITIPA" document) and are historical.

### Open items

1. **DONE 2026-09-23 (bc0b3ea): cross-model consensus dropped from the canvas.** The
   overview (headline, inflamed fibers, widths) already uses only the served model. The
   leftover from the finding-card rounds is in the pathway dive: strands are ordered first
   by "models flagging" (`src/lib/finding/candidates.ts`, the sort's first key) and each
   strand shows "identified by N of 4 models" (`pulse/page.tsx`, `index.modelsFlagging`).
   Only Mongolia has comparison runs, and those still cover the pre-#189 153-target corpus,
   so the 31 new NDC 3.0 targets cap at "1 of 4", rank down, and read as disagreement.
   Decision: stop passing consensus counts in the pulse page and drop the models line from
   strands, so ordering is confidence, manageability, mechanism for every country, like
   the production dashboard. Do NOT re-run comparison models for this. Grouping and the
   caption now live in `src/lib/pulse/strands.ts` (tested). The legacy leaves the canvas
   links to (`/findings` via "and N more, ranked", the finding page via "Open as a page")
   still read consensus.
2. **Sri Lanka corpus on `main` is the old one** (8 docs incl. minerals NMP). The
   2026-09-18 replacement (225 targets, 12 docs, minerals + fisheries dropped) was still
   uncommitted in the main checkout at this sync; it arrives with the next `git merge main`
   once it lands there. Still the old corpus on `origin/main` at 7006442.
3. **RESOLVED 2026-09-23 (88a489a): the dive's "top 6" was mostly alphabetical.** The pipeline's
   enums barely vary: medium confidence + coordination-level is 663 of Mongolia's 671
   flags, 1,104 of Panama's 1,133, 864 of Sri Lanka's 866. With consensus gone, only the
   mechanism differs, so the final pairKey tie-break (lexical: `NDC_11` before `NDC_1`)
   picks which six strands a pathway shows: in 12 of 13 inflamed Mongolia pathways
   (55 of 78 strands shown), 9 of 9 in Panama (41 of 54), 6 of 9 in Sri Lanka. For
   Panama, Sri Lanka and Cote d'Ivoire this was already true before the cleanup. The
   header "Strongest signals first" overclaims. A data-only signal that does vary:
   concentration on a target within the pathway (every pathway is a full cross-product,
   so counts are comparable per side). Mongolia: Vision 2050 "Irrigated agriculture
   expansion" (doc id SECTORAL) is in 21 of 38 Vision 2050<->NDC flags, and one target
   touches half the flags in 5 of 13 inflamed pathways; Panama: PIOTA "Pillar 1.2" in 157
   of 173 ENR<->PIOTA flags, PEG "1.1 Actions to Implement (integrate local productive
   chains)" (an 895-character merged action list) in 190 of 517 PEG<->ENR flags. A hub can
   be a real cross-cutting conflict or a broad, merged target text; the reader decides
   which. To re-audit, re-derive from `/api/dashboard?country=x` with the canvas's filters
   (flagged, cross-document, no BTR/BER).
   Fix (Jonas: "check what targets have the most potential misalignments, like the old
   overview"): strands rank by how many of the PATHWAY's potential misalignments their
   targets are in (busier target, then the other); the enums only break ties; header
   "Most recurring targets first". Counted within the pathway, not corpus-wide like the
   explorer's "Most conflicted targets": corpus-wide counts overlapped the in-pathway
   top 6 on only 45 of 78 Mongolia strands and made pathways open on globally busy
   targets (Vision 2050 <-> FSS would lead with "Irrigated agriculture expansion", in 3 of
   its 85). Now NBSAP <-> FSS opens on "3 Protected areas" (21 of 87) against six FSS
   production measures. Still open: rows keep the stored pair orientation (FSS target
   left under an "NBSAP <-> FSS" header); flipping them would misdirect the rationales
   that say "the first/second target" (26 of 712 Mongolia flags, 45 of 866 Sri Lanka).
   The counts themselves are not shown yet.

## Why this branch exists

July 2026 feedback (Panama focus group 24 Jul, Mongolia call 28 Jul, Magda's BIOFIN email)
said: the analysis is valued, navigation is fine, but interpretation fails and nothing is
compelling enough to forward to a colleague. This branch is the search for the answer.

## The rounds and their verdicts

1. **Finding pages** (`4280cdb`, `753eff8`): one target-pair claim per permalinked page,
   template-composed headline, ranked shortlist at `/{country}/findings`.
   Verdict (Jonas): "the pair drawer as a page", discarded as a product direction.
2. **Significance strip** (`0dc90bc`): the card gained data-only "why this pair stands out"
   lines (model consensus, pattern rarity, target concentration, review status).
   Verdict (Jonas): "a few information bubbles more... will not lead to uptake", discarded.
3. **The coherence canvas** (`2a0bc14`): Jonas's own picture, built bold, at
   `/{country}/pulse`. Verdict 2026-08-06: "a good start"; 2026-09-23: not impressive,
   pretty, informative, accessible or understandable enough. Replaced.
4. **The coherence brief** (2026-09-23, `f0d22c9`..`abea5ff`): a composable, printable
   2-3 page brief. Verdict: "neither ... understandable" parts (grid, map, text walls).
5. **Self-explanatory brief** (`d0cf0b5`): plain theme lists, readable examples, team
   register, walkthrough. Verdict: clearer; red/green liked; "too much a PDF tool".
6. **Flowing brief + dynamic dots + new How it works** (`ff89b09`). Verdict pending.

The finding-page routes (`/{country}/finding/{pairKey}`, `/{country}/findings`) still exist
on this branch as legacy surfaces; nothing in the brief links to them. Their lib layer
(`selectFindingCandidates`) still feeds `src/lib/pulse/strands.ts`.

## What the brief is (design contract)

- **Landing:** rows of verbatim targets drift behind one serif statement of scale
  ("8 policy documents. 178 targets. 13,404 target pairs compared."); an icon pause button
  (WCAG 2.2.2); reduced motion stills them.
- **Screen:** one flowing, full-width page next to the builder (documents, policy-area lens,
  sections and their order, share link, "How to read this brief" walkthrough, "How the
  analysis works" link). No section eyebrows: each section opens with its finding.
- **Print:** A4 sheets are always laid out off screen (so charts and text fits are measured at
  page size), inert and hidden; "Print or save as PDF" shows them as a preview with Print /
  Back. The theme the reader selected prints. Default = overall, areas of alignment, most
  aligned targets, potential misalignment, targets to review first, documents = 3 pages.
- **Sections:** overall (halftone dot field; aligned and potential-misalignment legend
  entries link to their sections); areas of alignment / potential misalignment (leading pair
  of documents headline; the tone's dots clustered by theme, numbered like the list; theme
  rows with the three documents most involved and, for misalignment, the resources involved;
  one example per theme, quotes fitted to whole lines); most aligned targets (share of
  compared targets); targets to review first (concentration); documents (one row per
  document, most aligned first, opening to its pairs); by policy area (optional).
- **Pair panel:** the pipeline's AI synthesis (first sentence, rest on request), an
  AI-suggested starting point, strongest aligned target pairs, potential misalignments.
- **Language:** targets, target pairs, aligned, partially aligned, potential misalignment,
  no clear relationship. Never commitment (the team's finance layer), reinforce, flagged.
- **How it works** (`public/methodology-experience.html` + `methodology-scene.js`): the left
  side is a canvas of dots on Mongolia's real per-target data (documents, extraction,
  measurable flags, GLOBE categories, 13,404 pairs, ratings, themes, finance, implementation);
  captions state each step's result; `#step=N` opens one step.

## Where the code lives

- `src/lib/brief/` (pure, tested): `source.ts` (payload -> BriefSource, incl. `pairNotes`),
  `selection.ts`, `sections.ts`, `compute.ts` (scope, tones, pairs, exclusive themes,
  examples, concentration, aligned targets, document stats, strongest aligned, areas),
  `data.ts` (`buildBriefData`, `themeDots`), `dot-layout.ts` (`layoutGroups`), `sheet.ts`
  (footer date, line fit), `pair.ts`, `test-fixture.ts` (options `themes`, `notes`).
- `src/components/brief/`: `brief-app.tsx` (modes, shared theme selection, replay), `flow.tsx`
  (screen), `sheets.tsx` (print), `section-view.tsx` (variant screen/print), `sections/*`,
  `dot-field.tsx` (`DotCanvas` + overall `DotField`), `example-pair.tsx`, `panels.tsx`,
  `builder.tsx`, `hero.tsx`, `moving-text.tsx`, `ink.tsx`, `brief.css`.
- Walkthrough steps: `TOUR_STEPS.brief` in the dashboard's tour engine
  (`src/components/dashboard/coherence-briefing/tour/steps.ts`), copy in `briefing.tour.brief`.
- Routes: `src/app/[locale]/[country]/brief/page.tsx`, `src/app/api/brief/pair/route.ts`;
  `/pulse` redirects.

## Data facts worth re-loading

- Mongolia headline: 1,128 potential misalignments over 9,678 policy-to-policy comparisons;
  FSS sits in 6 of the 10 inflamed pathways; Vision 2050 <-> FSS is worst (145/615 = 24%).
- Cross-model consensus funnel (Mongolia, 4 models): 2,825 union-flagged pairs -> 932 by 2+,
  454 by 3+, 144 by all four. Panama funnel: 1,172 flagged -> 7 high-confidence.
- Live blind-ratings ledger (3 Aug): 2 rated pairs, both livestock-vs-conservation, both
  rated lower by the reviewer than by the flagging model (single-model flags deserve doubt).
- The demo strand: FSS 4.4 pig/poultry farm support <-> Vision 2050 pasture carrying
  capacity limits, identified by 4 of 4 models, high confidence.

## Open questions for the pickup

1. Uptake gate: would Jonas send the printed default brief to Lea or a CO colleague as is?
2. "Most aligned targets" is led by generic enabling targets (for example the NDC's "Enabling
   environment Goal", aligned with 100% of the targets it was compared with). True, but it
   may read as trivial.
3. Cote d'Ivoire: the same pair can lead both "most closely aligned" and "highest share of
   potential misalignment".
4. How it works, right panel: some worked-example numbers are older hand-set figures
   (NDC <-> NBSAP 720 pairs, 70%, 1,560 pairs); the new left side uses the current run.
5. New strings since round 6 are English placeholders in es/mn; the es/mn How it works
   pages still carry the old flowchart.
6. Finance and implementation sections: none yet (coherence only by decision).

## How to resume

- Code: `cd /Users/jonas/github/cpc-tracker/.claude/worktrees/coherence-pulse`,
  `pnpm dev -p 3100`, open `http://localhost:3100/mongolia/brief`. Never check this branch
  out in the main checkout; it lives in the worktree (see the status section above).
- Tests for just this work:
  `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief src/components/brief src/lib/pulse`.
- Print check: `pnpm build && npx next start -p 3101`, then Chrome headless
  `--print-to-pdf` with `--virtual-time-budget=8000` on `http://localhost:3101/mongolia/brief`
  (the dev server's live-reload socket keeps a virtual-time print from finishing).
- Chat context: start `claude` inside the worktree folder and say "pick up the
  coherence-pulse experiment"; Claude's memory (`finding-cards-experiment`, shared across
  worktrees of this repo) plus this file carry the rest.
- Keep current with main via `git merge main` (see the status section), not rebase.
- How it works checks: after `pnpm build` (new files in `public/` are only served by the
  production server if they existed at build time), open
  `http://localhost:3101/methodology-experience.html#step=11`. Headless captures need
  `--force-prefers-reduced-motion` to show settled scenes (animation frames barely advance
  under virtual time), and Chrome keeps running after writing the file (use an alarm).
