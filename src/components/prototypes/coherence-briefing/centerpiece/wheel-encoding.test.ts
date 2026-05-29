import { describe, it, expect } from "vitest";
import {
  CORE_MIN_PX,
  RIBBON_MAX_PX,
  RIBBON_MIN_PX,
  ribbonBaseWidth,
  ribbonCoreWidth,
  ribbonWidthScale,
} from "./wheel-encoding";

describe("ribbonWidthScale", () => {
  it("scales the busiest pair up to RIBBON_MAX_PX", () => {
    const scale = ribbonWidthScale(900);
    expect(ribbonBaseWidth(900, scale)).toBeCloseTo(RIBBON_MAX_PX);
  });
  it("never blows a small corpus up past 1x", () => {
    expect(ribbonWidthScale(4)).toBeLessThanOrEqual(1);
    expect(ribbonWidthScale(0)).toBe(1);
  });
});

describe("ribbonBaseWidth", () => {
  it("clamps to the [MIN, MAX] band", () => {
    const scale = ribbonWidthScale(10000);
    expect(ribbonBaseWidth(10000, scale)).toBeLessThanOrEqual(RIBBON_MAX_PX);
    expect(ribbonBaseWidth(1, scale)).toBeGreaterThanOrEqual(RIBBON_MIN_PX);
  });
  it("is zero for an empty relationship", () => {
    expect(ribbonBaseWidth(0, 1)).toBe(0);
  });
});

describe("ribbonCoreWidth", () => {
  it("is the LINEAR share of the base width (a 15% flag shows 15%, not ~42%)", () => {
    expect(ribbonCoreWidth(20, 0.15)).toBeCloseTo(3);
    expect(ribbonCoreWidth(20, 0.5)).toBeCloseTo(10);
  });
  it("floors a real low-share flag to a findable hairline", () => {
    expect(ribbonCoreWidth(20, 0.005)).toBe(CORE_MIN_PX);
  });
});

describe("red area tracks the corpus flagged share (regression against the old ~50% lie)", () => {
  // baseWidth is proportional to sqrt(total); coreWidth = baseWidth * share
  // (floored). The area-weighted red fraction must track the corpus flagged
  // share, NOT the sqrt-inflated ratio the old per-side encoding produced
  // (which put a ~15%-flagged corpus near ~50% red).
  function redFraction(
    pairs: { total: number; flaggedShare: number }[],
  ): number {
    const maxTotal = Math.max(...pairs.map((p) => p.total));
    const scale = ribbonWidthScale(maxTotal);
    let base = 0;
    let core = 0;
    for (const p of pairs) {
      const b = ribbonBaseWidth(p.total, scale);
      base += b;
      core += ribbonCoreWidth(b, p.flaggedShare);
    }
    return core / base;
  }

  // Mongolia-like: ~85% aligned overall, friction concentrated on the FSS pairs.
  const mongolia = [
    { total: 696, flaggedShare: 161 / 696 }, // FSS-NBSAP 23%
    { total: 825, flaggedShare: 180 / 825 }, // FSS-NDC 22%
    { total: 564, flaggedShare: 137 / 564 }, // FSS-SECTORAL 24%
    { total: 507, flaggedShare: 65 / 507 }, // FSS-NAP 13%
    { total: 496, flaggedShare: 42 / 496 }, // NBSAP-NDC 8%
    { total: 282, flaggedShare: 2 / 282 }, // NAP-NBSAP 1%
    { total: 372, flaggedShare: 20 / 372 }, // NAP-NDC 5%
  ];
  // Panama-like: ~87% aligned, low cross-doc flagged share, big clean pairs.
  const panama = [
    { total: 4414, flaggedShare: 382 / 4414 }, // ENR-PEG 9%
    { total: 2860, flaggedShare: 19 / 2860 }, // ENR-PENCYT 0.7%
    { total: 2374, flaggedShare: 142 / 2374 }, // ENR-PIOTA 6%
    { total: 2195, flaggedShare: 22 / 2195 }, // ENR-PNRF 1%
    { total: 706, flaggedShare: 76 / 706 }, // HR-PEG 11%
  ];

  it("a ~15%-flagged corpus reads well under a quarter red, far from the old ~50%", () => {
    const r = redFraction(mongolia);
    expect(r).toBeGreaterThan(0.1);
    expect(r).toBeLessThan(0.25);
  });

  it("a cleaner corpus reads clearly greener still", () => {
    expect(redFraction(panama)).toBeLessThan(redFraction(mongolia));
    expect(redFraction(panama)).toBeLessThan(0.12);
  });
});
