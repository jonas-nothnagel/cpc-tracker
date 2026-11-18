import { describe, expect, it } from "vitest";
import { INSIGHT_MIN_UNITS, insightHalf, fewestToHalf } from "./insight";

describe("fewestToHalf", () => {
  it("takes the fewest units, largest first, that together hold at least half", () => {
    expect(fewestToHalf([5, 3, 1, 1], 10)).toEqual({ units: 1, count: 5 });
    expect(fewestToHalf([4, 3, 2, 1], 10)).toEqual({ units: 2, count: 7 });
    expect(fewestToHalf([3, 3, 3], 9)).toEqual({ units: 2, count: 6 });
  });

  it("reads half of what is counted, which may hold more than the units", () => {
    // 10 counted, 6 of them outside every unit: the units never reach half.
    expect(fewestToHalf([3, 1], 10)).toBeNull();
    expect(fewestToHalf([5, 1], 10)).toEqual({ units: 1, count: 5 });
  });

  it("says nothing with nothing to count", () => {
    expect(fewestToHalf([], 0)).toBeNull();
    expect(fewestToHalf([0, 0, 0], 0)).toBeNull();
  });

  it("states a sentence only with three units or more to choose from", () => {
    expect(INSIGHT_MIN_UNITS).toBe(3);
  });
});

describe("insightHalf", () => {
  it("reads the units largest first, whatever order they come in", () => {
    expect(insightHalf([1, 5, 3, 1], 10)).toEqual({ units: 1, count: 5 });
  });

  it("says nothing with fewer than three units, or fewer than three things counted", () => {
    expect(insightHalf([6, 4], 10)).toBeNull();
    expect(insightHalf([1, 1, 0], 2)).toBeNull();
  });

  it("says nothing when it takes every unit to reach half: then none stands out", () => {
    expect(insightHalf([3, 3, 3], 18)).toBeNull();
    expect(insightHalf([3, 3, 3, 0], 18)).toBeNull();
  });
});
