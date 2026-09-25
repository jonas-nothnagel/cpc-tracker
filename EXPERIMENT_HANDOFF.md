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
- Review fix pass (`444bf1a`) added:
  - AI labels, confidence and caveats on the theme and document-pair panels;
  - phone jumps that land below the sticky field;
  - texture in the document hub;
  - the es/mn walkthrough titles restored.

**Round 8 (2026-09-24, `9e612b4`):** Jonas liked the direction ("better and better"). The
document hub was "MUCH better". The four green theme columns "only looked cool", and the
steps should be more integrated and explorable as readers dive deeper.
- The overview goes a level deeper with each step:
  - themes as named strips split by the pairs of documents that carry them (hover names
    the pair, a click opens it);
  - the strongest alignments, the types of potential misalignment and the targets to
    review first, each with its own strips.
- Document names in findings lead into the documents.
- The hub centre and partners carry result bars, and a factual line sums up the document
  in focus.
- The landing flows into the overview: no repeated figures band, no divider.
- A pair of documents reads as two documents: two named lines and two columns of targets.
- How it works:
  - the step's place is on the left, with numbered navigation;
  - technical details are always shown;
  - the right side follows the brief's design;
  - the triangle is annotated;
  - plain copy uses the brief's vocabulary.

Verdict: "looks good"; the document hub and the document in focus liked ("really great").

**Round 9 (2026-09-25, `7ae7a46`..`4f36453`):** Jonas: nail the coherence side (four
components) before sectors, implementation, finance and the wheel. Asks: feature documents
in the overview (the How it works triangle and the Explore ring as inspiration, the dot
cloud as the baseline); the theme strips were "green bars" and the target strips "dots, no
policy can be made from dots"; one explorable section per side; the old dashboard's "just 7
targets carry 52%" takeaway, simply and honestly; panels greyed out the screen; subtle UNDP
branding.
- **Four components:** the overview (the ratings, then a map of the documents), what works
  well, where to look closer, the document in focus (unchanged).
- **The map:** the How it works triangle in the brief's inks. Each document's targets run
  along the diagonal in the builder's colour; each block is a pair of documents; each dot
  sits at its two targets. Names are spread apart and kept clear of the diagonal. The two
  lead pairs are outlined. A block gives its figures on hover and opens on click; a
  document's name brings its row and column forward and moves the document hub.
- **One section per side:** the headline says how few targets carry it, as a union of
  pairs (for example, "Of the 671 potential misalignments, 52% involve just 7 targets"). The
  map brings those targets' pairs forward; pointing at a theme, a type or a document name
  brings its pairs forward instead. The target list puts its first target in the centre
  (the document hub's layout); a row picks another target and opens with its text and a way
  to its panel. Each dot names its partner target and opens the comparison.
- **Panels:** DrawerShell locks the root element, not body (with `html { overflow-x:
  hidden }` a clipping body became its own scroll box and threw the sticky field and menu
  off screen: the grey screen). Brief panels use a light scrim without blur.
- **Branding:** UNDP's lockup at the landing's top left with the tool's name; small in each
  printed running head.
- **Walkthrough:** a new "Map of the documents" stop; the other stops describe the map and
  the target in the centre.
- Verified: 1,323 tests on a clean copy of the branch; all four countries and en/es/mn
  print 3 pages; production walk without errors. Verdict pending.
- Review fix pass (fresh review of `7ae7a46..4f36453`):
  - panels keep the page's width with a classic (Windows) scrollbar;
  - the walkthrough centres each stop, so the dots match its card;
  - a theme or type shows its own tone on the map, whichever step leads;
  - the map's dots never overlap on large corpora;
  - the whole name at the centre opens the target.
  Left for Jonas's rework of the two sections: "See all N of its target pairs" opens a
  panel that lists only the aligned and potentially misaligned targets; the strongest
  alignments list names 6 of the headline's K targets (K is 21 for Mongolia); each hover
  re-lays the map (29 to 83 ms for Sri Lanka and Panama). Main's shared `Modal` still
  locks `body` (the grey-screen bug class): fix on main, with the DrawerShell lock.

**Round 10 (2026-09-25, `44638a3`..HEAD):** Jonas liked the design ("stay simplistic")
but asked for one path that deepens step by step. Clicking green in the overall picture
jumped past the map. The target-in-the-centre layout ran three times, blurring target
level and document level; keep it for the document in focus only. The two sides should
build from the dots and use the document squares, not copy the How it works triangle. The
map's colours were hard to hit and the misalignment view looked blurry. A document around
the centre should be clickable, the comparison was a text wall, and the ring should be
considered. He chose variant B from sketches ("B is better"). Spec
`docs/superpowers/specs/2026-09-25-coherence-brief-round10-design.md`, plan
`docs/superpowers/plans/2026-09-25-coherence-brief-round10.md`.
- **One path:** overall, map, what works well, where to look closer, documents. A rating in
  the legend leads to the map with its pairs brought forward until the reader moves on; the
  map step holds for most of a screen (`min-height: 72vh`).
- **Each side is its own landscape on the map:**
  - only its pairs: strong alignments, or potential misalignments;
  - each document's targets re-sorted: the ones the side names, then by count, then
    document order, so the side's pairs slide into the corner of their squares;
  - its targets named at the front of their document, with counts: the headline's when
    they are at most 8, else the list's first 6. The first document's names sit above the
    map when there is room; names wrap to two lines where one is too narrow.
  - Every pair of documents keeps a pale square, so empty squares read as empty.
  - Lists come first under the headline, then themes (and types).
  - Rows and names bring a target's row and column forward; a click keeps it, a second click
    lets go. A theme outlines its pairs of documents.
  - Every dot opens its comparison; every square opens its pair of documents.
- **Sharp map:** each pair is a square on the device pixel grid; paler means a lighter opaque
  ink (`mixInk`), never transparency. Placements are cached per side and size, so pointing
  only recomputes emphasis (Sri Lanka about 8 ms, Mongolia about 3 ms).
- **Single targets go to the ring:** a picked row offers "Explore this target", which puts it
  in the ring's centre and scrolls there (`BriefApp` dispatches to the explore reducer);
  without the ring the row opens the target's panel, relabelled "See its aligned and
  potentially misaligned targets". The target stage is gone from the hub.
- **Document in focus:** clicking another document around the centre (its name, bar or
  dots) puts it in the centre and opens its row.
- **One comparison for panel and ring** (`comparison.tsx`, `ai-text.tsx`):
  - two stops, each with its document's colour square, name, bold title and text (4 lines,
    "Full text");
  - the rating's line from square to square: solid green, grey, dotted, dashed red;
  - the AI explanation's first sentence with "More", confidence beside the heading.
