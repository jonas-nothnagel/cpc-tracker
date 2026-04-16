import { describe, it, expect } from "vitest";
import {
  budgetBackingLabel,
  buildAtlasSignals,
  classifyQuadrant,
  median,
  quadrantThreshold,
  tensionRingWidth,
  type BuildAtlasInput,
} from "./target-atlas-signals";
import type {
  Target,
  ThematicClassification,
  AlignmentResult,
} from "@/types";

function makeTarget(id: string, sourceDocument: string, label = id): Target {
  return {
    id,
    text: `${id} text`,
    sourceDocument,
    sourceLabel: label,
    country: "Testland",
    isQuantitative: false,
    isTimeBound: false,
  };
}

/** Build classifications marking given ids as relevant in given taxonomy/category. */
function clsRelevant(
  targetId: string,
  taxonomy: string,
  categoryId: string,
  isPrimary = false,
): ThematicClassification {
  return {
    targetId,
    categoryId,
    taxonomyType: taxonomy as ThematicClassification["taxonomyType"],
    isRelevant: true,
    isPrimary,
  };
}

function runBuild(partial: Partial<BuildAtlasInput> & { policyTargets: Target[] }) {
  const targetsById = new Map<string, Target>();
  for (const t of partial.policyTargets) targetsById.set(t.id, t);
  const fromPairs = (arr?: AlignmentResult[] | null) =>
    (arr ?? []).flatMap((a) => [a.targetAId, a.targetBId]);
  const ids = new Set<string>([
    ...fromPairs(partial.alignments),
    ...fromPairs(partial.budgetAlignments),
    ...(partial.classifications ?? []).map((c) => c.targetId),
  ]);
  for (const id of ids) {
    if (targetsById.has(id)) continue;
    const doc = id.startsWith("BER_") ? "BER" : id.startsWith("BTR_") ? "BTR" : "UNK";
    targetsById.set(id, makeTarget(id, doc));
  }

  return buildAtlasSignals({
    policyTargets: partial.policyTargets,
    classifications: partial.classifications ?? [],
    alignments: partial.alignments ?? [],
    budgetAlignments: partial.budgetAlignments ?? null,
    targetsById,
    bridgeTaxonomy: partial.bridgeTaxonomy ?? "globe",
  });
}

describe("buildAtlasSignals — coherence via taxonomy bridge", () => {
  it("counts cross-doc policy targets sharing a relevant category", () => {
    const targets = [
      makeTarget("NDC_1", "NDC"),
      makeTarget("NBSAP_1", "NBSAP"),
      makeTarget("NAP_1", "NAP"),
    ];
    const classifications = [
      clsRelevant("NDC_1", "globe", "globe_9"),
      clsRelevant("NBSAP_1", "globe", "globe_9"),
      clsRelevant("NAP_1", "globe", "globe_2"),
    ];
    const [ndc1, nbsap1, nap1] = runBuild({
      policyTargets: targets,
      classifications,
    });
    expect(ndc1.coherenceCount).toBe(1);
    expect(ndc1.coherenceBridgeLinks).toHaveLength(1);
    expect(ndc1.coherenceBridgeLinks[0].pseudoTargetId).toBe("NBSAP_1");
    expect(ndc1.coherenceBridgeLinks[0].sharedCategories).toEqual(["globe_9"]);
    expect(nbsap1.coherenceCount).toBe(1);
    expect(nap1.coherenceCount).toBe(0);
  });

  it("ignores same-source-document pairs", () => {
    const targets = [makeTarget("NDC_1", "NDC"), makeTarget("NDC_2", "NDC")];
    const classifications = [
      clsRelevant("NDC_1", "globe", "globe_1"),
      clsRelevant("NDC_2", "globe", "globe_1"),
    ];
    const [ndc1] = runBuild({ policyTargets: targets, classifications });
    expect(ndc1.coherenceCount).toBe(0);
  });

  it("switches lens and recomputes (pluggability)", () => {
    const targets = [makeTarget("NDC_1", "NDC"), makeTarget("NBSAP_1", "NBSAP")];
    const classifications = [
      clsRelevant("NDC_1", "globe", "globe_1"),
      clsRelevant("NBSAP_1", "globe", "globe_2"), // no globe overlap
      clsRelevant("NDC_1", "sector", "sector_energy"),
      clsRelevant("NBSAP_1", "sector", "sector_energy"), // overlap on sector
    ];
    const [ndc1Globe] = runBuild({
      policyTargets: targets,
      classifications,
      bridgeTaxonomy: "globe",
    });
    const [ndc1Sector] = runBuild({
      policyTargets: targets,
      classifications,
      bridgeTaxonomy: "sector",
    });
    expect(ndc1Globe.coherenceCount).toBe(0);
    expect(ndc1Sector.coherenceCount).toBe(1);
  });
});

