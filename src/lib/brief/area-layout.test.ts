import { describe, expect, it } from "vitest";
import { layoutAreaField, ROW_LABEL, targetAt } from "./area-layout";

const ROWS = [
  { id: "r1", targets: ["a", "b"] },
  { id: "r2", targets: ["c"] },
];
const row = (n: number) => [{ id: "r", targets: Array.from({ length: n }, (_, i) => `t${i}`) }];

describe("layoutAreaField", () => {
  it("sets each row's targets on one line under its name, the first dot at the name's left edge", () => {
    const layout = layoutAreaField(ROWS, 212);
    expect(layout.pitch).toBe(10);
    expect(layout.targetR).toBeCloseTo(3.2);
    expect(layout.rows.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(layout.rows[0].y).toBe(0);
    expect(layout.at.get("a")!.x - layout.targetR).toBeCloseTo(0);
    expect(layout.at.get("b")!.x).toBeCloseTo(13.2);
    // Name line 20, gap 2, half a line of 10 to the dot's centre.
    expect(layout.at.get("a")!.y).toBeCloseTo(27);
    // A line of dots and 14 after the row.
    expect(layout.rows[1].y).toBeCloseTo(46);
    expect(layout.at.get("c")!.y).toBeCloseTo(73);
    expect(layout.height).toBeCloseTo(92);
  });

  it("fills the name's column with the largest area on one line", () => {
    const layout = layoutAreaField(row(75), 800, 600);
    expect(layout.pitch).toBeCloseTo(8);
    const at = [...layout.at.values()];
    expect(new Set(at.map((p) => p.y)).size).toBe(1);
    expect(Math.max(...at.map((p) => p.x)) + layout.targetR).toBeLessThanOrEqual(600);
  });

  it("keeps the dots inside the name's column, clear of the figures beside it", () => {
    const layout = layoutAreaField([...ROWS, ...row(40)], 800, 300);
    const right = Math.max(...[...layout.at.values()].map((p) => p.x)) + layout.targetR;
    expect(right).toBeLessThanOrEqual(300);
  });

  it("wraps only where the column is too narrow for the smallest spacing", () => {
    const layout = layoutAreaField(row(110), 240, 200);
    expect(layout.pitch).toBe(3);
    const lines = new Set([...layout.at.values()].map((p) => p.y));
    expect(lines.size).toBe(2);
    expect(layout.height).toBeCloseTo(ROW_LABEL + 2 + 2 * 8 + 14);
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
    expect(targetAt(layout, 3.2, 27)).toBe("a");
    expect(targetAt(layout, 7, 30)).toBe("a");
    expect(targetAt(layout, 13.2, 27)).toBe("b");
    expect(targetAt(layout, 3.2, 73)).toBe("c");
    expect(targetAt(layout, 3.2, 10)).toBeNull();
    expect(targetAt(layout, 150, 27)).toBeNull();
  });
});
