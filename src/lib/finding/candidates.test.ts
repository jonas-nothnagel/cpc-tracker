import { describe, expect, it } from "vitest";
import { selectFindingCandidates } from "./candidates";
import type { AlignmentResult, Target } from "@/types";

function makeTarget(id: string, overrides: Partial<Target> = {}): Target {
  return {
    id,
    text: `Text for ${id}`,
    sourceDocument: id.split("_")[0],
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
  makeTarget("NDC_1"),
  makeTarget("NDC_2"),
  makeTarget("NBSAP_1"),
  makeTarget("NBSAP_2"),
  makeTarget("FSS_1"),
  makeTarget("BTR_1", { sourceDocument: "BTR" }),
];

describe("selectFindingCandidates", () => {
  it("keeps only flagged cross-document pairs", () => {
    const out = selectFindingCandidates(
      [
        makePair("NDC_1", "NBSAP_1"),
        makePair("NDC_1", "NDC_2"),
        makePair("NDC_2", "NBSAP_1", { alignment: "high" }),
      ],
      TARGETS,
    );
    expect(out.map((c) => c.pairKey)).toEqual(["NBSAP_1__NDC_1"]);
  });

  it("drops BTR pseudo-target pairs", () => {
    const out = selectFindingCandidates(
      [makePair("BTR_1", "NDC_1"), makePair("NDC_1", "NBSAP_1")],
      TARGETS,
    );
    expect(out.map((c) => c.pairKey)).toEqual(["NBSAP_1__NDC_1"]);
  });

  it("drops pairs whose targets cannot be resolved", () => {
    const out = selectFindingCandidates(
      [makePair("GHOST_9", "NDC_1"), makePair("NDC_1", "NBSAP_1")],
      TARGETS,
    );
    expect(out.map((c) => c.pairKey)).toEqual(["NBSAP_1__NDC_1"]);
  });

  it("orders by confidence, then manageability, then mechanism, then key", () => {
    const out = selectFindingCandidates(
      [
        makePair("NDC_1", "NBSAP_1", {
          confidence: "medium",
          mechanism: "goal_conflict",
        }),
        makePair("NDC_2", "NBSAP_1", {
          confidence: "high",
          mechanism: "delivery_friction",
        }),
        makePair("NDC_2", "NBSAP_2", {
          confidence: "high",
          mechanism: "delivery_friction",
          manageability: "fundamental",
        }),
        makePair("FSS_1", "NDC_1", {
          confidence: "high",
          mechanism: "goal_conflict",
        }),
        makePair("FSS_1", "NBSAP_1"),
      ],
      TARGETS,
    );
    expect(out.map((c) => c.pairKey)).toEqual([
      "NBSAP_2__NDC_2", // high + fundamental beats everything manageable
      "FSS_1__NDC_1", // high + goal_conflict
      "NBSAP_1__NDC_2", // high + delivery_friction
      "NBSAP_1__NDC_1", // medium
      "FSS_1__NBSAP_1", // no confidence sorts last
    ]);
  });

  it("puts pairs flagged by more models first when consensus counts are given", () => {
    const out = selectFindingCandidates(
      [
        makePair("NDC_1", "NBSAP_1", { confidence: "high" }),
        makePair("NDC_2", "NBSAP_1", { confidence: "low" }),
      ],
      TARGETS,
      { consensusCounts: { NBSAP_1__NDC_2: 4, NBSAP_1__NDC_1: 1 } },
    );
    expect(out.map((c) => c.pairKey)).toEqual([
      "NBSAP_1__NDC_2",
      "NBSAP_1__NDC_1",
    ]);
    expect(out[0].modelsFlagging).toBe(4);
  });

  it("is deterministic across runs", () => {
    const input = [
      makePair("NDC_1", "NBSAP_1"),
      makePair("NDC_2", "NBSAP_1"),
      makePair("FSS_1", "NBSAP_2"),
    ];
    const a = selectFindingCandidates(input, TARGETS).map((c) => c.pairKey);
    const b = selectFindingCandidates(input, TARGETS).map((c) => c.pairKey);
    expect(a).toEqual(b);
    expect(a).toEqual(["FSS_1__NBSAP_2", "NBSAP_1__NDC_1", "NBSAP_1__NDC_2"]);
  });
});
