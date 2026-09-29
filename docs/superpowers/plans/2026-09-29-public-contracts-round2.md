# Public contracts, round 2: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, chosen by the
> urgency of "build it for me to see now"). Steps use `- [ ]`. Each task is test-first: write the
> tests named, watch them fail, implement, watch them pass, commit.

**Goal:** Rebuild `/{country}/brief/contracts` around one shared focus (policy area, document, place).
The work covers:
- blue money;
- the map moved to step 3, with three layers and an All-contracts switch;
- sketch B for policy areas, with a red|green table;
- step 2 answering the focus;
- one reworked deep dive, "Where to look closer".

**Architecture:** Pure libs (`focus.ts`, `angles.ts`, `field.ts`) compute everything; the canvas
field draws base squares that move between steps, plus an overlay (finer squares or tender dots) that
crossfades in for a focus or a tender layer. The page holds the focus; every view reads it.

**Tech stack:** Next.js 16, React 19 client components, canvas 2D, next-intl, vitest + Testing Library,
Python 3.11 bake.

**Spec:** `docs/superpowers/specs/2026-09-29-public-contracts-round2-design.md`

## Global constraints

- No `Co-Authored-By` or any AI attribution in commits (memory rule `no_coauthor`).
- Commit only own paths. A parallel session commits `messages/*.json` in this worktree: stage messages
  as HEAD plus the `brief.contracts` block only (`stage.py`), rebuilt right before each commit. Never
  bare `git stash`. Never push.
- Vocabulary:
  - "potentially misaligned", "strongly matching", "mainly for nature or climate", "side benefit";
  - never "flagged", "tension", "work against" or "funded";
  - numbers, never words;
  - no em dashes.
