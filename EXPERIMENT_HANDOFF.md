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
- no feedback control on the pair synthesis (fixed in round 7);
- tour targets in preview;
- `#step=N` not reaching the iframe route.

**Round 7 (2026-09-24, `d68da55`, `31e201f`, `94e8e67`):** Jonas: the sections felt
"unfocused again"; start from one great coherence overview built out of the landing dots and
explore from there. It combines the dashboard's 01 direction/themes, 02 document focus,
04 types of misalignment and 05 where to focus. Mongolia English only for the first version.
- **The overview** (`src/components/brief/hub/`) replaces the screen sections: a sticky dot
  field beside four steps. As a step crosses the middle of the window, the same dots
  re-form: by rating; aligned pairs by theme (+ strongest alignments, counted by strong
  links as in the explorer); potential misalignments by theme (+ types of potential
  misalignment + targets to review first); and one document in the centre with its pairs
  with every other document on either side, joined by spokes (picked from the document
  list, whose rows carry chevrons and open one at a time).
- **Panels** in the brief's design: serif title, result bar, rating-ink rows, the two
  targets as quotes. The review loop (thumbs + note) is on every AI text, with the
  dashboard's anchors. Document codes in AI text get tooltips with the full names.
- **How it works:** the 13,404 pairs are a comparison triangle (documents along the
  diagonal, their own squares empty), coloured by every pair's real rating in the next step.
  The worked example's parts, measurable phrases and source check are quoted on the left.
  Invented right-hand examples were removed, and the example figures re-verified.
- The printed brief is unchanged: the builder's section group reads "In the printed brief".

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
6. **Flowing brief + dynamic dots + new How it works** (`ff89b09`). Verdict: How it works
   and the documents list liked; the other sections "unfocused again".
7. **One coherence overview** (`d68da55`..`94e8e67`): the scrolling hub, brief-style
   panels, hands-on How it works. Verdict pending.

The finding-page routes (`/{country}/finding/{pairKey}`, `/{country}/findings`) still exist
on this branch as legacy surfaces; nothing in the brief links to them. Their lib layer
(`selectFindingCandidates`) still feeds `src/lib/pulse/strands.ts`.

## What the brief is (design contract)

- **Landing:** rows of verbatim targets drift behind one serif statement of scale
  ("8 policy documents. 178 targets. 13,404 target pairs compared."); an icon pause button
  (WCAG 2.2.2); reduced motion stills them.
- **Screen:** one flowing, full-width page next to the builder (documents, policy-area lens,
  the sections of the printed brief and their order, share link, "How to read this brief"
  walkthrough, "How the analysis works" link). The page is the coherence overview, then any
  other kept section (policy areas).
- **Print:** A4 sheets are always laid out off screen (so charts and text fits are measured at
  page size), inert and hidden; "Print or save as PDF" shows them as a preview with Print /
  Back. Default = overall, areas of alignment, strongest alignments, potential misalignment,
  targets to review first, documents = 3 pages.
- **Overview steps** (screen): overall (headline + legend; aligned and potential
  misalignment lead to their steps); aligned (leading pair of documents headline; themes
  numbered like the dot groups; strongest alignments by strong links); potential
  misalignment (themes with resources involved; types of potential misalignment; targets to
  review first); documents (one row per document, most aligned first; the open row sits at
  the centre of the dots). Dots keep within 1.8x their landing size in every step.
- **Print sections:** overall (halftone field), areas of alignment / potential misalignment
  (theme list + one example per theme, quotes fitted to whole lines), strongest alignments,
  targets to review first, documents, by policy area (optional).
- **Panels:** serif title with one plain line or the result bar under it. Pair of documents:
  the pipeline's AI summary (first sentence, rest on request), an AI-suggested starting
  point, strongest aligned target pairs, potential misalignments. One comparison: both
  targets quoted, joined by the rating's line, then the AI explanation. Theme: size, AI
  summary, example, starting point, documents by share. Thumbs + note on each AI text.
- **Language:** targets, target pairs, aligned, partially aligned, potential misalignment,
  no clear relationship. Never commitment (the team's finance layer), reinforce, flagged.
- **How it works** (`public/methodology-experience.html` + `methodology-scene.js`): the left
  side is a canvas of dots on Mongolia's real per-target data (documents, extraction,
  measurable flags, GLOBE categories, the comparison triangle of 13,404 pairs with each
  pair's real rating, themes, finance, implementation) with the worked example quoted in
  place; captions state each step's result; `#step=N` opens one step.

## Where the code lives

- `src/lib/brief/` (pure, tested): `source.ts` (payload -> BriefSource, incl. `pairNotes` with
  confidence), `selection.ts`, `sections.ts`, `compute.ts` (scope, tones, pairs, themes as
  coverage, examples, concentration, strongest alignments, mechanism mix, document stats,
  areas), `data.ts` (`buildBriefData`, `themeDots`), `hub.ts` (overview particles and stage
  layouts), `dot-layout.ts` (`layoutGroups`), `text.ts` (sentence split, document codes),
  `sheet.ts`, `pair.ts`, `test-fixture.ts` (options `themes`, `notes`).
- `src/components/brief/`: `brief-app.tsx` (modes, panels), `flow.tsx` (screen), `hub/`
  (`hub.tsx` steps, `hub-canvas.tsx` morphing field), `sheets.tsx` (print),
  `section-view.tsx`, `sections/*` (print sections; `ThemeList`, `DocList`, `ResultBar` and
  the headline hooks are shared with the overview), `rank-list.tsx`, `dot-field.tsx`,
  `example-pair.tsx`, `panels.tsx`, `builder.tsx`, `hero.tsx`, `moving-text.tsx`, `ink.tsx`,
  `brief.css`.
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
2. Strongest alignments are led by broad targets (Vision 2050's national anti-desertification
   programme and the NBSAP's biodiversity mainstreaming, 60 strong links each). True, but
   possibly unsurprising to a reader.
3. Cote d'Ivoire: the same pair can lead both "most closely aligned" and "highest share of
   potential misalignment".
4. es/mn: new and changed strings since round 6 are English placeholders (hub, panels,
   tour, builder "In the printed brief"); the es/mn How it works pages keep the old
   flowchart. Translate once Jonas likes the Mongolia English version.
5. The overview's screen-only sections (overall dot field with links, theme dot clusters)
   still exist as components for the print path; their screen interactivity is now unused.
6. Next sections Jonas named: sectors (from the taxonomy lens), implementation, finance,
   and the wheel to explore.

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
