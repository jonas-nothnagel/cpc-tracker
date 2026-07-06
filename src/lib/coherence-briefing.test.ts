import { describe, it, expect } from "vitest";
import {
  buildContradictionBreakdown,
  buildDocCoherenceGraph,
  buildDocFocusFrictions,
  buildDocFrictionShares,
  buildFlagSubsetProfile,
  buildSectorCoherenceShare,
  buildStorylineProfile,
  buildTargetFrictionTree,
  canonicalHiddenKey,
  computeCoverageConcentration,
  computeStorylineLiveStats,
  computeTargetConcentration,
  concentrationDocAttribution,
  frictionTypeTotalsFromAlignment,
  pickTopStorylines,
  rankTargetsByFriction,
  selectCorpusThemesForState,
  selectSectorSynthesesForState,
  type CorpusThemesPayload,
  type SectorSynthesisPayload,
  type SectorTension,
} from "./coherence-briefing";
import type {
  AlignmentLevel,
  AlignmentManageability,
  AlignmentMechanism,
  AlignmentResult,
  CorpusThemes,
  DocPairSynthesis,
  SectorSynthesis,
  Target,
  ThematicClassification,
} from "@/types";

function makeTarget(id: string, sourceDocument: string): Target {
  return {
    id,
    text: `${id} text`,
    sourceDocument,
    sourceLabel: id,
    country: "Testland",
    isQuantitative: false,
    isTimeBound: false,
  };
}

function makeAlignment(
  a: string,
  b: string,
  level: AlignmentLevel,
): AlignmentResult {
  return {
    targetAId: a,
    targetBId: b,
    alignment: level,
    description: `${a} <-> ${b}: ${level}`,
  };
}

function makeFlagged(
  a: string,
  b: string,
  mechanism: AlignmentMechanism,
  manageability?: AlignmentManageability,
): AlignmentResult {
  return {
    targetAId: a,
    targetBId: b,
    alignment: "flagged",
    mechanism,
    ...(manageability ? { manageability } : {}),
    description: `${a} <-> ${b}: flagged/${mechanism}`,
  };
}

function makeClassification(
  targetId: string,
  categoryId: string,
  taxonomyType: ThematicClassification["taxonomyType"],
  isPrimary = true,
): ThematicClassification {
  return { targetId, categoryId, taxonomyType, isRelevant: true, isPrimary };
}

describe("buildDocCoherenceGraph", () => {
  // FSS (2 targets), NAP (2 targets), NDC (1 target).
  const targets = [
    makeTarget("FSS_1", "FSS"),
    makeTarget("FSS_2", "FSS"),
    makeTarget("NAP_1", "NAP"),
    makeTarget("NAP_2", "NAP"),
    makeTarget("NDC_1", "NDC"),
  ];

  const alignment: AlignmentResult[] = [
    makeAlignment("FSS_1", "NAP_1", "high"), // FSS<->NAP aligned
    makeAlignment("FSS_1", "NAP_2", "flagged"), // FSS<->NAP tension
    makeAlignment("NAP_1", "FSS_2", "low"), // reversed authoring; scored but not aligned/flagged
    makeAlignment("FSS_2", "NDC_1", "medium"), // FSS<->NDC aligned
    makeAlignment("NAP_1", "NDC_1", "none"), // ignored entirely
    makeAlignment("FSS_1", "FSS_2", "high"), // same-document, ignored
  ];

  it("builds one node per document with target counts and config-resolved labels/colors", () => {
    const { nodes } = buildDocCoherenceGraph(alignment, targets, null);
    expect(nodes).toHaveLength(3);
    const byDoc = new Map(nodes.map((n) => [n.docType, n]));
    expect(byDoc.get("FSS")!.targetCount).toBe(2);
    expect(byDoc.get("NAP")!.targetCount).toBe(2);
    expect(byDoc.get("NDC")!.targetCount).toBe(1);
    // null config → raw id label + neutral color (from utils helpers).
    expect(byDoc.get("FSS")!.label).toBe("FSS");
    expect(byDoc.get("FSS")!.color).toBe("#94a3b8");
  });

  it("aggregates cross-doc edges with aligned/flagged counts and normalised shares", () => {
    const { edges } = buildDocCoherenceGraph(alignment, targets, null);
    const fssNap = edges.find((e) => e.a === "FSS" && e.b === "NAP")!;
    expect(fssNap.totalScored).toBe(3); // high + flagged + low
    expect(fssNap.alignedCount).toBe(1); // high only (low is not aligned)
    expect(fssNap.flaggedCount).toBe(1); // flagged
    expect(fssNap.alignedShare).toBeCloseTo(1 / 3);
    expect(fssNap.flaggedShare).toBeCloseTo(1 / 3);

    const fssNdc = edges.find((e) => e.a === "FSS" && e.b === "NDC")!;
    expect(fssNdc.totalScored).toBe(1); // medium
    expect(fssNdc.alignedCount).toBe(1);
    expect(fssNdc.flaggedCount).toBe(0);
    expect(fssNdc.alignedShare).toBeCloseTo(1);
    expect(fssNdc.flaggedShare).toBe(0);
  });

  it("ignores none-level and same-document pairs, and omits doc-pairs with no scored relationship", () => {
    const { edges } = buildDocCoherenceGraph(alignment, targets, null);
    // NAP<->NDC has only a "none" record → no edge.
    expect(edges.find((e) => e.a === "NAP" && e.b === "NDC")).toBeUndefined();
    // Only FSS<->NAP and FSS<->NDC survive.
    expect(edges).toHaveLength(2);
    // No same-document edge leaked in.
    expect(edges.every((e) => e.a !== e.b)).toBe(true);
  });

  it("collapses bidirectional pairs into one lexicographically-ordered edge", () => {
    const { edges } = buildDocCoherenceGraph(alignment, targets, null);
    // The reversed NAP_1 <-> FSS_2 record must fold into the single FSS<->NAP
    // edge (a < b lexicographically), not create a NAP<->FSS duplicate.
    expect(
      edges.filter(
        (e) =>
          new Set([e.a, e.b]).has("FSS") && new Set([e.a, e.b]).has("NAP"),
      ),
    ).toHaveLength(1);
    for (const e of edges) expect(e.a < e.b).toBe(true);
  });
});

