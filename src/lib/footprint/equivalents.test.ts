import { describe, expect, it } from "vitest";

import {
  EQUIVALENCE_FACTORS,
  equivalentsMeaningful,
  everydayEquivalents,
} from "./equivalents";

describe("everydayEquivalents", () => {
  it("matches the whole-ledger reference values of 9 August 2026", () => {
    // 86.03 kWh / 35.30 kg CO2e / 265.3 L: the totals the August 2026
    // sustainable-AI review verified by hand against the EPA factors.
    const eq = everydayEquivalents({
      energy_wh: 86_030,
      co2_geq: 35_300,
      water_ml: 265_300,
    });
    expect(eq.petrolLitres).toBeCloseTo(15.0, 1);
    expect(eq.evCharges).toBeCloseTo(0.98, 2);
    expect(eq.bathtubs).toBeCloseTo(1.71, 2);
  });

  it("keeps each equivalent on exactly one base metric", () => {
    const zeroCarbon = everydayEquivalents({
      energy_wh: 86_030,
      co2_geq: 0,
      water_ml: 265_300,
    });
    expect(zeroCarbon.petrolLitres).toBe(0);
    expect(zeroCarbon.evCharges).toBeGreaterThan(0);
    expect(zeroCarbon.bathtubs).toBeGreaterThan(0);
  });

  it("uses the EPA petrol factor (8,887 g per US gallon)", () => {
    expect(EQUIVALENCE_FACTORS.petrolCo2GPerLitre).toBeCloseTo(2347.7, 1);
  });
});

describe("equivalentsMeaningful", () => {
  it("hides the strip for a near-empty ledger", () => {
    expect(
      equivalentsMeaningful({ energy_wh: 50, co2_geq: 20, water_ml: 150 }),
    ).toBe(false);
  });

  it("shows the strip once anchors reach a legible fraction", () => {
    expect(
      equivalentsMeaningful({ energy_wh: 10_000, co2_geq: 4_000, water_ml: 40_000 }),
    ).toBe(true);
  });
});
