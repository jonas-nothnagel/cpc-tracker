# Coherence brief round 10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The overview reads as one deep dive (overall, map, each side's own landscape, one document), with single targets handed to the Explore ring and one comparison design for panel and ring.

**Architecture:** The map stage of `layoutHub` gains a `side`: only that side's pairs, each document's targets re-sorted so the side's targets come first, and named marks for them. The canvas draws the map as crisp squares with opaque tints on pale document-pair squares. The hub drops its target stage; list rows and marks focus a target's row and column on the map, and a selected row hands the target to the ring through `BriefApp`'s explore reducer. A shared `Comparison` component renders two targets on one rating line.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript, canvas 2D, next-intl, vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-25-coherence-brief-round10-design.md`

## Global Constraints

- Work only in the worktree `/Users/jonas/github/cpc-tracker/.claude/worktrees/coherence-pulse`, branch `experiment/coherence-pulse`; never push.
- A parallel session commits Explore work to the same branch: re-read `messages/*.json`, `tour/steps.ts`, `explore/*` right before editing them; stage only own hunks.
- Copy: no em dashes; "target pairs", "aligned", "potential misalignment"; never "flagged", "tension", "contradiction", "commitment" in UI copy; controls stay plain text.
- Green and red never carry meaning by colour alone where both appear (dash, texture, position or a word as well).
- No text faded to fit; clamp with a visible ellipsis and a way to read the rest.
- es/mn: English placeholders for new or rewritten strings.
- Run tests as `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run <paths>`.

## Review Focus

1. A selection where a side has no pairs (no potential misalignment, or no strong alignment): the side's step must not crash and the map shows empty squares. Test in Task 1 (layout) and Task 3 (step renders its empty headline).
2. A target focused that is not among the named marks (row 7 of a list): it still gets its mark and its pairs forward. Test in Task 1.
3. Changing the document selection while a target is picked or a rating preview is on: stale ids fall back (no mark, top emphasis). Test in Task 3.
4. Very small documents (1-3 targets) and many documents (12): marks and names stay inside the field and apart. Test in Task 1.
5. A comparison whose AI explanation has several sentences or none, and texts much longer than the clamp. Test in Task 5.

---

### Task 1: Side landscapes on the map (library)

**Files:**
- Modify: `src/lib/brief/hub.ts`
- Test: `src/lib/brief/hub.test.ts`

**Interfaces:**
- Produces:
  - `type MapFocus = {kind:"top"} | {kind:"theme";index:number} | {kind:"mechanism";mechanism:AlignmentMechanism} | {kind:"doc";doc:string} | {kind:"target";id:string}`
  - `type HubStage = {kind:"overview"} | {kind:"map"; side?: HubTone; tone?: Tone; focus?: MapFocus} | {kind:"doc"; doc:string}` (the `target` stage is removed)
  - `interface HubMark { id: string; doc: string; count: number; x: number; y: number; labelX: number; labelY: number; labelWidth: number }`
  - `HubLayout.marks: HubMark[]`, `HubLayout.pitch: number` (cell size on the map, 0 elsewhere), `HubAxis.lead: {x:number;y:number} | null`
  - `sideLevel(side: HubTone): AlignmentLevel`, `namedTargets(data: BriefData, side: HubTone): string[]`, `NAMED_MAX = 8`
  - `ZOOM_DEEP` removed.

- [ ] **Step 1: Write the failing tests** (replace the target-stage tests and the "brought forward" block in `hub.test.ts`):

