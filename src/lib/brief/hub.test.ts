import { describe, expect, it } from "vitest";
import { buildBriefData } from "./data";
import { scopeOf } from "./compute";
import { briefFixture, FIXTURE_THEMES } from "./test-fixture";
import { DOT_ORDER } from "./dot-layout";
import { FOCUS_LABEL, hubParticles, layoutHub, type HubParticle } from "./hub";

const SOURCE = briefFixture({ themes: true });
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), null);

function visibleCount(layout: ReturnType<typeof layoutHub>) {
  return layout.visible.reduce((s, v) => s + v, 0);
}

describe("hubParticles", () => {
  it("makes one particle per target pair when no two themes share a pair of documents", () => {
    const particles = hubParticles(DATA);
    expect(particles).toHaveLength(108);
    expect(particles.every((p) => !p.ghost)).toBe(true);
  });

  it("adds a ghost for each extra theme a target pair is covered by", () => {
    const planning = { ...FIXTURE_THEMES[0], name: "Shared water planning", contributing_doc_pairs: ["A<->B"] };
    const full = { storylines: [...FIXTURE_THEMES, planning], summary_paragraph: "", doc_pair_count: 3, schema_version: 2 };
    const source = { ...SOURCE, themes: { ...full, states: { "": full } } };
    const data = buildBriefData(source, scopeOf(source, ["A", "B", "C"]), null);
    const ghosts = hubParticles(data).filter((p) => p.ghost);
    // A~B's 24 aligned pairs sit in both alignment themes.
    expect(ghosts).toHaveLength(24);
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

  it("aligned: only aligned pairs, in their themes and the rest", () => {
    const layout = layoutHub({ kind: "reinforce" }, particles, DATA, 800, 400);
    expect(visibleCount(layout)).toBe(72);
    expect(layout.groups.map((g) => [g.key, g.count])).toEqual([
      ["Shared land restoration", 54],
      ["__other", 18],
    ]);
  });

  it("potential misalignment: only those pairs, in their themes", () => {
    const layout = layoutHub({ kind: "apart" }, particles, DATA, 800, 400);
    expect(visibleCount(layout)).toBe(15);
    expect(layout.groups.map((g) => [g.key, g.count])).toEqual([
      ["Water allocation pressure", 9],
      ["Goal overlap", 6],
    ]);
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
        theme: -1,
        ghost: false,
        base: 0,
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
        expect(column[k].y0 - FOCUS_LABEL).toBeGreaterThanOrEqual(column[k - 1].y1);
      }
      for (const g of column) {
        expect(g.y0 - FOCUS_LABEL).toBeGreaterThanOrEqual(0);
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
    for (const stage of [{ kind: "reinforce" }, { kind: "apart" }, { kind: "doc", doc: "A" }] as const) {
      const layout = layoutHub(stage, particles, DATA, 800, 500);
      const largest = Math.max(...layout.r.filter((_, i) => layout.visible[i]));
      expect(largest).toBeLessThanOrEqual(size * 1.8 + 1e-6);
      expect(largest).toBeGreaterThan(0);
    }
  });

  it("keeps every shown dot inside the field", () => {
    for (const stage of [{ kind: "overview" }, { kind: "reinforce" }, { kind: "apart" }, { kind: "doc", doc: "B" }] as const) {
      const layout = layoutHub(stage, particles, DATA, 800, 500);
      for (let i = 0; i < layout.visible.length; i++) {
        if (!layout.visible[i]) continue;
        expect(layout.x[i]).toBeGreaterThanOrEqual(0);
        expect(layout.x[i]).toBeLessThanOrEqual(800);
        expect(layout.y[i]).toBeGreaterThanOrEqual(0);
        expect(layout.y[i]).toBeLessThanOrEqual(500);
      }
    }
  });
});
