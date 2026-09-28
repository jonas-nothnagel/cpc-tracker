import { describe, expect, it } from "vitest";

import { dotCounts, fieldLayout, niceUnit } from "./field";

describe("niceUnit", () => {
  it("picks the smallest round amount that fits the largest use into the dots available", () => {
    expect(niceUnit(18_777, 400)).toBe(50); // 46.9 per dot, rounded up to 50
    expect(niceUnit(93_400, 400)).toBe(250); // 233.5
    expect(niceUnit(1_000, 400)).toBe(2.5); // exactly 2.5
    expect(niceUnit(3_990, 400)).toBe(10); // 9.98: the next power of ten
    expect(niceUnit(120, 400)).toBe(0.5); // 0.3
  });

  it("falls back to one unit when there is nothing to fit", () => {
    expect(niceUnit(0, 400)).toBe(1);
  });
});

describe("dotCounts", () => {
  it("rounds each use to whole dots, so a use smaller than half a dot shows none", () => {
    expect(dotCounts([18_777, 67.4, 1.3], 50)).toEqual([376, 1, 0]);
  });
});

describe("fieldLayout", () => {
  it("fills each use's row column by column, all rows on one grid", () => {
    const layout = fieldLayout([5, 1], {
      x0: 10,
      width: 100,
      rowHeight: 40,
      blockTop: 8,
      lines: 2,
      columns: 10,
    });
    expect(layout.pitch).toBe(10);
    expect([...layout.xs]).toEqual([15, 15, 25, 25, 35, 15]);
    expect([...layout.ys]).toEqual([13, 23, 13, 23, 13, 53]);
    expect([...layout.row]).toEqual([0, 0, 0, 0, 0, 1]);
  });
});
