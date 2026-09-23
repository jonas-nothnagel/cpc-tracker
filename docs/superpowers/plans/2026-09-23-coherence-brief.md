# Coherence Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the coherence canvas with a composable, printable policy coherence brief at `/{country}/brief` (landing with moving commitments, a builder, A4 sheets with self-contained sections).

**Architecture:** The server page slims the dashboard payload into a serializable `BriefSource`; a client app holds the selection (URL-synced), derives every section with pure, tested functions in `src/lib/brief/` (reusing `src/lib/coherence-briefing.ts` and `src/lib/pulse/strands.ts`), paginates sections into A4 sheets, and renders them with SVG/canvas marks. Pair details load on demand from `/api/brief/pair`.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind v4 tokens, next-intl (en/es/mn), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-coherence-brief-design.md`

## Global Constraints

- Plain policy language per the spec's Language table: commitment, policy document, comparison, "reinforce each other" (high+medium), "partial link" (low), "potential misalignment" (flagged), "no clear link" (none). Never "pipeline", "scored", "corpus", "pathway", "fiber", "flagged" in UI text.
- Third person, sentence case, no em dashes, no second person.
- Every user-facing string lives in `messages/{en,es,mn}.json` under `brief.*`; `src/i18n/messages-parity.test.ts` must stay green.
- Numbers formatted with the page locale (next-intl `useFormatter`), never `toLocaleString(undefined)`.
- Green solid = reinforce; red hatched/ringed = potential misalignment; colour never the only channel. UNDP Blue only for the primary action and focus.
- Serif (`var(--font-display)`) only for the landing statement, sheet title and section findings.
- A4 sheet: 210 x 297 mm; content = 4 units of 58 mm with 4 mm gaps; page 1 spends 1 unit on the title block. Section units: overall 1; together, apart, commitments, documents, areas 2; map 4.
- Minimum comparisons for naming a pair of documents: 30. Map steps: 0, 1-2, 3-5, 6-10, 11-20, 21+.
- Reduced motion: no drifting text, no dot settling.
- Tests run as `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run` (the machine default is de-DE).

## Review Focus

1. A selection that leaves fewer than two documents: the builder must refuse to drop the second-to-last document, and a hand-edited URL with one document falls back to the defaults.
2. A document selection with no precomputed theme state (e.g. Panama with ENR added): theme rows still show live counts and the "written for the full set" note appears; no crash when themes are missing entirely (uploads).
3. Very large or very small selections: Sri Lanka's 404 commitments must fit the map sheet (cell size shrinks), and Cote d'Ivoire's 3 documents must still paginate and render every section.
4. Print: the printed PDF of the default brief has exactly 3 pages and no builder or landing.
5. Non-English pages: Mongolian and Spanish strings fit (line clamps), numbers use the page locale, and the moving text shows the locale's commitment text.

---

### Task 1: Brief source (server-side slimming)

**Files:**
- Create: `src/lib/brief/source.ts`
- Test: `src/lib/brief/source.test.ts`

**Interfaces:**
- Consumes: `normalizeTarget` (`src/lib/normalize-target.ts`), `findingDocName` (`src/lib/finding/doc-name.ts`), `getDocColor`, `getDocFullLabel`, `getDocLabel` (`src/lib/utils.ts`), `CorpusThemesPayload` (`src/lib/coherence-briefing.ts`).
- Produces:
  - `type LensId = "globe" | "ipcc" | "gga" | "hr"`
  - `LEVEL_CODES = ["high","medium","low","none","flagged"] as const`, `MECHANISM_CODES = [null,"goal_conflict","resource_competition","delivery_friction"] as const`
  - `interface BriefCommitment { id; doc; label; text }`
  - `interface BriefDocument { id; code; name; full; color; count; defaultOn }`
  - `interface BriefLens { id: LensId; taxonomyType: string; categories: {id; name}[]; primary: Record<string, string> }`
  - `interface BriefSource { countryId; countryName; commitments; documents; comparisons: number[] /* flat [a,b,level,mechanism] */; lenses; themes: CorpusThemesPayload | null; model: string | null }`
  - `function buildBriefSource(args: { countryId: string; countryName: string; data: Record<string, unknown>; locale: string }): BriefSource`

- [ ] **Step 1: Write the failing test** (`source.test.ts`): fixture payload with config documentTypes `[NDC, NBSAP, FSS, BTR]`, `defaultHiddenDocTypes: ["FSS"]`, targets `NDC_1, NDC_2, NBSAP_1, FSS_1, BTR_1`, alignment rows covering high, low, flagged (with mechanism), a same-document row and a BTR row, classifications with one primary `globe` row. Assert: BTR commitment and BTR/same-doc rows dropped; `comparisons` is the flat encoding in payload order; documents in config order with counts and `defaultOn` false for FSS; only the `globe` lens present with its `primary` map; `name` comes from `findingDocName`.
- [ ] **Step 2: Run** `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief/source.test.ts`; expect FAIL (module missing).
- [ ] **Step 3: Implement** `buildBriefSource`: normalize targets with the page locale; drop `BTR`/`BER`; order commitments by document order then payload order; documents from `countryConfig.documentTypes` that have commitments (unknown documents appended); encode cross-document comparisons as `[aIdx, bIdx, LEVEL_CODES.indexOf(level), MECHANISM_CODES.indexOf(mechanism ?? null)]`; lenses from `globeCategories` (globe), `sectors` (ipcc, taxonomyType `sector`), `ggaCategories` (gga), `hrCategories` (hr), kept only with at least one primary classification on a brief commitment.
- [ ] **Step 4: Run the test**; expect PASS.
- [ ] **Step 5: Commit** `feat(brief): slim the dashboard payload into a brief source`.

### Task 2: Selection (defaults, URL parse and serialize)

**Files:**
- Create: `src/lib/brief/selection.ts`
- Test: `src/lib/brief/selection.test.ts`

**Interfaces:**
- Consumes: `BriefSource`, `LensId` (Task 1).
- Produces:
  - `type SectionId = "overall" | "together" | "apart" | "commitments" | "documents" | "map" | "areas"`
  - `SECTION_IDS: SectionId[]`, `DEFAULT_SECTIONS: SectionId[] = ["overall","together","apart","documents","map"]`
  - `interface BriefSelection { docs: string[]; lens: LensId | null; sections: SectionId[] }`
  - `defaultSelection(source): BriefSelection` (documents with `defaultOn`, or all when fewer than two; first lens)
  - `parseSelection(params: Record<string, string | string[] | undefined>, source): BriefSelection`
  - `selectionQuery(selection, source): string` (only non-default keys; `""` for the default)

- [ ] **Step 1: Failing tests**: default docs honour `defaultOn`; unknown document ids ignored and config order kept; a single valid document falls back to the defaults; an unavailable lens falls back; unknown or duplicate sections dropped, empty falls back; `areas` dropped when there is no lens; `selectionQuery` is `""` for the default and round-trips through `parseSelection`.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement** as specified.
- [ ] **Step 4: Run**; expect PASS.
- [ ] **Step 5: Commit** `feat(brief): selection defaults and shareable URL state`.

### Task 3: Section sizes and pagination

**Files:**
- Create: `src/lib/brief/sections.ts`
- Test: `src/lib/brief/sections.test.ts`

**Interfaces:**
- Consumes: `SectionId` (Task 2).
- Produces: `SECTION_UNITS: Record<SectionId, 1 | 2 | 4>`, `PAGE_UNITS = 4`, `TITLE_UNITS = 1`, `interface BriefPage { title: boolean; sections: SectionId[] }`, `paginate(sections: SectionId[]): BriefPage[]`.

- [ ] **Step 1: Failing tests**: default sections give `[{title, [overall, together]}, {[apart, documents]}, {[map]}]`; `[map]` alone gives a title-only first page and the map on page 2; `[]` gives one title page; all seven sections give 5 pages in order.
- [ ] **Step 2: Run**; FAIL. **Step 3:** greedy in-order implementation. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(brief): A4 pagination by section units`.