describe("buildDocFrictionShares", () => {
  it("computes each document's flagged share on the aligned+flagged basis", () => {
    const targets = [
      makeTarget("FSS_1", "FSS"),
      makeTarget("FSS_2", "FSS"),
      makeTarget("NAP_1", "NAP"),
      makeTarget("NDC_1", "NDC"),
    ];
    const alignment: AlignmentResult[] = [
      makeAlignment("FSS_1", "NAP_1", "high"), // FSS<->NAP aligned
      makeFlagged("FSS_2", "NAP_1", "goal_conflict"), // FSS<->NAP flagged
      makeFlagged("FSS_1", "NDC_1", "goal_conflict"), // FSS<->NDC flagged
      makeAlignment("NAP_1", "NDC_1", "medium"), // NAP<->NDC aligned
      makeAlignment("FSS_1", "FSS_2", "high"), // same-document, ignored
      makeAlignment("FSS_2", "NDC_1", "none"), // none, ignored
    ];
    const { byDoc, mid, maxShare } = buildDocFrictionShares(
      alignment,
      targets,
      null,
    );
    // FSS: flagged 2 over (FSS-NAP denom 2 + FSS-NDC denom 1) = 2/3.
    expect(byDoc.get("FSS")).toBeCloseTo(2 / 3);
    // NAP: flagged 1 over (FSS-NAP denom 2 + NAP-NDC denom 1) = 1/3.
    expect(byDoc.get("NAP")).toBeCloseTo(1 / 3);
    // NDC: flagged 1 over (FSS-NDC denom 1 + NAP-NDC denom 1) = 1/2.
    expect(byDoc.get("NDC")).toBeCloseTo(1 / 2);
    // Corpus norm = total flagged 2 / total denom 4.
    expect(mid).toBeCloseTo(0.5);
    expect(maxShare).toBeCloseTo(2 / 3);
  });

  it("keeps a large but clean document's share low (share, not absolute count)", () => {
    // A sits in the most relationships but is mostly aligned; B and C clash.
    const targets = [
      makeTarget("A1", "A"),
      makeTarget("A2", "A"),
      makeTarget("A3", "A"),
      makeTarget("B1", "B"),
      makeTarget("B2", "B"),
      makeTarget("C1", "C"),
      makeTarget("C2", "C"),
    ];
    const alignment: AlignmentResult[] = [
      // A<->B: 3 aligned, 1 flagged.
      makeAlignment("A1", "B1", "high"),
      makeAlignment("A2", "B1", "medium"),
      makeAlignment("A3", "B2", "high"),
      makeFlagged("A1", "B2", "goal_conflict"),
      // A<->C: 3 aligned, 0 flagged.
      makeAlignment("A1", "C1", "high"),
      makeAlignment("A2", "C1", "medium"),
      makeAlignment("A3", "C2", "high"),
      // B<->C: 0 aligned, 2 flagged.
      makeFlagged("B1", "C1", "resource_competition"),
      makeFlagged("B2", "C2", "delivery_friction"),
    ];
    const { byDoc } = buildDocFrictionShares(alignment, targets, null);
    const a = byDoc.get("A")!;
    // A: flagged 1 over denom 7 (A-B denom 4 + A-C denom 3).
    expect(a).toBeCloseTo(1 / 7);
    // A participates in the most pairs yet has the lowest friction share.
    expect(a).toBeLessThan(byDoc.get("B")!);
    expect(a).toBeLessThan(byDoc.get("C")!);
  });
});


// ─── buildContradictionBreakdown ────────────────────────────────────

function makeDocPairSynth(
  doc_a: string,
  doc_b: string,
  flagged: { goal?: number; resource?: number; delivery?: number },
  aligned_count = 0,
): DocPairSynthesis {
  return {
    doc_a,
    doc_b,
    label_a: doc_a,
    label_b: doc_b,
    aligned_count,
    flagged_count:
      (flagged.goal ?? 0) + (flagged.resource ?? 0) + (flagged.delivery ?? 0),
    contradiction_types: {
      goal_conflict: flagged.goal,
      resource_competition: flagged.resource,
      delivery_friction: flagged.delivery,
    },
    synthesis: {
      storyline_name: `${doc_a} vs ${doc_b}`,
      reinforce: "",
      clash: "",
      coordination_hint: "",
      confidence: "high",
    },
    synthesis_error: null,
  };
}

describe("buildContradictionBreakdown", () => {
  it("returns zero totals and empty rows for empty input", () => {
    const r = buildContradictionBreakdown([]);
    expect(r.corpusTotals).toEqual({
      goal_conflict: 0,
      resource_competition: 0,
      delivery_friction: 0,
    });
    expect(r.perDocPair).toEqual([]);
    expect(r.totalFlagged).toBe(0);
    expect(r.dominantType).toBeNull();
  });

  it("sums contradiction types across pairs and surfaces the dominant type", () => {
    const synths = [
      makeDocPairSynth("FSS", "NBSAP", { goal: 10, resource: 2, delivery: 1 }),
      makeDocPairSynth("NDC", "NBSAP", { goal: 5, resource: 3, delivery: 0 }),
    ];
    const r = buildContradictionBreakdown(synths);
    expect(r.corpusTotals).toEqual({
      goal_conflict: 15,
      resource_competition: 5,
      delivery_friction: 1,
    });
    expect(r.totalFlagged).toBe(21);
    expect(r.dominantType).toBe("goal_conflict");
  });

  it("treats missing contradiction-type fields as zero", () => {
    const synth: DocPairSynthesis = {
      doc_a: "A",
      doc_b: "B",
      label_a: "A",
      label_b: "B",
      aligned_count: 0,
      flagged_count: 3,
      contradiction_types: {},
      synthesis: {
        storyline_name: "x",
        reinforce: "",
        clash: "",
        coordination_hint: "",
        confidence: "high",
      },
      synthesis_error: null,
    };
    const r = buildContradictionBreakdown([synth]);
    expect(r.corpusTotals).toEqual({
      goal_conflict: 0,
      resource_competition: 0,
      delivery_friction: 0,
    });
    expect(r.dominantType).toBeNull();
  });

  it("sorts perDocPair by flagged total descending and caps to topN", () => {
    const synths = [
      makeDocPairSynth("A", "B", { goal: 1 }), // 1
      makeDocPairSynth("C", "D", { goal: 10, resource: 5 }), // 15
      makeDocPairSynth("E", "F", { goal: 3, delivery: 4 }), // 7
      makeDocPairSynth("G", "H", { resource: 2 }), // 2
    ];
    const r = buildContradictionBreakdown(synths, { topN: 2 });
    expect(r.perDocPair).toHaveLength(2);
    expect(r.perDocPair[0].docA).toBe("C");
    expect(r.perDocPair[0].docB).toBe("D");
    expect(r.perDocPair[0].total).toBe(15);
    expect(r.perDocPair[1].docA).toBe("E");
    expect(r.perDocPair[1].total).toBe(7);
  });

  it("folds legacy v1 fields into delivery_friction so old runs still parse", () => {
    const synth: DocPairSynthesis = {
      doc_a: "A",
      doc_b: "B",
      label_a: "A",
      label_b: "B",
      aligned_count: 0,
      flagged_count: 5,
      contradiction_types: {
        goal_conflict: 1,
        implementation_tension: 2,
        scale_scope_mismatch: 2,
      },
      synthesis: {
        storyline_name: "x",
        reinforce: "",
        clash: "",
        coordination_hint: "",
        confidence: "high",
      },
      synthesis_error: null,
    };
    const r = buildContradictionBreakdown([synth]);
    expect(r.corpusTotals).toEqual({
      goal_conflict: 1,
      resource_competition: 0,
      delivery_friction: 4, // 0 + 2 + 2
    });
  });
});