```ts
describe("a side of the map", () => {
  const apart = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, particles, DATA, 800, 500);
  const flagged = (p: HubParticle) => p.level === "flagged";

  it("shows only the side's pairs, and keeps a square for every pair of documents", () => {
    expect(visibleCount(apart)).toBe(15);
    particles.forEach((p, i) => expect(apart.visible[i]).toBe(flagged(p) ? 1 : 0));
    expect(apart.groups.map((g) => [g.key, g.count])).toEqual([["A<->B", 36], ["A<->C", 36], ["B<->C", 36]]);
  });

  it("puts the side's targets first in their document, so its pairs gather in the corner", () => {
    // B6 carries 12 potential misalignments, A6 6: each leads its document.
    const plain = layoutHub({ kind: "map" }, particles, DATA, 800, 500);
    const i = particles.findIndex((p) => p.ca === "A6" && p.cb === "B6");
    const corner = particles.findIndex((p) => p.ca === "A1" && p.cb === "B1");
    expect(apart.y[i]).toBeCloseTo(plain.y[corner]);
    expect(apart.x[i]).toBeCloseTo(plain.x[corner]);
  });

  it("names the targets that carry it, with their counts, at the front of their document", () => {
    expect(apart.marks.map((m) => [m.id, m.count])).toEqual([["A6", 6], ["B6", 12]]);
    for (const m of apart.marks) {
      const axis = apart.axis.find((a) => a.key === m.doc)!;
      expect(m.y).toBeCloseTo(axis.square.y0 + apart.pitch / 2);
      expect(m.labelY).toBeGreaterThan(axis.labelY);
      expect(m.labelX).toBeLessThanOrEqual(axis.square.x0);
    }
  });

  it("at rest: the named targets' pairs full, the side's other pairs paler", () => {
    particles.forEach((p, i) => {
      if (!flagged(p)) return;
      const named = ["A6", "B6"].includes(p.ca) || ["B6", "A6"].includes(p.cb);
      expect(apart.alpha[i]).toBe(named ? 1 : MAP_MID);
    });
  });

  it("one target: its row and column forward, even when the side does not name it", () => {
    const one = layoutHub({ kind: "map", side: "apart", focus: { kind: "target", id: "C5" } }, particles, DATA, 800, 500);
    particles.forEach((p, i) => {
      if (!flagged(p)) return;
      expect(one.alpha[i]).toBe(p.ca === "C5" || p.cb === "C5" ? 1 : MAP_BACK);
    });
    expect(one.marks.map((m) => m.id)).toContain("C5");
  });

  it("alignment: the strong alignments only, named by the side's list when its headline names many", () => {
    const strong = layoutHub({ kind: "map", side: "reinforce", focus: { kind: "top" } }, particles, DATA, 800, 500);
    particles.forEach((p, i) => expect(strong.visible[i]).toBe(p.level === "high" ? 1 : 0));
    expect(strong.marks.map((m) => m.id)).toEqual(namedTargets(DATA, "reinforce"));
  });

  it("a side with no pairs: every square empty, nothing named", () => {
    const calm = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "C"]), null);
    const empty = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, hubParticles(calm), calm, 800, 500);
    expect(visibleCount(empty)).toBe(0);
    expect(empty.groups).toHaveLength(1);
    expect(empty.marks).toEqual([]);
  });

  it("draws each pair as a square the size of its cell", () => {
    const shown = particles.findIndex((_, i) => apart.visible[i]);
    expect(2 * apart.r[shown]).toBeCloseTo(apart.pitch);
  });
});

it("a rating brought forward on the map: its pairs full, the rest faint", () => {
  const layout = layoutHub({ kind: "map", tone: "apart" }, particles, DATA, 800, 500);
  particles.forEach((p, i) => expect(layout.alpha[i]).toBe(p.level === "flagged" ? 1 : MAP_FAINT));
});
```

