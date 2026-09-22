# Coherence Pulse experiment: handoff

Branch `experiment/coherence-pulse` (formerly `feat/finding-cards`), local only, never pushed.
Written 2026-08-06 to freeze the state of a three-round design experiment and the reasoning
behind it, so a future session (human or Claude) can resume cold. Companion context lives in
Claude's project memory under `finding-cards-experiment`.

## Status 2026-09-22: long-lived parallel track

Jonas decided to develop the canvas in parallel with `main` for weeks to months. It may
never merge back and may instead overtake main as the product's opening view.

- **Where:** worktree `/Users/jonas/github/cpc-tracker/.claude/worktrees/coherence-pulse`
  on branch `experiment/coherence-pulse`. The main checkout stays on `main`, untouched.
  Start chats for this work from inside the worktree folder.
- **Run:** `pnpm dev -p 3100` (keeps 3000 free for main's dev server), then
  `http://localhost:3100/mongolia/pulse`. English URLs carry no locale prefix. No sign-in
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
  - `coherence-dashboard.tsx`: take main's version (the branch no longer changes it).
- **Verification after the first sync:** 882 tests pass (1 skipped), all four countries'
  `/pulse` render. `tsc` shows one error in `src/lib/analytics/store.test.ts`, inherited
  unchanged from main. The Turbopack "inferred your workspace root" warning in the dev
  log is harmless (the parent checkout's lockfile).
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

### Known data caveats to resolve before trusting strand ranking

1. **Mongolia consensus is mixed-corpus.** The served run (gpt-5.4) covers the 178-target
   corpus; the three comparison runs (deepseek-v4-pro, gpt-5.4-mini, llama-4-maverick)
   still cover the pre-#189 153-target corpus. 31 current targets exist in only one run,
   so any strand touching them can reach at most "1 of 4 models" and is ranked down.
   Options: re-run the comparison models on the current corpus, or drop consensus from
   the ranking for pairs whose targets are not in every run.
2. **Sri Lanka corpus on `main` is the old one** (8 docs incl. minerals NMP). The
   2026-09-18 replacement (225 targets, 12 docs, minerals + fisheries dropped) was still
   uncommitted in the main checkout at this sync; it arrives with the next `git merge main`
   once it lands there.

## Why this branch exists

July 2026 feedback (Panama focus group 24 Jul, Mongolia call 28 Jul, Magda's BIOFIN email)
said: the analysis is valued, navigation is fine, but interpretation fails and nothing is
compelling enough to forward to a colleague. This branch is the search for the answer.

## The three rounds and their verdicts

1. **Finding pages** (`4280cdb`, `753eff8`): one target-pair claim per permalinked page,
   template-composed headline, ranked shortlist at `/{country}/findings`.
   Verdict (Jonas): "the pair drawer as a page", discarded as a product direction.
2. **Significance strip** (`0dc90bc`): the card gained data-only "why this pair stands out"
   lines (model consensus, pattern rarity, target concentration, review status).
   Verdict (Jonas): "a few information bubbles more... will not lead to uptake", discarded.
3. **The coherence canvas** (`2a0bc14`): Jonas's own picture, built bold. Live at
   `/{country}/pulse`. Verdict so far: "a good start" — parked here for a later pickup.

The finding-page routes (`/{country}/finding/{pairKey}`, `/{country}/findings`) still exist
on this branch. They are LEGACY as surfaces, but their lib layer is the data engine of the
canvas and the "Open as a page" leaf is still linked from the canvas's strand stage.

## What the canvas is (design contract)

- **Documents as literal pages** on a shallow arc (fold, doc color, target count), ordered
  by the country config's documentTypes order.
- **Two layers, two scales, stated in the legend.** Quiet green tissue = each doc pair's
  aligned share (opacity only). Red dashed fibers = doc pairs whose flagged share sits at
  or above the corpus's OWN mean (width/glow grow with share, capped at 3x). Within-corpus
  ranking is what fixes "the wheel always looks the same": Mongolia shows 10 of 21 pathways
  inflamed, Panama 9 of 28, Cote d'Ivoire honestly 1 of 3.
- **Staged dive, three glances.** Click a fiber: the two documents anchor left/right, the
  fiber splits into its top-6 ranked strands (consensus, confidence, manageability,
  mechanism), with an honest "and N more, ranked" link into `/findings`. Click a strand:
  claim sentence (serif), the two verbatim commitments, mechanism sentence, AI rationale
  behind a disclosure. Esc walks back.
- Deterministic geometry (hash-seeded jitter, SSR-safe, no Math.random). Reduced motion
  honored. Vocabulary canonical ("potential misalignment"; "inflamed nerve" is an internal
  metaphor, never UI copy). en/es/mn with parity-gate coverage.

## Where the code lives

- `src/lib/pulse/aggregate.ts` — doc-pair model (shares, corpus mean, inflamed flag). Tested.
- `src/lib/pulse/geometry.ts` — arc positions, hash jitter, fiber paths, widths. Tested.
- `src/components/pulse/coherence-canvas.tsx` (+ `types.ts`) — the scene, staging, overlays.
- `src/app/[locale]/[country]/pulse/page.tsx` — server assembly: payload, consensus counts,
  strand precompute with translated claims/signals.
- Data engine (round-1 survivors): `src/lib/finding/{candidates,headline,doc-name,consensus,
  resolve,significance}.ts`, all tested.
- Messages: `finding.*` and `pulse.*` namespaces in `messages/{en,es,mn}.json`.

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

1. The uptake gate: does the overview invite touch, and does the dive feel like following
   the pain? ("a good start" is not yet a yes.)
2. If yes: does the canvas become the dashboard's opening view (replacing/joining the wheel
   in section 01), and what happens on mobile?
3. Strand claims: template sentences are honest but repetitive within one pathway; consider
   target-level phrasing per strand.
4. The review loop (validate/dismiss with note) is still the missing trust layer everywhere.
5. Hub-target idea from round 2 is unexplored: one page per concentration target
   (e.g. FSS 3.1, 85 pairs) aggregating the buried drill-down content.

## How to resume

- Code: `cd /Users/jonas/github/cpc-tracker/.claude/worktrees/coherence-pulse`,
  `pnpm dev -p 3100`, open `http://localhost:3100/mongolia/pulse`. Never check this branch
  out in the main checkout; it lives in the worktree (see the status section above).
- Tests for just this work: `npx vitest run src/lib/pulse src/components/pulse src/lib/finding`.
- Chat context: start `claude` inside the worktree folder and say "pick up the
  coherence-pulse experiment"; Claude's memory (`finding-cards-experiment`, shared across
  worktrees of this repo) plus this file carry the rest.
- Keep current with main via `git merge main` (see the status section), not rebase.
