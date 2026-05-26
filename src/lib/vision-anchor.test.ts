import { describe, it, expect } from "vitest";
import {
  aggregateAnchorCoverage,
  computeAnchorStatus,
  findLooselyConnectedTargets,
  sortAnchorRows,
  type AnchorRow,
} from "./vision-anchor";
import type { AlignmentLevel, AlignmentResult, Target } from "@/types";

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

function makeAlignment(
  a: string,
  b: string,
  level: AlignmentLevel,
): AlignmentResult {
  return {
    targetAId: a,
    targetBId: b,
    alignment: level,
    description: `${a} ↔ ${b}: ${level}`,
  };
}

function makeRow(
  overrides: Partial<AnchorRow> & { anchor?: Target } = {},
): AnchorRow {
  return {
    anchor: overrides.anchor ?? makeTarget("SECTORAL_1", "SECTORAL"),
    cells: overrides.cells ?? new Map(),
    totalsByLevel: overrides.totalsByLevel ?? {},
    totalRecords: overrides.totalRecords ?? 0,
    mediumOrHighCount: overrides.mediumOrHighCount ?? 0,
    lowTensionShare: overrides.lowTensionShare ?? 0,
    distinctDocsWithMediumPlus: overrides.distinctDocsWithMediumPlus ?? 0,
    status: null,
  };
}

describe("aggregateAnchorCoverage", () => {
  const anchorA = makeTarget("SECTORAL_1", "SECTORAL");
  const anchorB = makeTarget("SECTORAL_2", "SECTORAL");
  const ndc1 = makeTarget("NDC_1", "NDC");
  const ndc2 = makeTarget("NDC_2", "NDC");
  const nbsap1 = makeTarget("NBSAP_1", "NBSAP");
  const nap1 = makeTarget("NAP_1", "NAP");

  const targets = [anchorA, anchorB, ndc1, ndc2, nbsap1, nap1];

  const alignment: AlignmentResult[] = [
    // SECTORAL_1 — strong NDC support, medium NBSAP, low NAP
    makeAlignment("SECTORAL_1", "NDC_1", "high"),
    makeAlignment("SECTORAL_1", "NDC_2", "medium"),
    makeAlignment("SECTORAL_1", "NBSAP_1", "medium"),
    makeAlignment("NAP_1", "SECTORAL_1", "low"), // bidirectional flip
    // SECTORAL_2 — mostly possible_misalignment
    makeAlignment("SECTORAL_2", "NDC_1", "flagged"),
    makeAlignment("SECTORAL_2", "NDC_2", "flagged"),
    makeAlignment("SECTORAL_2", "NBSAP_1", "flagged"),
    makeAlignment("SECTORAL_2", "NAP_1", "medium"),
    // Stray non-anchor pair, must be ignored
    makeAlignment("NDC_1", "NBSAP_1", "high"),
  ];

  it("partitions targets and counts records per anchor cell", () => {
    const result = aggregateAnchorCoverage(targets, alignment, "SECTORAL");
    expect(result.rows).toHaveLength(2);
    expect(result.peripheralCount).toBe(4);
    expect(new Set(result.visibleDocTypes)).toEqual(new Set(["NDC", "NBSAP", "NAP"]));

    const row1 = result.rows.find((r) => r.anchor.id === "SECTORAL_1")!;
    expect(row1.totalRecords).toBe(4);
    expect(row1.cells.get("NDC")!.total).toBe(2);
    expect(row1.cells.get("NDC")!.byLevel).toEqual({ high: 1, medium: 1 });
    expect(row1.cells.get("NBSAP")!.total).toBe(1);
    expect(row1.cells.get("NAP")!.total).toBe(1);
    expect(row1.cells.get("NAP")!.byLevel).toEqual({ low: 1 });
  });

  it("treats targetAId/targetBId as bidirectional", () => {
    const result = aggregateAnchorCoverage(targets, alignment, "SECTORAL");
    const row1 = result.rows.find((r) => r.anchor.id === "SECTORAL_1")!;
    // The NAP record was authored as NAP_1 → SECTORAL_1; it must still
    // attribute to SECTORAL_1's NAP cell.
    expect(row1.cells.get("NAP")!.peripheralIds).toEqual(["NAP_1"]);
  });

  it("ignores alignments that don't involve an anchor", () => {
    const result = aggregateAnchorCoverage(targets, alignment, "SECTORAL");
    const totalRecords = result.rows.reduce((s, r) => s + r.totalRecords, 0);
    // 4 records for SECTORAL_1 + 4 records for SECTORAL_2 = 8.
    // The stray NDC↔NBSAP record is ignored.
    expect(totalRecords).toBe(8);
  });

  it("computes mediumOrHighCount and distinctDocsWithMediumPlus", () => {
    const result = aggregateAnchorCoverage(targets, alignment, "SECTORAL");
    const row1 = result.rows.find((r) => r.anchor.id === "SECTORAL_1")!;
    expect(row1.mediumOrHighCount).toBe(3); // high + medium + medium
    expect(row1.distinctDocsWithMediumPlus).toBe(2); // NDC, NBSAP

    const row2 = result.rows.find((r) => r.anchor.id === "SECTORAL_2")!;
    expect(row2.mediumOrHighCount).toBe(1); // single NAP medium
    expect(row2.lowTensionShare).toBeCloseTo(3 / 4);
  });

  it("tracks the largest single-cell total for bar scaling", () => {
    const result = aggregateAnchorCoverage(targets, alignment, "SECTORAL");
    expect(result.maxCellTotal).toBe(2); // SECTORAL_1's NDC cell has 2
  });

  it("excludes `none`-level records from totals, shares, and status rules", () => {
    // Same anchor (SECTORAL_1) with extra "none" records that should NOT
    // dilute the possible_misalignment share or pad the cell totals.
    const noneTargets = [anchorA, ndc1, ndc2, nbsap1];
    const noneAlignment: AlignmentResult[] = [
      makeAlignment("SECTORAL_1", "NDC_1", "flagged"),
      makeAlignment("SECTORAL_1", "NDC_2", "flagged"),
      // 6 "none" records that should be ignored by the matrix path.
      makeAlignment("SECTORAL_1", "NBSAP_1", "none"),
    ];
    const result = aggregateAnchorCoverage(noneTargets, noneAlignment, "SECTORAL");
    const row = result.rows[0];
    expect(row.totalRecords).toBe(2); // only the two possible_misalignment records
    expect(row.lowTensionShare).toBe(1); // 100%, not 2/3
    expect(row.cells.has("NBSAP")).toBe(false);
    expect(row.status?.id).toBe("tension_heavy");
  });
});