describe("buildAtlasSignals — backing via taxonomy bridge", () => {
  it("counts BER programmes and BTR actions sharing relevant categories", () => {
    const targets = [makeTarget("NDC_1", "NDC")];
    const classifications = [
      clsRelevant("NDC_1", "globe", "globe_9"),
      clsRelevant("NDC_1", "globe", "globe_8"),
      clsRelevant("BER_1", "globe", "globe_9"),
      clsRelevant("BER_2", "globe", "globe_1"), // not shared
      clsRelevant("BTR_1", "globe", "globe_8"),
    ];
    const [ndc1] = runBuild({ policyTargets: targets, classifications });
    expect(ndc1.budgetCount).toBe(1);
    expect(ndc1.implementationCount).toBe(1);
    expect(ndc1.backingCount).toBe(2);
    expect(ndc1.budgetBridgeLinks[0].sharedCategories).toEqual(["globe_9"]);
    expect(ndc1.actionBridgeLinks[0].sharedCategories).toEqual(["globe_8"]);
  });

  it("is zero on all three counts when no classifications overlap", () => {
    const targets = [makeTarget("NDC_1", "NDC")];
    const classifications = [
      clsRelevant("NDC_1", "globe", "globe_1"),
      clsRelevant("BER_1", "globe", "globe_9"),
      clsRelevant("BTR_1", "globe", "globe_7"),
    ];
    const [ndc1] = runBuild({ policyTargets: targets, classifications });
    expect(ndc1.budgetCount).toBe(0);
    expect(ndc1.implementationCount).toBe(0);
    expect(ndc1.backingCount).toBe(0);
  });
});

describe("buildAtlasSignals — tensions and side-panel data from LLM", () => {
  it("counts LLM contradictions in alignment data for the red ring", () => {
    const targets = [
      makeTarget("NDC_1", "NDC"),
      makeTarget("NBSAP_1", "NBSAP"),
      makeTarget("NAP_1", "NAP"),
    ];
    const alignments: AlignmentResult[] = [
      { targetAId: "NDC_1", targetBId: "NBSAP_1", alignment: "high_contradiction", description: "" },
      { targetAId: "NDC_1", targetBId: "NAP_1", alignment: "low_tension", description: "" },
    ];
    const [ndc1] = runBuild({ policyTargets: targets, alignments });
    expect(ndc1.tensionCount).toBe(2);
    expect(ndc1.tensionSeverity).toBe(3 + 1);
  });

  it("preserves LLM alignment links for side-panel drill-down", () => {
    const targets = [makeTarget("NDC_1", "NDC")];
    const alignments: AlignmentResult[] = [
      { targetAId: "NDC_1", targetBId: "BTR_1", alignment: "medium", description: "" },
      { targetAId: "NDC_1", targetBId: "BTR_2", alignment: "low", description: "" },
    ];
    const budgetAlignments: AlignmentResult[] = [
      { targetAId: "NDC_1", targetBId: "BER_1", alignment: "high", description: "" },
    ];
    const [ndc1] = runBuild({ policyTargets: targets, alignments, budgetAlignments });
    expect(ndc1.actionLinks).toHaveLength(2);
    expect(ndc1.budgetLinks).toHaveLength(1);
  });
});

describe("buildAtlasSignals — primary taxonomy for color", () => {
  it("records primary category id for each color taxonomy", () => {
    const targets = [makeTarget("NDC_1", "NDC")];
    const classifications = [
      { ...clsRelevant("NDC_1", "globe", "globe_5"), isPrimary: true },
      { ...clsRelevant("NDC_1", "sector", "sector_energy"), isPrimary: true },
    ];
    const [ndc1] = runBuild({ policyTargets: targets, classifications });
    expect(ndc1.primaryByTaxonomy.globe).toBe("globe_5");
    expect(ndc1.primaryByTaxonomy.sector).toBe("sector_energy");
    expect(ndc1.primaryByTaxonomy.nbs).toBeNull();
  });
});

describe("median and quadrant helpers", () => {
  it("computes medians for even and odd lengths", () => {
    expect(median([])).toBe(0);
    expect(median([4])).toBe(4);
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("falls back to mean of non-zero values when median is zero", () => {
    expect(quadrantThreshold([0, 0, 0, 2, 4])).toBe(3);
    expect(quadrantThreshold([0, 0, 0])).toBe(0);
    expect(quadrantThreshold([1, 2, 3])).toBe(2);
  });

  it("classifies quadrants around thresholds", () => {
    expect(classifyQuadrant(5, 5, 3, 3)).toBe("well_supported");
    expect(classifyQuadrant(0, 5, 3, 3)).toBe("backed_isolated");
    expect(classifyQuadrant(5, 0, 3, 3)).toBe("ambition_gap");
    expect(classifyQuadrant(0, 0, 3, 3)).toBe("limited_uptake");
  });
});

describe("visual-band helpers", () => {
  it("tensionRingWidth only flags high-tension nodes (5+)", () => {
    expect(tensionRingWidth(0)).toBeNull();
    expect(tensionRingWidth(1)).toBeNull();
    expect(tensionRingWidth(4)).toBeNull();
    expect(tensionRingWidth(5)).toBe(3);
    expect(tensionRingWidth(99)).toBe(3);
  });

  it("budgetBackingLabel maps counts to plain-language labels", () => {
    expect(budgetBackingLabel(0)).toBe("Not in budget");
    expect(budgetBackingLabel(1)).toBe("Partly budget-backed");
    expect(budgetBackingLabel(3)).toBe("Well budget-backed");
  });
});
