# Coherence Pulse experiment: handoff

Branch `experiment/coherence-pulse` (formerly `feat/finding-cards`), local only, never pushed.
Written 2026-08-06 to freeze the state of a three-round design experiment and the reasoning
behind it, so a future session (human or Claude) can resume cold. Companion context lives in
Claude's project memory under `finding-cards-experiment`.

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

- Code: `git checkout experiment/coherence-pulse`, `pnpm dev`, open `/mongolia/pulse`.
  COMMIT OR STASH any in-flight work on your current branch first: this branch and main
  both touch `messages/*.json`, so a dirty checkout will conflict.
- Tests for just this work: `npx vitest run src/lib/pulse src/components/pulse src/lib/finding`.
- Chat context: start a session in this repo and say "pick up the coherence-pulse
  experiment"; Claude's memory (`finding-cards-experiment`) plus this file carry the rest.
- If main has moved far by then, rebase is optional; the experiment is self-contained and
  runs fine from its base (ea391a0).