### Task 4: Scope, tones and documents side by side

**Files:**
- Create: `src/lib/brief/compute.ts`
- Test: `src/lib/brief/compute.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `AlignmentResult`, `Target` from `@/types`.
- Produces:
  - `type Tone = "reinforce" | "partial" | "apart" | "none"`, `toneOf(level): Tone`
  - `interface ToneCounts { reinforce; partial; apart; none; total }`, `toneCounts(comparisons: {level}[]): ToneCounts`
  - `interface ScopedComparison { a: BriefCommitment; b: BriefCommitment; level: AlignmentLevel; mechanism?: AlignmentMechanism }`
  - `interface Scope { docs: BriefDocument[]; commitments: BriefCommitment[]; comparisons: ScopedComparison[]; alignment: AlignmentResult[]; targets: Target[]; hiddenDocs: string[] }` (`alignment`/`targets` are lite objects for the shared helpers; `hiddenDocs` = source documents not selected)
  - `scopeOf(source, docIds): Scope`
  - `verdictOf(counts): "mostly_aligned" | "mixed" | "lots_of_misalignment"` (apart / (apart + reinforce) below 0.15 / 0.30, same thresholds as `pickHeadlineVerdict`)
  - `interface DocPairStat { a: BriefDocument; b: BriefDocument; counts: ToneCounts }`, `docPairStats(scope): DocPairStat[]` (a before b in document order)
  - `MIN_PAIR_COMPARISONS = 30`, `leadingPair(stats, tone: "reinforce" | "apart"): DocPairStat | null`

- [ ] **Step 1: Failing tests** with a hand-built source (3 documents, literal expectations): scope drops comparisons touching an unselected document; `toneCounts` literal; `verdictOf` boundaries (0.149, 0.15, 0.30); `docPairStats` orientation follows document order whichever way the row was stored; `leadingPair` ignores pairs under 30 comparisons and breaks share ties by the larger total.
- [ ] **Step 2-4:** run FAIL, implement, run PASS.
- [ ] **Step 5: Commit** `feat(brief): scope, tone counts and pairs of documents`.

### Task 5: Recurring themes and examples

**Files:**
- Modify: `src/lib/brief/compute.ts`, `src/lib/brief/compute.test.ts`

**Interfaces:**
- Consumes: `selectCorpusThemesForState`, `computeStorylineLiveStats`, `rankStorylines`, `getStorylineDocPairKeys`, `getDocPairKey` (`src/lib/coherence-briefing.ts`); `CorpusStoryline` (`@/types`).
- Produces:
  - `interface ThemeRow { storyline: CorpusStoryline; count: number; docShares: Record<string, number> }`
  - `themeRows(source, scope, type: "reinforcement" | "friction"): { rows: ThemeRow[]; exact: boolean }` (rows with a live count of 0 are dropped)
  - `shareStep(share: number): 0 | 1 | 2 | 3` (0 = no part, 1 = up to 10%, 2 = up to 25%, 3 = over 25%)
  - `interface ExamplePair { a: BriefCommitment; b: BriefCommitment; level: AlignmentLevel; mechanism?: AlignmentMechanism }`
  - `themeExample(scope, storyline): ExamplePair | null` (polarity-matched comparisons in the theme's document pairs; ranked by anchors present desc, then `high` before `medium` for reinforcement, then combined in-theme involvement desc, then pair key)

- [ ] **Step 1: Failing tests**: themes payload with one reinforcement and one friction storyline over literal document pairs: live counts, doc shares, `exact` false for an unprecomputed hidden set, zero-count theme dropped, `shareStep` boundaries, example prefers the anchor pair over a higher-involvement non-anchor pair.
- [ ] **Step 2-4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** `feat(brief): recurring themes with live counts and a principled example`.

### Task 6: Commitments, map cells and map layout

**Files:**
- Modify: `src/lib/brief/compute.ts`, `src/lib/brief/compute.test.ts`
- Create: `src/lib/brief/map-layout.ts`, `src/lib/brief/map-layout.test.ts`

**Interfaces:**
- Consumes: `computeTargetConcentration`, `rankTargetsByFriction` (`src/lib/coherence-briefing.ts`).
- Produces:
  - `interface CommitmentRow { commitment: BriefCommitment; apart: number; partnerDocs: { doc: string; count: number }[] }`, `commitmentsToReview(scope, limit = 8): CommitmentRow[]`
  - `concentrationOf(scope)` returning `{ total; contested; top; share }` from `computeTargetConcentration(…, 0.5)`
  - `interface MapCell { commitment: BriefCommitment; apart: number; reinforce: number; total: number }`, `mapCells(scope): MapCell[]`
  - `APART_STEPS = [0, 1, 3, 6, 11, 21]`, `apartStep(n): 0..5`, `reinforceStep(share): 0..3` (under 25, 50, 75, else 3)
  - `partnersOf(scope, id): { apart: BriefCommitment[]; reinforce: BriefCommitment[] }`
  - `interface MapBlock { doc; x; y; cols; rows; width; height }`, `interface MapLayout { cell; gap; blocks: MapBlock[]; width; height }`, `layoutMap(docs: {id; count}[], width, maxHeight, labelHeight = 18): MapLayout`, `cellOrigin(layout, block, i): { x; y }`

- [ ] **Step 1: Failing tests**: step functions at every boundary; `mapCells` literal counts; `partnersOf` literal; `commitmentsToReview` names the most frequent partner document; `layoutMap` keeps blocks inside the width, never overlapping, fits Sri Lanka-sized input (sizes 91, 16, 4, 192, 4, 33, 9, 55) in 600 px height, and returns the largest cell size that fits.
- [ ] **Step 2-4:** FAIL, implement (cell sizes 22 down to 5; square-ish blocks, `cols = ceil(sqrt(count))`; shelf packing in document order with a 2-cell horizontal gap and `labelHeight` above each block), PASS.
- [ ] **Step 5: Commit** `feat(brief): commitments to review, map cells and map layout`.

### Task 7: Policy areas

**Files:**
- Modify: `src/lib/brief/compute.ts`, `src/lib/brief/compute.test.ts`

**Interfaces:**
- Consumes: `buildSectorCoherenceShare` (`src/lib/coherence-briefing.ts`).
- Produces: `interface AreaRow { id; name; commitments; reviewed; apart; share: number | null }`, `areaRows(source, scope, lens: LensId): { rows: AreaRow[]; average: number; max: number }` (categories with at least one commitment in scope; share desc, `null` last).

- [ ] **Step 1: Failing test** with literal classifications; **Steps 2-4**; **Step 5: Commit** `feat(brief): policy-area rows`.

### Task 8: Messages

**Files:**
- Modify: `messages/en.json`, `messages/es.json`, `messages/mn.json` (add `brief.*`; remove the `pulse.*` namespace once the canvas is gone in Task 13)

- [ ] Add every key listed in the components below in all three locales; run `npx vitest run src/i18n` and confirm parity passes. Commit `i18n(brief): brief copy in en, es and mn`.

### Task 9: Route, redirect and pair endpoint

**Files:**
- Create: `src/app/[locale]/[country]/brief/page.tsx`, `src/app/api/brief/pair/route.ts`, `src/lib/brief/pair.ts`, `src/lib/brief/pair.test.ts`
- Modify: `src/app/[locale]/[country]/pulse/page.tsx` (becomes a redirect preserving the query)

**Interfaces:**
- Produces: `findPair(data, aId, bId, locale): { pair: AlignmentResult; targetA: Target; targetB: Target } | null` (either orientation; ids longer than 120 chars rejected).

- [ ] **Step 1: Failing test** for `findPair` (orientation, unknown ids, overlong ids). **Steps 2-4.**
- [ ] Page: `force-dynamic`; load the payload with `getCountryDashboardPayload(entry.id, locale, null)`; `buildBriefSource`; `parseSelection(searchParams)`; render `<BriefApp source initialSelection preparedOn={new Date().toISOString()} />`; `generateMetadata` title `brief.metaTitle`.
- [ ] Route handler: GET with `country`, `a`, `b`, `locale`; 404 on unknown country or pair; JSON body from `findPair`.
- [ ] Commit `feat(brief): brief route, pair endpoint, pulse redirect`.

### Task 10: App shell, landing, builder, sheets, print

**Files:**
- Create: `src/components/brief/brief-app.tsx`, `hero.tsx`, `moving-text.tsx`, `builder.tsx`, `sheets.tsx`, `ink.tsx` (shared swatches, hatch pattern defs, formatters), `brief-app.test.tsx`
- Modify: `src/app/globals.css` (print rules scoped to `[data-brief]`)

- [ ] **Step 1: Failing component tests** (`brief-app.test.tsx`, fixture source): the builder unchecking a document updates the page count and the scope line; the last-but-one document cannot be unchecked; moving a section down reorders the sheets; the page counter reads "Prints on 3 pages" for the default.
- [ ] **Step 2: Implement** the shell: selection state with `router.replace(?query, { scroll: false })`; `scopeOf` memoised on `docs`; `paginate`; sheets of `210mm x 297mm` with running header and footer; page 1 title block; builder rail (documents, policy areas, sections with move buttons and size, page count, print, copy link, reset); landing with drifting rows of verbatim commitments (CSS keyframes, duplicated strips, `prefers-reduced-motion` still); print CSS hiding `[data-screen-only]`, `@page { size: A4; margin: 0 }`, sheets `break-after: page`.
- [ ] **Step 3: Run tests**; PASS. **Step 4: Commit** `feat(brief): landing, builder and A4 sheets`.

### Task 11: Sections (overall, together, apart, commitments, documents, areas)

**Files:**
- Create: `src/components/brief/sections/{overall,together,apart,commitments,documents,areas}.tsx`, `src/components/brief/dot-field.tsx`, `src/components/brief/theme-grid.tsx`, `src/components/brief/example-pair.tsx`, `src/components/brief/sections.test.tsx`

- [ ] **Step 1: Failing tests** (fixture): each section renders its headline finding with literal numbers; the documents section orders rows by misalignment share; the areas section shows "too few comparisons" for a thin category.
- [ ] **Step 2: Implement**: dot field on canvas (one dot per comparison up to 16,000 dots, else one per `ceil(total/16000)`; groups reinforce, partial, apart, none left to right; settle animation on first view unless reduced motion; labels under groups with collision stacking); theme grid (theme rows by document columns, marks in three share steps, count bar); example pair (two verbatim commitments with document and label, AI reading disclosure for potential misalignment fetched from the pair endpoint); result bars with potential misalignment anchored left and reinforcement anchored right.
- [ ] **Step 3: PASS. Step 4: Commit** `feat(brief): brief sections`.

### Task 12: Map of commitments

**Files:**
- Create: `src/components/brief/sections/map.tsx`, `src/components/brief/commitment-map.tsx`, `src/components/brief/commitment-map.test.tsx`

- [ ] **Step 1: Failing tests**: one cell per commitment; cell fill step matches `apartStep`; the five most involved commitments carry numbered callouts listed below the map; selecting a cell marks its partners and dims the rest; arrow keys move the selection.
- [ ] **Step 2: Implement** SVG map from `layoutMap`, Zeit-style legend, shading toggle (screen only), numbered callouts, selection highlighting.
- [ ] **Step 3: PASS. Step 4: Commit** `feat(brief): map of commitments`.

### Task 13: Drill-down panels and canvas removal

**Files:**
- Create: `src/components/brief/panels.tsx`
- Delete: `src/components/pulse/coherence-canvas.tsx`, `src/components/pulse/coherence-canvas.test.tsx`, `src/components/pulse/types.ts`, `src/lib/pulse/geometry.ts`, `src/lib/pulse/geometry.test.ts`
- Modify: messages (drop `pulse.*`)

- [ ] Panels in `DrawerShell`: a single comparison (fetch, then `PairDrawer`), a pair of documents (its potential misalignments via `strandsByPathway`, rows open the comparison), a commitment (partners grouped, rows open the comparison). Test: the pair-of-documents panel lists strands through the busiest commitment first.
- [ ] Remove the canvas UI and its keys; full suite green. Commit `feat(brief): drill-down panels; remove the canvas`.

### Task 14: Verification and handoff

- [ ] `npx tsc --noEmit`, eslint on touched files, full vitest suite.
- [ ] `curl` each country's `/brief` (200, headline present) and one `es` and `mn` page.
- [ ] Headless print of the default Mongolia brief to PDF; assert 3 pages.
- [ ] Update `EXPERIMENT_HANDOFF.md` and the `finding-cards-experiment` memory. Commit.
