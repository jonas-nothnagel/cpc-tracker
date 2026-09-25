import { describe, expect, it } from "vitest";
import { buildBriefData, type BriefData } from "./data";
import { scopeOf } from "./compute";
import { briefFixture } from "./test-fixture";
import { DOT_ORDER } from "./dot-layout";
import {
  FOCUS_LABEL,
  MAP_BACK,
  MAP_FAINT,
  MAP_MID,
  hubParticles,
  layoutHub,
  MARK_LINE,
  namedTargets,
  pairInOrder,
  sideLevel,
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

    it("puts each dot at its two targets: the earlier document's in rows, the later one's in columns", () => {
      const at = (ca: string, cb: string) => {
        const i = particles.findIndex((p) => p.ca === ca && p.cb === cb);
        return { x: layout.x[i], y: layout.y[i] };
      };
      const a1b1 = at("A1", "B1");
      const a1b6 = at("A1", "B6");
      const a6b1 = at("A6", "B1");
      expect(a1b6.y).toBeCloseTo(a1b1.y);
      expect(a1b6.x).toBeGreaterThan(a1b1.x);
      expect(a6b1.x).toBeCloseTo(a1b1.x);
      expect(a6b1.y).toBeGreaterThan(a1b1.y);
      // A target keeps its row across the blocks of its document.
      expect(at("A3", "C2").y).toBeCloseTo(at("A3", "B5").y);
      // And its column: B4 against A and against C (B is earlier than C, so rows there).
      expect(at("A2", "B4").x).toBeLessThan(at("B4", "C1").x);
    });

    it("names the documents along the diagonal, each next to its own empty square", () => {
      expect(layout.axis.map((a) => a.key)).toEqual(["A", "B", "C"]);
      for (let k = 1; k < layout.axis.length; k++) {
        expect(layout.axis[k].labelX).toBeGreaterThan(layout.axis[k - 1].labelX);
        expect(layout.axis[k].labelY).toBeGreaterThan(layout.axis[k - 1].labelY);
      }
      for (const axis of layout.axis) {
        // A document is never compared with itself: its square stays empty.
        for (let i = 0; i < particles.length; i++) {
          const x = layout.x[i];
          const y = layout.y[i];
          expect(x > axis.square.x0 && x < axis.square.x1 && y > axis.square.y0 && y < axis.square.y1).toBe(false);
        }
        expect(axis.labelX).toBeLessThanOrEqual(axis.square.x0);
        expect(axis.labelWidth).toBeGreaterThan(0);
      }
    });

    it("takes the width its names leave: short names, a larger map", () => {
      const narrow = layoutHub({ kind: "map" }, particles, DATA, 500, 620);
      const right = Math.max(...narrow.groups.map((g) => g.x1));
      const left = Math.min(...narrow.axis.map((a) => a.square.x0));
      expect(right - left).toBeGreaterThan(0.8 * 500);
      // The first name still has its room.
      expect(narrow.axis[0].labelWidth).toBeGreaterThanOrEqual("Document A".length * 6.6);
      expect(right).toBeLessThanOrEqual(500);
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
      for (let k = 1; k < map.axis.length; k++) {
        expect(map.axis[k].labelY - map.axis[k - 1].labelY).toBeGreaterThanOrEqual(
          (map.axis[k].labelHeight + map.axis[k - 1].labelHeight) / 2 - 1e-6,
        );
      }
      for (const axis of map.axis) {
        expect(axis.labelY - axis.labelHeight / 2).toBeGreaterThanOrEqual(-1e-6);
        expect(axis.labelY + axis.labelHeight / 2).toBeLessThanOrEqual(371 + 1e-6);
      }
    });

    it("keeps each name clear of the diagonal, even a tall name beside a small document", () => {
      const docs = ["Vision 2050", "Nationally Determined Contribution", "National targets for implementation of the Paris Agreement", "National Biodiversity Strategy & Action Plan", "National Adaptation Plan", "Food Supply and Security Measures", "LDN Targets", "Investing in Land Degradation Neutrality"];
      const { data, particles: many } = corpus([15, 36, 16, 20, 15, 41, 27, 8]);
      const named = { ...data, scope: { ...data.scope, docs: data.scope.docs.map((d, k) => ({ ...d, name: docs[k] })) } };
      for (const [w, h] of [[450, 700], [500, 620], [390, 371]]) {
        const map = layoutHub({ kind: "map" }, many, named, w, h);
        const x0 = map.axis[0].square.x0;
        const y0 = map.axis[0].square.y0;
        for (const a of map.axis) {
          // Every document's own stretch lies on one line, x - x0 = y - y0.
          const top = a.labelY - a.labelHeight / 2;
          expect(a.labelX).toBeLessThanOrEqual(x0 + (top - y0) + 1e-6);
        }
      }
    });

    it("never lets dots overlap, so a block's colours read true in a large corpus", () => {
      const { data, particles: many } = corpus([60, 50, 45, 40, 40, 40, 35, 30, 30, 30]);
      const map = layoutHub({ kind: "map" }, many, data, 358, 370);
      const side = map.axis[0].square.x1 - map.axis[0].square.x0;
      const pitch = side / 60;
      expect(pitch).toBeLessThan(0.8);
      expect(map.pitch).toBeCloseTo(pitch);
      const shown = many.findIndex((_, i) => map.visible[i]);
      expect(2 * map.r[shown]).toBeLessThanOrEqual(pitch + 1e-6);
    });

    it("draws each pair as a square the size of its cell", () => {
      const shown = particles.findIndex((_, i) => layout.visible[i]);
      expect(layout.pitch).toBeGreaterThan(0);
      expect(2 * layout.r[shown]).toBeCloseTo(layout.pitch);
    });

    it("leads a name back to its document only when it had to move away", () => {
      for (const a of layout.axis) expect(a.lead).toBeNull();
      const { data, particles: many } = corpus([30, 4, 3, 5, 40, 2, 6, 25, 3, 3, 20, 8]);
      const crowded = layoutHub({ kind: "map" }, many, data, 390, 371);
      const moved = crowded.axis.filter((a) => a.lead !== null);
      expect(moved.length).toBeGreaterThan(0);
      for (const a of moved) {
        // The lead ends on the document's own stretch of the diagonal.
        expect(a.lead!.x - a.square.x0).toBeCloseTo(a.lead!.y - a.square.y0);
        expect(a.lead!.y).toBeGreaterThanOrEqual(a.square.y0);
        expect(a.lead!.y).toBeLessThanOrEqual(a.square.y1);
      }
    });

    it("gives every pair its dot in a large corpus too, never a sample", () => {
      const { data, particles: many } = corpus([60, 45, 40, 38, 30, 30, 25, 20, 18, 12]);
      const map = layoutHub({ kind: "map" }, many, data, 480, 520);
      expect(visibleCount(map)).toBe(many.length);
      expect(map.groups.reduce((s, g) => s + g.count, 0)).toBe(many.length);
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
      // The documents and the map keep their place and size.
      expect(apart.axis.map((a) => a.square)).toEqual(plain.axis.map((a) => a.square));
    });

    it("puts the side's targets first in their document, so its pairs gather in the corner", () => {
      // A6 and B6 carry most of the potential misalignment: each leads its document.
      const i = particles.findIndex((p) => p.ca === "A6" && p.cb === "B6");
      const corner = particles.findIndex((p) => p.ca === "A1" && p.cb === "B1");
      expect(apart.x[i]).toBeCloseTo(plain.x[corner]);
      expect(apart.y[i]).toBeCloseTo(plain.y[corner]);
      // Then by how many of the side's pairs a target is in: C4-C6 (two each)
      // before C1-C3 (one each), so B5 x C4 takes C's first column.
      const b5c4 = particles.findIndex((p) => p.ca === "B5" && p.cb === "C4");
      const firstColumnOfC = plain.axis.find((a) => a.key === "C")!.square.x0 + apart.pitch / 2;
      expect(apart.x[b5c4]).toBeCloseTo(firstColumnOfC);
    });

    it("names the targets that carry it, with their counts, at the front of their document", () => {
      expect(namedTargets(DATA, "apart")).toEqual(["B6", "A6"]);
      expect(apart.marks.map((m) => [m.id, m.doc, m.count])).toEqual([
        ["A6", "A", 6],
        ["B6", "B", 7],
      ]);
      for (const m of apart.marks) {
        const axis = apart.axis.find((a) => a.key === m.doc)!;
        // Its own point: the first on the document's stretch of the diagonal.
        expect(m.y).toBeCloseTo(axis.square.y0 + apart.pitch / 2);
        expect(m.x).toBeCloseTo(axis.square.x0 + apart.pitch / 2);
        // Its name under the document's name, on the same side of the diagonal.
        expect(m.labelY).toBeGreaterThan(axis.labelY);
        expect(m.labelX).toBeLessThanOrEqual(axis.square.x0);
        expect(m.labelWidth).toBeGreaterThan(0);
      }
    });

    it("gives a long name two lines where one would not hold it", () => {
      // "6 Commitment B6 Verbatim text of commitment B6." is wider than B's room.
      const b6 = apart.marks.find((m) => m.id === "B6")!;
      expect(b6.lines).toBe(2);
      expect(b6.labelHeight).toBe(2 * MARK_LINE - 2);
      expect(b6.align).toBe("right");
    });

    it("names the first document's targets above the map when there is room for them", () => {
      // A taller field leaves room above the map: the first document's
      // targets are named there, from the start of its stretch.
      const tall = layoutHub({ kind: "map", side: "apart", focus: { kind: "top" } }, particles, DATA, 800, 900);
      const a = tall.axis.find((x) => x.key === "A")!;
      const a6 = tall.marks.find((m) => m.id === "A6")!;
      expect(a6.align).toBe("left");
      expect(a6.labelX).toBeCloseTo(a.square.x0);
      expect(a6.labelY + a6.labelHeight / 2).toBeLessThanOrEqual(a.square.y0);
      expect(a6.labelWidth).toBeGreaterThan(400);
      // Without that room they follow the document's name, as the others do.
      expect(apart.marks.find((m) => m.id === "A6")!.align).toBe("right");
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

    it("keeps names and marks apart, inside the field and clear of the diagonal, with many documents", () => {
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
        const labels = [
          ...map.axis.map((a) => ({ y: a.labelY, h: a.labelHeight, x: a.labelX, above: false })),
          ...map.marks.map((m) => ({ y: m.labelY, h: m.labelHeight, x: m.labelX, above: m.align === "left" })),
        ].sort((p, q) => p.y - q.y);
        for (let k = 1; k < labels.length; k++) {
          expect(labels[k].y - labels[k - 1].y).toBeGreaterThanOrEqual((labels[k].h + labels[k - 1].h) / 2 - 1e-6);
        }
        const x0 = map.axis[0].square.x0;
        const y0 = map.axis[0].square.y0;
        for (const l of labels) {
          expect(l.y - l.h / 2).toBeGreaterThanOrEqual(-1e-6);
          expect(l.y + l.h / 2).toBeLessThanOrEqual(h + 1e-6);
          // Names beside the diagonal stay left of it; names above the map stay above it.
          if (l.above) expect(l.y + l.h / 2).toBeLessThanOrEqual(y0 + 1e-6);
          else expect(l.x).toBeLessThanOrEqual(x0 + (l.y - l.h / 2 - y0) + 1e-6);
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

describe("pairInOrder", () => {
  it("names a pair of documents in the documents' own order, not by key", () => {
    const docs = [{ id: "NDC" }, { id: "FSS" }, { id: "NBSAP" }];
    expect(pairInOrder("FSS<->NDC", docs)).toEqual(["NDC", "FSS"]);
    expect(pairInOrder("FSS<->NBSAP", docs)).toEqual(["FSS", "NBSAP"]);
  });
});