Also: keep the theme, mechanism and document tests but written with `side` (`{ kind: "map", side: "reinforce", focus: { kind: "theme", index: 0 } }` expects the theme's strong pairs at 1 and the other strong pairs at `MAP_BACK`); a 12-document corpus test that marks and names stay inside the field and do not overlap; drop the target-stage tests (the doc-stage tests stay).

- [ ] **Step 2: Run to verify they fail**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief/hub.test.ts`
Expected: FAIL (no `side`, `marks`, `pitch`, `namedTargets`).

- [ ] **Step 3: Implement**

Key pieces in `hub.ts`:

```ts
export const NAMED_MAX = 8;
export function sideLevel(side: HubTone): AlignmentLevel {
  return side === "apart" ? "flagged" : "high";
}
/** The targets a side names on the map: the headline's when they are few
 *  enough to name, otherwise the first of the side's list. */
export function namedTargets(data: BriefData, side: HubTone): string[] {
  const c = side === "apart" ? data.concentration : data.strongConcentration;
  if (c.concentrated && c.top.length > 0 && c.top.length <= NAMED_MAX) return c.top;
  const list = side === "apart" ? data.commitments.map((r) => r.commitment.id) : data.strongest.map((r) => r.commitment.id);
  return list.slice(0, HUB_TOP);
}
```

`placeMap(layout, particles, data, width, height, side?, focusTarget?)`:
- geometry unchanged (label room from document names only, so the map keeps its size between steps);
- row order per document: with `side`, named targets first (in `namedTargets` order), then by count of the side's pairs, then document order;
- every particle gets its cell; with `side`, only `p.level === sideLevel(side)` is visible;
- `r = pitch / 2`, `layout.pitch = pitch`;
- groups: every pair of documents with any comparison, counted over all pairs;
- labels: one `spread` pass over, per document, its name then its marks (named targets of the document plus `focusTarget` when it belongs there); with a side, a name's wanted centre is its stretch's top (`y0 + off + h/2`), a mark's its own row; a mark's right edge is its document name's; `lead` when a name ends more than 6px from where it wanted to be; marks keep one 15px line each and are skipped when their label room is under 60px.

Emphasis: with a side, the side's pairs are 1 when asked, else `MAP_MID` for `top` and `MAP_BACK` for the others; `top` asks the concentration's targets when concentrated (all pairs full otherwise); `target` asks `p.ca === id || p.cb === id`. Without a side, `tone` asks `toneOf(level) === tone` and the rest is `MAP_FAINT`; `doc` as before.

Positions are cached per `(particles, width, height, side, focusTarget-in-marks)` in a `WeakMap<HubParticle[], Map<string, Placed>>` so pointer changes only recompute alpha.

- [ ] **Step 4: Run to verify they pass**

Run: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run src/lib/brief/hub.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** `feat(brief): each side of the map as its own landscape, its targets first and named`

### Task 2: A sharp map, names and pointing (canvas)

**Files:**
- Modify: `src/components/brief/hub/hub-canvas.tsx`
- Test: `src/components/brief/hub/hub-canvas.test.tsx`

**Interfaces:**
- Consumes: Task 1's `HubStage`, `HubMark`, `HubLayout.pitch`, `HubAxis.lead`.
- Produces: `HubTarget` gains `{ kind: "mark"; mark: HubMark }`; `HubCanvas` prop `markLabel?: (mark: HubMark) => ReactNode`; `stageKey` keys `map`, `map:tone:<t>`, `map:<side>:top|theme:<n>|kind:<m>|doc:<d>|target:<id>`.

- [ ] **Step 1: Failing tests**: a side view names a pair under the pointer (`dot B6-C1` style tip) and selects it; a mark under the pointer gives `onHover("target:apart:B6")` and selects on click; a document's name around the centre is a way in (click 20px above a doc-stage cluster calls `onSelect` with that group); `stageKey` for the new stages; the tip persists across emphasis changes within a side but not across sides.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**: map drawing when `layout.pitch > 0`: each group's square filled `#f0f0ee`; dots as squares snapped to device pixels (`Math.round(v * dpr) / dpr`, one device pixel gap when the cell has 3 or more), colour = the ink mixed toward the square's paper by `1 - alpha` (opaque); leaders for names (`lead`) and marks; marks as HTML labels (`.brief-hub-mark`, `data-dim` when another target is in focus, `data-on` for it); hit tests: in a side view the nearest shown dot within `max(pitch, 4)`, then marks, names, squares; in the document stage a cluster's box reaches up over its name.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(brief): a sharp map with its targets named, every dot a way into its comparison`

### Task 3: The overview's one path (hub)

**Files:**
- Modify: `src/components/brief/hub/hub.tsx`, `src/components/brief/rank-list.tsx`, `src/components/brief/sections/aligned.tsx`, `src/components/brief/sections/commitments.tsx`, `src/components/brief/brief.css`
- Test: `src/components/brief/hub/hub.test.tsx`

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: `Hub` prop `onExplore?: (id: string) => void`; steps `overview | map | reinforce | apart | documents`; `RankList` props `hovered?: string | null`, row toggles (`onSelect` on the picked row unpicks in the hub).

- [ ] **Step 1: Failing tests** (rewrite the step-flow tests in `hub.test.tsx`):
  - clicking "67% aligned" scrolls to the map step and the stage reads `map:tone:reinforce` once the map leads; the preview ends when another step leads;
  - `enter("reinforce")` gives `map:reinforce:top`, `enter("apart")` `map:apart:top`; no `strong`/`review` steps;
  - in each side the list comes before the themes (DOM order), rows hover to `map:apart:target:B6`, click picks (sticky, row open with "Explore this target"), a second click unpicks;
  - "Explore this target" calls `onExplore("B6")`; without `onExplore` the row offers the target's panel;
  - on the documents step a click on another document's cluster or name moves the stage to `doc:B` and opens its row;
  - a picked target that leaves the selection falls back to `top`;
  - a side with no pairs renders its empty headline.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the new stage spec, hover keys (`theme:<side>:<n>`, `kind:<m>`, `target:<side>:<id>`, `axis:<doc>`, block keys), mark labels and dot/mark tips, the legend preview, the doc centring, and CSS: map step `min-height: 72vh` (desktop), `.brief-hub-mark` (0.75rem, one line, ellipsis, count in tabular figures, green `#2a7443` or red `#b3361f` text), `.brief-rank-row[data-hovered]`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(brief): one path from the overall picture to each side and back to the documents`

### Task 4: Hand a target to the ring

**Files:**
- Modify: `src/components/brief/brief-app.tsx`
- Test: `src/components/brief/brief-app.test.tsx`

- [ ] **Step 1: Failing test**: rendering `BriefApp` with an explore setup, picking a target row in "Targets to review first" and pressing "Explore this target" puts it in the ring's centre (the ring's side column reads its finding) and scrolls `#brief-explore` into view.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `onExplore={explore ? (id) => { dispatchExplore({ type: "focus", id }); document.getElementById("brief-explore")?.scrollIntoView({ behavior: "smooth", block: "start" }); } : undefined}`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(brief): a target from the overview opens on the ring`

### Task 5: One comparison for panel and ring

**Files:**
- Create: `src/components/brief/comparison.tsx`, `src/components/brief/ai-text.tsx`
- Modify: `src/components/brief/panels.tsx` (PairPanel; `AiText`, `AiHeading`, `confidenceLabel` move to `ai-text.tsx`), `src/components/brief/explore/pair-view.tsx` (quotes block only), `src/components/brief/explore/explore.tsx` (one prop), `src/components/brief/brief.css`
- Test: `src/components/brief/comparison.test.tsx`, `src/components/brief/panels.test.tsx`

**Interfaces:**
- Produces: `Comparison({ first, second, tone }: { first: ComparisonSide; second: ComparisonSide; tone: Tone })`, `interface ComparisonSide { label: string; text: string; docName: string; color: string }`; `Explanation({ text, docs, confidence, children })` rendering the heading with confidence, the first sentence with "More", then `children` (resources line, caveats).

- [ ] **Step 1: Failing tests**: both stops show document name, title and text; the rail carries the tone (`data-tone="apart"`); a text over 280 characters is clamped with a "Full text" button that shows it whole and then "Show less"; an explanation of three sentences shows the first with "More"; the confidence sits beside "AI explanation".
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the components and CSS (`.brief-cmp`: stops in a column, a 10px document-colour square per stop, the rail a 2px line from the first square to the second in the rating's ink: solid green, grey, dotted grey, dashed red), then swap them into PairPanel and PairView (PairView gets `docColor?: (doc: string) => string | undefined`; layer items take the ring's action/budget tints).
- [ ] **Step 4: Run, verify pass** (`src/components/brief`).
- [ ] **Step 5: Commit** `feat(brief): two targets compared as two stops on one line, in the panel and on the ring`

### Task 6: Walkthrough and copy

**Files:**
- Modify: `src/components/dashboard/coherence-briefing/tour/steps.ts` (brief order: overall, map, aligned, themes, commitments, documents, builder), `messages/en.json`, `messages/es.json`, `messages/mn.json` (`brief.hub.exploreTarget`, `brief.panel.fullText`, `brief.panel.shortText`, rewritten `briefing.tour.brief.steps.{overall,aligned,commitments,documents}.body`)

- [ ] **Step 1**: update copy (en), English placeholders in es/mn, run the i18n parity tests and the tour tests.
- [ ] **Step 2: Commit** `docs(brief): the walkthrough follows the new path`

### Task 7: Verify and hand over

- [ ] Run `src/lib/brief src/components/brief src/lib/pulse` tests, `npx tsc --noEmit` (known: one inherited error in `src/lib/analytics/store.test.ts`), `pnpm lint` on changed files.
- [ ] Render `/mongolia/brief`, `/panama/brief`, `/sri-lanka/brief`, `/cote-divoire/brief` on the dev server (HTTP 200, no server errors).
- [ ] Update `EXPERIMENT_HANDOFF.md` (round 10) and memory (`finding_cards_experiment`); commit.