// ─── frictionTypeTotalsFromAlignment ────────────────────────────────

describe("frictionTypeTotalsFromAlignment", () => {
  it("counts flagged pairs by mechanism and surfaces the dominant type", () => {
    const al = [
      makeFlagged("A", "B", "goal_conflict"),
      makeFlagged("A", "C", "resource_competition"),
      makeFlagged("B", "C", "resource_competition"),
      makeFlagged("C", "D", "delivery_friction"),
      makeAlignment("A", "D", "high"), // not flagged → ignored
      makeAlignment("B", "D", "none"), // ignored
    ];
    const r = frictionTypeTotalsFromAlignment(al);
    expect(r.goal_conflict).toBe(1);
    expect(r.resource_competition).toBe(2);
    expect(r.delivery_friction).toBe(1);
    expect(r.total).toBe(4);
    expect(r.dominantType).toBe("resource_competition");
  });

  it("returns zero totals and null dominant for empty input", () => {
    const r = frictionTypeTotalsFromAlignment([]);
    expect(r.total).toBe(0);
    expect(r.dominantType).toBeNull();
  });

  it("ignores flagged pairs that carry no mechanism", () => {
    const r = frictionTypeTotalsFromAlignment([
      { targetAId: "A", targetBId: "B", alignment: "flagged", description: "" },
    ]);
    expect(r.total).toBe(0);
    expect(r.dominantType).toBeNull();
  });
});


// ─── buildDocFocusFrictions ─────────────────────────────────────────

describe("buildDocFocusFrictions", () => {
  const targets = [
    makeTarget("FSS_1", "FSS"),
    makeTarget("FSS_2", "FSS"),
    makeTarget("NAP_1", "NAP"),
    makeTarget("NDC_1", "NDC"),
  ];
  const alignment = [
    makeFlagged("FSS_1", "NAP_1", "goal_conflict"), // cross-doc, touches FSS
    makeFlagged("FSS_1", "NDC_1", "resource_competition"), // cross-doc, touches FSS
    makeFlagged("FSS_1", "FSS_2", "delivery_friction"), // same-doc → excluded
    makeFlagged("NAP_1", "NDC_1", "goal_conflict"), // cross-doc, no FSS → excluded
    makeFlagged("FSS_2", "ZZZ", "goal_conflict"), // unresolvable → excluded
    makeAlignment("FSS_2", "NAP_1", "high"), // not flagged → ignored
  ];

  it("keeps only cross-document flagged pairs touching the focused doc", () => {
    const r = buildDocFocusFrictions(alignment, targets, "FSS");
    expect(r.flaggedPairs).toHaveLength(2);
    // Goal conflict (the NAP pair) outranks resource competition (the NDC pair).
    expect(r.flaggedPairs[0].targetB.id).toBe("NAP_1");
    expect(r.flaggedPairs[1].targetB.id).toBe("NDC_1");
  });

  it("splits the touching pairs by mechanism", () => {
    const r = buildDocFocusFrictions(alignment, targets, "FSS");
    expect(r.frictionTotals.goal_conflict).toBe(1);
    expect(r.frictionTotals.resource_competition).toBe(1);
    expect(r.frictionTotals.delivery_friction).toBe(0); // same-doc one excluded
    expect(r.frictionTotals.total).toBe(2);
  });

  it("returns empty for a doc with no cross-document flags", () => {
    const r = buildDocFocusFrictions(alignment, targets, "ZZZ");
    expect(r.flaggedPairs).toEqual([]);
    expect(r.frictionTotals.total).toBe(0);
  });

  it("surfaces the most severe mechanism first, regardless of peer order", () => {
    const t = [
      makeTarget("V_1", "Vision"),
      makeTarget("A_1", "AAA"), // alphabetically-early peer
      makeTarget("Z_1", "ZZZ"), // alphabetically-late peer
    ];
    const al = [
      makeFlagged("V_1", "A_1", "delivery_friction"), // early peer, least severe
      makeFlagged("V_1", "Z_1", "goal_conflict"), // late peer, most severe
    ];
    const r = buildDocFocusFrictions(al, t, "Vision");
    expect(r.flaggedPairs[0].pair.mechanism).toBe("goal_conflict");
    expect(r.flaggedPairs[1].pair.mechanism).toBe("delivery_friction");
  });
});


// ─── buildTargetFrictionTree ────────────────────────────────────────

