import { describe, expect, it } from "vitest";
import { moneyParts, per100, toUsd } from "./money";

describe("moneyParts", () => {
  it("splits a sum into an amount and its word, at most one decimal", () => {
    expect(moneyParts(50.36e12)).toEqual({ amount: 50.4, unit: "trillion" });
    expect(moneyParts(801.7e9)).toEqual({ amount: 802, unit: "billion" });
    expect(moneyParts(24.83e9)).toEqual({ amount: 24.8, unit: "billion" });
    expect(moneyParts(60.7e6)).toEqual({ amount: 60.7, unit: "million" });
    expect(moneyParts(3192)).toEqual({ amount: 3192, unit: "none" });
  });
});

describe("per100 and toUsd", () => {
  it("states a share as tugrik of every hundred, one decimal", () => {
    expect(per100(0.0159)).toBe(1.6);
    expect(per100(0.02983)).toBe(3);
  });
  it("converts at the indicative rate", () => {
    expect(toUsd(3500e6, 3500)).toBe(1e6);
    expect(toUsd(1, 0)).toBe(0);
  });
});
