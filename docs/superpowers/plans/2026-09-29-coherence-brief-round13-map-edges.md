# Coherence brief round 13: the map named on its edges, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redraw the brief's map of documents as a lower triangle in today's look.
Rows are named at the left edge. Columns are named under the map in one aligned row: a short name
and a smaller line of context, Jonas's mockup 7.

**Architecture:** The geometry lives in `placeMap` (`src/lib/brief/hub.ts`) and is rewritten for
the mirrored triangle. The layout types grow:
- a per-document edge (`HubAxis.edge`) and a colour `bar`;
- the row and column documents of each block (`HubGroup.row` / `.column`);
- each target's row and column (`HubLayout.lines`), replacing its point on the diagonal;
- the edges' positions (`HubLayout.edges`), for the hover hairlines.

The canvas (`hub-canvas.tsx`) draws bars instead of the diagonal and renders two kinds of names,
marking both names of a pointed block. Short names come from a new optional config field
`mapLabel`, resolved in `buildBriefSource`.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest + Testing Library, canvas 2D.

**Spec:** `docs/superpowers/specs/2026-09-29-coherence-brief-round13-map-edges-design.md`

## Global Constraints

- Today's look is kept as it is:
  - `cellRect` squares on the device pixel grid (a one-pixel gap from 3 device px);
  - paper `#f0f0ee` blocks;
  - the two tones on a side (`MAP_MID` for the side's pairs outside the concentrated targets);
  - no numbers in the blocks;
  - pale yellow `--brief-highlight` on words only.
- Rows: documents 2..N (the later document of each pair). Columns: documents 1..N-1 (the earlier
  one). Each block is `x = column document`, `y = row document`.
- Column names follow mockup 7: a short first line, a smaller muted context line, centred under
  the column, one baseline. Fallback: every second name drops a row, and a thin line joins it to
  its bar.
- `mapLabel` resolution: an explicit `mapLabel`, else the `mediumLabel` "ACRONYM (context)" split
  in two, else `[shortLabel, ""]`.
- Mongolia's `mapLabel`s are exactly:
  - SECTORAL ["Vision", "2050"]
  - NDC ["NDC", "Contribution"]
  - NITIPA ["Paris", "Agreement"]
  - NBSAP ["Biodiv.", "2030"]
  - NAP ["Adapt.", "Plan"]
  - FSS ["Food", "Measures"]
  - NRVTS ["LDN", "Targets"]
  - ILDN ["LDN", "Investment"]
- UI copy follows the brief's register: no em dashes; "potential misalignment", never
  "flagged"; es/mn get English placeholders for changed strings.
- Commits:
  - only paths this plan touches (a parallel session commits contracts work in the same worktree);
  - no `Co-Authored-By` line (Jonas's rule);
  - run tests with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`.

## Review Focus

- **Two documents selected** (one block): one row name, one column name, no named targets in the
  empty half. Nothing crashes on `present.length === 2` (Task 3 test "two documents").
- **A target in focus from the first or last document** (no row, or no column): strips and counts
  use only the part the target has (Task 4 tests).
- **Sri Lanka's 4-target documents:** column names drop to two rows with a joining line and stay
  inside the field (Task 3 test "narrow columns").
- **A short field (phone, 358 × 371):** names keep their full height, and the target in focus is
  always named (Task 3 test, adapted).
- **A document with no targets in the selection:** it gets neither row nor column (Task 3 test
  "a document without targets").

---

### Task 1: Short names for the columns (`mapLabel`)

**Files:**
- Modify: `src/types/index.ts` (the `DocumentTypeEntry` interface, near line 972), after
  `color`
- Modify: `src/lib/brief/source.ts` (`BriefDocument`, `buildBriefSource`, new export `mapLabelOf`)
- Modify: `src/lib/brief/test-fixture.ts:107-115` (documents get a `mapLabel`)
- Modify: `python/data/mongolia-country-config.json` (`documentTypes[].mapLabel`)
- Test: `src/lib/brief/source.test.ts`

**Interfaces:**
- Produces: `BriefDocument.mapLabel?: [string, string]` (resolved, always set by
  `buildBriefSource`) and `export function mapLabelOf(entry: Pick<DocumentTypeEntry, "id" | "shortLabel" | "mediumLabel" | "mapLabel"> | undefined, id: string): [string, string]`.

- [ ] **Step 1: Failing tests** in `source.test.ts`:

```ts
import { mapLabelOf } from "./source";

describe("mapLabelOf", () => {
  it("takes a document's own short name and context", () => {
    expect(mapLabelOf({ id: "NDC", shortLabel: "NDC", mediumLabel: "NDC", mapLabel: ["NDC", "Contribution"] }, "NDC")).toEqual(["NDC", "Contribution"]);
  });
  it("splits the medium label's hint into the context", () => {
    expect(mapLabelOf({ id: "NP", shortLabel: "NP", mediumLabel: "NP (Nature Pledge)" }, "NP")).toEqual(["NP", "Nature Pledge"]);
  });
  it("falls back to the short label alone", () => {
    expect(mapLabelOf({ id: "FSS", shortLabel: "FSS", mediumLabel: "FSS" }, "FSS")).toEqual(["FSS", ""]);
    expect(mapLabelOf(undefined, "X")).toEqual(["X", ""]);
  });
});
```

And in the existing `buildBriefSource` describe block, a test that a document built from a config
entry with `mapLabel` carries it, and one without it gets the split medium label.

- [ ] **Step 2: Run, expect FAIL:** `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm vitest run src/lib/brief/source.test.ts` → "mapLabelOf is not a function".

- [ ] **Step 3: Implement.**

`src/types/index.ts`, in `DocumentTypeEntry` after `color`:

```ts
  /** The document's short name on the map of documents, over a line of
   *  context: e.g. ["NDC", "Contribution"]. Display only, never fed into a
   *  pipeline prompt; must be approved by the team, never LLM-drafted.
   *  Without it the map splits `mediumLabel` ("NDC (Climate)"). */
  mapLabel?: [string, string];
```

`src/lib/brief/source.ts`, in `BriefDocument` after `color`:

```ts
  /** Short name and context under the map's column (see `mapLabelOf`). */
  mapLabel?: [string, string];
```

and the resolver after `briefDocName`:

```ts
/** A document's short name under the map, over a line of context: its own
 *  `mapLabel`, else its medium label's hint split off ("NP (Nature Pledge)"
 *  gives NP / Nature Pledge), else its short label alone. */
export function mapLabelOf(
  entry: Pick<DocumentTypeEntry, "id" | "shortLabel" | "mediumLabel" | "mapLabel"> | undefined,
  id: string,
): [string, string] {
  if (entry?.mapLabel && entry.mapLabel[0]) return [entry.mapLabel[0], entry.mapLabel[1] ?? ""];
  const split = /^(.*?)\s*\((.+)\)\s*$/.exec(entry?.mediumLabel ?? "");
  if (split && split[1]) return [split[1], split[2]];
  return [entry?.shortLabel || entry?.mediumLabel || id, ""];
}
```

In `buildBriefSource`, where `documents` are built, add `mapLabel: mapLabelOf(entry, id),`.
In `test-fixture.ts` documents: `mapLabel: [id, \`Context ${id}\`],`.
In `mongolia-country-config.json`, add the eight `mapLabel` arrays from the Global Constraints to
their document types.

- [ ] **Step 4: Run, expect PASS:** the same command, then `pnpm tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/brief/source.ts src/lib/brief/source.test.ts src/lib/brief/test-fixture.ts python/data/mongolia-country-config.json
git commit -m "feat(brief): a short name and a line of context for each document on the map"
```

### Task 2: Names held inside the field (`spread`)

**Files:**
- Modify: `src/lib/brief/hub.ts:282-306` (`spread`, now exported)
- Test: `src/lib/brief/hub.test.ts`

- [ ] **Step 1: Failing test:**

```ts
import { spread } from "./hub";

describe("spread", () => {
  it("keeps the first name inside the field and the others in place", () => {
    // The first name's own place lies within half its height of the top.
    const ys = spread([16, 33.5, 159.5, 284.5], [48, 32, 32, 32], 6, 754);
    expect(ys[0]).toBeCloseTo(30);
    expect(ys[1]).toBeCloseTo(70);
    expect(ys[2]).toBeCloseTo(159.5);
    expect(ys[3]).toBeCloseTo(284.5);
  });
  it("still shares the height evenly when the names cannot fit", () => {
    const hs = [40, 40, 40];
    const ys = spread([10, 20, 30], hs, 0, 60);
    expect(ys[0] - hs[0] / 2).toBeCloseTo(0);
    expect(ys[2] + hs[2] / 2).toBeCloseTo(60);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (import error, then the first case squeezes to the top: 22, 62, ...).

- [ ] **Step 3: Implement.** Export `spread`, and hold the first name inside before the forward pass:

```ts
export function spread(centres: number[], heights: number[], top: number, bottom: number): number[] {
  const y = [...centres];
  if (y.length > 0) y[0] = Math.max(y[0], top + heights[0] / 2);
  for (let k = 1; k < y.length; k++) {
    const min = y[k - 1] + (heights[k - 1] + heights[k]) / 2;
    if (y[k] < min) y[k] = min;
  }
  const last = y.length - 1;
  if (last >= 0 && y[last] + heights[last] / 2 > bottom) y[last] = bottom - heights[last] / 2;
  for (let k = last - 1; k >= 0; k--) {
    const max = y[k + 1] - (heights[k + 1] + heights[k]) / 2;
    if (y[k] > max) y[k] = max;
  }
  if (y.length > 0 && y[0] - heights[0] / 2 < top - 1e-6) {
    // Too many names for the height: they share it evenly.
    const total = heights.reduce((s, h) => s + h, 0);
    const scale = Math.min(1, (bottom - top) / Math.max(1, total));
    let at = top;
    for (let k = 0; k < y.length; k++) {
      heights[k] *= scale;
      y[k] = at + heights[k] / 2;
      at += heights[k];
    }
  }
  return y;
}
```

- [ ] **Step 4: Run, expect PASS** for `spread`. Run the whole `hub.test.ts`; its geometry tests
  still pass here, because Task 3 has not changed the layout yet.

- [ ] **Step 5: Commit** `git add src/lib/brief/hub.ts src/lib/brief/hub.test.ts && git commit -m "fix(brief): a name near the top no longer squeezes every name to the top"`

### Task 3: The mirrored map and its names on the edges

**Files:**
- Modify: `src/lib/brief/hub.ts`: types `HubAxis`, `HubGroup`, `HubMark` (comment), new
  `HubLines`, `HubSegment`, `HubLayout` (`lines` replaces `points`, new `edges`), `emptyLayout`,
  constants, `placeMap` rewritten.
- Test: `src/lib/brief/hub.test.ts`: the "the map of documents" and "a side of the map"
  describes are rewritten as below; the other tests are kept.

**Interfaces:**
- Consumes: `BriefDocument.mapLabel` (Task 1), `spread` (Task 2).
- Produces:

```ts
export interface HubSegment { x0: number; y0: number; x1: number; y1: number }
export interface HubAxis {
  key: string;
  edge: "row" | "column";
  bar: HubSegment;
  labelX: number;   // row: its right end; column: its middle
  labelY: number;   // row: its middle; column: its top
  labelWidth: number;
  labelHeight: number;
  lead: HubSegment | null;
}
export interface HubLines {
  row: { y: number; x0: number; x1: number } | null;
  column: { x: number; y0: number; y1: number } | null;
}
// HubGroup gains: row?: string; column?: string;
// HubLayout: lines: Map<string, HubLines>; edges: { rowBar: number; columnBar: number; gap: number } | null
// HubMark.x/.y: where its lead ends.
```

- [ ] **Step 1: Rewrite the failing tests** for the map (replacing the diagonal ones):

```ts
describe("the map of documents", () => {
  const layout = layoutHub({ kind: "map" }, particles, DATA, 800, 500);
  const rowsOf = (l: HubLayout) => l.axis.filter((a) => a.edge === "row");
  const colsOf = (l: HubLayout) => l.axis.filter((a) => a.edge === "column");
  const mapBox = (l: HubLayout) => ({
    x0: Math.min(...l.groups.map((g) => g.x0)), x1: Math.max(...l.groups.map((g) => g.x1)),
    y0: Math.min(...l.groups.map((g) => g.y0)), y1: Math.max(...l.groups.map((g) => g.y1)),
  });

  it("shows every target pair once, in one block per pair of documents", () => {
    // unchanged from today's test
  });

  it("puts each dot at its two targets: the later document's in rows, the earlier one's in columns", () => {
    const at = (ca: string, cb: string) => {
      const i = particles.findIndex((p) => p.ca === ca && p.cb === cb);
      return { x: layout.x[i], y: layout.y[i] };
    };
    // A is earlier than B: A's targets are columns, B's rows.
    expect(at("A1", "B6").x).toBeCloseTo(at("A1", "B1").x);
    expect(at("A1", "B6").y).toBeGreaterThan(at("A1", "B1").y);
    expect(at("A6", "B1").y).toBeCloseTo(at("A1", "B1").y);
    expect(at("A6", "B1").x).toBeGreaterThan(at("A1", "B1").x);
    // A target keeps its column across its document's blocks, and its row.
    expect(at("A3", "C2").x).toBeCloseTo(at("A3", "B5").x);
    expect(at("A2", "B4").y).toBeCloseTo(at("A5", "B4").y);
    expect(at("B4", "C1").x).toBeCloseTo(at("B4", "C6").x);
    // Each block knows its row and column documents.
    expect(layout.groups.map((g) => [g.key, g.row, g.column])).toEqual([
      ["A<->B", "B", "A"], ["A<->C", "C", "A"], ["B<->C", "C", "B"],
    ]);
  });

  it("names every row at the left edge and every column under the map", () => {
    const box = mapBox(layout);
    expect(rowsOf(layout).map((a) => a.key)).toEqual(["B", "C"]);
    expect(colsOf(layout).map((a) => a.key)).toEqual(["A", "B"]);
    for (const a of rowsOf(layout)) {
      expect(a.labelX).toBeLessThan(box.x0);
      expect(a.bar.x0).toBeLessThan(box.x0);
      expect(a.bar.x0).toBeGreaterThan(a.labelX);
    }
    for (const a of colsOf(layout)) {
      expect(a.labelY).toBeGreaterThan(box.y1);
      expect(a.bar.y0).toBeGreaterThan(box.y1);
      expect(a.bar.y0).toBeLessThan(a.labelY);
      // Centred under its column.
      expect(a.labelX).toBeCloseTo((a.bar.x0 + a.bar.x1) / 2);
      expect(a.lead).toBeNull();
    }
    // One baseline.
    expect(new Set(colsOf(layout).map((a) => a.labelY)).size).toBe(1);
  });

  it("two documents: one block, one row name, one column name", () => {
    const two = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "C"]), null);
    const map = layoutHub({ kind: "map" }, hubParticles(two), two, 800, 500);
    expect(map.groups.map((g) => g.key)).toEqual(["A<->C"]);
    expect(map.axis.map((a) => [a.edge, a.key])).toEqual([["row", "C"], ["column", "A"]]);
  });

  it("a document without targets gets neither row nor column", () => {
    const { data, particles: many } = corpus([5, 0, 4, 3]);
    const map = layoutHub({ kind: "map" }, many, data, 600, 500);
    expect(map.axis.some((a) => a.key === "D1")).toBe(false);
    expect(map.axis.filter((a) => a.edge === "row").map((a) => a.key)).toEqual(["D2", "D3"]);
    expect(map.axis.filter((a) => a.edge === "column").map((a) => a.key)).toEqual(["D0", "D2"]);
  });

  it("narrow columns: every second name drops a row, joined to its bar, all inside the field", () => {
    const { data, particles: many } = corpus([91, 16, 4, 192, 4, 33, 9, 55]);
    const labelled = { ...data, scope: { ...data.scope, docs: data.scope.docs.map((d) => ({ ...d, mapLabel: [d.id, "Land degradation"] as [string, string] })) } };
    const map = layoutHub({ kind: "map" }, many, labelled, 640, 760);
    const cols = map.axis.filter((a) => a.edge === "column");
    const tops = [...new Set(cols.map((a) => a.labelY))].sort((p, q) => p - q);
    expect(tops).toHaveLength(2);
    cols.forEach((a, n) => {
      expect(a.labelY).toBe(tops[n % 2]);
      if (n % 2 === 1) expect(a.lead).not.toBeNull();
      expect(a.labelX - a.labelWidth / 2).toBeGreaterThanOrEqual(-1e-6);
      expect(a.labelX + a.labelWidth / 2).toBeLessThanOrEqual(640 + 1e-6);
    });
    // Names in one row never overlap.
    for (const row of tops) {
      const same = cols.filter((a) => a.labelY === row).sort((p, q) => p.labelX - q.labelX);
      for (let k = 1; k < same.length; k++) {
        expect(same[k].labelX - same[k].labelWidth / 2).toBeGreaterThanOrEqual(same[k - 1].labelX + same[k - 1].labelWidth / 2 - 1e-6);
      }
    }
  });
});
```

Keep and adapt the remaining map tests:
- "takes the width its names leave": `left` = `Math.min(...narrow.groups.map((g) => g.x0))`,
  and the row name's width covers `"Document B".length * 6.6`.
- "keeps its labels apart and inside the field": row names only, in order, each inside
  `[0, height]`.
- "keeps each name clear of the map": row labels right of `x = 0` and left of the map; column
  labels below it.
- "never lets dots overlap": `pitch` from `map.pitch`; keep the `2 * r <= pitch` check.
- "leads a name back": moved row names have a `lead` whose far end lies on their bar's x, between
  the bar's `y0` and `y1`.
- Keep "draws each pair as a square", "gives every pair its dot", the rating and document focus
  tests, unchanged.

Side tests, adapted:
- "keeps a square for every pair of documents": compare `apart.axis.map((a) => a.bar)` with
  `plain.axis.map((a) => a.bar)`.
- "puts the side's targets first": A6×B6 takes A1×B1's corner (unchanged). B5×C4 takes C's first
  row: `apart.y[b5c4]` ≈ the C row bar's `y0 + pitch / 2`.
- "names the targets that carry it", with `[["A6", "A", 6], ["B6", "B", 7]]`:
  - A6 (the first document) stands above the map, `align: "left"`, and its lead ends at its
    column's top: `m.y` equals the map box's `y0 - 1`;
  - B6 (a middle document) stands in the empty half: `align: "left"`, `labelX` greater than the
    right end of B's row (`apart.lines.get("B6")!.row!.x1`), and its lead ends at that row's end.
- "gives a long name two lines": applies to the last document's names at the left edge. Build a
  corpus where the last document carries the named target, and assert `lines === 2` with
  `align: "right"`.
- Remove "names the first document's targets above the map when there is room": it is covered
  above. Keep "at rest: the named targets' pairs full", "one target", theme, type, alignment,
  "no pairs", placement cache.
- "on a phone": row names keep a multiple of 16px; marks are `MARK_LINE` or two lines; labels in
  the left column never overlap; D11_3 in focus is always named; with focus `top`, fewer marks
  than `hot`.
- "keeps names and marks apart ... with many documents":
  - left-column labels apart and inside the field;
  - marks in the empty half (`align: "left"`, not above the map) apart from each other;
  - each mark's box lies right of the row end at its height: for every block whose `y` range
    meets the mark's box, `mark.labelX >= block.x1`.

- [ ] **Step 2: Run, expect FAIL:** `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm vitest run src/lib/brief/hub.test.ts`.

- [ ] **Step 3: Implement.**

Types and constants in `hub.ts`, replacing today's `HubAxis` and extending the others:

```ts
/** A stretch of line on the field. */
export interface HubSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A document's name on an edge of the map, beside its colour bar: a row's
 *  at the left edge (right-aligned at `labelX`, centred on `labelY`), a
 *  column's under the map (centred on `labelX`, its top at `labelY`). */