describe("buildTargetFrictionTree", () => {
  const targets = [
    makeTarget("NDC_1", "NDC"), // focal
    makeTarget("FSS_1", "FSS"),
    makeTarget("FSS_2", "FSS"),
    makeTarget("NAP_1", "NAP"),
  ];
  const pairs = [
    makeFlagged("NDC_1", "FSS_2", "goal_conflict"),
    makeFlagged("NDC_1", "FSS_1", "resource_competition"),
    makeFlagged("NDC_1", "NAP_1", "resource_competition"),
    makeFlagged("FSS_1", "NDC_1", "delivery_friction"), // focal as side B
    makeFlagged("FSS_1", "NAP_1", "goal_conflict"), // does not touch focal → excluded
    makeFlagged("NDC_1", "ZZZ", "goal_conflict"), // unresolvable counterpart → excluded
    makeAlignment("NDC_1", "FSS_1", "high"), // not flagged → ignored
  ];

  it("counts only flagged pairs touching the focal target with both ids resolvable", () => {
    const tree = buildTargetFrictionTree({
      focalTargetId: "NDC_1",
      pairs,
      targets,
    });
    expect(tree.total).toBe(4);
  });

  it("orders mechanism groups by severity, null mechanism last", () => {
    const withNull = [
      ...pairs,
      { ...makeAlignment("NDC_1", "FSS_2", "flagged"), mechanism: undefined },
    ];
    const tree = buildTargetFrictionTree({
      focalTargetId: "NDC_1",
      pairs: withNull,
      targets,
    });
    expect(tree.byMechanism.map((g) => g.mechanism)).toEqual([
      "goal_conflict",
      "resource_competition",
      "delivery_friction",
      null,
    ]);
  });

  it("groups counterparts by peer document under each mechanism", () => {
    const tree = buildTargetFrictionTree({
      focalTargetId: "NDC_1",
      pairs,
      targets,
    });
    const resource = tree.byMechanism.find(
      (g) => g.mechanism === "resource_competition",
    )!;
    expect(resource.count).toBe(2);
    // FSS and NAP each contribute one; tie broken by label.
    expect(resource.byDoc.map((d) => d.peerDoc)).toEqual(["FSS", "NAP"]);
    expect(resource.byDoc[0].counterparts[0].counterpart.id).toBe("FSS_1");
  });

  it("uses the non-focal side as the counterpart regardless of pair order", () => {
    const tree = buildTargetFrictionTree({
      focalTargetId: "NDC_1",
      pairs,
      targets,
    });
    const delivery = tree.byMechanism.find(
      (g) => g.mechanism === "delivery_friction",
    )!;
    // pair was makeFlagged("FSS_1", "NDC_1", ...) — focal is side B.
    expect(delivery.byDoc[0].counterparts[0].counterpart.id).toBe("FSS_1");
  });

  it("returns empty when the focal target does not resolve", () => {
    const tree = buildTargetFrictionTree({
      focalTargetId: "MISSING",
      pairs,
      targets,
    });
    expect(tree.total).toBe(0);
    expect(tree.byMechanism).toEqual([]);
  });
});


// ─── rankTargetsByFriction ──────────────────────────────────────────

describe("rankTargetsByFriction", () => {
  const targets = [
    makeTarget("A", "FSS"),
    makeTarget("B", "NAP"),
    makeTarget("C", "NAP"),
    makeTarget("D", "NDC"),
  ];

  it("ranks targets by flagged-pair count desc, tie-broken by id", () => {
    const al = [
      makeFlagged("A", "B", "goal_conflict"),
      makeFlagged("A", "C", "resource_competition"),
      makeFlagged("A", "D", "delivery_friction"),
      makeFlagged("B", "C", "resource_competition"),
      makeAlignment("B", "D", "high"), // not flagged → no contribution
    ];
    // counts: A:3, B:2, C:2, D:1
    const r = rankTargetsByFriction(al, targets);
    expect(r.map((x) => x.target.id)).toEqual(["A", "B", "C", "D"]);
    expect(r[0].flaggedPairCount).toBe(3);
    expect(r[1].flaggedPairCount).toBe(2);
  });

  it("only counts pairs where both targets resolve, and caps to n", () => {
    const al = [
      makeFlagged("A", "B", "goal_conflict"),
      makeFlagged("A", "ZZZ", "goal_conflict"), // ZZZ unresolvable → skipped
    ];
    const r = rankTargetsByFriction(al, targets, 1);
    expect(r).toHaveLength(1);
    expect(r[0].target.id).toBe("A");
    expect(r[0].flaggedPairCount).toBe(1);
  });
});


// ─── computeTargetConcentration ─────────────────────────────────────

describe("computeTargetConcentration", () => {
  const targets = ["A", "B", "C", "D", "E"].map((id) => makeTarget(id, "FSS"));
  // 5 distinct flagged pairs; counts A:4, B:2, C:2, D:1, E:1.
  const al = [
    makeFlagged("A", "B", "goal_conflict"),
    makeFlagged("A", "C", "goal_conflict"),
    makeFlagged("A", "D", "goal_conflict"),
    makeFlagged("A", "E", "goal_conflict"),
    makeFlagged("B", "C", "goal_conflict"),
  ];

  it("finds the smallest target set covering the share, counting distinct pairs", () => {
    const r = computeTargetConcentration(al, targets, 0.5);
    expect(r.totalFlaggedPairs).toBe(5);
    expect(r.contestedTargetCount).toBe(5);
    // A alone touches 4 of 5 pairs (0.8 ≥ 0.5).
    expect(r.topCount).toBe(1);
    expect(r.topTargets.map((t) => t.target.id)).toEqual(["A"]);
    expect(r.coveredPairShare).toBeCloseTo(0.8);
    // A adds all 4 of its pairs (none previously covered).
    expect(r.topTargets[0].marginalPairCount).toBe(4);
  });

  it("adds targets greedily until the share is met, deduping shared pairs", () => {
    const r = computeTargetConcentration(al, targets, 0.9);
    // A covers 4; adding B (tie with C, id asc) adds the B-C pair → 5/5.
    expect(r.topCount).toBe(2);
    expect(r.topTargets.map((t) => t.target.id)).toEqual(["A", "B"]);
    expect(r.coveredPairShare).toBeCloseTo(1);
    // A adds 4 new pairs; B adds only the B-C pair (A-B already covered).
    expect(r.topTargets.map((t) => t.marginalPairCount)).toEqual([4, 1]);
  });

  it("returns an empty, zeroed result when nothing is flagged", () => {
    const r = computeTargetConcentration([], targets);
    expect(r.totalFlaggedPairs).toBe(0);
    expect(r.contestedTargetCount).toBe(0);
    expect(r.topCount).toBe(0);
    expect(r.topTargets).toEqual([]);
    expect(r.coveredPairShare).toBe(0);
  });
});


