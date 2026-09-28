# Coherence brief round 12: policy areas, explorable. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brief's on-screen "By policy area" bars with an explorable component: a bar chart of targets per policy area whose targets carry riso point clouds of their target pairs, beside a lean list of the pairs of areas those target pairs fall between, and put it in the standard brief.

**Architecture:** Pure, tested libs compute everything (`src/lib/brief/areas.ts`: areas, pairs of areas, headline, the picture's states; `src/lib/brief/area-layout.ts`: geometry and hit testing). A canvas component (`areas/area-field.tsx`) draws and animates the picture; a view component (`areas/areas-view.tsx`) holds the reader's choices (side, open pair of areas, picked target) and renders the right side. `BriefApp` mounts the view for the "areas" section on screen (print keeps the old bars), shares the lens with the menu, and opens a new panel kind for a pair of areas' target pairs.

**Tech Stack:** Next.js App Router, React 19, TypeScript, next-intl, Vitest + Testing Library (jsdom), canvas 2D.

**Spec:** `docs/superpowers/specs/2026-09-28-coherence-brief-round12-policy-areas-design.md`

## Global Constraints

- Copy uses the brief's vocabulary: potential misalignment, strongly aligned, target pairs. Never "reinforce", "flagged", "tension", "contradiction", "commitment" in `brief.*` or walkthrough strings, no "you" in the walkthrough, no em dashes anywhere (`src/components/brief/copy.test.ts` enforces this).
- Headlines state the number itself ("53% of ..."), never a word for it ("Half of").
- Area names as the data gives them; a trailing acronym in brackets moves to a `title` tooltip; no shortening at commas.
- Controls are plain typographic buttons: an ink underline (2px) when on (`aria-pressed="true"`), a small glyph square for the side; no pills, outlines, or filled/black states.
- Highlighter Rule: pale yellow (`var(--brief-highlight)`, #fff5c7) on words only (row names, list names, the picked target's title), never on marks, nothing at rest.
- Inks: ink `#232e3d`, muted `#55606e`, green `#2a7443`, red `#d2432c`; potential misalignment dots use the checker texture (every other dot small).
- Pointing only marks names; selecting re-shapes the picture; row heights never change while the lens and side stay the same.
- A cloud stops at 40 lines of dots; a taller one is cut with a visible break and its exact count on top.
- New message keys go into `messages/en.json`, and the same English text into `messages/es.json` and `messages/mn.json` (placeholders; locale parity).
- Run tests as `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run <paths>` (the Mac's de-DE locale breaks some of main's tests).
- Never run prettier on a file (no project config; it reformats whole files). Match the surrounding code's style by hand.
- Commits: local branch `experiment/coherence-pulse` only, never push; stage only the paths the task touched (another session may work in this worktree); no `Co-Authored-By` trailer (Jonas's rule).

## Review Focus

1. A lens that places only some targets (Mongolia's Human rights lens places 27 of 178): the others have no row and cannot be picked; their target pairs count as "{area} · targets outside these areas"; the scope line shows. Pinned in Task 2 (grouping) and Task 6 (scope line, row name).
2. A brief with none of the side's target pairs (two documents without any potential misalignment between them): the headline says "Too few target pairs to compare.", no list, no error. Pinned in Task 2 and Task 6.
3. Very large rows and clouds (Sri Lanka: a 195-target row, one target in 211 potential misalignments): rows wrap onto further lines whose clouds keep clear of the line above; a cloud is cut at 40 lines with its count shown. Pinned in Task 4 and Task 5.
4. The lens changing (in the menu or the component) while a pair of areas is open or a target is picked: the choice lapses and does not come back when the lens returns. Pinned in Task 6.
5. Pointing across the list: row names are marked, nothing else changes (no counts, no re-shaping). Pinned in Task 6.

---

### Task 0: Record the approved spec, this plan and the screen-toggle fix

The screen-toggle fix (menu sections now decide the screen too) is already in the tree, tested, uncommitted.

**Files:**
- Commit: `docs/superpowers/specs/2026-09-28-coherence-brief-round12-policy-areas-design.md`, `docs/superpowers/plans/2026-09-28-coherence-brief-round12-policy-areas.md` (force-add: `docs/` is gitignored)
- Commit: `messages/en.json`, `messages/es.json`, `messages/mn.json`, `src/components/brief/brief-app.tsx`, `src/components/brief/brief-app.test.tsx`, `src/components/brief/hub/hub.tsx`, `src/components/brief/hub/hub.test.tsx`

- [ ] **Step 1: Confirm the toggle fix is the only pending change in those paths**

Run: `git status --short && git diff --stat`
Expected: the seven source paths above modified, `.superpowers/` untracked, nothing else of ours.

- [ ] **Step 2: Run the two suites the fix touched**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/components/brief/brief-app.test.tsx src/components/brief/hub/hub.test.tsx`
Expected: PASS (58 tests).

- [ ] **Step 3: Commit the fix, then the documents**

```bash
git add messages/en.json messages/es.json messages/mn.json src/components/brief/brief-app.tsx src/components/brief/brief-app.test.tsx src/components/brief/hub/hub.tsx src/components/brief/hub/hub.test.tsx
git commit -m "feat(brief): the menu's sections decide the screen as well as the print"
git add -f docs/superpowers/specs/2026-09-28-coherence-brief-round12-policy-areas-design.md docs/superpowers/plans/2026-09-28-coherence-brief-round12-policy-areas.md
git commit -m "docs(brief): round 12 spec and plan: policy areas, explorable"
```

---

### Task 1: The standard brief holds "By policy area"

**Files:**
- Modify: `src/lib/brief/selection.ts` (`DEFAULT_SECTIONS`)
- Test: `src/lib/brief/sections.test.ts`, `src/components/brief/brief-app.test.tsx`

**Interfaces:**
- Produces: `DEFAULT_SECTIONS` ends with `"areas"`; `defaultSelection` keeps it only when the country has a lens (unchanged filter).

- [ ] **Step 1: Write the failing tests**

In `src/lib/brief/sections.test.ts`, replace the first test with:

```ts
  it("lays the standard brief out on four pages, the policy areas last", () => {
    expect(DEFAULT_SECTIONS).toEqual([
      "overall",
      "together",
      "aligned",
      "apart",
      "commitments",
      "documents",
      "areas",
    ]);
    expect(paginate(DEFAULT_SECTIONS)).toEqual([
      { title: true, sections: ["overall", "together"] },
      { title: false, sections: ["aligned", "apart"] },
      { title: false, sections: ["commitments", "documents"] },
      { title: false, sections: ["areas"] },
    ]);
  });
```

In `src/components/brief/brief-app.test.tsx`:
- rename `"prints the standard brief on three pages"` to `"prints the standard brief on four pages"` and change its two assertions to `"Prints on 4 pages"` and `toHaveLength(4)`;
- in `"drops a page when sections are left out"`, change `"Prints on 2 pages"` to `"Prints on 3 pages"`;
- replace the test `"adds the policy areas below the overview when the brief holds them"` with:

```tsx
  it("shows the policy areas below the overview in the standard brief, and leaves them out with the section", () => {
    renderApp();
    const flow = screen.getByTestId("brief-flow");
    expect(flow.querySelector('[data-section="areas"]')).not.toBeNull();
    const sections = screen.getByRole("group", { name: "In the brief" });
    fireEvent.click(within(sections).getByRole("checkbox", { name: /By policy area/ }));
    expect(flow.querySelector('[data-section="areas"]')).toBeNull();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief/sections.test.ts src/components/brief/brief-app.test.tsx`
Expected: FAIL: the default sections lack `"areas"`, "Prints on 3 pages" found instead of 4.

- [ ] **Step 3: Add the section to the standard brief**

In `src/lib/brief/selection.ts`:

```ts
/** The standard brief: four A4 pages, the policy areas last. */
export const DEFAULT_SECTIONS: SectionId[] = [
  "overall",
  "together",
  "aligned",
  "apart",
  "commitments",
  "documents",
  "areas",
];
```

- [ ] **Step 4: Run the brief suites**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief src/components/brief`
Expected: PASS. (`selection.test.ts` compares with `DEFAULT_SECTIONS` itself and its source has lenses.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/brief/selection.ts src/lib/brief/sections.test.ts src/components/brief/brief-app.test.tsx
git commit -m "feat(brief): the policy areas join the standard brief"
```

---

### Task 2: Policy areas and the pairs of areas (lib)

**Files:**
- Create: `src/lib/brief/areas.ts`
- Test: `src/lib/brief/areas.test.ts`

**Interfaces:**
- Consumes: `Scope`, `ScopedComparison` (`./compute`); `sideLevel`, `HubTone` (`./hub`); `BriefSource`, `LensId` (`./source`).
- Produces:
  - `type AreaSide = "apart" | "reinforce"`; `OTHER_AREA = "__other"`; `TOP_AREA_PAIRS = 6`
  - `interface LensArea { id: string; name: string; acronym: string | null; order: number; targets: string[] }`
  - `interface LensAreas { areas: LensArea[]; placed: number; total: number }`
  - `splitAcronym(name: string): { name: string; acronym: string | null }`
  - `lensAreas(source: BriefSource, scope: Scope, lensId: LensId): LensAreas`
  - `type SideLinks = Record<AreaSide, Map<string, string[]>>`; `sideLinks(scope: Scope): SideLinks`
  - `interface AreaPair { key: string; a: string; b: string; pairs: number; count: number; involvement: Map<string, number> }`
  - `interface AreaPairs { side: AreaSide; top: AreaPair[]; rest: { groups: number; pairs: number; count: number }; total: number }`
  - `areaPairs(lens: LensAreas, scope: Scope, side: AreaSide): AreaPairs`
  - `type AreaHeadline = { kind: "none" } | { kind: "between" | "within" | "outside"; share: number; a: string; b: string }`; `areaHeadline(pairs: AreaPairs): AreaHeadline`
  - internal helpers `placing(lens)` and `pairOf(comparison, placing)` reused by Task 3.

The fixture (`briefFixture()`, lens `globe`): g1 "Protected areas" = A1-A3, g2 "Agriculture" = B4-B6, g5 "Water" = C1-C3; the other nine targets are outside the lens. Potential misalignments: A6 x B1-B6, B5 x C4-C6, B6 x C1-C6 (15). Every expected number below was derived independently of this code.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/brief/areas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scopeOf } from "./compute";
import { briefFixture } from "./test-fixture";
import type { BriefSource } from "./source";
import { areaHeadline, areaPairs, lensAreas, OTHER_AREA, sideLinks, splitAcronym } from "./areas";

const SOURCE = briefFixture();
const ALL = scopeOf(SOURCE, ["A", "B", "C"]);

/** The fixture with its one lens placing other targets. */
function withPrimary(primary: Record<string, string>, categories = SOURCE.lenses[0].categories): BriefSource {
  return { ...SOURCE, lenses: [{ ...SOURCE.lenses[0], categories, primary }] };
}

describe("splitAcronym", () => {
  it("moves a trailing acronym in brackets out of the name", () => {
    expect(splitAcronym("Land use, land-use change and forestry (LULUCF)")).toEqual({
      name: "Land use, land-use change and forestry",
      acronym: "LULUCF",
    });
  });

  it("keeps a name without one as written, commas and all", () => {
    expect(splitAcronym("Free, meaningful and active public participation")).toEqual({
      name: "Free, meaningful and active public participation",
      acronym: null,
    });
    expect(splitAcronym("Targets (2030)")).toEqual({ name: "Targets (2030)", acronym: null });
  });
});

describe("lensAreas", () => {
  it("lists the areas holding targets, most first, ties in the taxonomy's order", () => {
    const lens = lensAreas(SOURCE, ALL, "globe");
    expect(lens.areas.map((a) => [a.id, a.targets])).toEqual([
      ["g1", ["A1", "A2", "A3"]],
      ["g2", ["B4", "B5", "B6"]],
      ["g5", ["C1", "C2", "C3"]],
    ]);
    expect([lens.placed, lens.total]).toEqual([9, 18]);
  });

  it("sorts the areas by their number of targets", () => {
    const source = withPrimary({ A1: "g5", A2: "g5", B4: "g5", B5: "g5", A3: "g1", B6: "g2", C1: "g2" });
    const lens = lensAreas(source, scopeOf(source, ["A", "B", "C"]), "globe");
    expect(lens.areas.map((a) => [a.id, a.targets.length])).toEqual([
      ["g5", 4],
      ["g2", 2],
      ["g1", 1],
    ]);
  });

  it("keeps to the documents in the brief", () => {
    const lens = lensAreas(SOURCE, scopeOf(SOURCE, ["B", "C"]), "globe");
    expect(lens.areas.map((a) => a.id)).toEqual(["g2", "g5"]);
    expect([lens.placed, lens.total]).toEqual([6, 12]);
  });

  it("has no areas for a lens the country lacks", () => {
    expect(lensAreas(SOURCE, ALL, "ipcc")).toEqual({ areas: [], placed: 0, total: 18 });
  });
});

describe("sideLinks", () => {
  it("gives each target its partners on each side", () => {
    const links = sideLinks(ALL);
    expect(links.apart.get("B6")).toEqual(["A6", "C1", "C2", "C3", "C4", "C5", "C6"]);
    expect(links.reinforce.get("A1")).toEqual(["B1", "B3", "B5", "C1", "C3", "C5"]);
    expect(links.apart.get("A1")).toBeUndefined();
  });
});

describe("areaPairs", () => {
  const lens = lensAreas(SOURCE, ALL, "globe");

  it("counts the side's target pairs by pair of areas, the targets outside the lens together", () => {
    const pairs = areaPairs(lens, ALL, "apart");
    expect(pairs.total).toBe(15);
    expect(pairs.top.map((p) => [p.key, p.count, p.pairs])).toEqual([
      [`g2|${OTHER_AREA}`, 9, 18],
      ["g2|g5", 3, 9],
    ]);
    expect(pairs.rest).toEqual({ groups: 4, pairs: 54, count: 0 });
  });

  it("knows each target's part in a pair of areas", () => {
    const pair = areaPairs(lens, ALL, "apart").top[1];
    expect(Object.fromEntries(pair.involvement)).toEqual({ B6: 3, C1: 1, C2: 1, C3: 1 });
  });

  it("reads strong alignments the same way", () => {
    const pairs = areaPairs(lens, ALL, "reinforce");
    expect(pairs.total).toBe(36);
    expect(pairs.top.map((p) => [p.key, p.count, p.pairs])).toEqual([
      [`g5|${OTHER_AREA}`, 10, 18],
      [`g1|${OTHER_AREA}`, 9, 18],
      ["g1|g5", 6, 9],
      ["g1|g2", 3, 9],
      [`g2|${OTHER_AREA}`, 1, 18],
    ]);
    expect(pairs.rest).toEqual({ groups: 1, pairs: 9, count: 0 });
  });

  it("names at most six pairs of areas, ties by their target pairs, then by name", () => {
    const categories = [
      { id: "a1", name: "A6 area" },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `b${i}`, name: `B${i} area` })),
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `c${i}`, name: `C${i} area` })),
    ];
    const primary: Record<string, string> = { A6: "a1" };
    for (const i of [1, 2, 3, 4, 5, 6]) {
      primary[`B${i}`] = `b${i}`;
      primary[`C${i}`] = `c${i}`;
    }
    const source = withPrimary(primary, categories);
    const scope = scopeOf(source, ["A", "B", "C"]);
    const pairs = areaPairs(lensAreas(source, scope, "globe"), scope, "apart");
    expect(pairs.top.map((p) => p.key)).toEqual(["a1|b1", "a1|b2", "a1|b3", "a1|b4", "a1|b5", "a1|b6"]);
    expect(pairs.rest).toEqual({ groups: 54, pairs: 102, count: 9 });
  });
});

describe("areaHeadline", () => {
  it("names the pair of areas holding the most of the side's target pairs, as a share of all of them", () => {
    const lens = lensAreas(SOURCE, ALL, "globe");
    expect(areaHeadline(areaPairs(lens, ALL, "apart"))).toEqual({
      kind: "outside",
      share: 0.6,
      a: "g2",
      b: OTHER_AREA,
    });
    const strong = areaHeadline(areaPairs(lens, ALL, "reinforce"));
    expect(strong).toMatchObject({ kind: "outside", a: "g5" });
    expect(strong.kind !== "none" && strong.share).toBeCloseTo(10 / 36);
  });

  it("says between two areas", () => {
    const primary: Record<string, string> = {};
    for (const i of [1, 2, 3, 4, 5, 6]) {
      primary[`B${i}`] = "g2";
      primary[`C${i}`] = "g5";
    }
    const source = withPrimary(primary);
    const scope = scopeOf(source, ["A", "B", "C"]);
    expect(areaHeadline(areaPairs(lensAreas(source, scope, "globe"), scope, "apart"))).toEqual({
      kind: "between",
      share: 0.6,
      a: "g2",
      b: "g5",
    });
  });

  it("says within one area", () => {
    const source = withPrimary(Object.fromEntries(SOURCE.commitments.map((c) => [c.id, "g2"])));
    const scope = scopeOf(source, ["A", "B", "C"]);
    expect(areaHeadline(areaPairs(lensAreas(source, scope, "globe"), scope, "apart"))).toEqual({
      kind: "within",
      share: 1,
      a: "g2",
      b: "g2",
    });
  });

  it("says nothing without any of the side's target pairs", () => {
    const scope = scopeOf(SOURCE, ["A", "C"]);
    expect(areaHeadline(areaPairs(lensAreas(SOURCE, scope, "globe"), scope, "apart"))).toEqual({ kind: "none" });
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief/areas.test.ts`
Expected: FAIL: `Failed to resolve import "./areas"`.

- [ ] **Step 3: Write the lib**

Create `src/lib/brief/areas.ts`:

```ts
import type { Scope, ScopedComparison } from "./compute";
import { sideLevel, type HubTone } from "./hub";
import type { BriefSource, LensId } from "./source";

/**
 * Policy areas on screen: the chosen lens's areas with the targets each
 * places, and the pairs of areas that target pairs fall between. A side is
 * read as in the overview: potential misalignment (`flagged`) or strong
 * alignment (`high`).
 */
export type AreaSide = HubTone;

/** Stands for the targets a lens does not place, in a pair of areas. */
export const OTHER_AREA = "__other";

/** Pairs of areas the list names; the rest are summed in one line. */
export const TOP_AREA_PAIRS = 6;

export interface LensArea {
  id: string;
  /** The category's name, without a trailing acronym in brackets. */
  name: string;
  /** That acronym ("LULUCF"), shown on request; null without one. */
  acronym: string | null;
  /** Position in the taxonomy's own order. */
  order: number;
  /** Targets in scope whose primary area this is, in document order. */
  targets: string[];
}

export interface LensAreas {
  /** Areas holding targets: most targets first, ties in the taxonomy's order. */
  areas: LensArea[];
  /** Targets in scope the lens places. */
  placed: number;
  /** Targets in scope. */
  total: number;
}

const ACRONYM = /\s*\(([A-Z][A-Z0-9&/-]{1,11})\)\s*$/;

/** A category's name for the page: a trailing acronym in brackets moves
 *  out (to a tooltip); the rest stays as the taxonomy writes it. */
export function splitAcronym(name: string): { name: string; acronym: string | null } {
  const m = ACRONYM.exec(name);
  return m ? { name: name.slice(0, m.index).trim(), acronym: m[1] } : { name, acronym: null };
}

/** The lens's areas with the targets in scope it places. */
export function lensAreas(source: BriefSource, scope: Scope, lensId: LensId): LensAreas {
  const total = scope.commitments.length;
  const lens = source.lenses.find((l) => l.id === lensId);
  if (!lens) return { areas: [], placed: 0, total };
  const byArea = new Map<string, string[]>();
  for (const c of scope.commitments) {
    const area = lens.primary[c.id];
    if (!area) continue;
    const list = byArea.get(area);
    if (list) list.push(c.id);
    else byArea.set(area, [c.id]);
  }
  const areas = lens.categories
    .map((cat, order) => ({ id: cat.id, ...splitAcronym(cat.name), order, targets: byArea.get(cat.id) ?? [] }))
    .filter((area) => area.targets.length > 0)
    .sort((x, y) => y.targets.length - x.targets.length || x.order - y.order);
  return { areas, placed: areas.reduce((sum, area) => sum + area.targets.length, 0), total };
}

/** Each target's partners on each side, within the scope. */
export type SideLinks = Record<AreaSide, Map<string, string[]>>;

export function sideLinks(scope: Scope): SideLinks {
  const links: SideLinks = { apart: new Map(), reinforce: new Map() };
  const add = (side: AreaSide, from: string, to: string) => {
    const list = links[side].get(from);
    if (list) list.push(to);
    else links[side].set(from, [to]);
  };
  for (const c of scope.comparisons) {
    for (const side of ["apart", "reinforce"] as const) {
      if (c.level !== sideLevel(side)) continue;
      add(side, c.a.id, c.b.id);
      add(side, c.b.id, c.a.id);
    }
  }
  return links;
}

export interface AreaPair {
  /** `a|b`: the taxonomy's order, the targets outside the lens last. */
  key: string;
  a: string;
  /** Another area, the same one (target pairs within an area), or OTHER_AREA. */
  b: string;
  /** Target pairs between the two areas (or within the one). */
  pairs: number;
  /** Of those, the side's. */
  count: number;
  /** Each target's number of the side's target pairs here. */
  involvement: Map<string, number>;
}

export interface AreaPairs {
  side: AreaSide;
  /** The pairs of areas holding the most of the side's target pairs: at
   *  most TOP_AREA_PAIRS, none without any. */
  top: AreaPair[];
  /** Every other pair of areas, summed. */
  rest: { groups: number; pairs: number; count: number };
  /** All the side's target pairs in scope, placed or not. */
  total: number;
}

export interface Placing {
  areaOf: Map<string, string>;
  order: Map<string, number>;
  name: Map<string, string>;
}

export function placing(lens: LensAreas): Placing {
  const areaOf = new Map<string, string>();
  for (const area of lens.areas) for (const id of area.targets) areaOf.set(id, area.id);
  return {
    areaOf,
    order: new Map(lens.areas.map((area) => [area.id, area.order])),
    name: new Map(lens.areas.map((area) => [area.id, area.name])),
  };
}

/** The pair of areas a target pair falls in; null when the lens places
 *  neither target. */
export function pairOf(c: ScopedComparison, p: Placing): { key: string; a: string; b: string } | null {
  const x = p.areaOf.get(c.a.id);
  const y = p.areaOf.get(c.b.id);
  if (!x && !y) return null;
  if (!x || !y) {
    const a = (x ?? y) as string;
    return { key: `${a}|${OTHER_AREA}`, a, b: OTHER_AREA };
  }
  const [a, b] = (p.order.get(x) ?? 0) <= (p.order.get(y) ?? 0) ? [x, y] : [y, x];
  return { key: `${a}|${b}`, a, b };
}

/** The side's target pairs by pair of areas: the list's rows and the rest. */
export function areaPairs(lens: LensAreas, scope: Scope, side: AreaSide): AreaPairs {
  const p = placing(lens);
  const level = sideLevel(side);
  const groups = new Map<string, AreaPair>();
  let total = 0;
  for (const c of scope.comparisons) {
    const on = c.level === level;
    if (on) total += 1;
    const at = pairOf(c, p);
    if (!at) continue;
    let group = groups.get(at.key);
    if (!group) {
      group = { ...at, pairs: 0, count: 0, involvement: new Map() };
      groups.set(at.key, group);
    }
    group.pairs += 1;
    if (!on) continue;
    group.count += 1;
    for (const id of [c.a.id, c.b.id]) group.involvement.set(id, (group.involvement.get(id) ?? 0) + 1);
  }
  // Ties: more target pairs first, then the areas' names; the targets
  // outside the lens after every area.
  const name = (id: string) => p.name.get(id) ?? "";
  const outside = (g: AreaPair) => (g.b === OTHER_AREA ? 1 : 0);
  const ranked = [...groups.values()].sort(
    (x, y) =>
      y.count - x.count ||
      y.pairs - x.pairs ||
      name(x.a).localeCompare(name(y.a)) ||
      outside(x) - outside(y) ||
      name(x.b).localeCompare(name(y.b)),
  );
  const top = ranked.filter((g) => g.count > 0).slice(0, TOP_AREA_PAIRS);
  const shown = new Set(top.map((g) => g.key));
  const others = ranked.filter((g) => !shown.has(g.key));
  return {
    side,
    top,
    rest: {
      groups: others.length,
      pairs: others.reduce((sum, g) => sum + g.pairs, 0),
      count: others.reduce((sum, g) => sum + g.count, 0),
    },
    total,
  };
}

export type AreaHeadline =
  | { kind: "none" }
  | { kind: "between" | "within" | "outside"; share: number; a: string; b: string };

/** What the headline says: the pair of areas holding the most of the side's
 *  target pairs, as a share of all of them. */
export function areaHeadline(pairs: AreaPairs): AreaHeadline {
  const lead = pairs.top[0];
  if (!lead || pairs.total === 0) return { kind: "none" };
  const kind = lead.a === lead.b ? "within" : lead.b === OTHER_AREA ? "outside" : "between";
  return { kind, share: lead.count / pairs.total, a: lead.a, b: lead.b };
}
```

- [ ] **Step 4: Run the tests**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief/areas.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/brief/areas.ts src/lib/brief/areas.test.ts
git commit -m "feat(brief): policy areas and the pairs of areas their target pairs fall between"
```

---

### Task 3: The picture's states (lib)

**Files:**
- Modify: `src/lib/brief/areas.ts` (append)
- Test: `src/lib/brief/areas.test.ts` (append)

**Interfaces:**
- Consumes: Task 2's `LensAreas`, `SideLinks`, `AreaPair`, `AreaSide`, `placing`, `pairOf`, `OTHER_AREA`.
- Produces:
  - `type AreaFocus = { kind: "rest" } | { kind: "pair"; pair: AreaPair } | { kind: "target"; id: string }`
  - `type TargetInk = "base" | "pale" | "lit" | "focus"`
  - `restClouds(lens, links, side): Map<string, number>`
  - `cloudSizes(lens, links, side, focus): Map<string, number>`
  - `rowOrder(lens, rest, clouds, focus, links, side): { id: string; targets: string[] }[]`
  - `rowCounts(lens, focus, links, side): Map<string, number>`
  - `targetInks(lens, focus, links, side): Map<string, TargetInk>`
  - `partnersByArea(lens, links, side, id): { areas: { id: string; count: number }[]; outside: number; total: number }`
  - `areaPairDetail(lens, scope, side, key): { rows: ScopedComparison[]; pairs: number }`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/brief/areas.test.ts` (and extend its import from `"./areas"` with `areaPairDetail, cloudSizes, partnersByArea, restClouds, rowCounts, rowOrder, targetInks, type LensAreas, type SideLinks`):

```ts
describe("the picture's states", () => {
  const lens = lensAreas(SOURCE, ALL, "globe");
  const links = sideLinks(ALL);
  const rest = restClouds(lens, links, "apart");
  const pair = areaPairs(lens, ALL, "apart").top[1]; // Agriculture · Water

  it("gives each placed target its cloud at rest", () => {
    expect(Object.fromEntries(rest)).toEqual({ A1: 0, A2: 0, A3: 0, B4: 1, B5: 4, B6: 7, C1: 1, C2: 1, C3: 1 });
  });

  it("keeps an open pair of areas' target pairs in its two rows, none elsewhere", () => {
    const clouds = cloudSizes(lens, links, "apart", { kind: "pair", pair });
    expect(Object.fromEntries(clouds)).toEqual({ A1: 0, A2: 0, A3: 0, B4: 0, B5: 0, B6: 3, C1: 1, C2: 1, C3: 1 });
  });

  it("lets every cloud fall around a picked target", () => {
    const clouds = cloudSizes(lens, links, "apart", { kind: "target", id: "B6" });
    expect([...clouds.values()].every((v) => v === 0)).toBe(true);
  });

  it("lines up each row: the tallest clouds first; in an open pair, that pair's; other rows as at rest", () => {
    expect(rowOrder(lens, rest, rest, { kind: "rest" }, links, "apart")).toEqual([
      { id: "g1", targets: ["A1", "A2", "A3"] },
      { id: "g2", targets: ["B6", "B5", "B4"] },
      { id: "g5", targets: ["C1", "C2", "C3"] },
    ]);
    const focus = { kind: "pair" as const, pair };
    const open = rowOrder(lens, rest, cloudSizes(lens, links, "apart", focus), focus, links, "apart");
    expect(open.map((r) => r.targets)).toEqual([
      ["A1", "A2", "A3"],
      ["B6", "B5", "B4"],
      ["C1", "C2", "C3"],
    ]);
  });

  it("puts a picked target first in its row and its partners first in theirs", () => {
    // x3 is y1's only partner and the smallest cloud of its row.
    const small: LensAreas = {
      areas: [
        { id: "X", name: "X", acronym: null, order: 0, targets: ["x1", "x2", "x3"] },
        { id: "Y", name: "Y", acronym: null, order: 1, targets: ["y1"] },
      ],
      placed: 4,
      total: 4,
    };
    const handLinks: SideLinks = {
      apart: new Map([
        ["y1", ["x3"]],
        ["x3", ["y1"]],
      ]),
      reinforce: new Map(),
    };
    const handRest = new Map([
      ["x1", 5],
      ["x2", 3],
      ["x3", 1],
      ["y1", 1],
    ]);
    const focus = { kind: "target" as const, id: "y1" };
    const rows = rowOrder(small, handRest, cloudSizes(small, handLinks, "apart", focus), focus, handLinks, "apart");
    expect(rows).toEqual([
      { id: "X", targets: ["x3", "x1", "x2"] },
      { id: "Y", targets: ["y1"] },
    ]);
  });

  it("counts each row's targets taking part: in the open pair, or as the picked target's partners", () => {
    expect(Object.fromEntries(rowCounts(lens, { kind: "pair", pair }, links, "apart"))).toEqual({ g2: 1, g5: 3 });
    expect(Object.fromEntries(rowCounts(lens, { kind: "target", id: "B6" }, links, "apart"))).toEqual({ g5: 3 });
    expect(rowCounts(lens, { kind: "rest" }, links, "apart").size).toBe(0);
  });

  it("inks the targets: the open pair's rows in ink; a picked target and its partners set apart", () => {
    const open = targetInks(lens, { kind: "pair", pair }, links, "apart");
    expect([open.get("A1"), open.get("B4"), open.get("C1")]).toEqual(["pale", "base", "base"]);
    const around = targetInks(lens, { kind: "target", id: "B6" }, links, "apart");
    expect([around.get("B6"), around.get("C1"), around.get("B5"), around.get("A1")]).toEqual([
      "focus",
      "lit",
      "pale",
      "pale",
    ]);
  });

  it("says where a picked target's partners sit", () => {
    expect(partnersByArea(lens, links, "apart", "B6")).toEqual({
      areas: [{ id: "g5", count: 3 }],
      outside: 4,
      total: 7,
    });
  });

  it("lists a pair of areas' target pairs through its most involved targets first", () => {
    const between = areaPairDetail(lens, ALL, "apart", "g2|g5");
    expect(between.pairs).toBe(9);
    expect(between.rows.map((c) => `${c.a.id}-${c.b.id}`)).toEqual(["B6-C1", "B6-C2", "B6-C3"]);
    const outside = areaPairDetail(lens, ALL, "apart", `g2|${OTHER_AREA}`);
    expect(outside.pairs).toBe(18);
    expect(outside.rows.map((c) => `${c.a.id}-${c.b.id}`)).toEqual([
      "A6-B5",
      "A6-B6",
      "B5-C4",
      "B5-C5",
      "B5-C6",
      "B6-C4",
      "B6-C5",
      "B6-C6",
      "A6-B4",
    ]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief/areas.test.ts`
Expected: FAIL: `restClouds is not a function` (and the other new names).

- [ ] **Step 3: Append the states to the lib**

Append to `src/lib/brief/areas.ts`:

```ts
/** What the picture shows: every target at rest, one pair of areas, or one target. */
export type AreaFocus = { kind: "rest" } | { kind: "pair"; pair: AreaPair } | { kind: "target"; id: string };

/** A target's dot: in ink, set back, a partner of the picked target, or the picked target. */
export type TargetInk = "base" | "pale" | "lit" | "focus";

/** Each placed target's point cloud at rest: its number of the side's target pairs. */
export function restClouds(lens: LensAreas, links: SideLinks, side: AreaSide): Map<string, number> {
  const out = new Map<string, number>();
  for (const area of lens.areas) for (const id of area.targets) out.set(id, links[side].get(id)?.length ?? 0);
  return out;
}

/** Each placed target's point cloud now: as at rest; with a pair of areas
 *  open, only its target pairs there (none in the other rows); none around
 *  a picked target. */
export function cloudSizes(lens: LensAreas, links: SideLinks, side: AreaSide, focus: AreaFocus): Map<string, number> {
  if (focus.kind === "rest") return restClouds(lens, links, side);
  const pair = focus.kind === "pair" ? focus.pair : null;
  const out = new Map<string, number>();
  for (const area of lens.areas) {
    const inPair = pair !== null && (area.id === pair.a || area.id === pair.b);
    for (const id of area.targets) out.set(id, inPair && pair ? (pair.involvement.get(id) ?? 0) : 0);
  }
  return out;
}

/** Each area's row with its targets in drawing order: the tallest clouds at
 *  rest first (then document order); in the open pair of areas' two rows,
 *  the tallest clouds of that pair first; around a picked target, the
 *  target, then its partners, then the rest. */
export function rowOrder(
  lens: LensAreas,
  rest: Map<string, number>,
  clouds: Map<string, number>,
  focus: AreaFocus,
  links: SideLinks,
  side: AreaSide,
): { id: string; targets: string[] }[] {
  const picked = focus.kind === "target" ? focus.id : null;
  const partners = picked ? new Set(links[side].get(picked) ?? []) : null;
  const pair = focus.kind === "pair" ? focus.pair : null;
  return lens.areas.map((area) => {
    const index = new Map(area.targets.map((id, i) => [id, i]));
    const byRest = (x: string, y: string) =>
      (rest.get(y) ?? 0) - (rest.get(x) ?? 0) || (index.get(x) ?? 0) - (index.get(y) ?? 0);
    const targets = [...area.targets];
    if (picked && partners) {
      const rank = (id: string) => (id === picked ? 0 : partners.has(id) ? 1 : 2);
      targets.sort((x, y) => rank(x) - rank(y) || byRest(x, y));
    } else if (pair && (area.id === pair.a || area.id === pair.b)) {
      targets.sort((x, y) => (clouds.get(y) ?? 0) - (clouds.get(x) ?? 0) || byRest(x, y));
    } else {
      targets.sort(byRest);
    }
    return { id: area.id, targets };
  });
}

/** "N of M targets" beside a row: its targets taking part in the open pair
 *  of areas, or the picked target's partners in it. None at rest. */
export function rowCounts(lens: LensAreas, focus: AreaFocus, links: SideLinks, side: AreaSide): Map<string, number> {
  const out = new Map<string, number>();
  if (focus.kind === "pair") {
    const { pair } = focus;
    for (const area of lens.areas) {
      if (area.id !== pair.a && area.id !== pair.b) continue;
      out.set(area.id, area.targets.filter((id) => (pair.involvement.get(id) ?? 0) > 0).length);
    }
  } else if (focus.kind === "target") {
    const partners = new Set(links[side].get(focus.id) ?? []);
    for (const area of lens.areas) {
      const count = area.targets.filter((id) => partners.has(id)).length;
      if (count > 0) out.set(area.id, count);
    }
  }
  return out;
}

/** Each placed target's ink in the current state. */
export function targetInks(lens: LensAreas, focus: AreaFocus, links: SideLinks, side: AreaSide): Map<string, TargetInk> {
  const out = new Map<string, TargetInk>();
  const picked = focus.kind === "target" ? focus.id : null;
  const partners = picked ? new Set(links[side].get(picked) ?? []) : null;
  const pair = focus.kind === "pair" ? focus.pair : null;
  for (const area of lens.areas) {
    const inPair = pair !== null && (area.id === pair.a || area.id === pair.b);
    for (const id of area.targets) {
      if (picked) out.set(id, id === picked ? "focus" : partners?.has(id) ? "lit" : "pale");
      else if (pair) out.set(id, inPair ? "base" : "pale");
      else out.set(id, "base");
    }
  }
  return out;
}

/** The picked target's partners on the side: by area (most first, then the
 *  taxonomy's order), those outside the lens, and all of them. */
export function partnersByArea(
  lens: LensAreas,
  links: SideLinks,
  side: AreaSide,
  id: string,
): { areas: { id: string; count: number }[]; outside: number; total: number } {
  const p = placing(lens);
  const partners = links[side].get(id) ?? [];
  const counts = new Map<string, number>();
  let outside = 0;
  for (const other of partners) {
    const area = p.areaOf.get(other);
    if (area) counts.set(area, (counts.get(area) ?? 0) + 1);
    else outside += 1;
  }
  const areas = [...counts.entries()]
    .map(([area, count]) => ({ id: area, count }))
    .sort((x, y) => y.count - x.count || (p.order.get(x.id) ?? 0) - (p.order.get(y.id) ?? 0));
  return { areas, outside, total: partners.length };
}

/** One pair of areas for its panel: the side's target pairs, those of the
 *  most involved targets first, and all the target pairs between the two. */
export function areaPairDetail(
  lens: LensAreas,
  scope: Scope,
  side: AreaSide,
  key: string,
): { rows: ScopedComparison[]; pairs: number } {
  const p = placing(lens);
  const level = sideLevel(side);
  const inPair = scope.comparisons.filter((c) => pairOf(c, p)?.key === key);
  const rows = inPair.filter((c) => c.level === level);
  const involvement = new Map<string, number>();
  for (const c of rows) for (const id of [c.a.id, c.b.id]) involvement.set(id, (involvement.get(id) ?? 0) + 1);
  const busy = (c: ScopedComparison) => Math.max(involvement.get(c.a.id) ?? 0, involvement.get(c.b.id) ?? 0);
  const calm = (c: ScopedComparison) => Math.min(involvement.get(c.a.id) ?? 0, involvement.get(c.b.id) ?? 0);
  const keyOf = (c: ScopedComparison) => `${c.a.id}__${c.b.id}`;
  rows.sort((x, y) => busy(y) - busy(x) || calm(y) - calm(x) || (keyOf(x) < keyOf(y) ? -1 : keyOf(x) > keyOf(y) ? 1 : 0));
  return { rows, pairs: inPair.length };
}
```

- [ ] **Step 4: Run the tests**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief/areas.test.ts`
Expected: PASS (23 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/brief/areas.ts src/lib/brief/areas.test.ts
git commit -m "feat(brief): the policy-area picture's states: clouds, rows, counts, inks"
```

---

### Task 4: The picture's geometry (lib)

**Files:**
- Create: `src/lib/brief/area-layout.ts`
- Test: `src/lib/brief/area-layout.test.ts`

**Interfaces:**
- Produces:
  - `CLOUD_MAX_LINES = 40`
  - `interface AreaFieldRow { id: string; targets: string[] }`
  - `interface AreaFieldLayout { width: number; height: number; pitch: number; per: number; sp: number; lift: number; targetR: number; cloudR: number; rows: { id: string; y: number }[]; at: Map<string, { x: number; y: number }> }`
  - `cloudLines(count: number, per: number): number`
  - `cloudDots(count: number, per: number): { dots: number; cut: boolean }`
  - `layoutAreaField(rows: AreaFieldRow[], restClouds: Map<string, number>, width: number): AreaFieldLayout`
  - `targetAt(layout: AreaFieldLayout, clouds: Map<string, number>, x: number, y: number): string | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/brief/area-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cloudDots, layoutAreaField, targetAt } from "./area-layout";

const ROWS = [
  { id: "r1", targets: ["a", "b"] },
  { id: "r2", targets: ["c"] },
];
const REST = new Map([
  ["a", 4],
  ["b", 0],
  ["c", 0],
]);

describe("layoutAreaField", () => {
  it("sets each row's targets on its line, with room for their clouds above", () => {
    const layout = layoutAreaField(ROWS, REST, 212);
    expect(layout.pitch).toBe(12);
    expect([layout.per, layout.sp]).toEqual([2, 4.6]);
    expect(layout.rows.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(layout.rows[0].y).toBe(0);
    expect(layout.at.get("a")!.x).toBeCloseTo(12);
    expect(layout.at.get("b")!.x).toBeCloseTo(24);
    // Name line 20, gap 8, a cloud of two lines of 4.6, the lift of 4.8.
    expect(layout.at.get("a")!.y).toBeCloseTo(42);
    expect(layout.rows[1].y).toBeCloseTo(70);
    expect(layout.at.get("c")!.y).toBeCloseTo(102.8);
    expect(layout.height).toBeCloseTo(130.8);
  });

  it("takes its row heights from the clouds at rest", () => {
    const flat = layoutAreaField(ROWS, new Map([["a", 0], ["b", 0], ["c", 0]]), 212);
    const tall = layoutAreaField(ROWS, REST, 212);
    expect(tall.rows[1].y - flat.rows[1].y).toBeCloseTo(2 * 4.6);
  });

  it("wraps a long row onto further lines, each with room for its clouds", () => {
    const targets = Array.from({ length: 30 }, (_, i) => `t${i}`);
    const layout = layoutAreaField([{ id: "r", targets }], new Map(targets.map((id) => [id, 0])), 100);
    expect(layout.pitch).toBe(6.5);
    const first = layout.at.get("t0")!;
    const next = layout.at.get("t13")!;
    expect(next.x).toBeCloseTo(first.x);
    expect(next.y - first.y).toBeCloseTo(layout.lift + layout.pitch);
  });

  it("takes three dots a line when two would make the field too tall", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, targets: [`t${i}`] }));
    const layout = layoutAreaField(rows, new Map(rows.map((r) => [r.targets[0], 80])), 212);
    expect(layout.per).toBe(3);
    expect(layout.sp).toBeCloseTo(3.6);
  });
});

describe("cloudDots", () => {
  it("stops a cloud at forty lines and says it is cut", () => {
    expect(cloudDots(80, 2)).toEqual({ dots: 80, cut: false });
    expect(cloudDots(81, 2)).toEqual({ dots: 80, cut: true });
    expect(cloudDots(211, 3)).toEqual({ dots: 120, cut: true });
  });
});

describe("targetAt", () => {
  it("finds the target whose column is under the pointer, its cloud included", () => {
    const layout = layoutAreaField(ROWS, REST, 212);
    expect(targetAt(layout, REST, 12, 40)).toBe("a");
    expect(targetAt(layout, REST, 12, 26)).toBe("a");
    expect(targetAt(layout, REST, 25, 42)).toBe("b");
    expect(targetAt(layout, REST, 12, 10)).toBeNull();
    expect(targetAt(layout, REST, 150, 42)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief/area-layout.test.ts`
Expected: FAIL: `Failed to resolve import "./area-layout"`.

- [ ] **Step 3: Write the geometry**

Create `src/lib/brief/area-layout.ts`:

```ts
/**
 * The policy-area picture's geometry: one row per area, its targets on a
 * line (wrapping onto further lines when the row is long), each target's
 * point cloud above it in lines of two or three dots. Row heights come from
 * the clouds at rest, so opening a pair of areas or picking a target never
 * moves a row.
 */

/** A cloud stops here; a taller one is cut, with its exact count on top. */
export const CLOUD_MAX_LINES = 40;
/** A row's name line, the room under it, and the room after the row. */
const ROW_LABEL = 20;
const ROW_GAP = 8;
const ROW_AFTER = 16;
/** Room kept at the field's two sides. */
const FIELD_PAD = 12;
/** Past this height at two dots a line, clouds take three. */
const FIELD_BUDGET = 720;
/** Spacing of the targets on a row. */
const PITCH_MIN = 6.5;
const PITCH_MAX = 12;

export interface AreaFieldRow {
  id: string;
  /** In drawing order. */
  targets: string[];
}

export interface AreaFieldLayout {
  width: number;
  height: number;
  /** Between two targets on a line. */
  pitch: number;
  /** Cloud dots a line. */
  per: number;
  /** Between two cloud dots. */
  sp: number;
  /** Between a target's dot and the first line of its cloud. */
  lift: number;
  targetR: number;
  cloudR: number;
  /** Each row's top, where its name sits. */
  rows: { id: string; y: number }[];
  /** Each target's dot. */
  at: Map<string, { x: number; y: number }>;
}

export function cloudLines(count: number, per: number): number {
  return Math.min(CLOUD_MAX_LINES, Math.ceil(count / per));
}

/** How many dots a cloud draws, and whether it is cut. */
export function cloudDots(count: number, per: number): { dots: number; cut: boolean } {
  const max = CLOUD_MAX_LINES * per;
  return count > max ? { dots: max, cut: true } : { dots: count, cut: false };
}

export function layoutAreaField(rows: AreaFieldRow[], restClouds: Map<string, number>, width: number): AreaFieldLayout {
  const usable = Math.max(1, width - FIELD_PAD);
  const widest = Math.max(1, ...rows.map((r) => r.targets.length));
  const pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, usable / widest));
  const perLine = Math.max(1, Math.floor(usable / pitch + 1e-6));
  const lift = Math.max(2, pitch * 0.4);
  const tallest = rows.map((r) => Math.max(0, ...r.targets.map((id) => restClouds.get(id) ?? 0)));
  const lines = (r: AreaFieldRow) => Math.max(1, Math.ceil(r.targets.length / perLine));
  const heightWith = (per: number, sp: number) =>
    rows.reduce(
      (h, r, i) => h + ROW_LABEL + ROW_GAP + lines(r) * (cloudLines(tallest[i], per) * sp + lift + pitch) + ROW_AFTER,
      0,
    );
  let per = 2;
  let sp = Math.min(4.6, pitch / 2);
  if (heightWith(per, sp) > FIELD_BUDGET) {
    per = 3;
    sp = Math.min(3.6, pitch / 3);
  }
  const at = new Map<string, { x: number; y: number }>();
  const tops: { id: string; y: number }[] = [];
  let y = 0;
  rows.forEach((r, i) => {
    tops.push({ id: r.id, y });
    // The room each line of targets keeps above it for their clouds.
    const band = cloudLines(tallest[i], per) * sp + lift;
    r.targets.forEach((id, j) => {
      const line = Math.floor(j / perLine);
      at.set(id, {
        x: FIELD_PAD / 2 + (j % perLine) * pitch + pitch / 2,
        y: y + ROW_LABEL + ROW_GAP + band + line * (band + pitch),
      });
    });
    y += ROW_LABEL + ROW_GAP + lines(r) * (band + pitch) + ROW_AFTER;
  });
  return {
    width,
    height: y,
    pitch,
    per,
    sp,
    lift,
    targetR: Math.max(2, pitch * 0.26),
    cloudR: Math.max(0.8, sp * 0.36),
    rows: tops,
    at,
  };
}

/** The target whose column is under a point: from the top of its cloud to
 *  just below its dot. */
export function targetAt(layout: AreaFieldLayout, clouds: Map<string, number>, x: number, y: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const [id, p] of layout.at) {
    const d = Math.abs(x - p.x);
    if (d > layout.pitch / 2) continue;
    const top = p.y - layout.lift - cloudLines(clouds.get(id) ?? 0, layout.per) * layout.sp - 4;
    if (y < top || y > p.y + layout.pitch / 2) continue;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run the tests**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief/area-layout.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/brief/area-layout.ts src/lib/brief/area-layout.test.ts
git commit -m "feat(brief): the policy-area picture's geometry: rows, clouds, the cut, pointer hits"
```

---

### Task 5: The picture (canvas component)

**Files:**
- Create: `src/components/brief/areas/area-field.tsx`
- Test: `src/components/brief/areas/area-field.test.tsx`
- Modify: `src/components/brief/brief.css` (append the field's block)

**Interfaces:**
- Consumes: Task 4's `layoutAreaField`, `cloudDots`, `targetAt`, `CLOUD_MAX_LINES`, `AreaFieldRow`; Task 3's `AreaSide`, `TargetInk`.
- Produces: `AreaField` with props `{ rows: AreaFieldRow[]; restClouds: Map<string, number>; clouds: Map<string, number>; inks: Map<string, TargetInk>; side: AreaSide; rowLabel: (id: string) => ReactNode; marked: ReadonlySet<string>; dimmed: ReadonlySet<string>; pointed: string | null; tipFor: (id: string) => ReactNode; formatCount: (n: number) => string; onPick: (id: string) => void }`. DOM hooks: `.brief-av-field`, `[data-row]` (with `data-marked`, `data-dim`), `[data-cut]`, the tip as `role="presentation"`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/brief/areas/area-field.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { layoutAreaField } from "@/lib/brief/area-layout";
import { AreaField } from "./area-field";

const W = 212;
const saved = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  ctx: HTMLCanvasElement.prototype.getContext,
};

// jsdom lays nothing out: give the field a width and no canvas.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => W });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

afterEach(() => {
  cleanup();
  if (saved.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", saved.w);
  HTMLCanvasElement.prototype.getContext = saved.ctx;
});

const ROWS = [
  { id: "r1", targets: ["a", "b"] },
  { id: "r2", targets: ["c"] },
];
const REST = new Map([
  ["a", 4],
  ["b", 0],
  ["c", 0],
]);

function renderField(overrides: Partial<Parameters<typeof AreaField>[0]> = {}) {
  const onPick = vi.fn();
  const { container } = render(
    <AreaField
      rows={ROWS}
      restClouds={REST}
      clouds={REST}
      inks={new Map()}
      side="apart"
      rowLabel={(id) => `row ${id}`}
      marked={new Set()}
      dimmed={new Set()}
      pointed={null}
      tipFor={(id) => `target ${id}`}
      formatCount={(n) => String(n)}
      onPick={onPick}
      {...overrides}
    />,
  );
  return { onPick, field: container.querySelector(".brief-av-field") as HTMLElement };
}

describe("AreaField", () => {
  it("names every row in the order given, marking and setting back the rows asked for", () => {
    renderField({ marked: new Set(["r2"]), dimmed: new Set(["r1"]) });
    const rows = [...document.querySelectorAll("[data-row]")];
    expect(rows.map((r) => r.textContent)).toEqual(["row r1", "row r2"]);
    expect(rows[1].getAttribute("data-marked")).toBe("true");
    expect(rows[0].getAttribute("data-dim")).toBe("true");
    expect(rows[0].getAttribute("data-marked")).toBeNull();
  });

  it("names the target under the pointer and hands it on when selected", () => {
    const { field, onPick } = renderField();
    const a = layoutAreaField(ROWS, REST, W).at.get("a")!;
    fireEvent.pointerMove(field, { clientX: a.x, clientY: a.y - 2 });
    expect(screen.getByRole("presentation").textContent).toBe("target a");
    fireEvent.click(field, { clientX: a.x, clientY: a.y - 2 });
    expect(onPick).toHaveBeenCalledWith("a");
    fireEvent.pointerLeave(field);
    expect(screen.queryByRole("presentation")).toBeNull();
  });

  it("says the exact count above a cloud cut at its limit", () => {
    const clouds = new Map([
      ["a", 211],
      ["b", 0],
      ["c", 0],
    ]);
    renderField({ restClouds: clouds, clouds });
    expect(document.querySelector('[data-cut="a"]')?.textContent).toBe("211");
    expect(document.querySelector('[data-cut="b"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/components/brief/areas/area-field.test.tsx`
Expected: FAIL: `Failed to resolve import "./area-field"`.

- [ ] **Step 3: Write the component**

Create `src/components/brief/areas/area-field.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import {
  CLOUD_MAX_LINES,
  cloudDots,
  layoutAreaField,
  targetAt,
  type AreaFieldRow,
} from "@/lib/brief/area-layout";
import type { AreaSide, TargetInk } from "@/lib/brief/areas";

/** The picture's inks: targets in ink or set back, clouds in the side's ink. */
const FIELD_INK = {
  base: "#55606e",
  pale: "#dcdfdb",
  apart: "#d2432c",
  reinforce: "#2a7443",
  ring: "#232e3d",
} as const;

/** How long a change of shape takes. */
const MOVE_MS = 850;

interface Pose {
  x: number;
  y: number;
  s: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The policy-area picture: one row per area, a dot per target on the row's
 * line and its point cloud above it. The rows come in drawing order; the
 * clouds and inks say what the reader has chosen, and every change of shape
 * moves the same dots. Pointing at a target gives its tip; selecting it
 * hands it to `onPick`. The list beside the picture carries every way in by
 * keyboard, so the picture is hidden from assistive technology.
 */
export function AreaField({
  rows,
  restClouds,
  clouds,
  inks,
  side,
  rowLabel,
  marked,
  dimmed,
  pointed,
  tipFor,
  formatCount,
  onPick,
}: {
  rows: AreaFieldRow[];
  /** Each target's cloud at rest: the rows' heights. */
  restClouds: Map<string, number>;
  /** Each target's cloud now. */
  clouds: Map<string, number>;
  inks: Map<string, TargetInk>;
  side: AreaSide;
  rowLabel: (id: string) => ReactNode;
  /** Rows whose names the reader points at, in pale yellow. */
  marked: ReadonlySet<string>;
  /** Rows set back while a pair of areas is open. */
  dimmed: ReadonlySet<string>;
  /** A target pointed at beside the picture: ringed. */
  pointed: string | null;
  tipFor: (id: string) => ReactNode;
  formatCount: (n: number) => string;
  onPick: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poses = useRef(new Map<string, Pose>());
  const [width, setWidth] = useState(0);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth((prev) => (prev === el.clientWidth ? prev : el.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => layoutAreaField(rows, restClouds, width), [rows, restClouds, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(layout.width * dpr);
    canvas.height = Math.round(layout.height * dpr);
    const ctx = canvas.getContext("2d");
    const from = new Map(poses.current);
    const to = new Map<string, Pose>();
    for (const [id, at] of layout.at) to.set(id, { x: at.x, y: at.y, s: clouds.get(id) ?? 0 });
    const cloudInk = side === "apart" ? FIELD_INK.apart : FIELD_INK.reinforce;

    const paint = (k: number) => {
      const now = new Map<string, Pose>();
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, layout.width, layout.height);
      }
      for (const [id, end] of to) {
        const start = from.get(id) ?? { x: end.x, y: end.y, s: 0 };
        const pose = {
          x: start.x + (end.x - start.x) * k,
          y: start.y + (end.y - start.y) * k,
          s: start.s + (end.s - start.s) * k,
        };
        now.set(id, pose);
        if (!ctx) continue;
        const { dots, cut } = cloudDots(Math.round(pose.s), layout.per);
        ctx.fillStyle = cloudInk;
        for (let d = 0; d < dots; d++) {
          const col = d % layout.per;
          const line = Math.floor(d / layout.per);
          // Every other dot small: potential misalignment reads without its colour.
          const r = side === "apart" && (col + line) % 2 === 1 ? layout.cloudR * 0.6 : layout.cloudR;
          ctx.beginPath();
          ctx.arc(pose.x + (col - (layout.per - 1) / 2) * layout.sp, pose.y - layout.lift - line * layout.sp, r, 0, Math.PI * 2);
          ctx.fill();
        }
        if (cut) {
          // The break over a cloud stopped at its limit.
          const top = pose.y - layout.lift - CLOUD_MAX_LINES * layout.sp - layout.sp;
          ctx.fillRect(pose.x - (layout.per * layout.sp) / 2, top, layout.per * layout.sp, 1.5);
        }
        const ink = inks.get(id) ?? "base";
        ctx.fillStyle = ink === "pale" ? FIELD_INK.pale : ink === "lit" ? cloudInk : FIELD_INK.base;
        ctx.beginPath();
        ctx.arc(pose.x, pose.y, layout.targetR, 0, Math.PI * 2);
        ctx.fill();
        if (ink === "focus" || id === pointed) {
          ctx.strokeStyle = FIELD_INK.ring;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pose.x, pose.y, layout.targetR + 2.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      poses.current = now;
    };

    const moves = [...to].some(([id, end]) => {
      const start = from.get(id);
      return !start || Math.abs(start.x - end.x) > 0.5 || Math.abs(start.y - end.y) > 0.5 || Math.abs(start.s - end.s) > 0.01;
    });
    const still =
      from.size === 0 ||
      !moves ||
      typeof requestAnimationFrame === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      paint(1);
      return;
    }
    let frame = 0;
    const begin = performance.now();
    const tick = (time: number) => {
      const k = Math.min(1, (time - begin) / MOVE_MS);
      paint(ease(k));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [layout, clouds, inks, side, pointed, width]);

  const hit = (e: { clientX: number; clientY: number; currentTarget: HTMLDivElement }) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    return { id: targetAt(layout, clouds, x, y), x, y };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const { id, x, y } = hit(e);
    setTip(id ? { id, x: Math.min(Math.max(x, 140), Math.max(140, layout.width - 140)), y } : null);
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const { id } = hit(e);
    if (id) onPick(id);
  };

  const cuts = [...layout.at]
    .filter(([id]) => cloudDots(clouds.get(id) ?? 0, layout.per).cut)
    .map(([id, at]) => ({ id, x: at.x, y: at.y - layout.lift - CLOUD_MAX_LINES * layout.sp - layout.sp - 3 }));
  const measured = width > 0;

  return (
    <div
      ref={wrapRef}
      className="brief-av-field"
      data-clickable={tip ? "true" : undefined}
      style={{ height: measured ? layout.height : undefined }}
      onPointerMove={onMove}
      onPointerLeave={() => setTip(null)}
      onClick={onClick}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ width: measured ? layout.width : 0, height: measured ? layout.height : 0 }}
      />
      {measured && (
        <div className="brief-av-labels" aria-hidden="true">
          {layout.rows.map((row) => (
            <div
              key={row.id}
              className="brief-av-row"
              data-row={row.id}
              data-marked={marked.has(row.id) ? "true" : undefined}
              data-dim={dimmed.has(row.id) ? "true" : undefined}
              style={{ transform: `translateY(${row.y}px)` }}
            >
              {rowLabel(row.id)}
            </div>
          ))}
          {cuts.map((cut) => (
            <div key={cut.id} className="brief-av-cut" data-cut={cut.id} style={{ left: cut.x, top: cut.y }}>
              {formatCount(clouds.get(cut.id) ?? 0)}
            </div>
          ))}
        </div>
      )}
      {tip && (
        <div className="brief-tip brief-av-tip" role="presentation" style={{ left: tip.x, top: Math.max(4, tip.y - 64) }}>
          {tipFor(tip.id)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Append the field's styles to `src/components/brief/brief.css`**

```css
/* ── Policy areas: one row per area, a point cloud above each target ─ */

[data-brief] .brief-av-field {
  position: relative;
}

[data-brief] .brief-av-field canvas {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
}

[data-brief] .brief-av-field[data-clickable] {
  cursor: pointer;
}

[data-brief] .brief-av-labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

[data-brief] .brief-av-row {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  max-width: 100%;
  font-size: 0.875rem;
  line-height: 20px;
  white-space: nowrap;
  transition: transform 0.85s cubic-bezier(0.65, 0, 0.35, 1), color 0.3s;
}

[data-brief] .brief-av-name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
}

[data-brief] .brief-av-row[data-marked] .brief-av-name {
  background: var(--brief-highlight);
}

[data-brief] .brief-av-row[data-dim] {
  color: var(--brief-muted);
}

[data-brief] .brief-av-row[data-dim] .brief-av-name {
  font-weight: 400;
}

[data-brief] .brief-av-n {
  color: var(--brief-muted);
  font-variant-numeric: tabular-nums;
}

[data-brief] .brief-av-of {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

[data-brief] .brief-av-of[data-side="apart"] {
  color: var(--brief-red);
}

[data-brief] .brief-av-of[data-side="reinforce"] {
  color: var(--brief-green);
}

[data-brief] .brief-av-cut {
  position: absolute;
  transform: translate(-50%, -100%);
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

[data-brief] .brief-av-tip {
  white-space: normal;
  max-width: 17rem;
}

@media (prefers-reduced-motion: reduce) {
  [data-brief] .brief-av-row {
    transition: none;
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/components/brief/areas/area-field.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/brief/areas/area-field.tsx src/components/brief/areas/area-field.test.tsx src/components/brief/brief.css
git commit -m "feat(brief): the policy-area picture: rows of targets, their point clouds, the cut"
```

---

### Task 6: The component: the right side and the reader's choices

**Files:**
- Create: `src/components/brief/areas/areas-view.tsx`
- Test: `src/components/brief/areas/areas-view.test.tsx`
- Modify: `messages/en.json`, `messages/es.json`, `messages/mn.json` (new `brief.areaView` object)
- Modify: `src/components/brief/brief.css` (append the view's block)

**Interfaces:**
- Consumes: Tasks 2-5; `LONG_TEXT` from `../comparison`; `commitmentLine`, `useNumbers` from `../ink`; message keys `briefing.lens.*`, `brief.hub.exploreTarget`, `brief.hub.openTarget`, `brief.panel.fullText`, `brief.panel.shortText`.
- Produces:
  - `interface AreaPairRef { lens: LensId; key: string; side: AreaSide }`
  - `AreasView` with props `{ source: BriefSource; data: BriefData; lens: LensId | null; onLens: (id: LensId) => void; onExplore?: (id: string) => void; onOpenCommitment?: (id: string) => void; onOpenAreaPair?: (pair: AreaPairRef) => void }`. Root `data-testid="brief-areas"`, `data-tour="brief-areas"`; pair rows `data-testid="brief-area-pair"`; involved targets `data-testid="brief-area-target"`; the card `data-testid="brief-area-card"`.

- [ ] **Step 1: Add the messages**

Run this once (it inserts the same English object into all three catalogs, keeping their formatting):

```bash
python3 - <<'EOF'
import json
KEYS = {
  "kicker": "By policy area",
  "lensGroup": "Policy areas",
  "sideGroup": "Target pairs",
  "sideApart": "Potential misalignment",
  "sideReinforce": "Strong alignment",
  "headlineBetween": "{pct} of the {side, select, apart {potential misalignments} other {strong alignments}} sit between <first>{areaA}</first> targets and <second>{areaB}</second> targets.",
  "headlineWithin": "{pct} of the {side, select, apart {potential misalignments} other {strong alignments}} sit within <first>{areaA}</first> targets.",
  "headlineOutside": "{pct} of the {side, select, apart {potential misalignments} other {strong alignments}} sit between <first>{areaA}</first> targets and targets outside these areas.",
  "headlineNone": "Too few target pairs to compare.",
  "scope": "{placed, number} of the {total, number} targets fall in one of these areas.",
  "within": "Within {area}",
  "outside": "{area} · targets outside these areas",
  "outsideShort": "Targets outside these areas",
  "between": "{areaA} · {areaB}",
  "share": "{pct} of {pairs, number} target pairs",
  "rest": "The other {groups, plural, one {pair of areas} other {# pairs of areas}}: {count, number} of their {pairs, number} target pairs.",
  "rowOf": "{count, number} of {total, number} targets",
  "involved": "{area} targets most involved",
  "seePairs": "See the {count, plural, one {# target pair} other {# target pairs}}",
  "backAll": "All pairs of areas",
  "backTo": "Back to {name}",
  "partners": "{side, select, apart {Potential misalignment with} other {Strongly aligned with}} {count, plural, one {# target} other {# targets}}",
  "partnersIn": "{count, number} in {area}",
  "partnersOutside": "{count, number} outside these areas",
  "tip": "{side, select, apart {potential misalignment with} other {strongly aligned with}} {count, plural, one {# target} other {# targets}}",
  "panelSub": "{count, number} of {pairs, number} target pairs {side, select, apart {show potential misalignment} other {are strongly aligned}}",
  "panelDialog": "Target pairs between policy areas"
}
for locale in ("en", "es", "mn"):
    path = f"messages/{locale}.json"
    data = json.load(open(path, encoding="utf-8"))
    data["brief"]["areaView"] = KEYS
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
EOF
git diff --stat messages/
```

Expected: each catalog gains only the `areaView` block. If the diff shows a whole-file reformat (the catalogs use a different indent), revert with `git checkout -- messages/` and instead insert the block by hand after `"areas": {...}` in `brief`, in each file's own indentation.

- [ ] **Step 2: Write the failing tests**

Create `src/components/brief/areas/areas-view.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { layoutAreaField } from "@/lib/brief/area-layout";
import { lensAreas, restClouds, rowOrder, sideLinks } from "@/lib/brief/areas";
import { scopeOf } from "@/lib/brief/compute";
import { buildBriefData } from "@/lib/brief/data";
import type { BriefSource, LensId } from "@/lib/brief/source";
import { briefFixture } from "@/lib/brief/test-fixture";
import { AreasView } from "./areas-view";

const BASE = briefFixture();
// A second lens, so the choice has two options.
const SOURCE: BriefSource = {
  ...BASE,
  lenses: [
    ...BASE.lenses,
    { id: "ipcc", taxonomyType: "sector", categories: [{ id: "s1", name: "Agriculture" }], primary: { A1: "s1" } },
  ],
};
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), "globe");
const W = 640;

const saved = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  ctx: HTMLCanvasElement.prototype.getContext,
};

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => W });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

afterEach(() => {
  cleanup();
  if (saved.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", saved.w);
  HTMLCanvasElement.prototype.getContext = saved.ctx;
});

type Props = Parameters<typeof AreasView>[0];

function renderView(props: Partial<Props> = {}) {
  const handlers = { onLens: vi.fn(), onExplore: vi.fn(), onOpenAreaPair: vi.fn() };
  const view = (over: Partial<Props>) => (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AreasView source={SOURCE} data={DATA} lens={"globe" as LensId} {...handlers} {...props} {...over} />
    </NextIntlClientProvider>
  );
  const utils = render(view({}));
  return { ...handlers, rerender: (over: Partial<Props>) => utils.rerender(view(over)) };
}

const pairRows = () => screen.getAllByTestId("brief-area-pair");
const row = (id: string) => document.querySelector(`[data-row="${id}"]`) as HTMLElement;
const openSecond = () => fireEvent.click(within(pairRows()[1]).getByRole("button", { expanded: false }));

describe("AreasView", () => {
  it("leads with where the side's target pairs sit, as a number", () => {
    renderView();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "60% of the potential misalignments sit between Agriculture targets and targets outside these areas.",
    );
    expect(screen.getByText("9 of the 18 targets fall in one of these areas.")).toBeTruthy();
  });

  it("lists the pairs of areas that hold the most, the rest summed", () => {
    renderView();
    const [first, second] = pairRows();
    expect(within(first).getByText("Agriculture · targets outside these areas")).toBeTruthy();
    expect(first.querySelector(".brief-av-pair-count")?.textContent).toBe("9");
    expect(within(first).getByText("50% of 18 target pairs")).toBeTruthy();
    expect(within(second).getByText("Agriculture · Water")).toBeTruthy();
    expect(within(second).getByText("33% of 9 target pairs")).toBeTruthy();
    expect(screen.getByText("The other 4 pairs of areas: 0 of their 54 target pairs.")).toBeTruthy();
  });

  it("marks a pair of areas' rows when pointed at, and changes nothing else", () => {
    renderView();
    const head = within(pairRows()[1]).getByRole("button");
    fireEvent.pointerEnter(head);
    expect(row("g2").getAttribute("data-marked")).toBe("true");
    expect(row("g5").getAttribute("data-marked")).toBe("true");
    expect(row("g1").getAttribute("data-marked")).toBeNull();
    expect(document.querySelectorAll(".brief-av-of")).toHaveLength(0);
    fireEvent.pointerLeave(head);
    expect(row("g2").getAttribute("data-marked")).toBeNull();
  });

  it("opens a pair of areas: its rows count the targets taking part, its most involved targets listed", () => {
    const { onOpenAreaPair } = renderView();
    openSecond();
    expect(row("g2").textContent).toContain("1 of 3 targets");
    expect(row("g5").textContent).toContain("3 of 3 targets");
    expect(row("g1").getAttribute("data-dim")).toBe("true");
    expect(screen.getByText("Agriculture targets most involved")).toBeTruthy();
    expect(screen.getByText("Water targets most involved")).toBeTruthy();
    const counts = screen.getAllByTestId("brief-area-target").map((t) => t.querySelector(".brief-av-target-count")?.textContent);
    expect(counts).toEqual(["3", "1", "1", "1"]);
    fireEvent.click(screen.getByRole("button", { name: "See the 3 target pairs" }));
    expect(onOpenAreaPair).toHaveBeenCalledWith({ lens: "globe", key: "g2|g5", side: "apart" });
  });

  it("picks a target from an open pair: its partners counted in every row, the target shown, back to the pair", () => {
    const { onExplore } = renderView();
    openSecond();
    const c1 = screen.getAllByTestId("brief-area-target").find((t) => t.textContent?.includes("Commitment C1"))!;
    fireEvent.click(c1);
    const card = screen.getByTestId("brief-area-card");
    expect(within(card).getByText("1 Commitment C1")).toBeTruthy();
    expect(within(card).getByText("Document C")).toBeTruthy();
    expect(card.textContent).toContain("Potential misalignment with 1 target: 1 in Agriculture.");
    expect(row("g2").textContent).toContain("1 of 3 targets");
    fireEvent.click(within(card).getByRole("button", { name: "Explore this target" }));
    expect(onExplore).toHaveBeenCalledWith("C1");
    fireEvent.click(within(card).getByRole("button", { name: "Back to Agriculture · Water" }));
    expect(screen.queryByTestId("brief-area-card")).toBeNull();
    expect(screen.getAllByTestId("brief-area-target")).toHaveLength(4);
  });

  it("picks a target on the picture, and lets it go on a second pick", () => {
    renderView();
    const lens = lensAreas(SOURCE, DATA.scope, "globe");
    const links = sideLinks(DATA.scope);
    const rest = restClouds(lens, links, "apart");
    const b6 = layoutAreaField(rowOrder(lens, rest, rest, { kind: "rest" }, links, "apart"), rest, W).at.get("B6")!;
    const field = document.querySelector(".brief-av-field") as HTMLElement;
    fireEvent.click(field, { clientX: b6.x, clientY: b6.y });
    const card = screen.getByTestId("brief-area-card");
    expect(within(card).getByText("6 Commitment B6")).toBeTruthy();
    expect(card.textContent).toContain("Potential misalignment with 7 targets: 3 in Water, 4 outside these areas.");
    expect(row("g5").textContent).toContain("3 of 3 targets");
    // B6 already led its row, so it stays where it was.
    fireEvent.click(field, { clientX: b6.x, clientY: b6.y });
    expect(screen.queryByTestId("brief-area-card")).toBeNull();
  });

  it("points from the headline's area names to their rows, and opens their pair", () => {
    renderView();
    const name = within(screen.getByRole("heading", { level: 2 })).getByRole("button", { name: "Agriculture" });
    fireEvent.pointerEnter(name);
    expect(row("g2").getAttribute("data-marked")).toBe("true");
    fireEvent.click(name);
    expect(within(pairRows()[0]).getByRole("button", { expanded: true })).toBeTruthy();
  });

  it("reads strong alignments on request, letting the open pair go", () => {
    renderView();
    openSecond();
    fireEvent.click(screen.getByRole("button", { name: "Strong alignment" }));
    expect(screen.getByRole("button", { name: "Strong alignment" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "28% of the strong alignments sit between Water targets and targets outside these areas.",
    );
    expect(within(pairRows()[0]).getByText("56% of 18 target pairs")).toBeTruthy();
    expect(screen.queryByTestId("brief-area-target")).toBeNull();
  });

  it("offers the lens as a plain choice, the brief's own", () => {
    const { onLens } = renderView();
    expect(screen.getByRole("button", { name: "Biodiversity" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Mitigation sectors" }));
    expect(onLens).toHaveBeenCalledWith("ipcc");
  });

  it("lets an open pair of areas go when the lens changes, for good", () => {
    const { rerender } = renderView();
    openSecond();
    rerender({ lens: "ipcc" });
    expect(screen.queryByTestId("brief-area-target")).toBeNull();
    rerender({ lens: "globe" });
    expect(screen.queryByTestId("brief-area-target")).toBeNull();
  });

  it("says so when the brief holds none of the side's target pairs", () => {
    renderView({ data: buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "C"]), "globe") });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Too few target pairs to compare.");
    expect(screen.queryAllByTestId("brief-area-pair")).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/components/brief/areas/areas-view.test.tsx`
Expected: FAIL: `Failed to resolve import "./areas-view"`.

- [ ] **Step 4: Write the component**

Create `src/components/brief/areas/areas-view.tsx`:

```tsx
"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  areaHeadline,
  areaPairs,
  cloudSizes,
  lensAreas,
  OTHER_AREA,
  partnersByArea,
  restClouds,
  rowCounts,
  rowOrder,
  sideLinks,
  targetInks,
  type AreaFocus,
  type AreaPair,
  type AreaSide,
  type TargetInk,
} from "@/lib/brief/areas";
import type { BriefData } from "@/lib/brief/data";
import type { BriefSource, LensId } from "@/lib/brief/source";
import { LONG_TEXT } from "../comparison";
import { commitmentLine, useNumbers } from "../ink";
import { AreaField } from "./area-field";

const SIDES: AreaSide[] = ["apart", "reinforce"];
/** Targets each area of an open pair lists. */
const INVOLVED_MAX = 3;

/** A pair of areas' target pairs, for the panel. */
export interface AreaPairRef {
  lens: LensId;
  key: string;
  side: AreaSide;
}

/** An area named in the headline: it points at its row and opens its pair. */
function AreaName({
  children,
  onPoint,
  onOpen,
}: {
  children: ReactNode;
  onPoint: (on: boolean) => void;
  onOpen: () => void;
}) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <span
      role="button"
      tabIndex={0}
      className="brief-docname"
      onClick={onOpen}
      onKeyDown={onKey}
      onPointerEnter={() => onPoint(true)}
      onPointerLeave={() => onPoint(false)}
      onFocus={() => onPoint(true)}
      onBlur={() => onPoint(false)}
    >
      {children}
    </span>
  );
}

/**
 * Policy areas on screen: the bar chart of targets per area, each target
 * with its point cloud, beside the pairs of areas the chosen side's target
 * pairs fall between. Pointing marks names; opening a pair of areas or
 * picking a target re-shapes the picture.
 */
export function AreasView({
  source,
  data,
  lens,
  onLens,
  onExplore,
  onOpenCommitment,
  onOpenAreaPair,
}: {
  source: BriefSource;
  data: BriefData;
  lens: LensId | null;
  onLens: (id: LensId) => void;
  /** Puts a target in the ring's centre further down. */
  onExplore?: (id: string) => void;
  onOpenCommitment?: (id: string) => void;
  onOpenAreaPair?: (pair: AreaPairRef) => void;
}) {
  const t = useTranslations("brief.areaView");
  const tl = useTranslations("briefing.lens");
  const th = useTranslations("brief.hub");
  const tp = useTranslations("brief.panel");
  const { n, pct } = useNumbers();
  const active = lens ?? source.lenses[0]?.id ?? null;
  const [side, setSide] = useState<AreaSide>("apart");
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [pointedRows, setPointedRows] = useState<string[]>([]);
  const [pointedTarget, setPointedTarget] = useState<string | null>(null);
  const [fullText, setFullText] = useState(false);
  // A new lens lets the open pair and the picked target go, for good.
  const [seenLens, setSeenLens] = useState(active);
  if (seenLens !== active) {
    setSeenLens(active);
    setOpen(null);
    setPicked(null);
  }

  const areas = useMemo(() => (active ? lensAreas(source, data.scope, active) : null), [source, data.scope, active]);
  const links = useMemo(() => sideLinks(data.scope), [data.scope]);
  const pairs = useMemo(() => (areas ? areaPairs(areas, data.scope, side) : null), [areas, data.scope, side]);
  const placed = useMemo(() => new Set(areas?.areas.flatMap((a) => a.targets) ?? []), [areas]);
  // A choice holds while its pair of areas, or its target, is in the brief.
  const openPair = open ? (pairs?.top.find((p) => p.key === open) ?? null) : null;
  const focusId = picked && placed.has(picked) ? picked : null;
  const focusKey = focusId ? `t:${focusId}` : openPair ? `p:${openPair.key}` : "rest";
  const focus: AreaFocus = focusId
    ? { kind: "target", id: focusId }
    : openPair
      ? { kind: "pair", pair: openPair }
      : { kind: "rest" };
  const rest = useMemo(
    () => (areas ? restClouds(areas, links, side) : new Map<string, number>()),
    [areas, links, side],
  );
  // One picture per lens, side and choice: the field re-forms only when they change.
  /* eslint-disable react-hooks/exhaustive-deps */
  const clouds = useMemo(
    () => (areas ? cloudSizes(areas, links, side, focus) : new Map<string, number>()),
    [areas, links, side, focusKey],
  );
  const rows = useMemo(
    () => (areas ? rowOrder(areas, rest, clouds, focus, links, side) : []),
    [areas, rest, clouds, focusKey],
  );
  const inks = useMemo(
    () => (areas ? targetInks(areas, focus, links, side) : new Map<string, TargetInk>()),
    [areas, links, side, focusKey],
  );
  const counts = useMemo(
    () => (areas ? rowCounts(areas, focus, links, side) : new Map<string, number>()),
    [areas, links, side, focusKey],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  if (!active || !areas || !pairs) return null;

  const area = (id: string) => areas.areas.find((a) => a.id === id);
  const nameOf = (id: string) => area(id)?.name ?? id;
  const pairName = (p: { a: string; b: string }) =>
    p.a === p.b
      ? t("within", { area: nameOf(p.a) })
      : p.b === OTHER_AREA
        ? t("outside", { area: nameOf(p.a) })
        : t("between", { areaA: nameOf(p.a), areaB: nameOf(p.b) });
  const rowsOf = (p: AreaPair) => [...new Set([p.a, p.b])].filter((id) => id !== OTHER_AREA);
  const commitment = (id: string) => data.scope.commitments.find((c) => c.id === id);
  const docName = (doc: string) => data.scope.docs.find((d) => d.id === doc)?.name ?? doc;

  const choose = (next: AreaSide) => {
    setSide(next);
    setOpen(null);
    setPicked(null);
  };
  const toggle = (p: AreaPair) => {
    setOpen(openPair?.key === p.key ? null : p.key);
    setPicked(null);
    setFullText(false);
  };
  const pick = (id: string) => {
    setPicked(focusId === id ? null : id);
    setFullText(false);
  };

  const head = areaHeadline(pairs);
  const lead = pairs.top[0];
  const nameLink = (chunks: ReactNode) =>
    lead ? (
      <AreaName
        onPoint={(on) => setPointedRows(on ? rowsOf(lead) : [])}
        onOpen={() => {
          setOpen(lead.key);
          setPicked(null);
        }}
      >
        {chunks}
      </AreaName>
    ) : (
      chunks
    );
  const headline =
    head.kind === "none"
      ? t("headlineNone")
      : t.rich(
          head.kind === "within" ? "headlineWithin" : head.kind === "outside" ? "headlineOutside" : "headlineBetween",
          {
            pct: pct(head.share),
            side,
            areaA: nameOf(head.a),
            areaB: head.kind === "between" ? nameOf(head.b) : "",
            first: nameLink,
            second: nameLink,
          },
        );

  const card = (back: string) => {
    if (!focusId) return null;
    const c = commitment(focusId);
    if (!c) return null;
    const by = partnersByArea(areas, links, side, focusId);
    const parts = by.areas.slice(0, 3).map((x) => t("partnersIn", { count: x.count, area: nameOf(x.id) }));
    if (by.outside > 0 && parts.length < 3) parts.push(t("partnersOutside", { count: by.outside }));
    const more = by.areas.length + (by.outside > 0 ? 1 : 0) > parts.length;
    const long = c.text.trim().length > LONG_TEXT;
    const openTarget = onExplore ?? onOpenCommitment;
    return (
      <div className="brief-av-card" data-testid="brief-area-card">
        <button type="button" className="brief-av-back" aria-label={t("backTo", { name: back })} onClick={() => setPicked(null)}>
          <span aria-hidden="true">‹ </span>
          {back}
        </button>
        <p className="brief-av-card-title">
          <span>{c.label}</span>
        </p>
        <p className="brief-av-card-doc">{docName(c.doc)}</p>
        {c.text.trim() && c.text.trim() !== c.label && (
          <p className="brief-av-card-text" data-clamped={long && !fullText ? "true" : undefined}>
            {c.text}
          </p>
        )}
        {long && (
          <button type="button" className="brief-av-link" aria-expanded={fullText} onClick={() => setFullText((v) => !v)}>
            {fullText ? tp("shortText") : tp("fullText")}
          </button>
        )}
        <p className="brief-av-card-partners">
          {t("partners", { side, count: by.total })}
          {parts.length > 0 ? `: ${parts.join(", ")}${more ? ", …" : ""}` : ""}.
        </p>
        {openTarget && (
          <button type="button" className="brief-av-link" onClick={() => openTarget(focusId)}>
            {th(onExplore ? "exploreTarget" : "openTarget")}
          </button>
        )}
      </div>
    );
  };

  const involved = (p: AreaPair) => (
    <div className="brief-av-open">
      {rowsOf(p).map((areaId) => {
        const top = (area(areaId)?.targets ?? [])
          .filter((id) => (p.involvement.get(id) ?? 0) > 0)
          .sort((x, y) => (p.involvement.get(y) ?? 0) - (p.involvement.get(x) ?? 0))
          .slice(0, INVOLVED_MAX);
        return (
          <div key={areaId}>
            <h4 className="brief-av-sub">{t("involved", { area: nameOf(areaId) })}</h4>
            <ul className="brief-av-targets">
              {top.map((id) => {
                const c = commitment(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="brief-av-target"
                      data-testid="brief-area-target"
                      onClick={() => pick(id)}
                      onPointerEnter={() => setPointedTarget(id)}
                      onPointerLeave={() => setPointedTarget(null)}
                      onFocus={() => setPointedTarget(id)}
                      onBlur={() => setPointedTarget(null)}
                    >
                      <span className="brief-av-target-name">{c ? commitmentLine(c, 70) : id}</span>
                      <span className="brief-av-target-doc">{c ? docName(c.doc) : ""}</span>
                      <span className="brief-av-target-count">{n(p.involvement.get(id) ?? 0)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {onOpenAreaPair && (
        <button type="button" className="brief-av-link" onClick={() => onOpenAreaPair({ lens: active, key: p.key, side })}>
          {t("seePairs", { count: p.count })}
        </button>
      )}
    </div>
  );

  const rowLabel = (id: string) => {
    const a = area(id);
    if (!a) return null;
    const count = counts.get(id);
    return (
      <>
        <span className="brief-av-name" title={a.acronym ? `${a.name} (${a.acronym})` : undefined}>
          {a.name}
        </span>
        <span className="brief-av-n">{n(a.targets.length)}</span>
        {count !== undefined && (
          <span className="brief-av-of" data-side={side}>
            {t("rowOf", { count, total: a.targets.length })}
          </span>
        )}
      </>
    );
  };
  const tipFor = (id: string) => {
    const c = commitment(id);
    return (
      <>
        <strong>{c ? commitmentLine(c, 90) : id}</strong>
        <br />
        <span className="brief-hub-tip-meta">
          {c ? `${docName(c.doc)} · ` : ""}
          {t("tip", { side, count: links[side].get(id)?.length ?? 0 })}
        </span>
      </>
    );
  };
  const marked = new Set(pointedRows.length > 0 ? pointedRows : openPair && !focusId ? rowsOf(openPair) : []);
  const dimmed = new Set(
    focus.kind === "pair" ? areas.areas.filter((a) => !rowsOf(focus.pair).includes(a.id)).map((a) => a.id) : [],
  );
  const max = pairs.top[0]?.count ?? 1;

  return (
    <div className="brief-av" data-testid="brief-areas" data-tour="brief-areas">
      <div className="brief-av-picture">
        <AreaField
          rows={rows}
          restClouds={rest}
          clouds={clouds}
          inks={inks}
          side={side}
          rowLabel={rowLabel}
          marked={marked}
          dimmed={dimmed}
          pointed={pointedTarget}
          tipFor={tipFor}
          formatCount={n}
          onPick={pick}
        />
      </div>
      <div className="brief-av-side">
        <p className="brief-hub-kicker">{t("kicker")}</p>
        <h2 className="brief-hub-headline" tabIndex={-1}>
          {headline}
        </h2>
        <p className="brief-av-choice" role="group" aria-label={t("lensGroup")}>
          {source.lenses.map((l) => (
            <button key={l.id} type="button" aria-pressed={l.id === active} onClick={() => onLens(l.id)}>
              {tl(l.id)}
            </button>
          ))}
        </p>
        <p className="brief-av-choice" role="group" aria-label={t("sideGroup")}>
          {SIDES.map((s) => (
            <button key={s} type="button" aria-pressed={s === side} onClick={() => choose(s)}>
              <span className="brief-av-glyph" data-side={s} aria-hidden="true" />
              {t(s === "apart" ? "sideApart" : "sideReinforce")}
            </button>
          ))}
        </p>
        {areas.placed < areas.total && (
          <p className="brief-av-scope">{t("scope", { placed: areas.placed, total: areas.total })}</p>
        )}
        {focusId && !openPair && card(t("backAll"))}
        {pairs.top.length > 0 && (
          <ol className="brief-av-pairs">
            {pairs.top.map((p) => {
              const isOpen = openPair?.key === p.key;
              return (
                <li key={p.key} className="brief-av-pair" data-testid="brief-area-pair" data-open={isOpen ? "true" : undefined}>
                  <button
                    type="button"
                    className="brief-av-pair-head"
                    aria-expanded={isOpen}
                    onClick={() => toggle(p)}
                    onPointerEnter={() => setPointedRows(rowsOf(p))}
                    onPointerLeave={() => setPointedRows([])}
                    onFocus={() => setPointedRows(rowsOf(p))}
                    onBlur={() => setPointedRows([])}
                  >
                    <span className="brief-av-pair-name">{pairName(p)}</span>
                    <span className="brief-av-pair-bar" data-side={side} aria-hidden="true">
                      <span style={{ width: `${((p.count / max) * 100).toFixed(1)}%` }} />
                    </span>
                    <span className="brief-av-pair-count">{n(p.count)}</span>
                    <span className="brief-av-pair-share">{t("share", { pct: pct(p.count / p.pairs), pairs: p.pairs })}</span>
                  </button>
                  {isOpen && (focusId ? card(pairName(p)) : involved(p))}
                </li>
              );
            })}
          </ol>
        )}
        {pairs.rest.groups > 0 && (
          <p className="brief-av-rest">
            {t("rest", { groups: pairs.rest.groups, count: pairs.rest.count, pairs: pairs.rest.pairs })}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Append the view's styles to `src/components/brief/brief.css`**

```css
/* The component: the picture beside its headline, choices and list. The
   list side stays in view beside a tall picture. */
[data-brief] .brief-av {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr);
  gap: clamp(1.5rem, 3.2vw, 3.5rem);
  align-items: start;
}

[data-brief] .brief-av-side {
  position: sticky;
  top: 1.25rem;
  min-width: 0;
}

[data-brief] .brief-av-choice {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.1rem;
  margin: 0 0 0.75rem;
}

[data-brief] .brief-av-choice button {
  padding: 0 0 2px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--brief-ink);
  font: inherit;
  font-size: 0.9375rem;
  cursor: pointer;
}

[data-brief] .brief-av-choice button[aria-pressed="true"] {
  border-bottom-color: var(--brief-ink);
  font-weight: 600;
}

[data-brief] .brief-av-glyph {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 0.4rem;
}

[data-brief] .brief-av-glyph[data-side="apart"] {
  background: var(--brief-red);
}

[data-brief] .brief-av-glyph[data-side="reinforce"] {
  background: var(--brief-green);
}

[data-brief] .brief-av-scope {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
  color: var(--brief-muted);
}

[data-brief] .brief-av-pairs {
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
}

[data-brief] .brief-av-pair {
  border-top: 1px solid var(--brief-hairline);
}

[data-brief] .brief-av-pair-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 5.5rem 2.75rem;
  gap: 0.1rem 0.65rem;
  align-items: center;
  width: 100%;
  padding: 0.55rem 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

[data-brief] .brief-av-pair-name {
  font-weight: 600;
}

[data-brief] .brief-av-pair-head:hover .brief-av-pair-name,
[data-brief] .brief-av-pair-head:focus-visible .brief-av-pair-name,
[data-brief] .brief-av-pair[data-open] .brief-av-pair-name {
  background: var(--brief-highlight);
}

[data-brief] .brief-av-pair-bar {
  position: relative;
  height: 8px;
  background: #efefec;
}

[data-brief] .brief-av-pair-bar > span {
  position: absolute;
  inset: 0 auto 0 0;
}

[data-brief] .brief-av-pair-bar[data-side="apart"] > span {
  background: var(--brief-red);
}

[data-brief] .brief-av-pair-bar[data-side="reinforce"] > span {
  background: var(--brief-green);
}

[data-brief] .brief-av-pair-count {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

[data-brief] .brief-av-pair-share {
  grid-column: 1 / -1;
  font-size: 0.8125rem;
  color: var(--brief-muted);
}

[data-brief] .brief-av-open {
  padding: 0 0 0.75rem;
}

[data-brief] .brief-av-sub {
  margin: 0.6rem 0 0.2rem;
  font-size: 0.8125rem;
  font-weight: 700;
}

[data-brief] .brief-av-targets {
  margin: 0;
  padding: 0;
  list-style: none;
}

[data-brief] .brief-av-target {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 1.75rem;
  gap: 0.6rem;
  width: 100%;
  padding: 0.15rem 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}

[data-brief] .brief-av-target:hover .brief-av-target-name,
[data-brief] .brief-av-target:focus-visible .brief-av-target-name {
  background: var(--brief-highlight);
}

[data-brief] .brief-av-target-doc {
  color: var(--brief-muted);
}

[data-brief] .brief-av-target-count {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

[data-brief] .brief-av-link,
[data-brief] .brief-av-back {
  margin: 0.5rem 1rem 0 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

[data-brief] .brief-av-link {
  color: var(--brief-blue);
}

[data-brief] .brief-av-back {
  margin-top: 0.35rem;
  color: var(--brief-muted);
}

[data-brief] .brief-av-card {
  padding: 0 0 0.75rem;
}

[data-brief] .brief-av-card-title {
  margin: 0.35rem 0 0;
  font-weight: 700;
}

[data-brief] .brief-av-card-title > span {
  background: var(--brief-highlight);
}

[data-brief] .brief-av-card-doc {
  margin: 0 0 0.25rem;
  font-size: 0.8125rem;
  color: var(--brief-muted);
}

[data-brief] .brief-av-card-text {
  margin: 0;
  font-size: 0.875rem;
}

[data-brief] .brief-av-card-text[data-clamped] {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

[data-brief] .brief-av-card-partners {
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
}

[data-brief] .brief-av-rest {
  margin: 0;
  padding: 0.55rem 0;
  border-top: 1px solid var(--brief-hairline);
  font-size: 0.8125rem;
  color: var(--brief-muted);
}

@media screen and (max-width: 820px) {
  [data-brief] .brief-av {
    grid-template-columns: minmax(0, 1fr);
  }

  [data-brief] .brief-av-side {
    position: static;
  }
}
```

- [ ] **Step 6: Run the tests, the copy rules and the locale parity**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/components/brief/areas src/components/brief/copy.test.ts`
Expected: PASS (13 view and field tests, the copy rules). Then `npx tsc --noEmit -p .` (expected: no output).

- [ ] **Step 7: Commit**

```bash
git add src/components/brief/areas/areas-view.tsx src/components/brief/areas/areas-view.test.tsx src/components/brief/brief.css messages/en.json messages/es.json messages/mn.json
git commit -m "feat(brief): policy areas explorable: the pairs of areas beside the picture, a pair or a target at a time"
```

---

### Task 7: The target pairs of a pair of areas (panel)

**Files:**
- Modify: `src/components/brief/panels.tsx` (a `PanelState` kind, `keyOf`, the dialog label, `AreaPairPanel`, the render switch)
- Test: `src/components/brief/panels.test.tsx`

**Interfaces:**
- Consumes: Task 3's `lensAreas`, `areaPairDetail`, `OTHER_AREA`, `AreaSide`; `LensId`.
- Produces: `PanelState` gains `{ kind: "areaPair"; lens: LensId; key: string; side: AreaSide }`; rows `data-testid="brief-areapair-row"`, names `data-testid="brief-areapair-area"`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("BriefPanels", ...)` in `src/components/brief/panels.test.tsx`:

```tsx
  it("lists a pair of policy areas' target pairs, each a way to its comparison", () => {
    const { onPush } = renderPanels([{ kind: "areaPair", lens: "globe", key: "g2|g5", side: "apart" }]);
    expect(screen.getAllByTestId("brief-areapair-area").map((n) => n.textContent)).toEqual(["Agriculture", "Water"]);
    expect(screen.getByText("3 of 9 target pairs show potential misalignment")).toBeTruthy();
    const rows = screen.getAllByTestId("brief-areapair-row");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("6 Commitment B6");
    expect(rows[0].textContent).toContain("1 Commitment C1");
    fireEvent.click(within(rows[0]).getByRole("button"));
    expect(onPush).toHaveBeenCalledWith({ kind: "pair", a: "B6", b: "C1" });
  });

  it("puts the area's own target first when its partner sits outside the lens", () => {
    renderPanels([{ kind: "areaPair", lens: "globe", key: "g2|__other", side: "apart" }]);
    expect(screen.getAllByTestId("brief-areapair-area").map((n) => n.textContent)).toEqual([
      "Agriculture",
      "Targets outside these areas",
    ]);
    const first = screen.getAllByTestId("brief-areapair-row")[0];
    expect(first.querySelectorAll(".brief-panel-cell")[0].textContent).toContain("Commitment B5");
    expect(first.querySelectorAll(".brief-panel-cell")[1].textContent).toContain("Commitment A6");
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/components/brief/panels.test.tsx`
Expected: FAIL: TypeScript/runtime error on the unknown panel kind; no `brief-areapair-area`.

- [ ] **Step 3: Add the panel**

In `src/components/brief/panels.tsx`:

1. Imports: add `import { areaPairDetail, lensAreas, OTHER_AREA, type AreaSide } from "@/lib/brief/areas";` and extend the source import to `import type { BriefCommitment, BriefDocument, BriefSource, LensId } from "@/lib/brief/source";`.
2. Extend the union:

```ts
export type PanelState =
  | { kind: "pair"; a: string; b: string }
  | { kind: "docPair"; a: string; b: string }
  | { kind: "commitment"; id: string }
  | { kind: "theme"; type: "reinforcement" | "friction"; name: string }
  | { kind: "areaPair"; lens: LensId; key: string; side: AreaSide };
```

3. In `keyOf`, before `default:` add:

```ts
    case "areaPair":
      return `area:${p.lens}:${p.side}:${p.key}`;
```

4. Above `export function BriefPanels`, add:

```tsx
/** A pair of policy areas: the side's target pairs between them, those of
 *  the most involved targets first, each a way to its comparison. The
 *  area's own target stands on the left. */
function AreaPairPanel({
  data,
  source,
  lens,
  pairKey,
  side,
  onOpenPair,
}: {
  data: BriefData;
  source: BriefSource;
  lens: LensId;
  pairKey: string;
  side: AreaSide;
  onOpenPair: (aId: string, bId: string) => void;
}) {
  const t = useTranslations("brief.areaView");
  const tp = useTranslations("brief.panel");
  const [all, setAll] = useState(false);
  const areas = useMemo(() => lensAreas(source, data.scope, lens), [source, data.scope, lens]);
  const detail = useMemo(() => areaPairDetail(areas, data.scope, side, pairKey), [areas, data.scope, side, pairKey]);
  const areaOf = useMemo(
    () => new Map(areas.areas.flatMap((x) => x.targets.map((id) => [id, x.id] as [string, string]))),
    [areas],
  );
  const [a, b] = pairKey.split("|");
  const nameOf = (id: string) => areas.areas.find((x) => x.id === id)?.name ?? id;
  const docName = (doc: string) => data.scope.docs.find((d) => d.id === doc)?.name ?? doc;
  const shown = all ? detail.rows : detail.rows.slice(0, LIST_PREVIEW);
  const cell = (c: BriefCommitment) => (
    <span className="brief-panel-cell">
      <span className="brief-panel-row-doc">{docName(c.doc)} · </span>
      {commitmentLine(c)}
    </span>
  );
  return (
    <>
      <DrawerHeader>
        <h2 className="brief-panel-title brief-panel-title-pair">
          {a === b ? (
            t("within", { area: nameOf(a) })
          ) : (
            <>
              <span className="brief-panel-pairdoc" data-testid="brief-areapair-area">
                {nameOf(a)}
              </span>
              <span className="brief-sr-only"> {tp("and")} </span>
              <span className="brief-panel-pairdoc" data-testid="brief-areapair-area">
                {b === OTHER_AREA ? t("outsideShort") : nameOf(b)}
              </span>
            </>
          )}
        </h2>
        <p className="brief-panel-sub">{t("panelSub", { count: detail.rows.length, pairs: detail.pairs, side })}</p>
      </DrawerHeader>
      <div className="brief-panel-body">
        <ol className="brief-panel-rows brief-panel-pairrows">
          {shown.map((c) => {
            const [left, right] = areaOf.get(c.a.id) === a ? [c.a, c.b] : [c.b, c.a];
            return (
              <li key={`${c.a.id}__${c.b.id}`} className="brief-panel-row" data-testid="brief-areapair-row">
                <button type="button" onClick={() => onOpenPair(c.a.id, c.b.id)}>
                  <span className={`brief-panel-mark brief-panel-mark-${side}`} aria-hidden="true" />
                  {cell(left)}
                  {cell(right)}
                </button>
              </li>
            );
          })}
        </ol>
        {!all && detail.rows.length > LIST_PREVIEW && (
          <button type="button" className="brief-panel-more brief-panel-show-all" onClick={() => setAll(true)}>
            {tp("showAll", { count: detail.rows.length })}
          </button>
        )}
      </div>
    </>
  );
}
```

5. In `BriefPanels`, make the dialog label cover the new kind:

```tsx
  const ta = useTranslations("brief.areaView");
  const dialogLabel =
    top.kind === "pair"
      ? t("pairDialog")
      : top.kind === "areaPair"
        ? ta("panelDialog")
        : top.kind === "theme"
          ? t("themeDialog", { name: top.name })
          : top.kind === "commitment"
            ? t("commitmentDialog", {
                label: data.scope.commitments.find((c) => c.id === top.id)?.label ?? top.id,
              })
            : t("docPairDialog", {
                docA: data.scope.docs.find((d) => d.id === top.a)?.name ?? top.a,
                docB: data.scope.docs.find((d) => d.id === top.b)?.name ?? top.b,
              });
```

(the `ta` hook goes next to the existing `const t = useTranslations("brief.panel");`, before the early `return null`), and add to the render switch:

```tsx
      {top.kind === "areaPair" && (
        <AreaPairPanel
          key={keyOf(top)}
          data={data}
          source={source}
          lens={top.lens}
          pairKey={top.key}
          side={top.side}
          onOpenPair={openPair}
        />
      )}
```

- [ ] **Step 4: Run the tests**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/components/brief/panels.test.tsx && npx tsc --noEmit -p .`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/components/brief/panels.tsx src/components/brief/panels.test.tsx
git commit -m "feat(brief): a pair of policy areas opens its target pairs, each a way to its comparison"
```

---

### Task 8: Into the brief: screen, the shared lens, the walkthrough

**Files:**
- Modify: `src/components/brief/brief-app.tsx` (render `AreasView` for "areas" on screen)
- Modify: `src/components/dashboard/coherence-briefing/tour/steps.ts` (a stop)
- Modify: `messages/en.json`, `messages/es.json`, `messages/mn.json` (`briefing.tour.brief.steps.areas`)
- Test: `src/components/brief/brief-app.test.tsx`

**Interfaces:**
- Consumes: Task 6's `AreasView`, `AreaPairRef`; Task 7's panel kind; `BriefApp`'s `update`, `exploreTarget`, `handlers`, `setPanels`.

- [ ] **Step 1: Write the failing tests**

In `src/components/brief/brief-app.test.tsx`:

- in `"walks through the overview on screen, never the print pages"`, insert `"By policy area",` between `"Documents side by side",` and `"Customize the brief",`;
- append inside `describe("BriefApp screen and print", ...)`:

```tsx
  it("shows the policy areas as the component after the overview", () => {
    renderApp(briefFixture({ themes: true }));
    const hub = screen.getByTestId("brief-hub");
    const areas = screen.getByTestId("brief-areas");
    expect(hub.compareDocumentPosition(areas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(areas).getByRole("heading", { level: 2 }).textContent).toContain("of the potential misalignments sit");
  });

  it("keeps the menu's policy areas and the component's choice as one", () => {
    const base = briefFixture();
    const source = {
      ...base,
      lenses: [
        ...base.lenses,
        { id: "ipcc" as const, taxonomyType: "sector", categories: [{ id: "s1", name: "Agriculture" }], primary: { A1: "s1" } },
      ],
    };
    renderApp(source);
    const areas = screen.getByTestId("brief-areas");
    fireEvent.click(within(areas).getByRole("button", { name: "Mitigation sectors" }));
    expect((screen.getByRole("radio", { name: "Mitigation sectors" }) as HTMLInputElement).checked).toBe(true);
    expect(window.location.search).toContain("lens=ipcc");
    fireEvent.click(screen.getByRole("radio", { name: "Biodiversity" }));
    expect(within(areas).getByRole("button", { name: "Biodiversity" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens a pair of policy areas' target pairs in a panel", () => {
    renderApp(briefFixture({ themes: true }));
    const areas = screen.getByTestId("brief-areas");
    const second = within(areas).getAllByTestId("brief-area-pair")[1];
    fireEvent.click(within(second).getByRole("button", { expanded: false }));
    fireEvent.click(within(areas).getByRole("button", { name: "See the 3 target pairs" }));
    expect(screen.getByRole("dialog", { name: "Target pairs between policy areas" })).toBeTruthy();
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/components/brief/brief-app.test.tsx`
Expected: FAIL: no `brief-areas` test id (the screen still shows the bars), no "By policy area" stop.

- [ ] **Step 3: Mount the component**

In `src/components/brief/brief-app.tsx`, add `import { AreasView } from "./areas/areas-view";` and replace the `Flow`'s `renderSection` prop with:

```tsx
            renderSection={(id) =>
              id === "areas" ? (
                <AreasView
                  source={source}
                  data={data}
                  lens={selection.lens}
                  onLens={(next) => update({ ...selection, lens: next })}
                  onExplore={explore ? exploreTarget : undefined}
                  onOpenCommitment={handlers.onOpenCommitment}
                  onOpenAreaPair={(pair) => setPanels([{ kind: "areaPair", ...pair }])}
                />
              ) : (
                <SectionView id={id} variant="screen" data={data} lensName={lensName} handlers={handlers} />
              )
            }
```

- [ ] **Step 4: Add the walkthrough stop**

In `src/components/dashboard/coherence-briefing/tour/steps.ts`, in `brief:`, after the `documents` stop:

```ts
    { id: "areas", target: "brief-areas", placement: "top" },
```

Add the copy to all three catalogs:

```bash
python3 - <<'EOF'
import json
STEP = {
  "title": "By policy area",
  "body": "Each row is one policy area of the chosen lens, with a dot for each of its targets. Above each target, one dot for each target pair it takes part in on the chosen side: potential misalignment or strong alignment. The list beside it names the pairs of policy areas that hold the most of them; opening one keeps only its target pairs, and selecting a target shows its partners in every row."
}
for locale in ("en", "es", "mn"):
    path = f"messages/{locale}.json"
    data = json.load(open(path, encoding="utf-8"))
    data["briefing"]["tour"]["brief"]["steps"]["areas"] = STEP
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
EOF
git diff --stat messages/
```

Expected: only the new `areas` step per catalog (same reformat check as Task 6 Step 1).

- [ ] **Step 5: Run the brief suites and the type check**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief src/components/brief && npx tsc --noEmit -p .`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/components/brief/brief-app.tsx src/components/brief/brief-app.test.tsx src/components/dashboard/coherence-briefing/tour/steps.ts messages/en.json messages/es.json messages/mn.json
git commit -m "feat(brief): the policy areas on screen, one lens with the menu, a walkthrough stop"
```

---

### Task 9: Verify, and hand over

**Files:**
- Modify: `EXPERIMENT_HANDOFF.md` (round 12 section)
- Modify (outside the repo): `~/.claude/projects/-Users-jonas-github-cpc-tracker/memory/project_finding_cards_experiment.md`

- [ ] **Step 1: Full suite, types, lint**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run`
Expected: all pass (about 1,500; 1 skipped). Report any failure by name.

Run: `npx tsc --noEmit -p . && npx eslint src/lib/brief/areas.ts src/lib/brief/area-layout.ts src/components/brief/areas src/components/brief/panels.tsx src/components/brief/brief-app.tsx`
Expected: no output.

- [ ] **Step 2: Every country renders the component**

With the dev server on port 3100 (`pnpm dev -p 3100` if it is not running):

```bash
for c in mongolia panama sri-lanka cote-divoire; do
  printf "%s " "$c"; curl -s "http://localhost:3100/$c/brief" | grep -c 'data-testid="brief-areas"'
done
```

Expected: `1` for each country (HTTP 200, the component in the page).

- [ ] **Step 3: The standard brief prints on 4 pages**

```bash
pnpm build && (npx next start -p 3101 &) && sleep 8
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --virtual-time-budget=8000 --print-to-pdf=/tmp/brief-mongolia.pdf "http://localhost:3101/mongolia/brief"
python3 -c "import re;print(len(re.findall(rb'/Type\s*/Page[^s]', open('/tmp/brief-mongolia.pdf','rb').read())))"
```

Expected: `4`. Stop the production server afterwards (`lsof -ti tcp:3101 | xargs kill`).

- [ ] **Step 4: Hand over**

Add a "Round 12" section to `EXPERIMENT_HANDOFF.md` after round 11: what Jonas asked (screen toggles; explorable policy areas), the four sketch rounds and their verdicts, the rulings (numbers never words; full area names; the cut at 40 lines, visible; in the standard brief, 4 printed pages; the menu's lens stays for now), what was built (files as in this plan), verification figures from Steps 1-3, and the open items (the print version of the component; es/mn translations; the menu's policy-area choice can go once the component prints; the pipeline's `sectorSynthesis` in the panel; areas holding no target).

Append a matching "Round 12 (2026-09-28)" paragraph to the memory file `project_finding_cards_experiment.md`.

- [ ] **Step 5: Commit**

```bash
git add EXPERIMENT_HANDOFF.md
git commit -m "docs(handoff): round 12, policy areas explorable"
```
