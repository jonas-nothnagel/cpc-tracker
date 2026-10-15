import { describe, expect, it } from "vitest";
import { resolveFindingPair } from "./resolve";
import type { AlignmentResult, Target } from "@/types";

function makeTarget(id: string, overrides: Partial<Target> = {}): Target {
  return {
    id,
    text: `Text for ${id}`,
    sourceDocument: "NDC",
    sourceLabel: id,
    country: "Mongolia",
    isQuantitative: false,
    isTimeBound: false,
    ...overrides,
  };
}

function makePair(
  targetAId: string,
  targetBId: string,
  overrides: Partial<AlignmentResult> = {},
): AlignmentResult {
  return {
    targetAId,
    targetBId,
    alignment: "flagged",
    description: `Rationale for ${targetAId} x ${targetBId}`,
    ...overrides,
  };
}

const TARGETS: Target[] = [
  makeTarget("FSS_18"),
  makeTarget("NDC_2"),
  makeTarget("NBSAP_4"),
];

// Stored record order is B-before-A on purpose: the canonical pairKey sorts.
const ALIGNMENT: AlignmentResult[] = [
  makePair("NDC_2", "FSS_18"),
  makePair("NBSAP_4", "NDC_2", { alignment: "medium" }),
];

describe("resolveFindingPair", () => {
  it("resolves a pair by its canonical sorted key", () => {
    const found = resolveFindingPair(ALIGNMENT, TARGETS, "FSS_18__NDC_2");
    expect(found).not.toBeNull();
    expect(found?.pair.targetAId).toBe("NDC_2");
    expect(found?.pairKey).toBe("FSS_18__NDC_2");
  });

  it("resolves when the key is given in reversed order", () => {
    const found = resolveFindingPair(ALIGNMENT, TARGETS, "NDC_2__FSS_18");
    expect(found?.pairKey).toBe("FSS_18__NDC_2");
  });

  it("returns targets in the stored record order", () => {
    const found = resolveFindingPair(ALIGNMENT, TARGETS, "FSS_18__NDC_2");
    expect(found?.targetA.id).toBe("NDC_2");
    expect(found?.targetB.id).toBe("FSS_18");
  });

  it("resolves non-flagged pairs too", () => {
    const found = resolveFindingPair(ALIGNMENT, TARGETS, "NBSAP_4__NDC_2");
    expect(found?.pair.alignment).toBe("medium");
  });

  it("returns null for an unknown pair", () => {
    expect(resolveFindingPair(ALIGNMENT, TARGETS, "FSS_18__NBSAP_4")).toBeNull();
  });

  it("returns null for malformed keys", () => {
    expect(resolveFindingPair(ALIGNMENT, TARGETS, "")).toBeNull();
    expect(resolveFindingPair(ALIGNMENT, TARGETS, "FSS_18")).toBeNull();
    expect(resolveFindingPair(ALIGNMENT, TARGETS, "a__b__c")).toBeNull();
    expect(resolveFindingPair(ALIGNMENT, TARGETS, "x; DROP__y")).toBeNull();
  });

  it("returns null when the record exists but a target is missing", () => {
    const targetsWithoutFss = TARGETS.filter((t) => t.id !== "FSS_18");
    expect(
      resolveFindingPair(ALIGNMENT, targetsWithoutFss, "FSS_18__NDC_2"),
    ).toBeNull();
  });
});
