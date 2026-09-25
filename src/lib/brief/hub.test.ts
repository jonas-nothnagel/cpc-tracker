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
  pairInOrder,
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

    it("gives every pair its dot in a large corpus too, never a sample", () => {
      const { data, particles: many } = corpus([60, 45, 40, 38, 30, 30, 25, 20, 18, 12]);
      const map = layoutHub({ kind: "map" }, many, data, 480, 520);
      expect(visibleCount(map)).toBe(many.length);
      expect(map.groups.reduce((s, g) => s + g.count, 0)).toBe(many.length);
    });
  });

  describe("the map, brought forward for one question", () => {
    const flagged = (p: HubParticle) => p.level === "flagged";

    it("potential misalignment: the pairs of the targets that carry most of it, the rest set back", () => {
      expect(DATA.concentration.top).toEqual(["B6", "A6"]);
      const layout = layoutHub({ kind: "map", tone: "apart", focus: { kind: "top" } }, particles, DATA, 800, 500);
      expect(visibleCount(layout)).toBe(108);
      const lead = particles.flatMap((p, i) => (flagged(p) && layout.alpha[i] === 1 ? [p] : []));
      expect(lead).toHaveLength(12);
      expect(lead.every((p) => ["B6", "A6"].includes(p.ca) || ["B6", "A6"].includes(p.cb))).toBe(true);
      expect(particles.filter((p, i) => flagged(p) && layout.alpha[i] === MAP_MID)).toHaveLength(3);
      expect(particles.every((p, i) => flagged(p) || layout.alpha[i] === MAP_FAINT)).toBe(true);
    });

    it("a theme: the pairs of its tone between the documents it cites", () => {
      const layout = layoutHub(
        { kind: "map", tone: "reinforce", focus: { kind: "theme", index: 0 } },
        particles,
        DATA,
        800,
        500,
      );
      const aligned = (p: HubParticle) => p.tone === DOT_ORDER.indexOf("reinforce");
      const forward = particles.filter((p, i) => layout.alpha[i] === 1);
      expect(forward).toHaveLength(54);
      expect(forward.every((p) => aligned(p) && p.a === "A")).toBe(true);
      // The rest of the tone steps further back than for the step's own finding.
      expect(particles.filter((p, i) => aligned(p) && layout.alpha[i] === MAP_BACK)).toHaveLength(18);
      expect(MAP_BACK).toBeLessThan(MAP_MID);
    });

    it("a type of potential misalignment: its pairs forward, the other potential misalignments set back", () => {
      const mixed = particles.map((p, i) =>
        p.level === "flagged" ? { ...p, mechanism: i % 2 ? ("goal_conflict" as const) : ("resource_competition" as const) } : p,
      );
      const layout = layoutHub(
        { kind: "map", tone: "apart", focus: { kind: "mechanism", mechanism: "goal_conflict" } },
        mixed,
        DATA,
        800,
        500,
      );
      mixed.forEach((p, i) => {
        if (p.mechanism === "goal_conflict") expect(layout.alpha[i]).toBe(1);
        else if (p.level === "flagged") expect(layout.alpha[i]).toBe(MAP_BACK);
        else expect(layout.alpha[i]).toBe(MAP_FAINT);
      });
    });

    it("a document: its row and column forward", () => {
      const layout = layoutHub({ kind: "map", focus: { kind: "doc", doc: "B" } }, particles, DATA, 800, 500);
      particles.forEach((p, i) => {
        expect(layout.alpha[i]).toBe(p.a === "B" || p.b === "B" ? 1 : MAP_FAINT);
      });
    });

    it("keeps every dot in its place, so only the emphasis changes", () => {
      const plain = layoutHub({ kind: "map" }, particles, DATA, 800, 500);
      const apart = layoutHub({ kind: "map", tone: "apart", focus: { kind: "top" } }, particles, DATA, 800, 500);
      expect([...apart.x]).toEqual([...plain.x]);
      expect([...apart.y]).toEqual([...plain.y]);
      expect([...plain.alpha].every((a) => a === 1)).toBe(true);
    });
  });

  it("a target in focus: its target pairs beside it, one cluster per other document", () => {
    const layout = layoutHub({ kind: "target", id: "B6" }, particles, DATA, 800, 500);
    expect(visibleCount(layout)).toBe(12);
    expect(layout.groups.map((g) => [g.key, g.count, g.side])).toEqual([
      ["A", 6, "left"],
      ["C", 6, "right"],
    ]);
    expect(layout.center).toMatchObject({ x: 400, y: 250 });
    for (const g of layout.groups) {
      expect(g.x1 < 400 - 60 || g.x0 > 400 + 60).toBe(true);
    }
    // Potential misalignment first, as around a document.
    const cluster = particles.flatMap((p, i) => (layout.visible[i] && (p.a === "A" || p.b === "A") ? [i] : []));
    const order = [...cluster].sort((i, j) => layout.y[i] - layout.y[j] || layout.x[i] - layout.x[j]);
    expect(particles[order[0]].level).toBe("flagged");
  });

  it("a target in focus on a phone: its few pairs leave its partners two lines for their names", () => {
    const { data, particles: many } = corpus([15, 36, 16, 20, 15, 41, 27, 8]);
    const target = layoutHub({ kind: "target", id: "D0_0" }, many, data, 390, 371);
    const document = layoutHub({ kind: "doc", doc: "D0" }, many, data, 390, 371);
    expect(target.focusLabel).toBeGreaterThanOrEqual(48);
    expect(target.focusLabel).toBeGreaterThan(document.focusLabel);
    for (const g of target.groups) expect(g.y0 - target.focusLabel).toBeGreaterThanOrEqual(0);
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
      [{ kind: "doc", doc: "A" }, 1.8],
      [{ kind: "target", id: "B6" }, 2.6],
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
      { kind: "map", tone: "apart", focus: { kind: "top" } },
      { kind: "target", id: "A6" },
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