// ─── buildFlagSubsetProfile ─────────────────────────────────────────

describe("buildFlagSubsetProfile", () => {
  const targets = [
    makeTarget("A", "FSS"),
    makeTarget("B", "NAP"),
    makeTarget("C", "NAP"),
    makeTarget("D", "NDC"),
  ];
  const classifications = [
    makeClassification("A", "cat1", "globe"),
    makeClassification("B", "cat1", "globe"),
    makeClassification("C", "cat2", "globe"),
    makeClassification("D", "cat2", "globe"),
  ];
  const categories = [
    { id: "cat1", name: "Cat One" },
    { id: "cat2", name: "Cat Two" },
  ];
  const pairs = [
    makeFlagged("A", "B", "goal_conflict", "manageable"),
    makeFlagged("A", "C", "resource_competition", "fundamental"),
    makeFlagged("A", "D", "delivery_friction", "manageable"),
    makeFlagged("B", "D", "goal_conflict"), // no manageability
  ];

  it("decomposes the subset by doc-pair, theme, recurring target, and manageability", () => {
    const p = buildFlagSubsetProfile({
      pairs,
      targets,
      classifications,
      taxonomyType: "globe",
      categories,
    });
    expect(p.total).toBe(4);

    // Doc-pairs: FSS|NAP=2 (A-B, A-C), FSS|NDC=1 (A-D), NAP|NDC=1 (B-D).
    expect(p.byDocPair[0]).toEqual({ a: "FSS", b: "NAP", count: 2 });
    expect(p.byDocPair.map((d) => `${d.a}|${d.b}`)).toContain("FSS|NDC");
    expect(p.byDocPair.map((d) => `${d.a}|${d.b}`)).toContain("NAP|NDC");

    // Themes: cat1 touched by all 4 pairs, cat2 by 3.
    expect(p.byTheme[0]).toEqual({
      categoryId: "cat1",
      categoryName: "Cat One",
      count: 4,
    });
    expect(p.byTheme[1].count).toBe(3);

    // Recurring targets: A:3, then B:2 / D:2 (tie by id), C:1.
    expect(p.recurringTargets[0].target.id).toBe("A");
    expect(p.recurringTargets[0].count).toBe(3);

    // Manageability tally (B-D has none → unknown).
    expect(p.manageability).toEqual({
      manageable: 2,
      fundamental: 1,
      unknown: 1,
    });
  });

  it("excludes a focal target from recurring targets and caps each list", () => {
    const p = buildFlagSubsetProfile({
      pairs,
      targets,
      classifications,
      taxonomyType: "globe",
      categories,
      excludeTargetId: "A",
      cap: 1,
    });
    expect(p.recurringTargets.every((t) => t.target.id !== "A")).toBe(true);
    expect(p.byDocPair.length).toBeLessThanOrEqual(1);
    expect(p.byTheme.length).toBeLessThanOrEqual(1);
    expect(p.recurringTargets.length).toBeLessThanOrEqual(1);
  });
});

describe("document-filter storyline state selection", () => {
  const fullThemes: CorpusThemes = {
    storylines: [],
    summary_paragraph: "full corpus summary",
    doc_pair_count: 5,
  };
  const enrThemes: CorpusThemes = {
    storylines: [],
    summary_paragraph: "ENR-hidden summary",
    doc_pair_count: 3,
  };

  it("canonicalHiddenKey matches the Python canonical_hidden_key", () => {
    expect(canonicalHiddenKey([])).toBe("");
    expect(canonicalHiddenKey(new Set<string>())).toBe("");
    expect(canonicalHiddenKey(["ENR"])).toBe("ENR");
    expect(canonicalHiddenKey(["B", "A"])).toBe("A+B");
    expect(canonicalHiddenKey(new Set(["B", "A", "A"]))).toBe("A+B");
  });

  it("selects the exact precomputed corpus state for the hidden set", () => {
    const payload: CorpusThemesPayload = {
      ...fullThemes,
      states: { "": fullThemes, ENR: enrThemes },
    };
    const full = selectCorpusThemesForState(payload, new Set());
    expect(full.themes?.summary_paragraph).toBe("full corpus summary");
    expect(full.isExact).toBe(true);

    const hidden = selectCorpusThemesForState(payload, new Set(["ENR"]));
    expect(hidden.themes?.summary_paragraph).toBe("ENR-hidden summary");
    expect(hidden.isExact).toBe(true);
  });

  it("falls back to full corpus (isExact=false) for an unmatched selection", () => {
    const payload: CorpusThemesPayload = {
      ...fullThemes,
      states: { "": fullThemes, ENR: enrThemes },
    };
    const sel = selectCorpusThemesForState(payload, new Set(["HR"]));
    expect(sel.themes?.summary_paragraph).toBe("full corpus summary");
    expect(sel.isExact).toBe(false);
  });

  it("treats a legacy corpus payload without states as the full ('') state", () => {
    const sel = selectCorpusThemesForState(fullThemes, new Set());
    expect(sel.themes?.summary_paragraph).toBe("full corpus summary");
    expect(sel.isExact).toBe(true);
    // A hidden selection on a legacy payload falls back to full (not exact).
    const hidden = selectCorpusThemesForState(fullThemes, new Set(["ENR"]));
    expect(hidden.isExact).toBe(false);
  });

  it("selects sector syntheses by state and falls back for unmatched", () => {
    const fullArr: SectorSynthesis[] = [
      {
        taxonomy_type: "globe",
        category_id: "g1",
        category_name: "Forests",
        aligned_count: 4,
        flagged_count: 1,
        pool_composition: { primary_count: 3, relevant_only_count: 2 },
        contradiction_types: {},
        synthesis: {
          storyline_name: "Forests reinforce one another",
          reinforce: "x",
          clash: "y",
          coordination_hint: "z",
          confidence: "medium",
        },
        synthesis_error: null,
      },
    ];
    const enrArr: SectorSynthesis[] = [];
    const payload: SectorSynthesisPayload = {
      synthesis: fullArr,
      states: { "": fullArr, ENR: enrArr },
    };
    expect(selectSectorSynthesesForState(payload, new Set()).syntheses).toBe(
      fullArr,
    );
    const hidden = selectSectorSynthesesForState(payload, new Set(["ENR"]));
    expect(hidden.syntheses).toBe(enrArr);
    expect(hidden.isExact).toBe(true);
    const unmatched = selectSectorSynthesesForState(payload, new Set(["HR"]));
    expect(unmatched.syntheses).toBe(fullArr);
    expect(unmatched.isExact).toBe(false);
  });

  it("treats a legacy sector array as the full state", () => {
    const arr: SectorSynthesis[] = [];
    const sel = selectSectorSynthesesForState(arr, new Set());
    expect(sel.syntheses).toBe(arr);
    expect(sel.isExact).toBe(true);
  });
});

