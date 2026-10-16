import { describe, expect, it } from "vitest";
import { layoutAreaField, ROW_LABEL, targetAt } from "./area-layout";

const ROWS = [
  { id: "r1", targets: ["a", "b"] },
  { id: "r2", targets: ["c"] },
];

describe("layoutAreaField", () => {
  it("sets each row's targets on a line under its name, one dot a target", () => {
    const layout = layoutAreaField(ROWS, 212);
    expect(layout.pitch).toBe(14);
    expect(layout.rows.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(layout.rows[0].y).toBe(0);
    expect(layout.at.get("a")!.x).toBeCloseTo(13);
    expect(layout.at.get("b")!.x).toBeCloseTo(27);
    // Name line 20, gap 4, half a pitch to the dot's centre.
    expect(layout.at.get("a")!.y).toBeCloseTo(31);
    // A line of dots and 14 after the row.
    expect(layout.rows[1].y).toBeCloseTo(52);
    expect(layout.at.get("c")!.y).toBeCloseTo(83);
    expect(layout.height).toBeCloseTo(104);
  });

  it("keeps the dots readable: a long row wraps onto further lines rather than shrinking them", () => {
    const targets = Array.from({ length: 30 }, (_, i) => `t${i}`);
    const layout = layoutAreaField([{ id: "r", targets }], 100);
    expect(layout.pitch).toBe(9);
    expect(layout.targetR).toBeGreaterThanOrEqual(3);
    const first = layout.at.get("t0")!;
    const next = layout.at.get("t9")!;
    expect(next.x).toBeCloseTo(first.x);
    expect(next.y - first.y).toBeCloseTo(layout.pitch);
    expect(layout.height).toBeCloseTo(ROW_LABEL + 4 + 4 * 9 + 14);
  });

  it("spaces the dots by the widest row, between 9 and 14 px", () => {
    const row = (n: number) => [{ id: "r", targets: Array.from({ length: n }, (_, i) => `t${i}`) }];
    expect(layoutAreaField(row(4), 600).pitch).toBe(14);
    expect(layoutAreaField(row(50), 612).pitch).toBeCloseTo(12);
    expect(layoutAreaField(row(75), 612).pitch).toBe(9);
  });

  it("keeps every row's height whatever the targets' order", () => {
    const shuffled = [
      { id: "r1", targets: ["b", "a"] },
      { id: "r2", targets: ["c"] },
    ];
    expect(layoutAreaField(shuffled, 212).height).toBe(layoutAreaField(ROWS, 212).height);
  });
});

describe("targetAt", () => {
  it("finds the target whose dot is under the pointer", () => {
    const layout = layoutAreaField(ROWS, 212);
    expect(targetAt(layout, 13, 31)).toBe("a");
    expect(targetAt(layout, 19, 36)).toBe("a");
    expect(targetAt(layout, 27, 31)).toBe("b");
    expect(targetAt(layout, 13, 83)).toBe("c");
    expect(targetAt(layout, 13, 10)).toBeNull();
    expect(targetAt(layout, 150, 31)).toBeNull();
  });
});
