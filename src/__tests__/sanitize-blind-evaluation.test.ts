import { describe, expect, it } from "vitest";

import type { ModelComparisonReport, ModelDisagreementRow } from "@/types";

import { sanitizeForBlindEvaluation } from "@/lib/dashboard-data";

const fullRow = (a: string, b: string): ModelDisagreementRow => ({
  targetAId: a,
  targetBId: b,
  labels: { "gpt-5-4": "flagged" },
  descriptions: { "gpt-5-4": "verbatim model rationale — must not leak" },
  flagDetails: {
    "gpt-5-4": {
      mechanism: "goal_conflict",
      confidence: "high",
      manageability: "low",
      contestedResources: ["land"],
    },
  },
  distinctLabelCount: 2,
  ordinalSpread: 3,
});

const report = {
  country: "mongolia",
  models: ["gpt-5-4", "deepseek-v4-pro"],
  targets: {
    NDC_1: {
      id: "NDC_1",
      text: "statement",
      sourceDocument: "NDC",
      sourceLabel: "1 Energy",
    },
  },
  uniqueSignalRandomSample: {
    "gpt-5-4": [fullRow("NDC_1", "FSS_2")],
    "deepseek-v4-pro": [fullRow("ILDN_5", "NRVTS_6")],
  },
  consensusFlaggedRandomSample: [fullRow("HR_7", "NDC_8")],
  // Analyst-only row sets that must NOT survive sanitization.
  disagreements: [fullRow("NDC_1", "FSS_2")],
  uniqueSignal: { "gpt-5-4": [fullRow("NDC_1", "FSS_2")] },
} as unknown as ModelComparisonReport;

describe("sanitizeForBlindEvaluation", () => {
  it("keeps only pair IDs in every sample row", () => {
    const blind = sanitizeForBlindEvaluation(report);
    for (const rows of [
      ...Object.values(blind.uniqueSignalRandomSample),
      blind.consensusFlaggedRandomSample,
    ]) {
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual(["targetAId", "targetBId"]);
      }
    }
    expect(blind.uniqueSignalRandomSample["gpt-5-4"]).toEqual([
      { targetAId: "NDC_1", targetBId: "FSS_2" },
    ]);
    expect(blind.consensusFlaggedRandomSample).toEqual([
      { targetAId: "HR_7", targetBId: "NDC_8" },
    ]);
  });

  it("drops every analyst-only field so verdicts can't leak via the payload", () => {
    const blind = sanitizeForBlindEvaluation(report);
    expect(Object.keys(blind).sort()).toEqual([
      "consensusFlaggedRandomSample",
      "country",
      "models",
      "targets",
      "uniqueSignalRandomSample",
    ]);
    expect(JSON.stringify(blind)).not.toContain("rationale");
    expect(JSON.stringify(blind)).not.toContain("flagged");
  });

  it("tolerates a report with missing sample maps", () => {
    const blind = sanitizeForBlindEvaluation({
      ...report,
      uniqueSignalRandomSample:
        undefined as unknown as ModelComparisonReport["uniqueSignalRandomSample"],
      consensusFlaggedRandomSample:
        undefined as unknown as ModelComparisonReport["consensusFlaggedRandomSample"],
    });
    expect(blind.uniqueSignalRandomSample).toEqual({
      "gpt-5-4": [],
      "deepseek-v4-pro": [],
    });
    expect(blind.consensusFlaggedRandomSample).toEqual([]);
  });
});
