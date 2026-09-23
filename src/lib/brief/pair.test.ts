import { describe, expect, it } from "vitest";
import { findPair } from "./pair";

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
