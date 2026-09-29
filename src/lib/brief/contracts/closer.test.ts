import { describe, expect, it } from "vitest";
import { layoutCloser } from "./closer";

const tenders = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);

describe("the rows of targets to look closer at", () => {
  it("puts one dot per tender on its side of the line: potentially misaligned left, strongly matching right", () => {
    const l = layoutCloser([{ id: "A1", mis: tenders(7), match: 5 }], 600);
    const mis = l.dots.filter((d) => d.kind === "mis");
    const match = l.dots.filter((d) => d.kind === "match");
    expect(mis).toHaveLength(7);
    expect(match).toHaveLength(5);
    expect(mis.every((d) => d.x < l.spine)).toBe(true);
    expect(match.every((d) => d.x > l.spine)).toBe(true);
    expect(mis[0].tender).toBe("t0");
    expect(mis[0].x).toBeGreaterThan(mis[6].x);
  });

  it("stops a cloud too long for its side with a gap of one column, then its last column", () => {
    const l = layoutCloser([{ id: "A1", mis: [], match: 2000 }], 600);
    const match = l.dots.filter((d) => d.kind === "match");
    const cols = [...new Set(match.map((d) => Math.round(d.x * 10)))].sort((a, b) => a - b);
    expect(match.length).toBe(cols.length * 3);
    const steps = cols.slice(1).map((c, i) => c - cols[i]);
    // Every step is one pitch, but for the one gap before the last column.
    expect(steps.filter((s) => s > steps[0] * 1.5)).toHaveLength(1);
    expect(l.rows[0].matchCut).toBe(true);
    expect(match.every((d) => d.x < 600)).toBe(true);
  });

  it("stacks the rows without overlap, and knows its height", () => {
    const l = layoutCloser(
      [
        { id: "A1", mis: tenders(3), match: 1 },
        { id: "B1", mis: tenders(1), match: 0 },
      ],
      600,
    );
    expect(l.rows[1].y).toBeGreaterThan(l.rows[0].y + 20);
    expect(l.height).toBeGreaterThan(l.rows[1].y);
    expect(Math.max(...l.dots.map((d) => d.y))).toBeLessThan(l.height);
  });
});
