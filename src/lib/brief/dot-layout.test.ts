import { describe, expect, it } from "vitest";
import { layoutDots, layoutGroups } from "./dot-layout";

const COUNTS = { reinforce: 660, partial: 280, apart: 50, none: 10, total: 1000 };

describe("layoutDots", () => {
  it("draws one dot per comparison when the unit is one", () => {
    const layout = layoutDots(COUNTS, 1, 600, 90);
    expect(layout.tones.length).toBe(1000);
    expect(layout.groups.map((g) => [g.tone, g.dots])).toEqual([
      ["reinforce", 660],
      ["partial", 280],
      ["apart", 50],
      ["none", 10],
    ]);
  });

  it("rounds each group up when a dot stands for several comparisons", () => {
    const layout = layoutDots(COUNTS, 7, 600, 90);
    expect(layout.groups.map((g) => g.dots)).toEqual([95, 40, 8, 2]);
  });

  it("keeps every dot inside the field and the groups side by side, left to right", () => {
    const layout = layoutDots(COUNTS, 1, 600, 90);
    for (let i = 0; i < layout.tones.length; i++) {
      expect(layout.xs[i]).toBeGreaterThan(0);
      expect(layout.xs[i]).toBeLessThanOrEqual(600);
      expect(layout.ys[i]).toBeGreaterThan(0);
      expect(layout.ys[i]).toBeLessThanOrEqual(90);
    }
    for (let g = 1; g < layout.groups.length; g++) {
      expect(layout.groups[g].x0).toBeGreaterThan(layout.groups[g - 1].x1);
    }
  });

  it("leaves out tones with no comparisons", () => {
    const layout = layoutDots({ reinforce: 5, partial: 0, apart: 2, none: 0, total: 7 }, 1, 200, 40);
    expect(layout.groups.map((g) => g.tone)).toEqual(["reinforce", "apart"]);
  });

  it("returns an empty field for an empty selection", () => {
    const layout = layoutDots({ reinforce: 0, partial: 0, apart: 0, none: 0, total: 0 }, 1, 200, 40);
    expect(layout.groups).toEqual([]);
    expect(layout.tones.length).toBe(0);
  });
});

describe("layoutDots texture", () => {
  it("thins every other dot of the potential-misalignment group, and no other group", () => {
    const layout = layoutDots({ reinforce: 40, partial: 0, apart: 40, none: 0, total: 80 }, 1, 200, 40);
    const apartIndex = 2; // DOT_ORDER: reinforce, partial, apart, none
    let thinApart = 0;
    let thinOther = 0;
    for (let i = 0; i < layout.tones.length; i++) {
      if (layout.small[i] === 1) {
        if (layout.tones[i] === apartIndex) thinApart += 1;
        else thinOther += 1;
      }
    }
    expect(thinOther).toBe(0);
    expect(thinApart).toBe(20);
  });
});

describe("layoutGroups", () => {
  it("lays any list of groups side by side and skips empty ones", () => {
    const layout = layoutGroups([{ count: 30 }, { count: 0 }, { count: 10, texture: true }], 1, 200, 40);
    expect(layout.groups.map((g) => [g.index, g.dots])).toEqual([
      [0, 30],
      [2, 10],
    ]);
    expect(layout.group.length).toBe(40);
  });

  it("thins every other dot of a textured group only", () => {
    const layout = layoutGroups([{ count: 30 }, { count: 10, texture: true }], 1, 200, 40);
    let thin = 0;
    for (let i = 0; i < layout.group.length; i++) {
      if (layout.small[i] !== 1) continue;
      expect(layout.group[i]).toBe(1);
      thin += 1;
    }
    expect(thin).toBe(5);
  });
});

