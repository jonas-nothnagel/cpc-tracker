import { describe, expect, it } from "vitest";
import { buildBriefData, type BriefData } from "./data";
import { scopeOf } from "./compute";
import { briefFixture } from "./test-fixture";
import { DOT_ORDER } from "./dot-layout";
import {
  FOCUS_LABEL,
  fitAlong,
  MAP_BACK,
  MAP_FAINT,
  MAP_MID,
  hubParticles,
  layoutHub,
  MARK_LINE,
  namedTargets,
  pairGuides,
  pairInOrder,
  sideLevel,
  spread,
  stripCounts,
  stripOf,
  type HubLayout,
  type HubParticle,
} from "./hub";

const SOURCE = briefFixture({ themes: true });
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), null);

function visibleCount(layout: HubLayout) {
  return layout.visible.reduce((s, v) => s + v, 0);
}

function inside(x: number, y: number, b: { x0: number; y0: number; x1: number; y1: number }) {
  return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
}

/** A synthetic corpus: `sizes[d]` targets per document, every pair of
 *  targets in different documents compared once. */
function corpus(sizes: number[]): { data: BriefData; particles: HubParticle[] } {
  const docs = sizes.map((_, d) => ({ ...DATA.scope.docs[0], id: `D${d}`, name: `Document ${d}` }));
  const commitments = sizes.flatMap((n, d) =>
    Array.from({ length: n }, (_, i) => ({ id: `D${d}_${i}`, doc: `D${d}`, label: `${i}`, text: `Target ${i}` })),
  );
  const particles: HubParticle[] = [];
  for (let x = 0; x < commitments.length; x++) {
    for (let y = x + 1; y < commitments.length; y++) {
      const a = commitments[x];
      const b = commitments[y];
      if (a.doc === b.doc) continue;
      particles.push({ tone: 0, a: a.doc, b: b.doc, ca: a.id, cb: b.id, level: "medium", mechanism: null });
    }
  }
  return { data: { ...DATA, scope: { ...DATA.scope, docs, commitments } }, particles };
}

const rowsOf = (l: HubLayout) => l.axis.filter((a) => a.edge === "row");
const colsOf = (l: HubLayout) => l.axis.filter((a) => a.edge === "column");

/** The map's own box: its blocks, without the names around it. */
function mapBox(l: HubLayout) {
  return {
    x0: Math.min(...l.groups.map((g) => g.x0)),
    x1: Math.max(...l.groups.map((g) => g.x1)),
    y0: Math.min(...l.groups.map((g) => g.y0)),
    y1: Math.max(...l.groups.map((g) => g.y1)),
  };
}

describe("fitAlong", () => {
  it("keeps each box within its own bounds and apart from the next, near its wanted place", () => {
    const at = fitAlong(
      [
        { want: 0, width: 10, lo: 0, hi: 5 },
        { want: 5, width: 0, lo: 12, hi: 20 },
        { want: 8, width: 10, lo: 0, hi: 30 },
      ],
      4,
    );
    expect(at).toEqual([0, 14, 18]);
  });

  it("none when the boxes cannot all fit", () => {
    expect(
      fitAlong(
        [
          { want: 0, width: 10, lo: 0, hi: 0 },
          { want: 0, width: 10, lo: 0, hi: 12 },
        ],
        4,
      ),
    ).toBeNull();
  });
});

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

describe("hubParticles", () => {
  it("makes one particle per target pair, with its documents, targets and reading", () => {
    const particles = hubParticles(DATA);
    expect(particles).toHaveLength(108);
    const first = DATA.scope.comparisons[0];
    expect(particles[0]).toEqual({
      tone: DOT_ORDER.indexOf("reinforce"),
      a: first.a.doc,
      b: first.b.doc,
      ca: first.a.id,
      cb: first.b.id,
      level: first.level,
      mechanism: null,
    });
  });
});