describe("computeAnchorStatus", () => {
  it("flags tension-heavy when possible_misalignment >= 50% of records", () => {
    const status = computeAnchorStatus(
      makeRow({ totalRecords: 10, lowTensionShare: 0.6, mediumOrHighCount: 2, distinctDocsWithMediumPlus: 1 }),
      5,
    );
    expect(status?.id).toBe("tension_heavy");
  });

  it("flags sparse strong support when medium+high count is below threshold", () => {
    const status = computeAnchorStatus(
      makeRow({ totalRecords: 8, lowTensionShare: 0.1, mediumOrHighCount: 3, distinctDocsWithMediumPlus: 2 }),
      5,
    );
    expect(status?.id).toBe("sparse_strong_support");
  });

  it("flags single-document dependency when only one doc contributes medium+", () => {
    const status = computeAnchorStatus(
      makeRow({ totalRecords: 12, lowTensionShare: 0.0, mediumOrHighCount: 8, distinctDocsWithMediumPlus: 1 }),
      5,
    );
    expect(status?.id).toBe("single_doc_dependency");
  });

  it("flags diversified backing when 3+ docs contribute medium+", () => {
    const status = computeAnchorStatus(
      makeRow({ totalRecords: 20, lowTensionShare: 0.1, mediumOrHighCount: 10, distinctDocsWithMediumPlus: 3 }),
      5,
    );
    expect(status?.id).toBe("diversified_backing");
  });

  it("returns null when no rule applies (partial coverage)", () => {
    const status = computeAnchorStatus(
      makeRow({ totalRecords: 12, lowTensionShare: 0.1, mediumOrHighCount: 8, distinctDocsWithMediumPlus: 2 }),
      5,
    );
    expect(status).toBeNull();
  });

  it("does not flag tension-heavy on empty rows", () => {
    const status = computeAnchorStatus(
      makeRow({ totalRecords: 0, lowTensionShare: 0, mediumOrHighCount: 0, distinctDocsWithMediumPlus: 0 }),
      5,
    );
    // 0 medium+ < threshold, so falls to sparse_strong_support, not tension_heavy.
    expect(status?.id).toBe("sparse_strong_support");
  });
});