describe("buildSectorCoherenceShare", () => {
  // Two GGA themes with four targets each, and enough reviewed pairs per theme to
  // clear the minimum-reviewed floor so the share is a real rate, not sampling noise.
  const categories = [
    { id: "catX", name: "Theme X" },
    { id: "catY", name: "Theme Y" },
  ];
  const targets = [
    makeTarget("X1", "NDC"),
    makeTarget("X2", "NDC"),
    makeTarget("X3", "NDC"),
    makeTarget("X4", "NDC"),
    makeTarget("Y1", "NAP"),
    makeTarget("Y2", "NAP"),
    makeTarget("Y3", "NAP"),
    makeTarget("Y4", "NAP"),
  ];
  const classifications = [
    makeClassification("X1", "catX", "gga"),
    makeClassification("X2", "catX", "gga"),
    makeClassification("X3", "catX", "gga"),
    makeClassification("X4", "catX", "gga"),
    makeClassification("Y1", "catY", "gga"),
    makeClassification("Y2", "catY", "gga"),
    makeClassification("Y3", "catY", "gga"),
    makeClassification("Y4", "catY", "gga"),
  ];
  const alignment: AlignmentResult[] = [
    makeAlignment("X1", "X2", "high"), // catX internal aligned
    makeAlignment("X1", "X3", "high"),
    makeAlignment("X2", "X4", "medium"),
    makeAlignment("Y1", "Y2", "high"), // catY internal aligned
    makeAlignment("Y1", "Y3", "high"),
    makeAlignment("Y2", "Y4", "medium"),
    makeAlignment("X1", "Y1", "flagged"), // cross catX<->catY flagged (both themes)
    makeAlignment("X2", "Y2", "flagged"),
    makeAlignment("X3", "Y3", "low"), // excluded: low is not "aligned"
    makeAlignment("X4", "Y4", "none"), // excluded entirely
  ];

  const summary = buildSectorCoherenceShare({
    targets,
    alignment,
    classifications,
    categories,
    taxonomyType: "gga",
  });

  it("counts high+medium aligned and flagged pairs touching a sector, excluding low/none", () => {
    const x = summary.byCategory.get("catX")!;
    expect(x.reviewedPairs).toBe(5); // 3 internal aligned + 2 cross flagged
    expect(x.flaggedPairs).toBe(2); // X1-Y1, X2-Y2
    expect(x.flaggedShare).toBeCloseTo(0.4);
  });

  it("credits a cross-sector flagged pair to both sectors", () => {
    const y = summary.byCategory.get("catY")!;
    expect(y.reviewedPairs).toBe(5); // 3 internal aligned + 2 cross flagged
    expect(y.flaggedPairs).toBe(2); // X1-Y1, X2-Y2
    expect(y.flaggedShare).toBeCloseTo(0.4);
  });

  it("returns null flaggedShare for a sector with no reviewed pairs", () => {
    const withEmpty = [...categories, { id: "catZ", name: "Theme Z" }];
    const s = buildSectorCoherenceShare({
      targets,
      alignment,
      classifications,
      categories: withEmpty,
      taxonomyType: "gga",
    });
    const z = s.byCategory.get("catZ")!;
    expect(z.reviewedPairs).toBe(0);
    expect(z.flaggedPairs).toBe(0);
    expect(z.flaggedShare).toBeNull();
  });

  it("computes corpus mid as the distinct-pair flag rate and maxShare across sectors", () => {
    // distinct lens-reviewed pairs: 6 aligned + 2 flagged = 8; flagged = 2
    expect(summary.mid).toBeCloseTo(2 / 8);
    expect(summary.maxShare).toBeCloseTo(0.4);
  });

  it("counts a flagged pair whose endpoints share one sector only once", () => {
    const t = [makeTarget("A1", "NDC"), makeTarget("A2", "NDC")];
    const c = [
      makeClassification("A1", "catX", "gga"),
      makeClassification("A2", "catX", "gga"),
    ];
    const al = [makeAlignment("A1", "A2", "flagged")];
    const s = buildSectorCoherenceShare({
      targets: t,
      alignment: al,
      classifications: c,
      categories,
      taxonomyType: "gga",
    });
    const x = s.byCategory.get("catX")!;
    expect(x.reviewedPairs).toBe(1); // counted once for the shared sector, not twice
    expect(x.flaggedPairs).toBe(1);
    expect(x.flaggedShare).toBeNull(); // one reviewed pair is below the floor
  });

  it("leaves flaggedShare null below the minimum reviewed-pairs floor and excludes it from maxShare", () => {
    const cats = [
      { id: "catBig", name: "Big" },
      { id: "catThin", name: "Thin" },
    ];
    const t = [
      ...["BG1", "BG2", "BG3", "BG4", "BG5", "BG6"].map((id) => makeTarget(id, "NDC")),
      ...["TH1", "TH2", "TH3", "TH4", "TH5"].map((id) => makeTarget(id, "NAP")),
    ];
    const c = [
      ...["BG1", "BG2", "BG3", "BG4", "BG5", "BG6"].map((id) =>
        makeClassification(id, "catBig", "gga"),
      ),
      ...["TH1", "TH2", "TH3", "TH4", "TH5"].map((id) =>
        makeClassification(id, "catThin", "gga"),
      ),
    ];
    const al: AlignmentResult[] = [
      // catBig: 5 reviewed (2 flagged + 3 aligned) -> share 0.4
      makeAlignment("BG1", "BG2", "flagged"),
      makeAlignment("BG1", "BG3", "flagged"),
      makeAlignment("BG1", "BG4", "high"),
      makeAlignment("BG1", "BG5", "high"),
      makeAlignment("BG1", "BG6", "high"),
      // catThin: 4 reviewed, all flagged -> would read 100%, but is below the floor
      makeAlignment("TH1", "TH2", "flagged"),
      makeAlignment("TH1", "TH3", "flagged"),
      makeAlignment("TH1", "TH4", "flagged"),
      makeAlignment("TH1", "TH5", "flagged"),
    ];
    const s = buildSectorCoherenceShare({
      targets: t,
      alignment: al,
      classifications: c,
      categories: cats,
      taxonomyType: "gga",
    });
    const big = s.byCategory.get("catBig")!;
    const thin = s.byCategory.get("catThin")!;
    expect(big.flaggedShare).toBeCloseTo(0.4);
    expect(thin.reviewedPairs).toBe(4);
    expect(thin.flaggedShare).toBeNull(); // thin data, not a 100% hotspot
    expect(s.maxShare).toBeCloseTo(0.4); // not 1.0 from the thin theme
  });

  it("ignores pairs whose targets are not primary-classified under the active taxonomy", () => {
    const otherTax = [
      makeClassification("X1", "catX", "sector"),
      makeClassification("X2", "catX", "sector"),
    ];
    const s = buildSectorCoherenceShare({
      targets,
      alignment,
      classifications: otherTax,
      categories,
      taxonomyType: "gga",
    });
    expect(s.byCategory.get("catX")!.reviewedPairs).toBe(0);
    expect(s.mid).toBe(0);
    expect(s.maxShare).toBe(0);
  });
});