describe("layoutHub", () => {
  const particles = hubParticles(DATA);

  it("overview: every target pair shown, grouped by how it reads", () => {
    const layout = layoutHub({ kind: "overview" }, particles, DATA, 800, 400);
    expect(visibleCount(layout)).toBe(108);
    expect(layout.groups.map((g) => [g.key, g.count])).toEqual([
      ["reinforce", 72],
      ["partial", 21],
      ["apart", 15],
    ]);
  });

  describe("the map of documents", () => {
    const layout = layoutHub({ kind: "map" }, particles, DATA, 800, 500);

    it("shows every target pair once, in one block per pair of documents", () => {
      expect(visibleCount(layout)).toBe(108);
      expect(layout.groups.map((g) => [g.key, g.count])).toEqual([
        ["A<->B", 36],
        ["A<->C", 36],
        ["B<->C", 36],
      ]);
      const places = new Set<string>();
      particles.forEach((p, i) => {
        const block = layout.groups.find((g) => g.key === [p.a, p.b].sort().join("<->"))!;
        expect(inside(layout.x[i], layout.y[i], block)).toBe(true);
        places.add(`${layout.x[i].toFixed(2)},${layout.y[i].toFixed(2)}`);
      });
      // Each pair has a place of its own.
      expect(places.size).toBe(108);
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
      // Each block knows the documents of its rows and its columns.
      expect(layout.groups.map((g) => [g.key, g.row, g.column])).toEqual([
        ["A<->B", "B", "A"],
        ["A<->C", "C", "A"],
        ["B<->C", "C", "B"],
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
        expect(a.labelWidth).toBeGreaterThan(0);
      }
      for (const a of colsOf(layout)) {
        expect(a.labelY).toBeGreaterThan(box.y1);
        expect(a.bar.y0).toBeGreaterThan(box.y1);
        expect(a.bar.y0).toBeLessThan(a.labelY);
        // Centred under its column, on one baseline with the others.
        expect(a.labelX).toBeCloseTo((a.bar.x0 + a.bar.x1) / 2);
        expect(a.lead).toBeNull();
      }
      expect(new Set(colsOf(layout).map((a) => a.labelY)).size).toBe(1);
    });

    it("takes the width its names leave: short names, a larger map", () => {
      const narrow = layoutHub({ kind: "map" }, particles, DATA, 500, 620);
      const box = mapBox(narrow);
      expect(box.x1 - box.x0).toBeGreaterThan(0.78 * 500);
      // The rows' names still have their room.
      expect(rowsOf(narrow)[0].labelWidth).toBeGreaterThanOrEqual("Document B".length * 6.6);
      expect(box.x1).toBeLessThanOrEqual(500);
    });

    it("keeps its labels apart and inside the field, even with many small documents", () => {
      const { data, particles: many } = corpus([30, 4, 3, 5, 40, 2, 6, 25, 3, 3, 20, 8]);
      const map = layoutHub({ kind: "map" }, many, data, 390, 371);
      for (let i = 0; i < many.length; i++) {
        expect(map.x[i]).toBeGreaterThanOrEqual(0);
        expect(map.x[i]).toBeLessThanOrEqual(390);
        expect(map.y[i]).toBeGreaterThanOrEqual(0);
        expect(map.y[i]).toBeLessThanOrEqual(371);
      }
      const rows = rowsOf(map);
      for (let k = 1; k < rows.length; k++) {
        expect(rows[k].labelY - rows[k - 1].labelY).toBeGreaterThanOrEqual(
          (rows[k].labelHeight + rows[k - 1].labelHeight) / 2 - 1e-6,
        );
      }
      for (const a of rows) {
        expect(a.labelY - a.labelHeight / 2).toBeGreaterThanOrEqual(-1e-6);
        expect(a.labelY + a.labelHeight / 2).toBeLessThanOrEqual(371 + 1e-6);
        expect(a.labelX - a.labelWidth).toBeGreaterThanOrEqual(-1e-6);
      }
      for (const a of colsOf(map)) {
        expect(a.labelX - a.labelWidth / 2).toBeGreaterThanOrEqual(-1e-6);
        expect(a.labelX + a.labelWidth / 2).toBeLessThanOrEqual(390 + 1e-6);
        expect(a.labelY + a.labelHeight).toBeLessThanOrEqual(371 + 1e-6);
      }
    });

    it("keeps every name clear of the map, even a tall name beside a small document", () => {
      const docs = ["Vision 2050", "Nationally Determined Contribution", "National targets for implementation of the Paris Agreement", "National Biodiversity Strategy & Action Plan", "National Adaptation Plan", "Food Supply and Security Measures", "LDN Targets", "Investing in Land Degradation Neutrality"];
      const { data, particles: many } = corpus([15, 36, 16, 20, 15, 41, 27, 8]);
      const named = { ...data, scope: { ...data.scope, docs: data.scope.docs.map((d, k) => ({ ...d, name: docs[k] })) } };
      for (const [w, h] of [[450, 700], [500, 620], [390, 371]]) {
        const map = layoutHub({ kind: "map" }, many, named, w, h);
        const box = mapBox(map);
        for (const a of rowsOf(map)) expect(a.labelX).toBeLessThanOrEqual(box.x0 - 8);
        for (const a of colsOf(map)) expect(a.labelY).toBeGreaterThanOrEqual(box.y1 + 8);
      }
    });

    it("never lets dots overlap, so a block's colours read true in a large corpus", () => {
      const { data, particles: many } = corpus([60, 50, 45, 40, 40, 40, 35, 30, 30, 30]);
      const map = layoutHub({ kind: "map" }, many, data, 358, 370);
      expect(map.pitch).toBeLessThan(0.8);
      const shown = many.findIndex((_, i) => map.visible[i]);
      expect(2 * map.r[shown]).toBeLessThanOrEqual(map.pitch + 1e-6);
      // Every pair has a cell of its own.
      const cells = new Set(many.map((_, i) => `${map.x[i].toFixed(3)},${map.y[i].toFixed(3)}`));
      expect(cells.size).toBe(many.length);
    });

    it("draws each pair as a square the size of its cell", () => {
      const shown = particles.findIndex((_, i) => layout.visible[i]);
      expect(layout.pitch).toBeGreaterThan(0);
      expect(2 * layout.r[shown]).toBeCloseTo(layout.pitch);
    });

    it("leads a row's name back to its bar only when it had to move away", () => {
      for (const a of layout.axis) expect(a.lead).toBeNull();
      const { data, particles: many } = corpus([30, 4, 3, 5, 40, 2, 6, 25, 3, 3, 20, 8]);
      const crowded = layoutHub({ kind: "map" }, many, data, 390, 371);
      const moved = rowsOf(crowded).filter((a) => a.lead !== null);
      expect(moved.length).toBeGreaterThan(0);
      for (const a of moved) {
        // The lead ends just left of the row's bar, within its band.
        expect(a.lead!.x1).toBeCloseTo(a.bar.x0 - 2);
        expect(a.lead!.y1).toBeGreaterThanOrEqual(a.bar.y0);
        expect(a.lead!.y1).toBeLessThanOrEqual(a.bar.y1);
      }
    });

    it("gives every pair its dot in a large corpus too, never a sample", () => {
      const { data, particles: many } = corpus([60, 45, 40, 38, 30, 30, 25, 20, 18, 12]);
      const map = layoutHub({ kind: "map" }, many, data, 480, 520);
      expect(visibleCount(map)).toBe(many.length);
      expect(map.groups.reduce((s, g) => s + g.count, 0)).toBe(many.length);
    });

    it("two documents: one block, one row name, one column name", () => {
      const two = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "C"]), null);
      const map = layoutHub({ kind: "map" }, hubParticles(two), two, 800, 500);
      expect(map.groups.map((g) => g.key)).toEqual(["A<->C"]);
      expect(map.axis.map((a) => [a.edge, a.key])).toEqual([
        ["row", "C"],
        ["column", "A"],
      ]);
    });

    it("a document without targets gets neither row nor column", () => {
      const { data, particles: many } = corpus([5, 0, 4, 3]);
      const map = layoutHub({ kind: "map" }, many, data, 600, 500);
      expect(map.axis.some((a) => a.key === "D1")).toBe(false);
      expect(rowsOf(map).map((a) => a.key)).toEqual(["D2", "D3"]);
      expect(colsOf(map).map((a) => a.key)).toEqual(["D0", "D2"]);
    });

    it("narrow columns: every second name drops a row, joined to its bar, all inside the field", () => {
      const { data, particles: many } = corpus([91, 16, 4, 192, 4, 33, 9, 55]);
      const labelled = {
        ...data,
        scope: {
          ...data.scope,
          docs: data.scope.docs.map((d) => ({ ...d, mapLabel: [d.id, "Land degradation"] as [string, string] })),
        },
      };
      const map = layoutHub({ kind: "map" }, many, labelled, 640, 760);
      const cols = colsOf(map);
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
          expect(same[k].labelX - same[k].labelWidth / 2).toBeGreaterThanOrEqual(
            same[k - 1].labelX + same[k - 1].labelWidth / 2 - 1e-6,
          );
        }
      }
    });
  });

  it("a rating brought forward on the map: its pairs full, the rest faint, every dot in its place", () => {
    const plain = layoutHub({ kind: "map" }, particles, DATA, 800, 500);
    const layout = layoutHub({ kind: "map", tone: "apart" }, particles, DATA, 800, 500);
    particles.forEach((p, i) => expect(layout.alpha[i]).toBe(p.level === "flagged" ? 1 : MAP_FAINT));
    expect([...layout.x]).toEqual([...plain.x]);
    expect([...layout.y]).toEqual([...plain.y]);
    expect([...plain.alpha].every((a) => a === 1)).toBe(true);
  });

  it("a document on the map: its row and column forward", () => {
    const layout = layoutHub({ kind: "map", focus: { kind: "doc", doc: "B" } }, particles, DATA, 800, 500);
    particles.forEach((p, i) => {
      expect(layout.alpha[i]).toBe(p.a === "B" || p.b === "B" ? 1 : MAP_FAINT);
    });
  });

  describe("a side of the map", () => {
    const flagged = (p: HubParticle) => p.level === "flagged";
    const plain = layoutHub({ kind: "map" }, particles, DATA, 800, 500);
    const apart = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, particles, DATA, 800, 500);

    it("reads a side by its own pairs: strong alignments, or potential misalignments", () => {
      expect(sideLevel("reinforce")).toBe("high");
      expect(sideLevel("apart")).toBe("flagged");
    });

    it("shows only the side's pairs, and keeps a square for every pair of documents", () => {
      expect(visibleCount(apart)).toBe(15);
      particles.forEach((p, i) => expect(apart.visible[i]).toBe(flagged(p) ? 1 : 0));
      expect(apart.groups.map((g) => [g.key, g.count])).toEqual([
        ["A<->B", 36],
        ["A<->C", 36],
        ["B<->C", 36],
      ]);
      // The documents and the map keep their place and size on every side.
      expect(apart.axis.map((a) => a.bar)).toEqual(plain.axis.map((a) => a.bar));
      expect(apart.groups.map((g) => [g.x0, g.y0, g.x1, g.y1])).toEqual(plain.groups.map((g) => [g.x0, g.y0, g.x1, g.y1]));
    });

    it("puts the side's targets first in their document, so its pairs gather in the corner", () => {
      // A6 and B6 carry most of the potential misalignment: each leads its document.
      const i = particles.findIndex((p) => p.ca === "A6" && p.cb === "B6");
      const corner = particles.findIndex((p) => p.ca === "A1" && p.cb === "B1");
      expect(apart.x[i]).toBeCloseTo(plain.x[corner]);
      expect(apart.y[i]).toBeCloseTo(plain.y[corner]);
      // Then by how many of the side's pairs a target is in: C4-C6 (two each)
      // before C1-C3 (one each), so B5 x C4 takes C's first row.
      const b5c4 = particles.findIndex((p) => p.ca === "B5" && p.cb === "C4");
      const firstRowOfC = apart.axis.find((a) => a.edge === "row" && a.key === "C")!.bar.y0 + apart.pitch / 2;
      expect(apart.y[b5c4]).toBeCloseTo(firstRowOfC);
    });

    it("names the targets that carry it, with their counts: the first document's above the map, the others where their row ends", () => {
      expect(namedTargets(DATA, "apart")).toEqual(["B6", "A6"]);
      expect(apart.marks.map((m) => [m.id, m.doc, m.count])).toEqual([
        ["A6", "A", 6],
        ["B6", "B", 7],
      ]);
      const box = mapBox(apart);
      const a6 = apart.marks.find((m) => m.id === "A6")!;
      expect(a6.align).toBe("left");
      expect(a6.labelX).toBeCloseTo(box.x0);
      expect(a6.labelY + a6.labelHeight / 2).toBeLessThanOrEqual(box.y0);
      // Its lead ends at the top of its column.
      expect(a6.y).toBeCloseTo(box.y0 - 1);
      expect(a6.x).toBeCloseTo(apart.lines.get("A6")!.column!.x);
      const b6 = apart.marks.find((m) => m.id === "B6")!;
      const row = apart.lines.get("B6")!.row!;
      expect(b6.align).toBe("left");
      expect(b6.labelX).toBeGreaterThan(row.x1);
      // Its lead ends where its row ends.
      expect(b6.x).toBeCloseTo(row.x1 + 1);
      expect(b6.y).toBeCloseTo(row.y);
    });

    it("the last document's named targets follow its name at the left, in two lines where one would not hold them", () => {
      // C has no column: C5, in focus, is named under C's row name.
      const one = layoutHub({ kind: "map", side: "apart", focus: { kind: "target", id: "C5" } }, particles, DATA, 800, 500);
      const c5 = one.marks.find((m) => m.id === "C5")!;
      const c = one.axis.find((a) => a.edge === "row" && a.key === "C")!;
      expect(c5.align).toBe("right");
      expect(c5.labelX).toBeCloseTo(c.labelX);
      expect(c5.labelY).toBeGreaterThan(c.labelY);
      // "5 Commitment C5 Verbatim text of commitment C5." is wider than the room.
      expect(c5.lines).toBe(2);
      expect(c5.labelHeight).toBe(2 * MARK_LINE - 2);
      // Its lead ends where its row starts.
      expect(c5.x).toBeCloseTo(mapBox(one).x0 - 1);
    });

    it("at rest: the named targets' pairs full, the side's other pairs paler", () => {
      particles.forEach((p, i) => {
        if (!flagged(p)) return;
        const named = ["A6", "B6"].includes(p.ca) || ["A6", "B6"].includes(p.cb);
        expect(apart.alpha[i]).toBe(named ? 1 : MAP_MID);
      });
    });

    it("one target: its row and column forward, and its name, even when the side does not name it", () => {
      const one = layoutHub({ kind: "map", side: "apart", focus: { kind: "target", id: "C5" } }, particles, DATA, 800, 500);
      particles.forEach((p, i) => {
        if (!flagged(p)) return;
        expect(one.alpha[i]).toBe(p.ca === "C5" || p.cb === "C5" ? 1 : MAP_BACK);
      });
      expect(one.marks.map((m) => [m.id, m.count])).toEqual([
        ["A6", 6],
        ["B6", 7],
        ["C5", 2],
      ]);
      // Pointing at a target never moves the dots.
      expect([...one.x]).toEqual([...apart.x]);
    });

    it("a theme: the side's pairs between the documents it cites", () => {
      const layout = layoutHub(
        { kind: "map", side: "reinforce", focus: { kind: "theme", index: 0 } },
        particles,
        DATA,
        800,
        500,
      );
      const strong = (p: HubParticle) => p.level === "high";
      particles.forEach((p, i) => {
        if (!strong(p)) return expect(layout.visible[i]).toBe(0);
        expect(layout.alpha[i]).toBe(p.a === "A" ? 1 : MAP_BACK);
      });
      expect(particles.filter((p, i) => strong(p) && layout.alpha[i] === 1)).toHaveLength(27);
    });

    it("a type of potential misalignment: its pairs forward, the other potential misalignments set back", () => {
      const mixed = particles.map((p, i) =>
        p.level === "flagged" ? { ...p, mechanism: i % 2 ? ("goal_conflict" as const) : ("resource_competition" as const) } : p,
      );
      const layout = layoutHub(
        { kind: "map", side: "apart", focus: { kind: "mechanism", mechanism: "goal_conflict" } },
        mixed,
        DATA,
        800,
        500,
      );
      mixed.forEach((p, i) => {
        if (p.level !== "flagged") expect(layout.visible[i]).toBe(0);
        else expect(layout.alpha[i]).toBe(p.mechanism === "goal_conflict" ? 1 : MAP_BACK);
      });
    });

    it("alignment: the strong alignments only, its list's targets named when its headline names none", () => {
      const strong = layoutHub({ kind: "map", side: "reinforce", focus: { kind: "top" } }, particles, DATA, 800, 500);
      particles.forEach((p, i) => expect(strong.visible[i]).toBe(p.level === "high" ? 1 : 0));
      // Spread across twelve targets: the first six of the list are named,
      // and no pair is set back.
      expect(namedTargets(DATA, "reinforce")).toEqual(["C1", "C3", "C5", "B1", "B3", "A1"]);
      expect(strong.marks.map((m) => [m.id, m.count])).toEqual([
        ["A1", 6],
        ["B1", 7],
        ["B3", 7],
        ["C1", 8],
        ["C3", 8],
        ["C5", 8],
      ]);
      particles.forEach((p, i) => {
        if (p.level === "high") expect(strong.alpha[i]).toBe(1);
      });
    });

    it("a side with no pairs: every square empty, nothing named", () => {
      const calm = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "C"]), null);
      const empty = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, hubParticles(calm), calm, 800, 500);
      expect(visibleCount(empty)).toBe(0);
      expect(empty.groups.map((g) => g.key)).toEqual(["A<->C"]);
      expect(empty.marks).toEqual([]);
    });

    it("on a phone, names what fits at its full height, and always the target in focus", () => {
      const { data, particles: many } = corpus([15, 36, 16, 20, 15, 41, 27, 8, 3, 2, 30, 12]);
      // Real lengths: long names for the first documents, long target titles.
      const long = [
        "Nationally Determined Contributions 3.0",
        "National Biodiversity Strategy and Action Plan",
        "National targets for implementation of the Paris Agreement",
      ];
      const docs = data.scope.docs.map((d, k) => ({ ...d, name: long[k] ?? d.name }));
      const commitments = data.scope.commitments.map((c) => ({ ...c, label: `Expand the target called ${c.id} across the country` }));
      const hot = docs.slice(0, 8).map((d) => `${d.id}_0`);
      const flaggedMany = many.map((p) =>
        hot.includes(p.ca) || hot.includes(p.cb) || p.ca === "D11_3" || p.cb === "D11_3"
          ? { ...p, level: "flagged" as const, tone: DOT_ORDER.indexOf("apart") }
          : p,
      );
      const named = {
        ...data,
        scope: { ...data.scope, docs, commitments },
        concentration: { ...data.concentration, top: hot, concentrated: true },
      };
      const plain = layoutHub({ kind: "map" }, flaggedMany, named, 358, 371);
      for (const a of rowsOf(plain)) expect(a.labelHeight % 16).toBe(0);
      for (const focus of [{ kind: "top" } as const, { kind: "target", id: "D11_3" } as const]) {
        const map = layoutHub({ kind: "map", side: "apart", focus }, flaggedMany, named, 358, 371);
        // Every label keeps the height its text needs.
        for (const a of rowsOf(map)) expect(a.labelHeight % 16).toBe(0);
        for (const m of map.marks) expect([MARK_LINE, 2 * MARK_LINE - 2]).toContain(m.labelHeight);
        // At the left edge, names never overlap.
        const beside = [
          ...rowsOf(map).map((a) => ({ y: a.labelY, h: a.labelHeight })),
          ...map.marks.filter((m) => m.align === "right").map((m) => ({ y: m.labelY, h: m.labelHeight })),
        ].sort((p, q) => p.y - q.y);
        for (let k = 1; k < beside.length; k++) {
          expect(beside[k].y - beside[k - 1].y).toBeGreaterThanOrEqual((beside[k].h + beside[k - 1].h) / 2 - 1e-6);
        }
        // The rows' names keep the room they have on the whole map.
        expect(rowsOf(map)[0].labelWidth).toBeGreaterThanOrEqual(rowsOf(plain)[0].labelWidth - 1e-6);
        // Whatever goes unnamed, never the target in focus.
        expect(map.marks.length).toBeLessThanOrEqual(hot.length + 1);
        if (focus.kind === "target") expect(map.marks.map((m) => m.id)).toContain("D11_3");
      }
    });

    it("shares one placement between a side at rest and one of its named targets", () => {
      const rest = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, particles, DATA, 800, 500);
      const b6 = layoutHub({ kind: "map", side: "apart", focus: { kind: "target", id: "B6" } }, particles, DATA, 800, 500);
      expect(b6.x).toBe(rest.x);
      expect(b6.marks).toBe(rest.marks);
    });

    it("keeps only the recent placements", () => {
      const first = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, particles, DATA, 811, 500);
      for (let w = 700; w < 760; w += 5) {
        layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, particles, DATA, w, 500);
      }
      const again = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, particles, DATA, 811, 500);
      expect(again.x).not.toBe(first.x);
      const recent = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, particles, DATA, 755, 500);
      expect(layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, particles, DATA, 755, 500).x).toBe(recent.x);
    });

    it("keeps names and marks apart and inside the field, clear of the squares, with many documents", () => {
      const { data, particles: many } = corpus([15, 36, 16, 20, 15, 41, 27, 8, 3, 2, 30, 12]);
      // The first target of every other document carries potential misalignment with everything.
      const hot = data.scope.docs.filter((_, k) => k % 2 === 0).map((d) => `${d.id}_0`);
      const flaggedMany = many.map((p) =>
        hot.includes(p.ca) || hot.includes(p.cb) ? { ...p, level: "flagged" as const, tone: DOT_ORDER.indexOf("apart") } : p,
      );
      const named = { ...data, concentration: { ...data.concentration, top: hot, concentrated: true } };
      for (const [w, h] of [[560, 620], [390, 371]]) {
        const map = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, flaggedMany, named, w, h);
        expect(map.marks.length).toBeGreaterThan(0);
        const box = mapBox(map);
        const left = [
          ...rowsOf(map).map((a) => ({ y: a.labelY, h: a.labelHeight })),
          ...map.marks.filter((m) => m.align === "right").map((m) => ({ y: m.labelY, h: m.labelHeight })),
        ].sort((p, q) => p.y - q.y);
        const stair = map.marks.filter((m) => m.align === "left" && m.labelY > box.y0).sort((p, q) => p.labelY - q.labelY);
        for (const list of [left, stair.map((m) => ({ y: m.labelY, h: m.labelHeight }))]) {
          for (let k = 1; k < list.length; k++) {
            expect(list[k].y - list[k - 1].y).toBeGreaterThanOrEqual((list[k].h + list[k - 1].h) / 2 - 1e-6);
          }
          for (const l of list) {
            expect(l.y - l.h / 2).toBeGreaterThanOrEqual(-1e-6);
            expect(l.y + l.h / 2).toBeLessThanOrEqual(h + 1e-6);
          }
        }
        // A name in the empty half starts right of every block at its height.
        for (const m of stair) {
          for (const g of map.groups) {
            if (g.y1 >= m.labelY - m.labelHeight / 2 && g.y0 <= m.labelY + m.labelHeight / 2) {
              expect(m.labelX).toBeGreaterThanOrEqual(g.x1);
            }
          }
        }
        // Names above the map stay above it.
        for (const m of map.marks.filter((x) => x.align === "left" && x.labelY < box.y0)) {
          expect(m.labelY + m.labelHeight / 2).toBeLessThanOrEqual(box.y0 + 1e-6);
        }
      }
    });
  });

  it("a document in focus: its target pairs beside it, one cluster per other document", () => {
    const layout = layoutHub({ kind: "doc", doc: "A" }, particles, DATA, 800, 500);
    expect(visibleCount(layout)).toBe(72);
    expect(layout.groups.map((g) => [g.key, g.count, g.side])).toEqual([
      ["B", 36, "left"],
      ["C", 36, "right"],
    ]);
    expect(layout.center).toMatchObject({ x: 400, y: 250 });
    // The document's name sits at the centre; the clusters keep clear of it.
    for (const g of layout.groups) {
      expect(g.x1 < 400 - 60 || g.x0 > 400 + 60).toBe(true);
    }
  });

  it("a document in focus: many partners stack on both sides without touching, names included", () => {
    const ids = ["F", "P1", "P2", "P3", "P4", "P5", "P6", "P7"];
    const docs = ids.map((id) => ({ ...DATA.scope.docs[0], id, name: `Document ${id}` }));
    const sizes = [540, 615, 1476, 120, 300, 36, 900];
    const many: HubParticle[] = sizes.flatMap((n, k) =>
      Array.from({ length: n }, (_, i) => ({
        tone: i % 4,
        a: "F",
        b: ids[k + 1],
        ca: "F1",
        cb: `${ids[k + 1]}1`,
        level: "medium" as const,
        mechanism: null,
      })),
    );
    const data = { ...DATA, scope: { ...DATA.scope, docs } };
    const layout = layoutHub({ kind: "doc", doc: "F" }, many, data, 520, 600);
    expect(layout.groups.map((g) => g.key)).toEqual(ids.slice(1));
    for (const side of ["left", "right"] as const) {
      const column = layout.groups.filter((g) => g.side === side).sort((x, y) => x.y0 - y.y0);
      expect(column.length).toBeGreaterThan(0);
      for (let k = 1; k < column.length; k++) {
        // Each name sits in the band above its cluster, below the cluster before it.
        expect(column[k].y0 - layout.focusLabel).toBeGreaterThanOrEqual(column[k - 1].y1);
      }
      for (const g of column) {
        expect(g.y0 - layout.focusLabel).toBeGreaterThanOrEqual(0);
        expect(g.y1).toBeLessThanOrEqual(600);
        expect(side === "left" ? g.x1 <= 260 : g.x0 >= 260).toBe(true);
      }
    }
  });

  it("a document in focus: potential misalignment keeps its texture, not only its colour", () => {
    const layout = layoutHub({ kind: "doc", doc: "A" }, particles, DATA, 800, 500);
    const apart = particles.flatMap((p, i) => (p.tone === DOT_ORDER.indexOf("apart") && layout.visible[i] ? [i] : []));
    const aligned = particles.flatMap((p, i) => (p.tone === DOT_ORDER.indexOf("reinforce") && layout.visible[i] ? [i] : []));
    expect(apart.length).toBeGreaterThan(0);
    // Every other dot drawn small, as in the overview and the landing field.
    expect(apart.some((i) => layout.small[i] === 1)).toBe(true);
    expect(apart.some((i) => layout.small[i] === 0)).toBe(true);
    expect(aligned.every((i) => layout.small[i] === 0)).toBe(true);
  });

  it("keeps the dots close to their overview size in every step", () => {
    const overview = layoutHub({ kind: "overview" }, particles, DATA, 800, 500);
    const size = Math.max(...overview.r);
    const cases = [
      [{ kind: "map" }, 1.8],
      [{ kind: "map", side: "apart", focus: { kind: "top" } }, 1.8],
      [{ kind: "doc", doc: "A" }, 1.8],
    ] as const;
    for (const [stage, zoom] of cases) {
      const layout = layoutHub(stage, particles, DATA, 800, 500);
      const largest = Math.max(...layout.r.filter((_, i) => layout.visible[i]));
      expect(largest).toBeLessThanOrEqual(size * zoom + 1e-6);
      expect(largest).toBeGreaterThan(0);
    }
  });

  it("a document in focus with many large partners stays inside the field", () => {
    const ids = ["F", ...Array.from({ length: 11 }, (_, k) => `P${k + 1}`)];
    const docs = ids.map((id) => ({ ...DATA.scope.docs[0], id, name: `Document ${id}` }));
    const sizes = [6336, 2900, 1800, 1200, 900, 700, 500, 300, 200, 120, 60];
    const many: HubParticle[] = sizes.flatMap((n, k) =>
      Array.from({ length: n }, (_, i) => ({
        tone: i % 4,
        a: "F",
        b: ids[k + 1],
        ca: "F1",
        cb: `${ids[k + 1]}1`,
        level: "medium" as const,
        mechanism: null,
      })),
    );
    const data = { ...DATA, scope: { ...DATA.scope, docs } };
    const layout = layoutHub({ kind: "doc", doc: "F" }, many, data, 480, 520);
    for (let i = 0; i < many.length; i++) {
      if (!layout.visible[i]) continue;
      expect(layout.x[i]).toBeGreaterThanOrEqual(0);
      expect(layout.x[i]).toBeLessThanOrEqual(480);
      expect(layout.y[i]).toBeGreaterThanOrEqual(0);
      expect(layout.y[i]).toBeLessThanOrEqual(520);
    }
    // Names get the room the clusters leave; the counts stay exact.
    expect(layout.focusLabel).toBeLessThan(FOCUS_LABEL);
    expect(layout.groups.map((g) => g.count)).toEqual(sizes);
  });

  it("keeps every shown dot inside the field", () => {
    const stages = [
      { kind: "overview" },
      { kind: "map" },
      { kind: "map", tone: "apart" },
      { kind: "map", side: "apart", focus: { kind: "top" } },
      { kind: "map", side: "reinforce", focus: { kind: "target", id: "A1" } },
      { kind: "doc", doc: "B" },
    ] as const;
    for (const stage of stages) {
      for (const [w, h] of [
        [800, 500],
        [390, 371],
      ]) {
        const layout = layoutHub(stage, particles, DATA, w, h);
        for (let i = 0; i < layout.visible.length; i++) {
          if (!layout.visible[i]) continue;
          expect(layout.x[i]).toBeGreaterThanOrEqual(0);
          expect(layout.x[i]).toBeLessThanOrEqual(w);
          expect(layout.y[i]).toBeGreaterThanOrEqual(0);
          expect(layout.y[i]).toBeLessThanOrEqual(h);
        }
      }
    }
  });
});

