import { describe, expect, it } from "vitest";
import { findPair, readingsFor } from "./pair";

function target(id: string, doc: string) {
  return {
    id,
    text: `Text ${id}`,
    sourceDocument: doc,
    sourceLabel: `Label ${id}`,
    country: "Mongolia",
    isQuantitative: false,
    isTimeBound: false,
  };
}

const DATA = {
  targets: [target("NDC_1", "NDC"), target("FSS_1", "FSS")],
  alignment: [
    {
      targetAId: "FSS_1",
      targetBId: "NDC_1",
      alignment: "flagged",
      mechanism: "resource_competition",
      description: "The first target expands cropland the second protects.",
    },
  ],
};

describe("findPair", () => {
  it("finds a comparison whichever way round it is asked for, keeping the stored order", () => {
    for (const [a, b] of [
      ["NDC_1", "FSS_1"],
      ["FSS_1", "NDC_1"],
    ]) {
      const found = findPair(DATA, a, b, "en");
      expect(found?.pair.description).toBe("The first target expands cropland the second protects.");
      expect(found?.targetA.id).toBe("FSS_1");
      expect(found?.targetB.id).toBe("NDC_1");
      expect(found?.targetA.sourceLabel).toBe("Label FSS_1");
    }
  });

  it("returns null for an unknown comparison", () => {
    expect(findPair(DATA, "NDC_1", "NDC_9", "en")).toBeNull();
  });

  it("refuses empty or overlong ids before searching", () => {
    expect(findPair(DATA, "", "NDC_1", "en")).toBeNull();
    expect(findPair(DATA, "x".repeat(121), "NDC_1", "en")).toBeNull();
  });
});

describe("budget readings", () => {
  const WITH_BUDGET = {
    ...DATA,
    budgetPseudoTargets: [{ id: "BER_1", sourceDocument: "BER", sourceLabel: "71401 Waste", text: "Waste management." }],
    budgetAlignment: [
      { targetAId: "NDC_1", targetBId: "BER_1", alignment: "high", description: "The line funds waste work. It is broad." },
    ],
  };

  it("finds a target's reading with a budget line", () => {
    const found = findPair(WITH_BUDGET, "BER_1", "NDC_1", "en");
    expect(found?.pair.alignment).toBe("high");
    expect(found?.targetB.sourceLabel).toBe("71401 Waste");
  });

  it("gives the first sentence of every reading of one target, by partner", () => {
    expect(readingsFor(WITH_BUDGET, "NDC_1")).toEqual({
      FSS_1: {
        level: "flagged",
        mechanism: "resource_competition",
        first: "The first target expands cropland the second protects.",
      },
      BER_1: { level: "high", first: "The line funds waste work." },
    });
  });

  it("has no readings for an unknown id", () => {
    expect(readingsFor(WITH_BUDGET, "NOPE")).toEqual({});
  });
});