describe("computeCoverageConcentration", () => {
  function row(
    categoryId: string,
    targetCount: number,
    tensionCount = 0,
  ): SectorTension {
    return {
      categoryId,
      categoryName: categoryId.toUpperCase(),
      targetCount,
      tensionCount,
      peakSeverity: null,
    };
  }

  it("selects the fewest sectors covering >= targetShare of all primary targets", () => {
    const stat = computeCoverageConcentration(
      [row("a", 7), row("b", 2), row("c", 1)],
      0.7,
    );
    expect(stat.populatedSectors).toBe(3);
    expect(stat.totalTargets).toBe(10);
    expect(stat.topNames).toEqual(["A"]); // a alone covers 70%
    expect(stat.share).toBeCloseTo(0.7);
  });

  it("ranks by target count, not tension count", () => {
    // b has far more tensions but fewer targets; coverage must rank by targets.
    const stat = computeCoverageConcentration(
      [row("b", 2, 999), row("a", 8, 0)],
      0.7,
    );
    expect(stat.totalTargets).toBe(10);
    expect(stat.topNames).toEqual(["A"]); // a alone covers 80%
    expect(stat.share).toBeCloseTo(0.8);
  });

  it("returns an empty result when no sector has primary targets", () => {
    const stat = computeCoverageConcentration([row("a", 0), row("b", 0)]);
    expect(stat.populatedSectors).toBe(0);
    expect(stat.totalTargets).toBe(0);
    expect(stat.topNames).toEqual([]);
    expect(stat.share).toBe(0);
  });
});

// ─── Storyline live profiles ─────────────────────────────────────────

function makeStoryline(
  overrides: Partial<import("@/types").CorpusStoryline> & {
    type: "reinforcement" | "friction";
  },
): import("@/types").CorpusStoryline {
  return {
    name: "Land requirements of expansion incentives",
    description: "desc",
    contributing_doc_pairs: [],
    confidence: "medium",
    pair_count: 0,
    spans_documents: [],
    ...overrides,
  };
}

