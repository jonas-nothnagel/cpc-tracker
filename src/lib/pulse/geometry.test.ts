import { describe, expect, it } from "vitest";
import { arcPositions, fiberPath, hashUnit, nerveWidth } from "./geometry";

describe("arcPositions", () => {
  it("places n points symmetrically inside the box", () => {
    const pts = arcPositions(5, 1000, 600);
    expect(pts).toHaveLength(5);
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(1000);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(600);
    }
    // symmetry: first and last mirror around the horizontal center
    expect(pts[0].x + pts[4].x).toBeCloseTo(1000, 0);
    expect(pts[0].y).toBeCloseTo(pts[4].y, 0);
  });

  it("is deterministic", () => {
    expect(arcPositions(4, 800, 500)).toEqual(arcPositions(4, 800, 500));
  });

  it("handles a single document", () => {
    const pts = arcPositions(1, 1000, 600);
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBeCloseTo(500, 0);
  });
});

describe("hashUnit", () => {
  it("is deterministic and bounded to [-1, 1]", () => {
    expect(hashUnit("NDC~NBSAP", 1)).toBe(hashUnit("NDC~NBSAP", 1));
    for (const seed of ["a", "b", "NDC~NBSAP", "x~y"]) {
      for (let i = 0; i < 4; i++) {
        const v = hashUnit(seed, i);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("differs across seeds", () => {
    expect(hashUnit("NDC~NBSAP", 0)).not.toBe(hashUnit("NDC~FSS", 0));
  });
});

describe("fiberPath", () => {
  const a = { x: 100, y: 200 };
  const b = { x: 700, y: 240 };

  it("is a deterministic cubic path between the endpoints", () => {
    const d1 = fiberPath("NDC~NBSAP", a, b, 1.4);
    expect(d1).toBe(fiberPath("NDC~NBSAP", a, b, 1.4));
    expect(d1.startsWith(`M ${a.x}`)).toBe(true);
    expect(d1).toContain("C ");
  });

  it("varies with the seed so fibers look organic, not templated", () => {
    expect(fiberPath("NDC~NBSAP", a, b, 1.4)).not.toBe(
      fiberPath("NDC~FSS", a, b, 1.4),
    );
  });
});

describe("nerveWidth", () => {
  it("grows with relative share and stays bounded", () => {
    expect(nerveWidth(1)).toBeGreaterThanOrEqual(2);
    expect(nerveWidth(3)).toBeGreaterThan(nerveWidth(1));
    expect(nerveWidth(50)).toBe(nerveWidth(3));
    expect(nerveWidth(50)).toBeLessThanOrEqual(6);
  });
});
