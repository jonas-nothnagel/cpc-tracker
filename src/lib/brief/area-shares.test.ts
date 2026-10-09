import { describe, expect, it } from "vitest";
import { lensAreas } from "./areas";
import { MIN_AREA_COMPARISONS, emptyCounts, scopeOf, type ToneCounts } from "./compute";
import { briefFixture } from "./test-fixture";
import {
  DEFAULT_AREA_SORT,
  areaShare,
  areaTones,
  nextAreaSort,
  orderRows,
  sortAreas,
  type AreaSort,
} from "./area-shares";

// Fixture lens: Protected areas g1 (A1-A3), Agriculture g2 (B4-B6), Water g5 (C1-C3).
const source = briefFixture();
const scope = scopeOf(source, ["A", "B", "C"]);
const lens = lensAreas(source, scope, "globe");
const tones = areaTones(lens, scope);

function counts(reinforce: number, partial: number, apart: number, none = 0): ToneCounts {
  return { reinforce, partial, apart, none, total: reinforce + partial + apart + none };
}

describe("areaTones", () => {
  it("counts every reading of the target pairs that involve an area's targets", () => {
    // A1-A3 against B1-B6 and C1-C6: all aligned
    expect(tones.get("g1")).toEqual(counts(36, 0, 0));
    // B4-B6: 12 aligned, 3 partial, 3 misaligned with A; 9 partial, 9 misaligned with C
    expect(tones.get("g2")).toEqual(counts(12, 12, 12));
    // C1-C3: 15 aligned, 3 partial with A; 9 aligned, 6 partial, 3 misaligned with B
    expect(tones.get("g5")).toEqual(counts(24, 9, 3));
  });

  it("credits a target pair between two areas to both", () => {
    // A1-A3 x C1-C3 sit in g1 and in g5
    const only = lensAreas(source, scopeOf(source, ["A", "C"]), "globe");
    const t = areaTones(only, scopeOf(source, ["A", "C"]));
    expect(t.get("g1")?.total).toBe(18);
    expect(t.get("g5")?.total).toBe(18);
  });
});

describe("areaShare", () => {
  it("divides a reading by all of the area's target pairs", () => {
    expect(areaShare(counts(24, 9, 3), "reinforce")).toBeCloseTo(24 / 36);
    expect(areaShare(counts(24, 9, 3), "partial")).toBeCloseTo(9 / 36);
    expect(areaShare(counts(24, 9, 3), "apart")).toBeCloseTo(3 / 36);
  });

  it("leaves an area with too few target pairs unrated", () => {
    expect(areaShare(counts(MIN_AREA_COMPARISONS - 1, 0, 0), "reinforce")).toBeNull();
    expect(areaShare(counts(MIN_AREA_COMPARISONS, 0, 0), "reinforce")).toBe(1);
    expect(areaShare(emptyCounts(), "apart")).toBeNull();
  });
});

describe("nextAreaSort", () => {
  it("sorts a new column most first, and the same column least first on a second click", () => {
    const start: AreaSort = { key: "reinforce", dir: "desc" };
    expect(nextAreaSort(start, "apart")).toEqual({ key: "apart", dir: "desc" });
    expect(nextAreaSort(start, "reinforce")).toEqual({ key: "reinforce", dir: "asc" });
    expect(nextAreaSort({ key: "reinforce", dir: "asc" }, "reinforce")).toEqual({ key: "reinforce", dir: "desc" });
  });
});

describe("sortAreas", () => {
  it("orders the areas by a share, most first or least first", () => {
    expect(sortAreas(lens, tones, { key: "reinforce", dir: "desc" })).toEqual(["g1", "g5", "g2"]);
    expect(sortAreas(lens, tones, { key: "reinforce", dir: "asc" })).toEqual(["g2", "g5", "g1"]);
    expect(sortAreas(lens, tones, { key: "apart", dir: "desc" })).toEqual(["g2", "g5", "g1"]);
    expect(sortAreas(lens, tones, { key: "partial", dir: "asc" })).toEqual(["g1", "g5", "g2"]);
  });

  it("orders by targets, ties in the taxonomy's order whichever the direction", () => {
    expect(sortAreas(lens, tones, { key: "targets", dir: "desc" })).toEqual(["g1", "g2", "g5"]);
    expect(sortAreas(lens, tones, { key: "targets", dir: "asc" })).toEqual(["g1", "g2", "g5"]);
  });

  it("puts unrated areas last and breaks ties by size, then the taxonomy's order", () => {
    const big = { ...lens.areas[0], id: "big", order: 9, targets: ["x1", "x2", "x3", "x4"] };
    const thin = { ...lens.areas[0], id: "thin", order: 0, targets: ["y1"] };
    const tied = { ...lens.areas[0], id: "tied", order: 1, targets: ["z1"] };
    const custom = { ...lens, areas: [thin, tied, big] };
    const t = new Map<string, ToneCounts>([
      ["thin", counts(10, 0, 0)],
      ["tied", counts(30, 30, 0)],
      ["big", counts(40, 40, 0)],
    ]);
    expect(sortAreas(custom, t, { key: "reinforce", dir: "desc" })).toEqual(["big", "tied", "thin"]);
    expect(sortAreas(custom, t, { key: "reinforce", dir: "asc" })).toEqual(["big", "tied", "thin"]);
  });
});

describe("orderRows", () => {
  it("lays the picture's rows out in the order of the sort, opening with the most aligned areas", () => {
    expect(DEFAULT_AREA_SORT).toEqual({ key: "reinforce", dir: "desc" });
    const rows = lens.areas.map((area) => ({ id: area.id, targets: area.targets }));
    const order = sortAreas(lens, tones, DEFAULT_AREA_SORT);
    expect(orderRows(rows, order).map((r) => r.id)).toEqual(["g1", "g5", "g2"]);
    expect(orderRows(rows, order)[1]).toBe(rows[2]);
  });
});