export interface HubAxis {
  key: string;
  edge: "row" | "column";
  /** The colour bar along the edge: a row's left of its band, a column's under it. */
  bar: HubSegment;
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
  /** A thin line from a name that moved away (a row's), or dropped to a
   *  second row (a column's), to its bar. */
  lead: HubSegment | null;
}

/** A target on the map: its row (its pairs with earlier documents, from the
 *  left edge to where its document's row ends) and its column (with later
 *  documents, from where its document's column starts to the bottom edge).
 *  The first document has no row, the last no column. */
export interface HubLines {
  row: { y: number; x0: number; x1: number } | null;
  column: { x: number; y0: number; y1: number } | null;
}
```

In `HubGroup` add:

```ts
  /** On the map: the documents whose targets are the block's rows (the later
   *  one) and columns (the earlier one). */
  row?: string;
  column?: string;
```

In `HubMark`, change the comment of `x`/`y` to "where its lead ends: its row's end in the empty
half, its row's start at the left edge, or its column's top above the map".

In `HubLayout`, replace `points` with:

```ts
  /** Each target's row and column on the map (empty off the map). */
  lines: Map<string, HubLines>;
  /** The map's edges: the rows' bars, the columns' bars, the gap between
   *  blocks (null off the map). */
  edges: { rowBar: number; columnBar: number; gap: number } | null;