- **Walkthrough:** stops follow the page top to bottom (strongest alignments before
  themes; pinned by a test); overall, aligned, themes, commitments and documents rewritten;
  es/mn English placeholders.
- Verified: full suite 1,369 passed (1 skipped), `tsc` clean (the merge of `origin/main` at
  `c5ceefd` fixed the inherited `store.test.ts` error), all four countries' `/brief` render
  (HTTP 200) with the five steps. Verdict pending.
- **Review fixes** (`1ea1596`, then the side labels): a picked target is let go when the
  selection leaves it no pairs on that side; on a short field (phones) target names take one
  line, then the ones carrying least go unnamed (never the one in focus), so labels keep
  their full height; the map is drawn at the screen's own pixel ratio with both cell edges
  snapped (sharp at 1x and 125%); placements shared and capped at 8; "Explore this target"
  moves focus to the ring's title. Then: the two sides carry a plain label above their
  finding ("What works well", "Where to look closer": Jonas could not find the first by
  name); the strongest alignments list every target the map names from its headline (up to
  8, as the targets to review first do); rows preview their target from the keyboard; "Full
  text" says whether it is open; the ring's AI text explains document codes like the panel.

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
  - `src/components/ui/drawer-shell.tsx` (round 9): the branch locks scrolling on the root
    element instead of body (taking a classic scrollbar's room as padding) and adds
    `scrim="light"`. Keep both if main edits the shell; the root lock fixes sticky
    elements behind every drawer, main's included.
  - `tour/tour-overlay.tsx` (round 9 review): an added `scrollBlock="center"` mode for the
    brief's walkthrough; main's tours keep their modes.
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
   panels, hands-on How it works. Verdict: "better and better"; the document hub liked.
8. **A deeper overview** (`9e612b4`): steps that dive deeper, documents set apart, How it
   works aligned with the brief. Verdict: "looks good"; the strips were unreadable.
9. **The coherence side** (`7ae7a46`..`4f36453`): a map of the documents, one explorable
   section per side, a target in the centre, UNDP branding. Verdict pending.
10. **Deep dive after deep dive** (`44638a3`..): one path; each side its own landscape on
   the map (variant B: its targets first and named); a sharp map; single targets to the
   ring; one comparison design. Verdict pending.

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
- **Overview steps** (screen, round 10): overall (headline + legend; aligned and potential
  misalignment lead on to the map with their pairs brought forward); the map of the
  documents (the leading pairs, linked and outlined); what works well and where to look
  closer, each its own landscape on the map: only its pairs (strong alignments, potential
  misalignments), each document's targets re-sorted so the side's come first and are named
  with their counts, then the list of those targets, themes (and types) that bring their
  pairs forward; documents (one row per document, most aligned first; the open row sits at
  the centre of the dots, and another document is picked there too). A single target is
  explored on the ring. Every pair is one square at its own place on the map (never
  sampled). Around a document, where even the smallest dot cannot fit every pair, one dot
  stands for several, taken evenly, and the counts stay exact.
- **Print sections:** overall (halftone field), areas of alignment / potential misalignment
  (theme list + one example per theme, quotes fitted to whole lines), strongest alignments,
  targets to review first, documents, by policy area (optional).
- **Panels:** serif title with one plain line or the result bar under it. Pair of documents:
  the pipeline's AI summary (first sentence, rest on request), an AI-suggested starting
  point, strongest aligned target pairs, potential misalignments. One comparison (panel
  and ring alike): two stops on the rating's line, each with its document's colour square,
  title and text, then the AI explanation's first sentence. Theme: size, AI
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
   and the wheel to explore. Another session built the explorable ring (`442fab3`, preview
   at `/{country}/brief/explore`); the brief does not link to it yet.
7. How it works, step 14 (finance): the right-hand examples ("Pasture management
   programme", "Soil & fodder programme", "Wetland restoration target") look illustrative;
   check them against Mongolia's BER data or replace them with real rows.
8. es/mn walkthrough: the "Targets to review first" body is an English placeholder like
   the other rewritten stops. Translate with the rest once the English version is liked.
9. The map on a phone is small (about 1.4 px per dot for Mongolia); readable as a pattern,
   with names at 12px.

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
