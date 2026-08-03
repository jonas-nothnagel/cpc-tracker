import { describe, expect, it } from "vitest";
import { computePulseModel } from "./aggregate";
import type { AlignmentResult, Target } from "@/types";

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
  a: string,
  b: string,
  alignment: AlignmentResult["alignment"],
): AlignmentResult {
  return { targetAId: a, targetBId: b, alignment, description: "r" };
}

const TARGETS: Target[] = [
  makeTarget("NDC_1"),
  makeTarget("NDC_2"),
  makeTarget("NBSAP_1"),
  makeTarget("FSS_1"),
  makeTarget("BTR_1", { sourceDocument: "BTR" }),
];

const ALIGNMENT: AlignmentResult[] = [
  makePair("NDC_1", "NBSAP_1", "high"),
  makePair("NDC_2", "NBSAP_1", "flagged"),
  makePair("NDC_1", "FSS_1", "medium"),
  makePair("NDC_2", "FSS_1", "none"),
  makePair("NBSAP_1", "FSS_1", "flagged"),
  makePair("BTR_1", "NDC_1", "flagged"),
];

describe("computePulseModel", () => {
  const model = computePulseModel(ALIGNMENT, TARGETS, ["NDC", "NBSAP", "FSS"]);

  it("lists non-pseudo documents in the given order with target counts", () => {
    expect(model.docs.map((d) => d.id)).toEqual(["NDC", "NBSAP", "FSS"]);
    expect(model.docs[0].targetCount).toBe(2);
  });

  it("aggregates per document pair, excluding pseudo documents", () => {
    const ndcNbsap = model.edges.find((e) => e.a === "NDC" && e.b === "NBSAP");
    expect(ndcNbsap).toMatchObject({ compared: 2, flagged: 1 });
    expect(model.edges).toHaveLength(3);
  });

  it("computes aligned and flagged shares", () => {
    const ndcFss = model.edges.find((e) => e.a === "NDC" && e.b === "FSS");
    expect(ndcFss?.alignedShare).toBeCloseTo(0.5);
    expect(ndcFss?.flaggedShare).toBeCloseTo(0);
  });

  it("marks edges at or above the corpus mean flagged share as inflamed", () => {
    // shares: NDC-NBSAP 0.5, NDC-FSS 0, NBSAP-FSS 1 -> mean 0.5
    expect(model.meanFlaggedShare).toBeCloseTo(0.5);
    const inflamed = model.edges.filter((e) => e.inflamed).map((e) => `${e.a}~${e.b}`);
    expect(inflamed.sort()).toEqual(["NBSAP~FSS", "NDC~NBSAP"].sort());
    const rel = model.edges.find((e) => e.a === "NBSAP" && e.b === "FSS")?.rel;
    expect(rel).toBeCloseTo(2);
  });

  it("keeps documents with no compared pairs out of edges but in docs", () => {
    const model2 = computePulseModel(
      [makePair("NDC_1", "NBSAP_1", "high")],
      TARGETS,
      ["NDC", "NBSAP", "FSS"],
    );
    expect(model2.docs.map((d) => d.id)).toContain("FSS");
    expect(model2.edges).toHaveLength(1);
  });
});