describe("the map's names on real-sized corpora", () => {
  // Four corpora shaped like the pilot countries, with their real document
  // names and short names: a 206-target document, 4-target documents, long names.
  const REAL: { sizes: number[]; names: string[]; labels: [string, string][] }[] = [
    {
      sizes: [36, 30, 17, 17, 206, 30, 14, 11],
      names: ["Pacto de Panamá con la Naturaleza", "Plan Estratégico de Gobierno 2025-2029", "PENCYT (Science & Innovation Plan)", "Plan Nacional de Seguridad Hídrica", "Estrategia Nacional REDD+", "Hoja de Ruta del Nature Pledge", "Plan Indicativo de Ordenamiento Territorial Ambiental", "Programa Nacional de Restauración Forestal"],
      labels: [["NP", "Nature Pledge"], ["PEG", "Gov't Strategic Plan"], ["PENCYT", "Science & Innovation Plan"], ["PNSH", "Water Security"], ["ENR", "REDD+ Strategy"], ["HR", "Nature Pledge Roadmap"], ["PIOTA", "Canal Watershed Plan"], ["PNRF", "Forest Restoration"]],
    },
    {
      sizes: [91, 16, 4, 192, 4, 33, 9, 55],
      names: ["Nationally Determined Contributions 3.0", "Draft National Biodiversity Strategy and Action Plan", "Land Degradation Neutrality document", "National Agriculture Policy", "Physical Planning Policy & Plan - 2048", "National Water Resources Policy of Sri Lanka", "The National Fisheries and Aquaculture Policy", "National Mineral Policy"],
      labels: [["NDC", "Climate Change"], ["NBSAP", "Nature"], ["LDN", "Land degradation"], ["NAP", "Agriculture"], ["PPPP", "Physical planning"], ["NWRP", "Water"], ["NFAP", "Fisheries"], ["NMP", "Minerals"]],
    },
    {
      sizes: [181, 21, 7],
      names: ["Nationally Determined Contributions 3.0", "National Biodiversity Targets", "Land Degradation Neutrality targets"],
      labels: [["NDC", "Climate"], ["NBT", "Nature"], ["LDN", "Land degradation"]],
    },
    {
      sizes: [15, 36, 16, 20, 15, 41, 27, 8],
      names: ["Vision 2050", "Nationally Determined Contribution", "National targets for implementation of the Paris Agreement", "National biodiversity targets for 2030", "National Adaptation Plan to Climate Change", "Food Supply and Security Measures", "LDN Targets", "Investing in Land Degradation Neutrality"],
      labels: [["Vision", "2050"], ["NDC", "Contribution"], ["Paris", "Agreement"], ["Biodiv.", "2030"], ["Adapt.", "Plan"], ["Food", "Measures"], ["LDN", "Targets"], ["LDN", "Investment"]],
    },
  ];
  const FIELDS = [[1000, 620], [800, 500], [640, 760], [560, 384], [497, 622], [427, 535], [358, 371]];
  type Box = { x0: number; y0: number; x1: number; y1: number; what: string };
  const boxes = (l: HubLayout): Box[] => [
    ...l.axis.map((a) =>
      a.edge === "row"
        ? { x0: a.labelX - a.labelWidth, x1: a.labelX, y0: a.labelY - a.labelHeight / 2, y1: a.labelY + a.labelHeight / 2, what: `row ${a.key}` }
        : { x0: a.labelX - a.labelWidth / 2, x1: a.labelX + a.labelWidth / 2, y0: a.labelY, y1: a.labelY + a.labelHeight, what: `column ${a.key}` },
    ),
    ...l.marks.map((m) =>
      m.align === "left"
        ? { x0: m.labelX, x1: m.labelX + m.labelWidth, y0: m.labelY - m.labelHeight / 2, y1: m.labelY + m.labelHeight / 2, what: `mark ${m.id}` }
        : { x0: m.labelX - m.labelWidth, x1: m.labelX, y0: m.labelY - m.labelHeight / 2, y1: m.labelY + m.labelHeight / 2, what: `mark ${m.id}` },
    ),
  ];
  const overlap = (a: Box, b: Box) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
  const through = (s: { x0: number; y0: number; x1: number; y1: number }, b: Box) => {
    for (let t = 0; t <= 1; t += 0.02) {
      const x = s.x0 + (s.x1 - s.x0) * t;
      const y = s.y0 + (s.y1 - s.y0) * t;
      if (x > b.x0 + 1 && x < b.x1 - 1 && y > b.y0 + 1 && y < b.y1 - 1) return true;
    }
    return false;
  };

  it("keeps every name inside the field, apart from the others and from their lines, and every short name whole", () => {
    for (const real of REAL) {
      const { data, particles: many } = corpus(real.sizes);
      const docs = data.scope.docs.map((d, k) => ({ ...d, name: real.names[k], mapLabel: real.labels[k] }));
      const commitments = data.scope.commitments.map((c) => ({ ...c, label: `Expand the target called ${c.id} across the country` }));
      const hot = [0, 1, 3, real.sizes.length - 2, real.sizes.length - 1].filter((k, i, a) => a.indexOf(k) === i && k < real.sizes.length).map((k) => `D${k}_0`);
      const flaggedMany = many.map((p) =>
        hot.includes(p.ca) || hot.includes(p.cb) ? { ...p, level: "flagged" as const, tone: DOT_ORDER.indexOf("apart") } : p,
      );
      const named = {
        ...data,
        scope: { ...data.scope, docs, commitments },
        concentration: { ...data.concentration, top: hot, concentrated: true },
      };
      const last = real.sizes.length - 1;
      const middle = Math.min(1, last - 1);
      const stages = [
        { kind: "map" } as const,
        { kind: "map", side: "apart", focus: { kind: "top" } } as const,
        { kind: "map", side: "apart", focus: { kind: "target", id: `D${middle}_3` } } as const,
        { kind: "map", side: "apart", focus: { kind: "target", id: `D${last}_2` } } as const,
        { kind: "map", side: "apart", focus: { kind: "target", id: "D0_4" } } as const,
      ];
      for (const [w, h] of FIELDS) {
        for (const stage of stages) {
          const map = layoutHub(stage, flaggedMany, named, w, h);
          const where = `${real.sizes.length} documents, ${w}x${h}, ${stage.side ?? "plain"} ${stage.focus?.kind === "target" ? stage.focus.id : ""}`;
          const all = boxes(map);
          for (const b of all) {
            expect(b.x0, `${b.what} left edge, ${where}`).toBeGreaterThanOrEqual(-0.5);
            expect(b.x1, `${b.what} right edge, ${where}`).toBeLessThanOrEqual(w + 0.5);
            expect(b.y0, `${b.what} top, ${where}`).toBeGreaterThanOrEqual(-0.5);
            expect(b.y1, `${b.what} bottom, ${where}`).toBeLessThanOrEqual(h + 0.5);
          }
          for (let i = 0; i < all.length; i++) {
            for (let j = i + 1; j < all.length; j++) {
              expect(overlap(all[i], all[j]), `${all[i].what} and ${all[j].what}, ${where}`).toBe(false);
            }
          }
          // A line joining a name to its column or row never runs through
          // another name. (On a phone's field, eight documents' names fall
          // back to spreading, and a line may cross a neighbour.)
          const lines = [
            ...map.axis.flatMap((a) => (a.lead ? [{ s: a.lead, what: `${a.edge} ${a.key}` }] : [])),
            ...map.marks.map((m) => ({
              s: { x0: m.align === "left" ? m.labelX - 3 : m.labelX + 3, y0: m.labelY, x1: m.x, y1: m.y },
              what: `mark ${m.id}`,
            })),
          ];
          if (w >= 480) {
            for (const l of lines) {
              for (const b of all) {
                if (b.what === l.what) continue;
                expect(through(l.s, b), `${l.what}'s line through ${b.what}, ${where}`).toBe(false);
              }
            }
          }
          // A column's short name is never cut.
          for (const a of map.axis.filter((x) => x.edge === "column")) {
            const k = docs.findIndex((d) => d.id === a.key);
            expect(a.labelWidth, `column ${a.key} width, ${where}`).toBeGreaterThanOrEqual(real.labels[k][0].length * 6.4);
          }
          // The target in focus is always named, whole, inside the field.
          if (stage.focus?.kind === "target") {
            const id = stage.focus.id;
            if (flaggedMany.some((p) => p.level === "flagged" && (p.ca === id || p.cb === id))) {
              expect(map.marks.map((m) => m.id), `focus ${id}, ${where}`).toContain(id);
            }
          }
        }
      }
    }
  });
});

