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
plan: `docs/superpowers/plans/2026-09-23-coherence-brief.md`. Verdict pending.

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
4. **The coherence brief** (2026-09-23, `f0d22c9`..): a composable, printable 2-3 page
   brief, see below. Verdict pending.

The finding-page routes (`/{country}/finding/{pairKey}`, `/{country}/findings`) still exist
on this branch as legacy surfaces; nothing in the brief links to them. Their lib layer
(`selectFindingCandidates`) still feeds `src/lib/pulse/strands.ts`.

## What the brief is (design contract)

- **Landing:** rows of verbatim commitments from the selected documents drift behind one
  serif statement of scale ("178 commitments. 8 policy documents. 13,404 comparisons.").
  Reduced motion stills them. References Jonas gave: Anthropic's 81k-interviews feature
  (moving text), Gates Notes, Die Zeit's Berlin election map story, riso-windowseat.
- **The brief:** A4 sheets on a light desk; the screen shows exactly what prints. A builder
  beside the sheets picks documents (country-config defaults), the policy-area lens and
  the sections, reorders them, shows the page count, copies a share link (URL holds
  `docs`, `lens`, `sections`) and prints. Default = 3 pages; verified by headless print of
  the production build for all four countries and en/es/mn.
- **Sections** (each self-contained: question label, serif finding, one visual, note):
  overall picture (every comparison one ink dot, halftone), what works well together and
  where policies may pull apart (leading pair of documents by share, min 30 comparisons;
  AI-identified themes as a theme x document grid; one principled example pair),
  commitments to look at first (concentration), documents side by side (result bars,
  misalignment anchored left and hatched, reinforcement right, average tick), map of
  commitments (one square per commitment, Zeit-style steps 0/1-2/3-5/6-10/11-20/21+,
  numbered top five, selection lights partners), by policy area (lens shares, thin areas
  unrated). Drill-downs open one drawer with a back trail: comparison (AI reading via
  `/api/brief/pair`), pair of documents (strands through the busiest commitment first),
  commitment (partners by tone), theme (AI summary; pathway under "AI-suggested starting
  point").
- **Inks:** green solid = reinforce, red hatched or dashed = potential misalignment;
  validated ordinal ramps (dataviz validator); green vs red fails CVD separation, so
  position, labels and hatching always carry it too. Text never takes the data colour.
- **Language:** commitment, policy document, comparison, reinforce each other, partial link,
  potential misalignment, no clear link. No "pathway", "corpus", "pipeline", "flagged".

## Where the code lives

- `src/lib/brief/` — pure, tested: `source.ts` (payload -> compact BriefSource),
  `selection.ts` (defaults, URL), `sections.ts` (units, pagination), `compute.ts` (scope,
  tones, pairs, themes, examples, concentration, map cells, areas, document shares),
  `data.ts` (everything a selection needs), `map-layout.ts`, `dot-layout.ts`, `pair.ts`,
  `test-fixture.ts` (hand-countable 3 x 6 fixture).
- `src/components/brief/` — `brief-app.tsx` (state, URL, panels), `hero.tsx` +
  `moving-text.tsx`, `builder.tsx`, `sheets.tsx`, `sections/*`, `dot-field.tsx`,
  `theme-grid.tsx`, `example-pair.tsx`, `commitment-map.tsx`, `panels.tsx`, `ink.tsx`,
  `brief.css` (all styles incl. print, scoped to `[data-brief]`).
- `src/app/[locale]/[country]/brief/page.tsx`, `src/app/api/brief/pair/route.ts`;
  `src/app/[locale]/[country]/pulse/page.tsx` is now a redirect.
- `src/lib/pulse/strands.ts` survives (pair-of-documents panel); the canvas UI, its geometry
  and aggregate were removed (git history: `2a0bc14`, `bc0b3ea`, `88a489a`).
- Messages: `brief.*` in `messages/{en,es,mn}.json`; `pulse.*` removed.

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

1. The uptake gate for the brief: would Jonas send the printed default brief to Lea or a
   CO colleague as is? If not, which section fails first?
2. With three documents (Cote d'Ivoire) the same pair can lead both "works well together"
   (86%) and "may pull apart" (11%); true, but it reads oddly. Decide whether the apart
   headline should skip a pair that leads the other way, or say so.
3. Finance and implementation sections: the registry and builder are ready for sections
   that declare the data they need; none exist yet (by decision, coherence only).
4. The review loop (validate/dismiss with note) is still the missing trust layer.
5. Rows in panels keep the stored pair orientation (the AI readings say "first/second
   target").

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
