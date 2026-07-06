import { describe, it, expect } from "vitest";
import { formatMoney } from "./financing-coherence";

describe("formatMoney (financing-coherence)", () => {
  // Mongolia precedent — billion-unit input
  it("formats billions as B", () => {
    expect(formatMoney(5.3, "billion", "MNT")).toBe("5.3B MNT");
  });

  it("scales billions ≥ 1000 to T", () => {
    expect(formatMoney(1500, "billion", "MNT")).toBe("1.5T MNT");
  });

  it("scales billions < 1 to M", () => {
    expect(formatMoney(0.5, "billion", "MNT")).toBe("500M MNT");
  });

  it("emits `< 1M` for non-zero values below 1M billions", () => {
    expect(formatMoney(0.0005, "billion", "MNT")).toBe("< 1M MNT");
  });

  it("emits `0` for zero", () => {
    expect(formatMoney(0, "billion", "MNT")).toBe("0 MNT");
  });

  // Panama — million-unit input (Decision 9 / D9 of the scoping doc).
  // 47.3M PAB is the locked example from the scoping doc Decision 1 template.
  it("formats Panama millions as M PAB", () => {
    expect(formatMoney(47.3, "million", "PAB")).toBe("47M PAB");
  });

  it("scales Panama millions ≥ 1000 (i.e. ≥ 1B) to B", () => {
    expect(formatMoney(1500, "million", "PAB")).toBe("1.5B PAB");
  });

  it("scales Panama millions ≥ 1M billions to T", () => {
    expect(formatMoney(1_500_000, "million", "PAB")).toBe("1.5T PAB");
  });

  it("emits `< 1M` for very small Panama amounts", () => {
    expect(formatMoney(0.5, "million", "PAB")).toBe("< 1M PAB");
  });

  it("emits `0` for zero Panama amount", () => {
    expect(formatMoney(0, "million", "PAB")).toBe("0 PAB");
  });

  // Defaults to billion semantics for unknown units, preserving Mongolia behaviour.
  it("treats unknown unit as billions", () => {
    expect(formatMoney(5.3, "unknown", "XYZ")).toBe("5.3B XYZ");
  });
});
