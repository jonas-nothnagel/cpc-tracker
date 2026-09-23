import { describe, expect, it } from "vitest";
import { computePulseModel } from "./aggregate";
import { strandSignals, strandsByPathway, type StrandSignalLabels } from "./strands";
import type { AlignmentResult, Target } from "@/types";

function makeTarget(id: string): Target {
  return {
    id,
    text: `Text for ${id}`,
    sourceDocument: id.split("_")[0],
    sourceLabel: id,
    country: "Mongolia",
    isQuantitative: false,
    isTimeBound: false,
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

const DOC_ORDER = ["NDC", "NBSAP", "FSS"];
const TARGETS = ["NDC_1", "NDC_2", "NBSAP_1", "NBSAP_2", "FSS_1", "FSS_2", "BTR_1"].map(
  makeTarget,
);

const LABELS: StrandSignalLabels = {
  confidence: { high: "High confidence", medium: "Medium confidence", low: "Low confidence" },
  manageability: { manageable: "Coordination-level", fundamental: "Design-level" },
  mechanism: {
    goal_conflict: "Conflicting goals",
    resource_competition: "Competing for resources",
    delivery_friction: "Delivery & coordination",
  },
};

describe("strandsByPathway", () => {
  it("files each flagged pair under the pathway the canvas draws, whichever way round it was compared", () => {
    const alignment = [
      makePair("FSS_1", "NDC_1"),
      makePair("NDC_2", "FSS_2"),
      makePair("NBSAP_1", "NDC_1"),
      makePair("NDC_2", "NBSAP_2", { alignment: "high" }),
      makePair("NBSAP_1", "NBSAP_2"),
      makePair("BTR_1", "NDC_1"),
    ];
    const strands = strandsByPathway(alignment, TARGETS, DOC_ORDER);

    expect([...strands.keys()].sort()).toEqual(["NDC~FSS", "NDC~NBSAP"]);
    expect(strands.get("NDC~FSS")!.map((c) => c.pairKey).sort()).toEqual([
      "FSS_1__NDC_1",
      "FSS_2__NDC_2",
    ]);
    expect(strands.get("NDC~NBSAP")!.map((c) => c.pairKey)).toEqual(["NBSAP_1__NDC_1"]);

    // Every flagged pair a fiber counts is reachable from that fiber's key.
    const edges = computePulseModel(alignment, TARGETS, DOC_ORDER).edges;
    for (const e of edges.filter((x) => x.flagged > 0)) {
      expect(strands.get(`${e.a}~${e.b}`)?.length).toBe(e.flagged);
    }
  });

  it("ranks a pathway's strands by confidence, then manageability, then mechanism", () => {
    const strands = strandsByPathway(
      [
        makePair("FSS_1", "NDC_1", { confidence: "medium", mechanism: "goal_conflict" }),
        makePair("NDC_2", "FSS_1", { confidence: "high", mechanism: "delivery_friction" }),
        makePair("FSS_2", "NDC_1", {
          confidence: "high",
          mechanism: "delivery_friction",
          manageability: "fundamental",
        }),
        makePair("NDC_2", "FSS_2", { confidence: "high", mechanism: "goal_conflict" }),
      ],
      TARGETS,
      DOC_ORDER,
    );
    expect(strands.get("NDC~FSS")!.map((c) => c.pairKey)).toEqual([
      "FSS_2__NDC_1", // high + design-level
      "FSS_2__NDC_2", // high + conflicting goals
      "FSS_1__NDC_2", // high + delivery & coordination
      "FSS_1__NDC_1", // medium
    ]);
  });
});

describe("strandSignals", () => {
  it("names confidence, manageability and mechanism in that order", () => {
    const pair = makePair("FSS_1", "NDC_1", {
      confidence: "high",
      manageability: "fundamental",
      mechanism: "resource_competition",
    });
    expect(strandSignals(pair, LABELS)).toBe(
      "High confidence · Design-level · Competing for resources",
    );
  });

  it("skips the signals the pipeline did not return", () => {
    const partial = makePair("FSS_1", "NDC_1", {
      confidence: "medium",
      mechanism: "goal_conflict",
    });
    expect(strandSignals(partial, LABELS)).toBe("Medium confidence · Conflicting goals");
    expect(strandSignals(makePair("FSS_1", "NDC_1"), LABELS)).toBe("");
  });
});