```

`emptyLayout` sets `lines: new Map(), edges: null`. New constants next to the `AXIS_*` ones:

```ts
/** How far a document's colour bar stands from the map's edge. */
const BAR_OFFSET = 7;
/** Room between a row's name and the map (the bar stands in it). */
const ROW_NAME_GAP = 14;
/** Widest a row's name runs, in up to three lines. */
const ROW_NAME_MAX = 150;
/** A column's name: per character of its short name (0.78rem semibold)
 *  and of its context (0.69rem), its line height, the room above it and
 *  between its two rows. */
const COLUMN_CHAR = 6.4;
const CONTEXT_CHAR = 5.3;
const COLUMN_LINE = 15;
const COLUMN_TOP = 13;
const COLUMN_ROW_GAP = 6;
/** Room between a row's end and a target named there. */
const STAIR_GAP = 10;
```

`placeMap`, rewritten. The first part (named targets, `byDoc` and its side sort, `sizes`, `rowOf`) is
today's code, kept word for word, down to `byDoc.forEach((list) => list.forEach((id, i) => rowOf.set(id, i)));`.
Everything after it is replaced by:

```ts
  // Rows are every document but the first, columns every document but the
  // last (a document without targets has neither): every row starts at the
  // left edge, every column ends at the bottom edge.
  const present = docs.map((_, k) => k).filter((k) => sizes[k] > 0);
  if (present.length < 2) return;
  const rows = present.slice(1);
  const cols = present.slice(0, -1);
  const last = present[present.length - 1];
  const pad = 6;
  const marked = side ? [...named, ...(extra && !rank.has(extra) && has(extra) ? [extra] : [])] : [];
  const byId = new Map(data.scope.commitments.map((c) => [c.id, c]));
  const ownMarks = (k: number) =>
    marked
      .filter((id) => byId.get(id)?.doc === docs[k].id)
      .sort((a, b) => (rowOf.get(a) ?? 0) - (rowOf.get(b) ?? 0));
  const markWidth = (id: string) => {
    const c = byId.get(id);
    return (c ? targetLine(c, MARK_TEXT).length : 0) * MARK_CHAR + MARK_COUNT;
  };
  // The rows' names: up to three lines at the left, never wider than a third of the field.
  const need = (k: number) => {
    const whole = docs[k].name.length * AXIS_CHAR;
    if (whole <= AXIS_SHORT) return whole;
    const word = Math.max(...docs[k].name.split(/\s+/).map((w) => w.length)) * AXIS_CHAR;
    return Math.min(whole, Math.max(AXIS_SHORT, whole / AXIS_LINES, word));
  };
  const nameWidth = Math.min(ROW_NAME_MAX, width * 0.3, Math.max(40, ...rows.map(need)));
  const x0Min = pad + nameWidth + ROW_NAME_GAP;
  // The first document is a column only: its named targets stand above the
  // map, one line each, never more than a fifth of the field (the target in
  // focus always).
  const cap = Math.max(1, Math.floor((height * 0.2) / MARK_LINE));
  const first = ownMarks(present[0]).filter((id, i) => i < cap || id === extra);
  const top = pad + (first.length > 0 ? first.length * MARK_LINE + 6 : 0);
  // The columns' names: a short name over a line of context.
  const colLabel = (k: number): [string, string] => docs[k].mapLabel ?? [docs[k].code || docs[k].id, ""];
  const colWidth = (k: number) => {
    const [name, context] = colLabel(k);
    return Math.max(name.length * COLUMN_CHAR, context.length * CONTEXT_CHAR) + 4;
  };
  const colHeight = (k: number) => (colLabel(k)[1] ? 2 : 1) * COLUMN_LINE;
  const labelH = Math.max(...cols.map(colHeight));
  const below = (n: number) => COLUMN_TOP + n * labelH + (n - 1) * COLUMN_ROW_GAP + pad;
  const colsN = cols.reduce((s, k) => s + sizes[k], 0);
  const rowsN = rows.reduce((s, k) => s + sizes[k], 0);
  const geometry = (room: number) => {
    const availW = width - x0Min - pad;
    const availH = height - top - room;
    const edge = Math.max(40, Math.min(availW, availH));
    const gap = present.length > 2 ? Math.min(6, Math.max(2, edge * 0.012)) : 0;
    const pitch = Math.max(
      0.05,
      Math.min((availW - (cols.length - 1) * gap) / colsN, (availH - (rows.length - 1) * gap) / rowsN),
    );
    const mapW = colsN * pitch + (cols.length - 1) * gap;
    const mapH = rowsN * pitch + (rows.length - 1) * gap;
    const x0 = x0Min + Math.max(0, (availW - mapW) / 2);
    const y0 = top + Math.max(0, (availH - mapH) / 2);
    const colX = new Map<number, number>();
    let at = x0;
    for (const k of cols) {
      colX.set(k, at);
      at += sizes[k] * pitch + gap;
    }
    const rowY = new Map<number, number>();
    at = y0;
    for (const k of rows) {
      rowY.set(k, at);
      at += sizes[k] * pitch + gap;
    }
    return { gap, pitch, x0, y0, colX, rowY, bottom: y0 + mapH };
  };
  let geo = geometry(below(1));
  const centresOf = (g: typeof geo) => cols.map((k) => g.colX.get(k)! + (sizes[k] * g.pitch) / 2);
  // One baseline when the names fit side by side, else two rows.
  const fits = (c: number[]) =>
    cols.every((k, n) => n === 0 || c[n - 1] + colWidth(cols[n - 1]) / 2 + 8 <= c[n] - colWidth(k) / 2) &&
    c[c.length - 1] + colWidth(cols[cols.length - 1]) / 2 <= width - pad;
  const twoRows = !fits(centresOf(geo));
  if (twoRows) geo = geometry(below(2));
  const { gap, pitch, x0, y0, colX, rowY, bottom } = geo;
  layout.pitch = pitch;
  layout.edges = { rowBar: x0 - BAR_OFFSET, columnBar: bottom + BAR_OFFSET, gap };
  const before = (k: number) => present[present.indexOf(k) - 1];
  const after = (k: number) => present[present.indexOf(k) + 1];
  const rowEnd = (k: number) => colX.get(before(k))! + sizes[before(k)] * pitch;
  for (const k of present) {
    byDoc[k].forEach((id, i) => {
      const at = i * pitch + pitch / 2;
      layout.lines.set(id, {
        row: rowY.has(k) ? { y: rowY.get(k)! + at, x0, x1: rowEnd(k) } : null,
        column: colX.has(k) ? { x: colX.get(k)! + at, y0: rowY.get(after(k))!, y1: bottom } : null,
      });
    });
  }
  // Each pair fills its cell at its two targets: the earlier document's in
  // columns, the later one's in rows.
  const radius = pitch / 2;
  const counts = new Map<string, number>();
  particles.forEach((p, i) => {
    let da = docIndex.get(p.a);
    let db = docIndex.get(p.b);
    let ra = rowOf.get(p.ca);
    let rb = rowOf.get(p.cb);
    if (da === undefined || db === undefined || ra === undefined || rb === undefined || da === db) return;
    if (da > db) {
      [da, db] = [db, da];
      [ra, rb] = [rb, ra];
    }
    const cx = colX.get(da);
    const ry = rowY.get(db);
    if (cx === undefined || ry === undefined) return;
    layout.x[i] = cx + ra * pitch + pitch / 2;
    layout.y[i] = ry + rb * pitch + pitch / 2;
    layout.r[i] = radius;
    layout.visible[i] = level === null || p.level === level ? 1 : 0;
    layout.alpha[i] = 1;
    layout.ink[i] = p.tone;
    layout.small[i] = 0;
    const key = `${da}:${db}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  // A square for every pair of documents compared, whatever the side shows.
  for (const i of cols) {
    for (const j of rows) {
      if (j <= i) continue;
      const n = counts.get(`${i}:${j}`) ?? 0;
      if (n === 0) continue;
      layout.groups.push({
        key: getDocPairKey(docs[i].id, docs[j].id),
        count: n,
        x0: colX.get(i)!,
        y0: rowY.get(j)!,
        x1: colX.get(i)! + sizes[i] * pitch,
        y1: rowY.get(j)! + sizes[j] * pitch,
        labelAt: "none",
        row: docs[j].id,
        column: docs[i].id,
      });
    }
  }
  const mark = (
    id: string,
    k: number,
    labelX: number,
    labelY: number,
    labelWidth: number,
    align: "left" | "right",
    lines: 1 | 2,
    end: { x: number; y: number },
  ) => {
    layout.marks.push({
      id,
      doc: docs[k].id,
      count: count.get(id) ?? 0,
      x: end.x,
      y: end.y,
      labelX,
      labelY,
      labelWidth,
      labelHeight: lines === 2 ? 2 * MARK_LINE - 2 : MARK_LINE,
      align,
      lines,
    });
  };
  // Rows: each document's name at the left edge, at the front of its band
  // on a side, else its middle; the last document, which has no column,
  // keeps its named targets under its name. Where the field is too short,
  // those names take one line, then the ones carrying least go unnamed
  // (never the one in focus).
  type Item = { k: number; mark: string | null; height: number; want: number; lines: 1 | 2 };
  const items: Item[] = [];
  for (const k of rows) {
    const lines = Math.min(AXIS_LINES, Math.max(1, Math.ceil((docs[k].name.length * AXIS_CHAR) / nameWidth)));
    const h = lines * AXIS_LINE;
    const band = sizes[k] * pitch;
    items.push({ k, mark: null, height: h, want: side ? rowY.get(k)! + h / 2 : rowY.get(k)! + band / 2, lines: 1 });
    if (k !== last) continue;
    for (const id of ownMarks(k)) {
      const two = markWidth(id) > nameWidth + 30 ? 2 : 1;
      items.push({
        k,
        mark: id,
        height: two === 2 ? 2 * MARK_LINE - 2 : MARK_LINE,
        want: rowY.get(k)! + (rowOf.get(id) ?? 0) * pitch + pitch / 2,
        lines: two,
      });
    }
  }
  const place = () => {
    const hs = items.map((it) => it.height);
    return { cs: spread(items.map((it) => it.want), hs, 0, height), hs };
  };
  const squeezed = ({ hs }: { cs: number[]; hs: number[] }) => hs.some((h, i) => h < items[i].height - 1e-6);
  let placed = place();
  if (squeezed(placed)) {
    for (const it of items) {
      if (it.mark === null || it.lines === 1) continue;
      it.lines = 1;
      it.height = MARK_LINE;
    }
    placed = place();
  }
  const leftDrop = [...ownMarks(last)].reverse().filter((id) => id !== extra);
  while (squeezed(placed) && leftDrop.length > 0) {
    const id = leftDrop.shift();
    const at = items.findIndex((it) => it.mark === id);
    if (at >= 0) items.splice(at, 1);
    placed = place();
  }
  items.forEach((it, n) => {
    const y = placed.cs[n];
    const k = it.k;
    const bandY = rowY.get(k)!;
    if (it.mark === null) {
      const at = side ? pitch / 2 : (sizes[k] * pitch) / 2;
      layout.axis.push({
        key: docs[k].id,
        edge: "row",
        bar: { x0: x0 - BAR_OFFSET, y0: bandY, x1: x0 - BAR_OFFSET, y1: bandY + sizes[k] * pitch },
        labelX: x0 - ROW_NAME_GAP,
        labelY: y,
        labelWidth: nameWidth,
        labelHeight: placed.hs[n],
        lead: Math.abs(y - it.want) > 6 ? { x0: x0 - ROW_NAME_GAP + 3, y0: y, x1: x0 - BAR_OFFSET - 2, y1: bandY + at } : null,
      });
      return;
    }
    mark(it.mark, k, x0 - ROW_NAME_GAP, y, nameWidth + 30, "right", it.lines, {
      x: x0 - 1,
      y: bandY + (rowOf.get(it.mark) ?? 0) * pitch + pitch / 2,
    });
    layout.marks[layout.marks.length - 1].labelHeight = placed.hs[n];
  });
  // Columns: a short name over a line of context under each column, on one
  // baseline; where they do not fit side by side, every second one drops a
  // row and a thin line joins it to its bar. A name in the first row keeps
  // clear of its neighbours' lines.
  const centres = centresOf(geo);
  const barY = bottom + BAR_OFFSET;
  cols.forEach((k, n) => {
    const lower = twoRows && n % 2 === 1;
    const apart = (d: number) => (centres[n + d] === undefined ? Infinity : Math.abs(centres[n + d] - centres[n]));
    const room = !twoRows ? colWidth(k) : lower ? Math.min(apart(-2), apart(2)) - 12 : 2 * Math.min(apart(-1), apart(1)) - 14;
    const w = Math.max(24, Math.min(colWidth(k), room));
    const cx = Math.min(width - pad - w / 2, Math.max(pad + w / 2, centres[n]));
    const labelY = bottom + COLUMN_TOP + (lower ? labelH + COLUMN_ROW_GAP : 0);
    layout.axis.push({
      key: docs[k].id,
      edge: "column",
      bar: { x0: colX.get(k)!, y0: barY, x1: colX.get(k)! + sizes[k] * pitch, y1: barY },
      labelX: cx,
      labelY,
      labelWidth: w,
      labelHeight: colHeight(k),
      lead: lower || Math.abs(cx - centres[n]) > 2 ? { x0: centres[n], y0: barY + 2, x1: cx, y1: labelY - 3 } : null,
    });
  });
  // The first document's named targets above the map, at the front of its column.
  const k0 = present[0];
  first.forEach((id, i) => {
    const labelY = y0 - 6 - (first.length - 1 - i) * MARK_LINE - MARK_LINE / 2;
    mark(id, k0, colX.get(k0)!, labelY, Math.max(MARK_MIN, width - pad - colX.get(k0)!), "left", 1, {
      x: colX.get(k0)! + (rowOf.get(id) ?? 0) * pitch + pitch / 2,
      y: y0 - 1,
    });
  });
  // The middle documents' named targets in the empty half, where their row
  // ends: spread apart above the last row, stepping right where a lower row
  // runs further; where they do not fit, the ones carrying least go unnamed
  // (never the one in focus).
  let stair = present
    .slice(1, -1)
    .flatMap((k) => ownMarks(k).map((id) => ({ id, k, want: rowY.get(k)! + (rowOf.get(id) ?? 0) * pitch + pitch / 2 })));
  const floor = rowY.get(last)! - 2;
  const fitStair = () => {
    const hs = stair.map(() => MARK_LINE);
    return { cs: spread(stair.map((s) => s.want), hs, y0, floor), hs };
  };
  let sp = fitStair();
  const stairDrop = stair
    .map((s) => s.id)
    .filter((id) => id !== extra)
    .sort((a, b) => (rank.get(b) ?? -1) - (rank.get(a) ?? -1));
  while (sp.hs.some((h) => h < MARK_LINE - 1e-6) && stairDrop.length > 0) {
    const id = stairDrop.shift();
    stair = stair.filter((s) => s.id !== id);
    sp = fitStair();
  }
  const bands = rows.map((k) => ({ y0: rowY.get(k)!, y1: rowY.get(k)! + sizes[k] * pitch, end: rowEnd(k) }));
  stair.forEach((s, n) => {
    const y = sp.cs[n];
    const lo = y - MARK_LINE / 2;
    const hi = y + MARK_LINE / 2;
    const end = Math.max(rowEnd(s.k), ...bands.filter((b) => b.y0 < hi + gap && b.y1 > lo - gap).map((b) => b.end));
    const x = end + STAIR_GAP;
    mark(s.id, s.k, x, y, Math.max(MARK_MIN, width - pad - x), "left", 1, { x: rowEnd(s.k) + 1, y: s.want });
  });
  layout.marks.sort((a, b) => docIndex.get(a.doc)! - docIndex.get(b.doc)! || a.y - b.y);
```

Remove the old `points` writes, and `layout.points` from everywhere in `hub.ts` (Task 4 replaces
its only reader).

- [ ] **Step 4: Run, expect PASS:** `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm vitest run src/lib/brief/hub.test.ts`.
  The strip tests still fail until Task 4 lands; that is expected.

- [ ] **Step 5: Commit** (after Task 4 passes, commit Tasks 3 and 4 together if the strip tests
  block a green run): `git add src/lib/brief/hub.ts src/lib/brief/hub.test.ts`, message
  "feat(brief): the map mirrored, rows named at the left, columns under it".

### Task 4: A target in focus, and the hairlines of a pointed block

**Files:**
- Modify: `src/lib/brief/hub.ts` (`HubStrip`, `stripOf`, `stripCounts`, new `pairGuides`)
- Test: `src/lib/brief/hub.test.ts` ("a target's strip and its counts", new "pairGuides")

**Interfaces:**
- Consumes: `HubLayout.lines`, `HubLayout.edges`, `HubGroup.row`/`.column` (Task 3).
- Produces: `stripOf(layout, id): HubStrip | null` with
  `HubStrip = { id; row: HubLines["row"]; column: HubLines["column"]; half: number }`;
  `stripCounts(layout, particles, id): HubCount[]` (same `HubCount`); and
  `pairGuides(layout: HubLayout, group: HubGroup): HubSegment[]`.

- [ ] **Step 1: Failing tests:**

```ts
describe("stripOf", () => {
  const map = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, particles, DATA, 800, 500);
  it("runs a target's row from the left edge to where its row ends, and its column down to the bottom", () => {
    const b6 = stripOf(map, "B6")!;
    expect(b6.row!.x0).toBeCloseTo(Math.min(...map.groups.map((g) => g.x0)));
    expect(b6.row!.x1).toBeCloseTo(map.groups.find((g) => g.key === "A<->B")!.x1);
    expect(b6.column!.y1).toBeCloseTo(Math.max(...map.groups.map((g) => g.y1)));
    expect(b6.column!.y0).toBeCloseTo(map.groups.find((g) => g.key === "B<->C")!.y0);
  });
  it("the first document's targets have only a column, the last's only a row", () => {
    expect(stripOf(map, "A6")!.row).toBeNull();
    expect(stripOf(map, "C5")!.column).toBeNull();
  });
  it("none for a target outside the selection", () => {
    expect(stripOf(map, "Z9")).toBeNull();
  });
});

describe("stripCounts", () => {
  const map = layoutHub({ kind: "map", side: "apart", focus: { kind: "target", id: "B6" } }, particles, DATA, 800, 500);
  it("counts a target's shown pairs in each block, under its row or beside its column", () => {
    const counts = stripCounts(map, particles, "B6");
    const b6 = stripOf(map, "B6")!;
    for (const c of counts) {
      const g = map.groups.find((x) => x.key === c.key)!;
      if (g.row === "B") {
        expect(c.align).toBe("below");
        expect(c.y).toBeCloseTo(b6.row!.y + b6.half + 2);
      } else {
        expect(g.column).toBe("B");
        expect(["right", "left"]).toContain(c.align);
      }
    }
    const shown = particles.filter((p, i) => map.visible[i] && (p.ca === "B6" || p.cb === "B6")).length;
    expect(counts.reduce((s, c) => s + c.count, 0)).toBe(shown);
  });
  it("counts for a target with only a column (the first document)", () => {
    const counts = stripCounts(map, particles, "A6");
    expect(counts.length).toBeGreaterThan(0);
    for (const c of counts) expect(c.align).not.toBe("below");
  });
});

describe("pairGuides", () => {
  const map = layoutHub({ kind: "map" }, particles, DATA, 800, 500);
  it("runs from the gap corner of a block left to the rows' bars and down to the columns' bars", () => {
    const g = map.groups.find((x) => x.key === "B<->C")!;
    const [row, column] = pairGuides(map, g);
    const half = map.edges!.gap / 2;
    expect(row).toEqual({ x0: g.x0 - half, y0: g.y0 - half, x1: map.edges!.rowBar, y1: g.y0 - half });
    expect(column).toEqual({ x0: g.x0 - half, y0: g.y0 - half, x1: g.x0 - half, y1: map.edges!.columnBar });
  });
  it("none off the map", () => {
    const overview = layoutHub({ kind: "overview" }, particles, DATA, 800, 500);
    expect(pairGuides(overview, overview.groups[0])).toEqual([]);
  });
});
```

Remove today's `stripOf`/`stripCounts` tests. They assume the diagonal: the strip runs from a
point on it, and the column runs up to the top.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** (replace today's `HubStrip`, `stripOf` and `stripCounts`; `HubCount`,
  `COUNT_*`, `countWidth` stay):

```ts
/** A target's row and column on the map, each a strip a little wider than
 *  its cells (never under 6px) so the numbers beside it keep clear. */
export interface HubStrip {
  id: string;
  row: HubLines["row"];
  column: HubLines["column"];
  half: number;
}

export function stripOf(layout: HubLayout, id: string): HubStrip | null {
  const lines = layout.lines.get(id);
  if (!lines || (!lines.row && !lines.column)) return null;
  return { id, row: lines.row, column: lines.column, half: Math.max(STRIP_MIN_HALF, layout.pitch / 2 + STRIP_PAD) };
}

export function stripCounts(layout: HubLayout, particles: HubParticle[], id: string): HubCount[] {
  const strip = stripOf(layout, id);
  if (!strip) return [];
  const count = new Map<string, number>();
  particles.forEach((p, i) => {
    if (!layout.visible[i] || (p.ca !== id && p.cb !== id)) return;
    const key = getDocPairKey(p.a, p.b);
    count.set(key, (count.get(key) ?? 0) + 1);
  });
  const right = Math.max(...layout.groups.map((g) => g.x1));
  const counts: HubCount[] = [];
  for (const g of layout.groups) {
    const n = count.get(g.key);
    if (!n) continue;
    // The blocks level with its row are on its row; the others on its column.
    if (strip.row && g.y0 <= strip.row.y && strip.row.y <= g.y1) {
      counts.push({ key: g.key, count: n, x: (g.x0 + g.x1) / 2, y: strip.row.y + strip.half + COUNT_GAP, align: "below" });
      continue;
    }
    if (!strip.column) continue;
    // Beside the column, on the side that keeps the number on the map.
    const after = strip.column.x + strip.half + COUNT_GAP;
    const fits = after + countWidth(n) <= right;
    counts.push({
      key: g.key,
      count: n,
      x: fits ? after : strip.column.x - strip.half - COUNT_GAP,
      y: (g.y0 + g.y1) / 2,
      align: fits ? "right" : "left",
    });
  }
  // Where blocks are smaller than their numbers, the numbers move apart
  // along the strip, in order, and stay beside it.
  const row = counts.filter((c) => c.align === "below");
  if (strip.row) {
    spread(row.map((c) => c.x), row.map((c) => countWidth(c.count)), strip.row.x0, strip.row.x1).forEach((x, k) => (row[k].x = x));
  }
  const column = counts.filter((c) => c.align !== "below");
  if (strip.column) {
    spread(column.map((c) => c.y), column.map(() => COUNT_HEIGHT), strip.column.y0, strip.column.y1).forEach((y, k) => (column[k].y = y));
  }
  return counts;
}

/** A pointed block traced to its two documents' bars along the white gaps:
 *  from the gap corner above-left of it, left to the rows' bars and down to
 *  the columns' bars, never over a square. */
export function pairGuides(layout: HubLayout, group: HubGroup): HubSegment[] {
  if (!layout.edges || group.row === undefined) return [];
  const half = layout.edges.gap / 2;
  const x = group.x0 - half;
  const y = group.y0 - half;
  return [
    { x0: x, y0: y, x1: layout.edges.rowBar, y1: y },
    { x0: x, y0: y, x1: x, y1: layout.edges.columnBar },
  ];
}
```

- [ ] **Step 4: Run, expect PASS:** `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm vitest run src/lib/brief/hub.test.ts`.

- [ ] **Step 5: Commit** `git add src/lib/brief/hub.ts src/lib/brief/hub.test.ts && git commit -m "feat(brief): a target in focus and a pointed block on the mirrored map"`

### Task 5: The canvas: bars, both kinds of names, the pointed block

**Files:**
- Modify: `src/components/brief/hub/hub-canvas.tsx`
- Modify: `src/components/brief/brief.css` (near `.brief-hub-axis`, line ~1755)
- Test: `src/components/brief/hub/hub-canvas.test.tsx`, and the one map test in
  `src/components/brief/hub/hub.test.tsx` that points at document A's name

**Interfaces:**
- Consumes: `HubAxis.edge/bar/lead`, `HubGroup.row/column`, `pairGuides`, `HubSegment`
  (Tasks 3 and 4); `BriefDocument.mapLabel` (Task 1).

- [ ] **Step 1: Failing tests** in `hub-canvas.test.tsx`, replacing the diagonal tests:

```ts
it("names the rows at the left and the columns under the map, and a document under the pointer", () => {
  const layout = layoutHub({ kind: "map" }, PARTICLES, DATA, W, H);
  const { container } = render(<HubCanvas data={DATA} stage={{ kind: "map" }} labelFor={() => null} tipFor={tipFor} />);
  const rows = [...container.querySelectorAll('[data-edge="row"]')].map((el) => el.textContent);
  const cols = [...container.querySelectorAll('[data-edge="column"]')].map((el) => el.textContent);
  expect(rows).toEqual(["Document B", "Document C"]);
  expect(cols).toEqual(["AContext A", "BContext B"]);
  const b = layout.axis.find((a) => a.edge === "row" && a.key === "B")!;
  fireEvent.pointerMove(field(container), { clientX: b.bar.x0, clientY: (b.bar.y0 + b.bar.y1) / 2 });
  expect(screen.getByRole("presentation").textContent).toBe("axis B");
});

it("pointing at a block marks its row's and its column's names, nothing at rest", () => {
  const layout = layoutHub({ kind: "map" }, PARTICLES, DATA, W, H);
  const block = layout.groups.find((g) => g.key === "A<->C")!;
  const { container } = render(<HubCanvas data={DATA} stage={{ kind: "map" }} labelFor={() => null} tipFor={tipFor} />);
  expect(container.querySelectorAll("[data-on]")).toHaveLength(0);
  fireEvent.pointerMove(field(container), { clientX: (block.x0 + block.x1) / 2, clientY: (block.y0 + block.y1) / 2 });
  const on = [...container.querySelectorAll(".brief-hub-axis[data-on]")].map((el) => `${el.getAttribute("data-edge")}:${el.getAttribute("data-axis")}`);
  expect(on.sort()).toEqual(["column:A", "row:C"]);
});
```

Update the old test that points at `b.square` to point at the bar. The draw test ("lineTo at least
axis + marks") holds as it is, because every bar is a line.

In `hub.test.tsx`, the test "a document's name on the map leads on to the documents only while the
brief keeps them" takes document A's column name. Point inside its box:
`{ clientX: a.labelX, clientY: a.labelY + a.labelHeight / 2 }`.

- [ ] **Step 2: Run, expect FAIL:** `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm vitest run src/components/brief/hub`.

- [ ] **Step 3: Implement.**

In `hub-canvas.tsx`:
1. Imports: add `pairGuides`, `type HubSegment`.
2. Hit boxes:

```ts
function axisBox(a: HubAxis) {
  return a.edge === "row"
    ? { x0: a.labelX - a.labelWidth, x1: a.labelX + 8, y0: a.labelY - a.labelHeight / 2, y1: a.labelY + a.labelHeight / 2 }
    : { x0: a.labelX - a.labelWidth / 2, x1: a.labelX + a.labelWidth / 2, y0: a.labelY - 2, y1: a.labelY + a.labelHeight };
}

function barBox(a: HubAxis) {
  return { x0: Math.min(a.bar.x0, a.bar.x1) - 3, x1: Math.max(a.bar.x0, a.bar.x1) + 3, y0: Math.min(a.bar.y0, a.bar.y1) - 3, y1: Math.max(a.bar.y0, a.bar.y1) + 3 };
}
```

   In `targetAt`: `const axis = layout.axis.find((a) => inside(x, y, barBox(a)) || inside(x, y, axisBox(a)));`

3. `draw(...)` takes a last parameter `guides: HubSegment[]`. The diagonal section becomes:

```ts
  // The map's documents: each one's colour bar along its edge (a row's at
  // the left, a column's under the map), with a thin lead from a name that
  // moved away from it; and a lead from each named target to its row or column.
  if (layout.axis.length > 0 && progress > 0) {
    for (const a of layout.axis) {
      const dim = extras.axisFocus !== null && extras.axisFocus !== a.key;
      ctx.globalAlpha = settledIn * (dim ? 0.3 : 1);
      ctx.strokeStyle = extras.colors.get(a.key) ?? "#94a3b8";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(a.bar.x0, a.bar.y0);
      ctx.lineTo(a.bar.x1, a.bar.y1);
      ctx.stroke();
      if (a.lead) {
        ctx.strokeStyle = "#c3c8cf";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.lead.x0, a.lead.y0);
        ctx.lineTo(a.lead.x1, a.lead.y1);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "#b9bfc7";
    ctx.lineWidth = 1;
    for (const m of layout.marks) {
      const dim = extras.markFocus !== null && extras.markFocus !== m.id;
      ctx.globalAlpha = settledIn * (dim ? 0.35 : 1);
      ctx.beginPath();
      ctx.moveTo(m.align === "left" ? m.labelX - 3 : m.labelX + 3, m.labelY);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
    }
  }
```

   and after the dots, before the outlines:

```ts
  // A pointed block traced to its two documents along the white gaps.
  if (guides.length > 0 && progress >= 1) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#232e3d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const g of guides) {
      ctx.moveTo(g.x0, g.y0);
      ctx.lineTo(g.x1, g.y1);
    }
    ctx.stroke();
  }
```

4. In `HubCanvas`, after `bright`:

```ts
  // The pointed block (or the block of a pointed square), traced to its documents.
  const pointedGroup = tipGroup >= 0 ? layout.groups[tipGroup] : null;
  const guides = useMemo(() => (pointedGroup ? pairGuides(layout, pointedGroup) : []), [layout, pointedGroup]);
  const guidesRef = useRef<HubSegment[]>([]);
```

   In the animation effect, `settle` calls
   `draw(canvas, cur, layout, size.w, size.h, moved ? e : 1, member, p < 1 ? -1 : brightRef.current, extras, p < 1 ? [] : guidesRef.current);`.
   The redraw effect sets `guidesRef.current = guides;` next to `brightRef.current = bright;`,
   passes `guides` to `draw`, and adds `guides` to its dependency list.

5. The names:

```tsx
        {layout.axis.map((a) => {
          const doc = data.scope.docs.find((d) => d.id === a.key);
          const [name, context] = doc?.mapLabel ?? [doc?.code ?? a.key, ""];
          const on =
            tip?.target.kind === "axis"
              ? tip.target.axis.key === a.key
              : pointedGroup?.row !== undefined && (a.edge === "row" ? pointedGroup.row === a.key : pointedGroup.column === a.key);
          return (
            <div
              key={`${a.edge}:${a.key}`}
              className="brief-hub-axis"
              data-axis={a.key}
              data-edge={a.edge}
              data-on={on ? "true" : undefined}
              data-dim={axisFocus !== null && axisFocus !== a.key ? "true" : undefined}
              data-compact={size.w < 480 ? "true" : undefined}
              style={{ left: a.labelX, top: a.labelY, width: a.labelWidth }}
            >
              {a.edge === "row" ? (
                <span className="brief-hub-axis-name">{docName(a.key)}</span>
              ) : (
                <>
                  <span className="brief-hub-axis-name">{name}</span>
                  {context && <span className="brief-hub-axis-context">{context}</span>}
                </>
              )}
            </div>
          );
        })}
```

   `brief.css`, after `.brief-hub-axis[data-dim]`:

```css
/* A column's name under the map: centred under its column, a short name
   over a line of context (Jonas's mockup 7). */
[data-brief] .brief-hub-axis[data-edge="column"] {
  display: block;
  overflow: hidden;
  transform: translateX(-50%);
  font-size: 0.78125rem;
  line-height: 15px;
  text-align: center;
  white-space: nowrap;
}

[data-brief] .brief-hub-axis-context {
  display: block;
  overflow: hidden;
  font-size: 0.6875rem;
  font-weight: 400;
  color: var(--brief-muted);
  text-overflow: ellipsis;
}

/* A pointed block's two documents, and a pointed document's names: pale
   yellow on the words only. */
[data-brief] .brief-hub-axis[data-on] .brief-hub-axis-name {
  background: linear-gradient(to bottom, transparent 12%, var(--brief-highlight) 12%, var(--brief-highlight) 94%, transparent 94%);
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
```

   The map's axis comments in `hub-canvas.tsx` that say "diagonal" are reworded to "edges".

- [ ] **Step 4: Run, expect PASS:** `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm vitest run src/components/brief`, then `pnpm tsc --noEmit`.

- [ ] **Step 5: Commit** `git add src/components/brief/hub/hub-canvas.tsx src/components/brief/hub/hub-canvas.test.tsx src/components/brief/hub/hub.test.tsx src/components/brief/brief.css && git commit -m "feat(brief): the map's names on its edges, and a pointed block traced to both"`

### Task 6: The walkthrough's map stop

**Files:**
- Modify: `messages/en.json`, `messages/es.json`, `messages/mn.json`, key
  `briefing.tour.brief.steps.map.body`

- [ ] **Step 1: Replace the English text** with:

"The same dots, one block for each pair of documents: each row is a document named at the left,
each column a document named under the map, and each dot sits where its two targets meet.
Pointing at a block names its two documents and gives its figures; selecting a block opens that
pair of documents, and selecting a name puts that document at the centre further down."

- [ ] **Step 2: es and mn** get the same English text as a placeholder (branch practice).
  Commit only this key: stage each catalog as HEAD plus this one change. Another session edits
  the catalogs in this worktree, so write each file with a script that reads `git show
  HEAD:messages/<l>.json`, sets the key, and `git update-index --add --cacheinfo` its blob.

- [ ] **Step 3: Run** `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm vitest run src/components/brief` (the tour tests) and the locale parity test (`pnpm vitest run src/i18n` or the repo's parity test).

- [ ] **Step 4: Commit** "copy(brief): the walkthrough reads the map by its edges".

### Task 7: Verification and handoff

- [ ] Full suite: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm test`, `pnpm tsc --noEmit`, and `pnpm
  lint` on the changed files.
- [ ] Dev server on a free port. `/{mongolia,panama,sri-lanka,cote-divoire}/brief` answer 200.
  A headless look at Mongolia with all eight documents, in the overall view and on the two sides,
  and at Sri Lanka with all eight (the two-row fallback).
- [ ] `EXPERIMENT_HANDOFF.md`: a "Round 13" section (what changed, the spec and plan, the
  sketches, what was verified). Update project memory.
- [ ] Commit the handoff: "docs(handoff): round 13, the map named on its edges".