describe("storyline live profiles", () => {
  // NMP (2 targets), NDC (2), NAP (1).
  const targets = [
    makeTarget("NMP_1", "NMP"),
    makeTarget("NMP_2", "NMP"),
    makeTarget("NDC_1", "NDC"),
    makeTarget("NDC_2", "NDC"),
    makeTarget("NAP_1", "NAP"),
  ];
  const alignment: AlignmentResult[] = [
    makeFlagged("NMP_1", "NDC_1", "resource_competition"),
    makeFlagged("NMP_1", "NDC_2", "resource_competition"),
    makeFlagged("NMP_2", "NAP_1", "delivery_friction"),
    makeAlignment("NMP_1", "NDC_1", "high"), // same doc pair, aligned polarity
    makeAlignment("NDC_1", "NAP_1", "medium"),
    makeAlignment("NDC_2", "NAP_1", "low"), // low never counts
    makeAlignment("NDC_1", "NDC_2", "high"), // same-document, ignored
    makeAlignment("NMP_2", "NDC_1", "none"),
  ];
  const classifications = [
    makeClassification("NMP_1", "G1", "globe"),
    makeClassification("NDC_1", "G2", "globe"),
  ];
  const categories = [
    { id: "G1", name: "Extractives" },
    { id: "G2", name: "Climate" },
  ];

  const friction = makeStoryline({
    type: "friction",
    contributing_doc_pairs: ["NDC<->NMP", "NAP<->NMP"],
    anchor_target_ids: ["NMP_1"],
    pair_count: 999, // display must never trust this
  });
  const reinforcement = makeStoryline({
    name: "Shared monitoring frameworks across climate plans",
    type: "reinforcement",
    contributing_doc_pairs: ["NAP<->NDC"],
    pair_count: 999,
  });

  it("buildStorylineProfile counts only polarity-matched cross-doc pairs (ThemeDrawer parity)", () => {
    const p = buildStorylineProfile({
      storyline: friction,
      alignment,
      targets,
      classifications,
      categories,
      taxonomyType: "globe",
    });
    // 3 flagged pairs; the high/low/none/same-doc records never count.
    expect(p.liveCount).toBe(3);
    const r = buildStorylineProfile({
      storyline: reinforcement,
      alignment,
      targets,
      classifications,
      categories,
      taxonomyType: "globe",
    });
    // Only NDC_1<->NAP_1 medium counts; low is excluded.
    expect(r.liveCount).toBe(1);
  });

  it("byDoc carries counts and shares of liveCount", () => {
    const p = buildStorylineProfile({
      storyline: friction,
      alignment,
      targets,
      classifications,
      categories,
      taxonomyType: "globe",
    });
    const byDoc = new Map(p.byDoc.map((d) => [d.doc, d]));
    expect(byDoc.get("NMP")!.count).toBe(3);
    expect(byDoc.get("NMP")!.share).toBeCloseTo(1.0);
    expect(byDoc.get("NDC")!.count).toBe(2);
    expect(byDoc.get("NDC")!.share).toBeCloseTo(2 / 3);
    expect(p.byDoc[0].doc).toBe("NMP"); // sorted by count desc
  });

  it("pins resolvable anchors first and drops unresolvable/zero-count anchors", () => {
    const themed = makeStoryline({
      type: "friction",
      contributing_doc_pairs: ["NDC<->NMP", "NAP<->NMP"],
      // NMP_2 has 1 live pair (less than NMP_1/NDC_*); GHOST_1 does not
      // resolve; NDC_9 resolves nowhere.
      anchor_target_ids: ["NMP_2", "GHOST_1"],
    });
    const p = buildStorylineProfile({
      storyline: themed,
      alignment,
      targets,
      classifications,
      categories,
      taxonomyType: "globe",
    });
    expect(p.topTargets[0].target.id).toBe("NMP_2");
    expect(p.topTargets[0].isAnchor).toBe(true);
    expect(p.topTargets.map((t) => t.target.id)).not.toContain("GHOST_1");
    // Non-anchors follow by count desc (NMP_1 has 2).
    expect(p.topTargets[1].target.id).toBe("NMP_1");
    expect(p.topTargets[1].isAnchor).toBe(false);
  });

  it("stays exact under document filtering", () => {
    // Hide NDC: its targets and pairs disappear from the visible arrays.
    const visTargets = targets.filter((t) => t.sourceDocument !== "NDC");
    const visIds = new Set(visTargets.map((t) => t.id));
    const visAlignment = alignment.filter(
      (a) => visIds.has(a.targetAId) && visIds.has(a.targetBId),
    );
    const p = buildStorylineProfile({
      storyline: friction,
      alignment: visAlignment,
      targets: visTargets,
      classifications,
      categories,
      taxonomyType: "globe",
    });
    expect(p.liveCount).toBe(1); // only NMP_2<->NAP_1 survives
    expect(p.byDoc.map((d) => d.doc).sort()).toEqual(["NAP", "NMP"]);
    // The NMP_1 anchor has no live pairs left -> dropped silently.
    expect(p.topTargets.every((t) => t.target.id !== "NMP_1")).toBe(true);
  });

  it("computeStorylineLiveStats matches buildStorylineProfile", () => {
    const stats = computeStorylineLiveStats(
      [friction, reinforcement],
      alignment,
      targets,
    );
    expect(stats.get(friction)!.liveCount).toBe(3);
    expect(stats.get(friction)!.docCounts.get("NMP")).toBe(3);
    expect(stats.get(reinforcement)!.liveCount).toBe(1);
  });
});

describe("pickTopStorylines", () => {
  const mk = (
    name: string,
    type: "reinforcement" | "friction",
    confidence: "high" | "medium" | "low",
    pairCount: number,
  ) =>
    makeStoryline({ name, type, confidence, pair_count: pairCount });

  it("ranks by confidence, then live count, filtered to the polarity", () => {
    const s1 = mk("Alpha pattern of shared delivery", "friction", "medium", 50);
    const s2 = mk("Beta pattern of shared delivery", "friction", "high", 10);
    const s3 = mk("Gamma pattern of shared delivery", "friction", "medium", 80);
    const s4 = mk("Delta pattern of shared delivery", "reinforcement", "high", 99);
    const top = pickTopStorylines([s1, s2, s3, s4], "friction", 2);
    expect(top.map((s) => s.name)).toEqual([
      "Beta pattern of shared delivery",
      "Gamma pattern of shared delivery",
    ]);
  });

  it("prefers a supplied live counter over persisted pair_count", () => {
    const s1 = mk("Alpha pattern of shared delivery", "friction", "medium", 999);
    const s2 = mk("Beta pattern of shared delivery", "friction", "medium", 1);
    const live = new Map([
      [s1, 2],
      [s2, 40],
    ]);
    const top = pickTopStorylines([s1, s2], "friction", 1, (s) =>
      live.get(s) ?? 0,
    );
    expect(top[0].name).toBe("Beta pattern of shared delivery");
  });
});

describe("concentrationDocAttribution", () => {
  const conc = (docs: string[]): Parameters<
    typeof concentrationDocAttribution
  >[0] => ({
    contestedTargetCount: docs.length,
    totalFlaggedPairs: 100,
    topTargets: docs.map((d, i) => ({
      target: makeTarget(`${d}_${i}`, d),
      flaggedPairCount: 10,
      marginalPairCount: 10,
    })),
    topCount: docs.length,
    coveredPairShare: 0.6,
  });

  it("returns the dominant document at or above half the set", () => {
    const a = concentrationDocAttribution(
      conc(["NMP", "NMP", "NMP", "NMP", "NMP", "PPPP"]),
    );
    expect(a).toEqual({ doc: "NMP", count: 5, total: 6 });
  });

  it("returns exactly-half only when no other doc ties it", () => {
    expect(
      concentrationDocAttribution(conc(["NMP", "NMP", "NDC", "NAP"])),
    ).toEqual({ doc: "NMP", count: 2, total: 4 });
    expect(
      concentrationDocAttribution(conc(["NMP", "NMP", "NDC", "NDC"])),
    ).toBeNull();
  });

  it("returns null below the threshold or for an empty set", () => {
    expect(
      concentrationDocAttribution(conc(["NMP", "NDC", "NAP"])),
    ).toBeNull();
    expect(concentrationDocAttribution(conc([]))).toBeNull();
  });
});
