import { describe, expect, it } from "vitest";
import { DEFAULT_GRAMS_PER_CALL, DEFAULT_PAIRS_PER_MINUTE, estimateRun, pairsPerMinute } from "./estimate";

const speed = { pairsPerMinute: DEFAULT_PAIRS_PER_MINUTE, gramsPerCall: DEFAULT_GRAMS_PER_CALL };

describe("pairsPerMinute", () => {
  it("is this service's median pace over its recent runs, or 450 until it has any", () => {
    expect(pairsPerMinute([])).toBe(450);
    expect(
      pairsPerMinute([
        { pairs: 2000, seconds: 300 },
        { pairs: 6000, seconds: 720 },
        { pairs: 100, seconds: 90 },
      ]),
    ).toBe(450);
    expect(pairsPerMinute([{ pairs: 3000, seconds: 300 }])).toBe(600);
  });
});

describe("estimateRun", () => {
  it("takes the time from the pairs and the footprint from the calls", () => {
    expect(estimateRun({ targets: 150, pairs: 7500, lenses: 4 }, speed)).toEqual({ minutes: 17, kg: 0.7 });
    expect(estimateRun({ targets: 89, pairs: 2090, lenses: 4 }, speed)).toEqual({ minutes: 5, kg: 0.2 });
  });

  it("says at least 2 minutes and 0.1 kg for the smallest analysis", () => {
    expect(estimateRun({ targets: 8, pairs: 16, lenses: 5 }, speed)).toEqual({ minutes: 2, kg: 0.1 });
  });
});
