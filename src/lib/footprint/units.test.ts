import { describe, expect, it } from "vitest";

import { fractionDigits, scaleAmount, shareText } from "./units";

describe("scaleAmount", () => {
  it("moves each resource to its larger unit from a thousand base units", () => {
    expect(scaleAmount(999, "co2_geq")).toEqual({ value: 999, unit: "g" });
    expect(scaleAmount(1000, "co2_geq")).toEqual({ value: 1, unit: "kg" });
    expect(scaleAmount(97_918.5, "energy_wh")).toEqual({ value: 97.9185, unit: "kWh" });
    expect(scaleAmount(850, "water_ml")).toEqual({ value: 850, unit: "mL" });
    expect(scaleAmount(316_752, "water_ml")).toEqual({ value: 316.752, unit: "L" });
    expect(scaleAmount(130_615, "minerals_ugsbeq")).toEqual({ value: 130.615, unit: "mg" });
    expect(scaleAmount(12, "minerals_ugsbeq")).toEqual({ value: 12, unit: "µg" });
  });
});

describe("fractionDigits", () => {
  it("keeps about three significant figures, more only for very small amounts", () => {
    expect(fractionDigits(316.75)).toBe(0); // 317
    expect(fractionDigits(100)).toBe(0);
    expect(fractionDigits(40.16)).toBe(1); // 40.2
    expect(fractionDigits(1.3)).toBe(1);
    expect(fractionDigits(0.1)).toBe(1);
    expect(fractionDigits(0.04)).toBe(2);
  });
});

describe("shareText", () => {
  const percent = (value: number, digits: number) => `${(value * 100).toFixed(digits)}%`;

  it("rounds a share to a whole percentage", () => {
    expect(shareText(0.6, percent)).toBe("60%");
    expect(shareText(0.321, percent)).toBe("32%");
    expect(shareText(1, percent)).toBe("100%");
    expect(shareText(0, percent)).toBe("0%");
  });

  it("never rounds a part up to the whole or down to nothing", () => {
    expect(shareText(0.9983, percent)).toBe("99.8%");
    expect(shareText(0.9999, percent)).toBe(">99.9%");
    expect(shareText(0.003, percent)).toBe("<1%");
  });
});
