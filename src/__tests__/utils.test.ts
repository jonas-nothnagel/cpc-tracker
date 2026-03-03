import { describe, it, expect } from "vitest";
import { countByCategory } from "@/lib/utils";
import { isContradiction } from "@/types";
import type { Target, ThematicClassification } from "@/types";

// ---------------------------------------------------------------------------
// isContradiction
// ---------------------------------------------------------------------------

describe("isContradiction", () => {
  it("returns true for contradiction levels", () => {
    expect(isContradiction("high_contradiction")).toBe(true);
    expect(isContradiction("moderate_contradiction")).toBe(true);
    expect(isContradiction("low_tension")).toBe(true);
  });

  it("returns false for alignment and none levels", () => {
    expect(isContradiction("none")).toBe(false);
    expect(isContradiction("low")).toBe(false);
    expect(isContradiction("medium")).toBe(false);
    expect(isContradiction("high")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countByCategory
// ---------------------------------------------------------------------------

describe("countByCategory", () => {
  const targets: Target[] = [
    { id: "A", text: "Target A", sourceDocument: "NAP", sourceLabel: "A", country: "Test", isQuantitative: false, isTimeBound: false },
    { id: "B", text: "Target B", sourceDocument: "NDC", sourceLabel: "B", country: "Test", isQuantitative: false, isTimeBound: false },
    { id: "C", text: "Target C", sourceDocument: "NDC", sourceLabel: "C", country: "Test", isQuantitative: false, isTimeBound: false },
  ];

  const categories = [
    { id: "cat_a", name: "Category A" },
    { id: "cat_b", name: "Category B" },
  ];

  it("counts targets by category and document type", () => {
    const classifications: ThematicClassification[] = [
      { targetId: "A", categoryId: "cat_a", taxonomyType: "nbs", isRelevant: true },
      { targetId: "B", categoryId: "cat_a", taxonomyType: "nbs", isRelevant: true },
      { targetId: "C", categoryId: "cat_b", taxonomyType: "nbs", isRelevant: true },
    ];

    const result = countByCategory(targets, classifications, categories);
    expect(result).toHaveLength(2);

    const catA = result.find((r) => r.categoryId === "cat_a")!;
    expect(catA.total).toBe(2);
    expect(catA.byDocument.NAP).toBe(1);
    expect(catA.byDocument.NDC).toBe(1);
  });

  it("handles empty input", () => {
    const result = countByCategory([], [], categories);
    expect(result).toHaveLength(2);
    expect(result[0].total).toBe(0);
  });

  it("ignores non-relevant classifications", () => {
    const classifications: ThematicClassification[] = [
      { targetId: "A", categoryId: "cat_a", taxonomyType: "nbs", isRelevant: false },
      { targetId: "B", categoryId: "cat_a", taxonomyType: "nbs", isRelevant: true },
    ];

    const result = countByCategory(targets, classifications, categories);
    const catA = result.find((r) => r.categoryId === "cat_a")!;
    expect(catA.total).toBe(1);
    expect(catA.byDocument.NAP).toBe(0);
  });
});