describe("findLooselyConnectedTargets", () => {
  const anchor = makeTarget("SECTORAL_1", "SECTORAL");
  const anchor2 = makeTarget("SECTORAL_2", "SECTORAL");
  const ndc1 = makeTarget("NDC_1", "NDC");
  const ndc2 = makeTarget("NDC_2", "NDC");
  const nap1 = makeTarget("NAP_1", "NAP");
  const targets = [anchor, anchor2, ndc1, ndc2, nap1];

  it("includes peripherals whose strongest anchor link is at most 'low'", () => {
    const alignment = [
      makeAlignment("SECTORAL_1", "NDC_1", "low"),
      makeAlignment("SECTORAL_2", "NDC_1", "flagged"),
      // NDC_2 reaches medium → excluded
      makeAlignment("SECTORAL_1", "NDC_2", "medium"),
      // NAP_1 has only possible_misalignment → included
      makeAlignment("SECTORAL_1", "NAP_1", "flagged"),
      makeAlignment("SECTORAL_2", "NAP_1", "flagged"),
    ];
    const loose = findLooselyConnectedTargets(targets, alignment, "SECTORAL");
    const ids = loose.map((l) => l.target.id).sort();
    expect(ids).toEqual(["NAP_1", "NDC_1"]);
  });

  it("captures the strongest anchor and counts low / possible_misalignment links", () => {
    const alignment = [
      makeAlignment("SECTORAL_1", "NDC_1", "flagged"),
      makeAlignment("SECTORAL_2", "NDC_1", "low"),
    ];
    const loose = findLooselyConnectedTargets(targets, alignment, "SECTORAL");
    const ndc1Loose = loose.find((l) => l.target.id === "NDC_1")!;
    expect(ndc1Loose.maxLevel).toBe("low");
    expect(ndc1Loose.strongestAnchorId).toBe("SECTORAL_2");
    expect(ndc1Loose.lowCount).toBe(1);
    expect(ndc1Loose.lowTensionCount).toBe(1);
  });

  it("excludes peripherals with zero anchor records", () => {
    const alignment: AlignmentResult[] = [];
    const loose = findLooselyConnectedTargets(targets, alignment, "SECTORAL");
    expect(loose).toEqual([]);
  });
});

describe("sortAnchorRows", () => {
  const a = makeRow({
    anchor: makeTarget("SECTORAL_3", "SECTORAL"),
    distinctDocsWithMediumPlus: 1,
    mediumOrHighCount: 2,
    lowTensionShare: 0.6,
  });
  const b = makeRow({
    anchor: makeTarget("SECTORAL_1", "SECTORAL"),
    distinctDocsWithMediumPlus: 3,
    mediumOrHighCount: 12,
    lowTensionShare: 0.0,
  });
  const c = makeRow({
    anchor: makeTarget("SECTORAL_2", "SECTORAL"),
    distinctDocsWithMediumPlus: 2,
    mediumOrHighCount: 5,
    lowTensionShare: 0.2,
  });

  it("weakest_support orders by distinct docs then medium+ count", () => {
    const sorted = sortAnchorRows([a, b, c], "weakest_support").map((r) => r.anchor.id);
    expect(sorted).toEqual(["SECTORAL_3", "SECTORAL_2", "SECTORAL_1"]);
  });

  it("tension_first orders by descending lowTensionShare", () => {
    const sorted = sortAnchorRows([a, b, c], "tension_first").map((r) => r.anchor.id);
    expect(sorted).toEqual(["SECTORAL_3", "SECTORAL_2", "SECTORAL_1"]);
  });

  it("anchor_order parses the trailing number", () => {
    const sorted = sortAnchorRows([a, b, c], "anchor_order").map((r) => r.anchor.id);
    expect(sorted).toEqual(["SECTORAL_1", "SECTORAL_2", "SECTORAL_3"]);
  });

  it("does not mutate the input array", () => {
    const original = [a, b, c];
    sortAnchorRows(original, "weakest_support");
    expect(original.map((r) => r.anchor.id)).toEqual([
      "SECTORAL_3",
      "SECTORAL_1",
      "SECTORAL_2",
    ]);
  });
});
