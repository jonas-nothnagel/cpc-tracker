import { describe, expect, it } from "vitest";
import { layoutRing, type ArcSpec } from "./ring";
import { edgeAt, flowerPaths, roadPaths, samplePath } from "./lines";

function arcsOf(sizes: number[]): { arcs: ArcSpec[]; n: number } {
  let next = 0;
  const arcs = sizes.map((size, k) => ({ key: `doc${k}`, ids: Array.from({ length: size }, () => next++) }));
  return { arcs, n: next };
}

const { arcs, n } = arcsOf([36, 20, 41, 15, 27, 16, 15, 8]);
const LAYOUT = layoutRing(arcs, n, 900, 800);
const dist = (x: number, y: number) => Math.hypot(x - LAYOUT.cx, y - LAYOUT.cy);

describe("flowerPaths", () => {
  const edges = [
    { id: 40, relation: "strong" as const },
    { id: 41, relation: "strong" as const },
    { id: 45, relation: "strong" as const },
    { id: 60, relation: "apart" as const },
  ];
  const paths = flowerPaths(LAYOUT, arcs, edges);

  it("draws one line per related target, from the centre to its seat", () => {
    expect(paths.map((p) => p.id)).toEqual([40, 41, 45, 60]);
    for (const p of paths) {
      const pts = samplePath(p, 12);
      const [x0, y0] = pts[0];
      const [x1, y1] = pts[pts.length - 1];
      expect(dist(x0, y0)).toBeCloseTo(LAYOUT.rCentre, 0);
      expect(Math.hypot(x1 - LAYOUT.x[p.id], y1 - LAYOUT.y[p.id])).toBeLessThanOrEqual(LAYOUT.radius + 4);
    }
  });

  it("starts the lines to one arc and reading from one point, so they read as a bundle", () => {
    const [a, b, c] = paths;
    expect(samplePath(a, 4)[0]).toEqual(samplePath(b, 4)[0]);
    expect(samplePath(a, 4)[0]).toEqual(samplePath(c, 4)[0]);
    expect(samplePath(paths[3], 4)[0]).not.toEqual(samplePath(a, 4)[0]);
  });

  it("stays outside the centre", () => {
    for (const p of paths) {
      for (const [x, y] of samplePath(p, 24)) expect(dist(x, y)).toBeGreaterThanOrEqual(LAYOUT.rCentre - 0.5);
    }
  });
});

describe("flowerPaths on a very large arc", () => {
  it("keeps a wide bundle outside the centre", () => {
    const big = arcsOf([4, 16, 91, 4, 192, 9, 55, 33]);
    const layout = layoutRing(big.arcs, big.n, 900, 800);
    const edges = big.arcs[4].ids.map((id) => ({ id, relation: "strong" as const }));
    for (const p of flowerPaths(layout, big.arcs, edges)) {
      for (const [x, y] of samplePath(p, 24)) {
        expect(Math.hypot(x - layout.cx, y - layout.cy)).toBeGreaterThanOrEqual(layout.rCentre - 0.5);
      }
    }
  });
});

describe("roadPaths", () => {
  it("runs from a seat round the centre to each partner without crossing the centre", () => {
    // Seat 0 is at the top; seat 100 roughly opposite.
    const paths = roadPaths(LAYOUT, 0, [{ id: 100, relation: "strong" }, { id: 20, relation: "apart" }]);
    expect(paths).toHaveLength(2);
    for (const p of paths) {
      const pts = samplePath(p, 48);
      expect(Math.hypot(pts[0][0] - LAYOUT.x[0], pts[0][1] - LAYOUT.y[0])).toBeLessThanOrEqual(LAYOUT.radius + 4);
      const end = pts[pts.length - 1];
      expect(Math.hypot(end[0] - LAYOUT.x[p.id], end[1] - LAYOUT.y[p.id])).toBeLessThanOrEqual(LAYOUT.radius + 4);
      for (const [x, y] of pts) expect(dist(x, y)).toBeGreaterThan(LAYOUT.rCentre);
    }
  });
});

describe("edgeAt", () => {
  const paths = flowerPaths(LAYOUT, arcs, [
    { id: 40, relation: "strong" },
    { id: 100, relation: "apart" },
  ]);
  const sampled = paths.map((p) => ({ id: p.id, pts: samplePath(p, 16) }));

  it("finds the line under the pointer", () => {
    const [x, y] = sampled[1].pts[10];
    expect(edgeAt(sampled, x + 1, y, 5)).toBe(100);
  });

  it("finds nothing away from every line", () => {
    expect(edgeAt(sampled, LAYOUT.cx, LAYOUT.cy, 5)).toBeNull();
  });
});