- The Highlighter Rule: pale yellow (#fff5c7) on names only, nothing at rest; controls typographic
  (underline when on).
- Inks:
  - record #232e3d; principal #0468B1; significant #B5D5F5; rest #E4E6E9;
  - strongly matching #2A7443; potentially misaligned #D2432C;
  - target dots #6B7684 / #D5D9DF.
- Mongolia only (the bake exists only there); other countries 404 as before.
- Run tests as `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run <paths>`.

## Review focus

1. Focus combinations that empty a view: a document with no principal money in a place, the "No
   policy area" row as focus. Expected: plain "No …" headlines, no NaN, no empty blocks drawn.
2. A tiny focus (₮1B) on the map: the unit shrinks, never below one square, and labels stay in
   bounds.
3. Labels on the map at a narrow field (phone): no label off the field; names that do not fit only on
   pointing.
4. The currency switch: every new amount (units, lines, lists) follows US$ when chosen.
5. The API `?target=` fetch in the deep dive: stale responses must not show under another target.

---

### Task 1: the whole record by place, in the payload

**Files:**
- modify `python/scripts/build_contracts_layer.py`, `python/tests/test_build_contracts_layer.py`;
- modify `src/lib/brief/contracts/model.ts` and `model.test.ts`.

**Produces:** `ContractsFile.places?: PlaceTotal[]` where
`PlaceTotal = { code: string; contracts: number; value: number }`; `code` is an ISO 3166-2 code or
`"none"` (no single place, including "several").

- [ ] **Test (python):** `test_places_sum_to_census` builds the payload rows' `places` from a small
  frame and checks the sums equal the census and that "several" falls under "none".
- [ ] **Implement:** `place_totals(t)`, which applies `place_of` over every kept contract; the payload
  key `places`, sorted by value.
- [ ] **Test (ts):** `parseContractsFile` accepts a payload with and without `places`.
- [ ] **Rebake:** see the handoff for the command; about 3.5 minutes. Check that the census still
  reads 75,312 / ₮48.78T and that `places` sums to it.
- [ ] **Commit:** `feat(contracts): the whole record by place, for the map's all-contracts view`.

### Task 2: the focus and the angles (pure)

**Files:**
- create `src/lib/brief/contracts/focus.ts`, `focus.test.ts`;
- create `src/lib/brief/contracts/angles.ts`, `angles.test.ts`;
- extend `test-fixture.ts` (places on the fixture file; one more misaligned tender with a place).

**Produces:**
- `Focus = { lens: LensKey; area: string | null; doc: string | null; place: string | null }`;
  `EMPTY_FOCUS(lens)`; `hasFocus(f)`; `focusWith(f, patch)`.
- `contractMatches(c, f, docOf, { area?, doc?, place? })`, where the flags choose which parts apply.
  - `area` compares `c.areas[f.lens]`; `NO_AREA` means no known area.
  - `doc`: any strongly matched target of the document.
  - `place`: `placeKey(c)`.
- `targetMatches(targetId, f, docOf, primary, { area?, doc? })`.
- `unitFor(total, want = 100): number`, from the ladder 5e9, 2e9, 1e9, 5e8, 2e8, 1e8, 5e7, 2e7, 1e7,
  5e6 (the first with at least `want × 0.6` squares).
- `yearFocus(file, keep): Map<number, number>` and `fullYears(file): number[]`, where a year is thin
  below 20% of the median year's contracts.
- `moneyByPlace(contracts, keep): Map<string, number>` and `mapFinding(by, base, contracts)`.
  - It returns `{ lead: { code; share; baseShare; over: boolean } | null; one: Contract | null;
    noneShare: number; total: number }`.
  - Over-representation guards: value ≥ max(3e9, 3% of the total); share ≥ 5%; ratio ≥ 1.5.
- `rates(places, principalByPlace)`: `Map<code, per-₮ share>`.
- `tenders(contracts, kind: "match" | "mis", keepTarget)`: `TenderDot[]` with
  `{ tender, lead: Contract, lots: Contract[], value, place, targets: string[] }`.
- `tenderFinding(list, base)`: the same guard shape for "match" (at least max(5, 3%)), and
  `{ none, placed, noneValue, placedValue }` for "mis".
- `alsoServed(contracts, doc, docOf, keep)`: `{ n, alone, shares: { doc, share }[] }`.
- `areaSynergy(contracts, lens, area, keep)`: `{ n, share, base }`.
- `areaTargetCounts(targets, stats)`: `{ red, green, total }`.
- `targetStats(contracts, keep)`: per target, `{ match: Set<tender>; mis: Set<tender>; matchContracts:
  number }`.
- `closerRows(targetIds, stats)`, `closerGaps(targetIds, everMatched, docOf, docOrder)`: groups
  `{ doc, ids }`.
- `topTenders(list, n)`: merged by title, `{ title, tenders, contracts, year, targets }`.

- [ ] **Tests:** write the fixture-based tests for each function above, one `it` each, including:
  - the NO_AREA focus;
  - the guard that rejects a single small place;
  - the one-contract note;
  - no aimag named on the misaligned side (`tenderFinding("mis")` returns only none/placed);
  - merged tenders.
- [ ] **Watch fail. Implement. Watch pass.**
- [ ] **Commit:** `feat(contracts): one focus, and what each angle says about it`.

### Task 3: the field's new layouts

**Files:** modify `src/lib/brief/contracts/field.ts` and `field.test.ts`.

**Consumes:** Task 2's `unitFor`, `tenders`, `moneyByPlace`.

**Produces:**
- `Stage`:
  - `{kind:"record"}`;
  - `{kind:"purpose"; focus: number[] | null}` (focus squares per year, in year order);
  - `{kind:"places"; layer:"money"|"all"|"match"|"mis"; key:string}`;
  - `{kind:"areas"; lens; key:string}`.
- `LayoutContext`:
  - `rows?: AreaRowB[]` (B rows with `money`, `targets`, and an optional `focusMoney` for the overlay);
  - `places?: PlaceCell[]`;
  - `geo`;
  - `overlay?: { unit: number; cells: { id: string; value: number }[] } | null`;
  - `tenders?: { place: string }[]`.
- `Placed.ink?: Ink` (override).
- `Mark = { x; y; shape: "square" | "dot"; ink: "principal" | "match" | "mis" | "record"; cell: string }`.
- `FieldLayout.overlay: { marks: Mark[]; pitch: number } | null`.
- `FieldLayout.leaders: { x1; y1; x2; y2 }[]` and `anchors: { x; y }[]`.
- `resolveBlocks(blocks, bounds, margin)`.
- `placeLabels(items, obstacles, bounds)`, where items are `{ key, w, h, around: Box, priority,
  always }`; it returns their positions or `null`.

- [ ] **Tests:**
  - every base square has a position in every stage;
  - `purpose` with focus sets `ink` on the first f principal squares of each year and "significant" on
    the rest of that year's principal squares;
  - places money: the blocks' rectangles do not overlap (margin ≥ 3) and stay in the map box; UB and
    none in the band; a displaced block gets a leader;
  - places all: every square is visible, with counts per place equal to the whole-record allocation;
  - places match/mis: base squares hidden and one overlay dot per tender;
  - places money with an overlay: base hidden, overlay squares per cell = the largest-remainder count;
  - areas: rows sorted by money with NO_AREA last; squares in one line; target dots start at ≥ 61% of
    the width;
  - `placeLabels` never returns overlapping boxes and never leaves the bounds.
- [ ] **Watch fail. Implement. Watch pass.**
- [ ] **Commit:** `feat(contracts): the map's layers and the policy areas side by side, laid out`.

### Task 4: the overview, the focus bar, the field's overlay

**Files:**
- modify `money-field.tsx`, `overview.tsx`, `set-line.tsx`, `contracts.css`;
- create `focus-bar.tsx`;
- modify `overview.test.tsx`;
- the message block (the sdd workspace's `i18n/contracts.en.json`, merged with `merge.py`).

**Consumes:** Tasks 2 and 3.

- [ ] **Tests (overview):**
  - the steps read record, purpose, places, areas;
  - the map's right side offers three layers and the stage offers the all switch;
  - choosing a document writes the focus (the `onFocus` spy);
  - selecting an area row calls `onFocus({ area })`;
  - step 2 shows the focus line with a focus;
  - nothing is marked at rest;
  - the red|green table has one row per area with "N of M";
  - US$ applies to the new figures.
- [ ] **Tests (focus bar):** it names each part, and ✕ clears that part only.
- [ ] **Implement:**
  - the MoneyField overlay: crossfade over the move, dots in the match/mis inks, leaders, the per-square
    ink;
  - the overview in the new order;
  - its right sides per the spec;
  - the focus bar.
- [ ] **Commit:** `feat(contracts): one focus across the overview, the map one step up, money in blue`.

### Task 5: Where to look closer, the list panel, the page

**Files:**
- create `closer-block.tsx` and `closer-block.test.tsx`;
- modify `panels.tsx`, `panels.test.tsx`, `contracts-page.tsx`, `contracts-page.test.tsx`;
- delete `targets-block.tsx`, `synergy-block.tsx`, `misaligned-block.tsx` and `blocks.test.tsx`
  (their tests move to `closer-block.test.tsx` where the behaviour stays).

- [ ] **Tests:**
  - the rows (lots of one tender once; counts);
  - the gaps grouped by document;
  - the top tenders merged by title;
  - a target's reasons fetched and shown with confidence;
  - a stale response not shown under another target;
  - the list panel lists by value and pushes a contract;
  - the page passes the focus from step 4 to the deep dive;
  - the currency switch.
- [ ] **Implement.**
- [ ] **Commit:** `feat(contracts): where to look closer, answering the focus; contracts behind a link`.

### Task 6: verify and hand off

- [ ] Clean-copy verification:
  - full suite (`npx vitest run`), `npx tsc --noEmit`, `npx eslint` on the changed files;
  - the locale parity test;
  - `/mongolia/brief/contracts` 200 on the dev server (port 3100).
- [ ] EXPERIMENT_HANDOFF.md, "Public contracts page, round 2"; memory.
- [ ] Final whole-branch review (fresh reviewer, most capable model); one fix pass; deferred minors
  ledgered.