describe("a target's strip and its counts", () => {
  const particles = hubParticles(DATA);
  const apart = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, particles, DATA, 800, 500);

  describe("stripOf", () => {
    it("runs a target's row from the left edge to where its row ends, and its column down to the bottom", () => {
      const b6 = stripOf(apart, "B6")!;
      const box = mapBox(apart);
      expect(b6.row!.x0).toBeCloseTo(box.x0);
      expect(b6.row!.x1).toBeCloseTo(apart.groups.find((g) => g.key === "A<->B")!.x1);
      expect(b6.column!.y1).toBeCloseTo(box.y1);
      expect(b6.column!.y0).toBeCloseTo(apart.groups.find((g) => g.key === "B<->C")!.y0);
      expect(b6.half).toBeGreaterThanOrEqual(3);
    });

    it("the first document's targets have only a column, the last's only a row", () => {
      expect(stripOf(apart, "A6")!.row).toBeNull();
      expect(stripOf(apart, "A6")!.column).not.toBeNull();
      expect(stripOf(apart, "C5")!.column).toBeNull();
      expect(stripOf(apart, "C5")!.row).not.toBeNull();
    });

    it("none off the map, and none for a target outside the selection", () => {
      expect(stripOf(layoutHub({ kind: "overview" }, particles, DATA, 800, 500), "B6")).toBeNull();
      expect(stripOf(apart, "Z9")).toBeNull();
    });
  });

  describe("stripCounts", () => {
    const map = layoutHub({ kind: "map", side: "apart", focus: { kind: "target", id: "B6" } }, particles, DATA, 800, 500);

    it("counts a target's shown pairs in each block, under its row or beside its column", () => {
      const counts = stripCounts(map, particles, "B6");
      const b6 = stripOf(map, "B6")!;
      expect(counts.length).toBeGreaterThan(0);
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

    it("counts for a target with only a column: the first document's", () => {
      const counts = stripCounts(map, particles, "A6");
      expect(counts.length).toBeGreaterThan(0);
      for (const c of counts) expect(c.align).not.toBe("below");
    });

    it("none for a target outside the selection", () => {
      expect(stripCounts(map, particles, "Z9")).toEqual([]);
    });
  });
});

describe("pairGuides", () => {
  const particles = hubParticles(DATA);
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

describe("pairInOrder", () => {
  it("names a pair of documents in the documents' own order, not by key", () => {
    const docs = [{ id: "NDC" }, { id: "FSS" }, { id: "NBSAP" }];
    expect(pairInOrder("FSS<->NDC", docs)).toEqual(["NDC", "FSS"]);
    expect(pairInOrder("FSS<->NBSAP", docs)).toEqual(["FSS", "NBSAP"]);
  });
});
