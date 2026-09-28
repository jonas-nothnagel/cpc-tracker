import { describe, expect, it } from "vitest";
import { cloudDots, layoutAreaField, targetAt } from "./area-layout";

const ROWS = [
  { id: "r1", targets: ["a", "b"] },
  { id: "r2", targets: ["c"] },
];
const REST = new Map([
  ["a", 4],
  ["b", 0],
  ["c", 0],
]);

describe("layoutAreaField", () => {
  it("sets each row's targets on its line, with room for their clouds above", () => {
    const layout = layoutAreaField(ROWS, REST, 212);
    expect(layout.pitch).toBe(12);
    expect([layout.per, layout.sp]).toEqual([2, 4.6]);
    expect(layout.rows.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(layout.rows[0].y).toBe(0);
    expect(layout.at.get("a")!.x).toBeCloseTo(12);
    expect(layout.at.get("b")!.x).toBeCloseTo(24);
    // Name line 20, gap 8, a cloud of two lines of 4.6, the lift of 4.8.
    expect(layout.at.get("a")!.y).toBeCloseTo(42);
    expect(layout.rows[1].y).toBeCloseTo(70);
    expect(layout.at.get("c")!.y).toBeCloseTo(102.8);
    expect(layout.height).toBeCloseTo(130.8);
  });

  it("takes its row heights from the clouds at rest", () => {
    const flat = layoutAreaField(ROWS, new Map([["a", 0], ["b", 0], ["c", 0]]), 212);
    const tall = layoutAreaField(ROWS, REST, 212);
    expect(tall.rows[1].y - flat.rows[1].y).toBeCloseTo(2 * 4.6);
  });

  it("wraps a long row onto further lines, each with room for its clouds", () => {
    const targets = Array.from({ length: 30 }, (_, i) => `t${i}`);
    const layout = layoutAreaField([{ id: "r", targets }], new Map(targets.map((id) => [id, 0])), 100);
    expect(layout.pitch).toBe(6.5);
    const first = layout.at.get("t0")!;
    const next = layout.at.get("t13")!;
    expect(next.x).toBeCloseTo(first.x);
    expect(next.y - first.y).toBeCloseTo(layout.lift + layout.pitch);
  });

  it("takes three dots a line when two would make the field too tall", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, targets: [`t${i}`] }));
    const layout = layoutAreaField(rows, new Map(rows.map((r) => [r.targets[0], 80])), 212);
    expect(layout.per).toBe(3);
    expect(layout.sp).toBeCloseTo(3.6);
  });
});

describe("cloudDots", () => {
  it("stops a cloud at forty lines and says it is cut", () => {
    expect(cloudDots(80, 2)).toEqual({ dots: 80, cut: false });
    expect(cloudDots(81, 2)).toEqual({ dots: 80, cut: true });
    expect(cloudDots(211, 3)).toEqual({ dots: 120, cut: true });
  });
});

describe("targetAt", () => {
  it("finds the target whose column is under the pointer, its cloud included", () => {
    const layout = layoutAreaField(ROWS, REST, 212);
    expect(targetAt(layout, REST, 12, 40)).toBe("a");
    expect(targetAt(layout, REST, 12, 26)).toBe("a");
    expect(targetAt(layout, REST, 25, 42)).toBe("b");
    expect(targetAt(layout, REST, 12, 10)).toBeNull();
    expect(targetAt(layout, REST, 150, 42)).toBeNull();
  });
});
