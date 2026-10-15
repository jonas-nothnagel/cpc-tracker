import { describe, expect, it } from "vitest";
import { computeSignificanceFacts } from "./significance";
import type { AlignmentResult, RatingsByCountry, Target } from "@/types";

function makeTarget(id: string, overrides: Partial<Target> = {}): Target {
  return {
    id,
    text: `Text for ${id}`,
    sourceDocument: id.split("_")[0],
    sourceLabel: `${id} label`,
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
    description: "rationale",
    ...overrides,
  };
}

const TARGETS: Target[] = [
  makeTarget("FSS_1"),
  makeTarget("FSS_2"),
  makeTarget("NDC_1"),
  makeTarget("NBSAP_1"),
  makeTarget("BTR_1", { sourceDocument: "BTR" }),
];

// FSS_1 is the hub: three flagged pairs. One BTR pseudo pair and one aligned
// pair must stay out of the flagged totals; the pseudo pair also stays out of
// the comparison total.
const ALIGNMENT: AlignmentResult[] = [
  makePair("FSS_1", "NDC_1", { mechanism: "goal_conflict" }),
  makePair("FSS_1", "NBSAP_1", { mechanism: "resource_competition" }),
  makePair("FSS_2", "FSS_1", { mechanism: "resource_competition" }),
  makePair("FSS_2", "NDC_1", { alignment: "medium" }),
  makePair("BTR_1", "NDC_1", { mechanism: "goal_conflict" }),
];

const PAIR = ALIGNMENT[0];

describe("computeSignificanceFacts", () => {
  it("counts same-pattern pairs against policy-to-policy comparisons", () => {
    const facts = computeSignificanceFacts(ALIGNMENT, TARGETS, PAIR);
    expect(facts.typeRarity).toEqual({
      mechanism: "goal_conflict",
      count: 1,
      totalComparisons: 4,
    });
  });

  it("omits pattern rarity for non-flagged pairs", () => {
    const facts = computeSignificanceFacts(ALIGNMENT, TARGETS, ALIGNMENT[3]);
    expect(facts.typeRarity).toBeUndefined();
  });

  it("reports the busier target's concentration", () => {
    const facts = computeSignificanceFacts(ALIGNMENT, TARGETS, PAIR);
    expect(facts.concentration).toEqual({
      targetId: "FSS_1",
      sourceLabel: "FSS_1 label",
      count: 3,
      flaggedTotal: 3,
    });
  });

  it("reports model agreement when consensus counts are supplied", () => {
    const facts = computeSignificanceFacts(ALIGNMENT, TARGETS, PAIR, {
      consensusCounts: { FSS_1__NDC_1: 4 },
      modelsTotal: 4,
    });
    expect(facts.modelsFlagging).toEqual({ count: 4, total: 4 });
  });

  it("treats a flagged pair missing from the consensus map as one model", () => {
    const facts = computeSignificanceFacts(ALIGNMENT, TARGETS, PAIR, {
      consensusCounts: {},
      modelsTotal: 4,
    });
    expect(facts.modelsFlagging).toEqual({ count: 1, total: 4 });
  });

  it("finds a reviewer rating under either key order", () => {
    const ratings: RatingsByCountry = {
      "NDC_1::FSS_1": { rating: "low", note: "checked on site", ts: 1785239441611 },
    };
    const facts = computeSignificanceFacts(ALIGNMENT, TARGETS, PAIR, { ratings });
    expect(facts.review).toEqual({
      rating: "low",
      note: "checked on site",
      ts: 1785239441611,
    });
  });

  it("returns null review when nobody rated the pair", () => {
    const facts = computeSignificanceFacts(ALIGNMENT, TARGETS, PAIR, {
      ratings: {},
    });
    expect(facts.review).toBeNull();
  });
});
