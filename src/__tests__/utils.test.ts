import { describe, it, expect } from "vitest";
import {
  countByCategory,
  DOC_COLORS,
  DOC_LABELS,
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  ALIGNMENT_LEVEL_ORDER,
  ALIGNMENT_WEIGHTS,
  CONTRADICTION_TYPE_LABELS,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import type { Target, ThematicClassification, AlignmentLevel } from "@/types";

// ---------------------------------------------------------------------------
// DOC_COLORS / DOC_LABELS completeness
// ---------------------------------------------------------------------------

describe("DOC_COLORS", () => {
  it("has entries for all document types", () => {
    const types = ["NDC", "NBSAP", "NAP", "LDN", "SECTORAL", "OTHER"];
    for (const t of types) {
      expect(DOC_COLORS).toHaveProperty(t);
      expect(typeof DOC_COLORS[t as keyof typeof DOC_COLORS]).toBe("string");
    }
  });
});

describe("DOC_LABELS", () => {
  it("has entries for all document types", () => {
    const types = ["NDC", "NBSAP", "NAP", "LDN", "SECTORAL", "OTHER"];
    for (const t of types) {
      expect(DOC_LABELS).toHaveProperty(t);
    }
  });
});

// ---------------------------------------------------------------------------
// Bidirectional alignment constants
// ---------------------------------------------------------------------------

describe("ALIGNMENT_COLORS", () => {
  it("has entries for all 7 levels", () => {
    const levels: AlignmentLevel[] = [
      "high_contradiction",
      "moderate_contradiction",
      "low_tension",
      "none",
      "low",
      "medium",
      "high",
    ];
    for (const l of levels) {
      expect(ALIGNMENT_COLORS).toHaveProperty(l);
      expect(ALIGNMENT_COLORS[l]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("contradiction colors are red-ish", () => {
    expect(ALIGNMENT_COLORS.high_contradiction).toBe("#b91c1c");
    expect(ALIGNMENT_COLORS.moderate_contradiction).toBe("#dc2626");
  });
});

describe("ALIGNMENT_LABELS", () => {
  it("has labels for all 7 levels", () => {
    expect(Object.keys(ALIGNMENT_LABELS)).toHaveLength(7);
    expect(ALIGNMENT_LABELS.high_contradiction).toBe("High contradiction");
    expect(ALIGNMENT_LABELS.none).toBe("No relationship");
    expect(ALIGNMENT_LABELS.high).toBe("High");
  });
});

describe("ALIGNMENT_LEVEL_ORDER", () => {
  it("goes from most negative to most positive", () => {
    expect(ALIGNMENT_LEVEL_ORDER[0]).toBe("high_contradiction");
    expect(ALIGNMENT_LEVEL_ORDER[ALIGNMENT_LEVEL_ORDER.length - 1]).toBe("high");
    expect(ALIGNMENT_LEVEL_ORDER).toHaveLength(7);
  });
});

describe("ALIGNMENT_WEIGHTS", () => {
  it("has negative weights for contradictions and positive for alignment", () => {
    expect(ALIGNMENT_WEIGHTS.high_contradiction).toBe(-3);
    expect(ALIGNMENT_WEIGHTS.moderate_contradiction).toBe(-2);
    expect(ALIGNMENT_WEIGHTS.low_tension).toBe(-1);
    expect(ALIGNMENT_WEIGHTS.none).toBe(0);
    expect(ALIGNMENT_WEIGHTS.low).toBe(1);
    expect(ALIGNMENT_WEIGHTS.medium).toBe(2);
    expect(ALIGNMENT_WEIGHTS.high).toBe(3);
  });
});

describe("CONTRADICTION_TYPE_LABELS", () => {
  it("has all 4 types", () => {
    expect(Object.keys(CONTRADICTION_TYPE_LABELS)).toHaveLength(4);
    expect(CONTRADICTION_TYPE_LABELS.goal_conflict).toBe("Goal conflict");
    expect(CONTRADICTION_TYPE_LABELS.resource_competition).toBe("Resource competition");
    expect(CONTRADICTION_TYPE_LABELS.implementation_tension).toBe("Implementation tension");
    expect(CONTRADICTION_TYPE_LABELS.scale_scope_mismatch).toBe("Scale/scope mismatch");
  });
});

// ---------------------------------------------------------------------------
// isContradiction helper
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
    {
      id: "NAP_1",
      text: "Target 1",
      sourceDocument: "NAP",
      sourceLabel: "T1",
      country: "Mongolia",
      isQuantitative: false,
      isTimeBound: false,
    },
    {
      id: "NDC_1",
      text: "Target 2",
      sourceDocument: "NDC",
      sourceLabel: "T2",
      country: "Mongolia",
      isQuantitative: false,
      isTimeBound: false,
    },
    {
      id: "NDC_2",
      text: "Target 3",
      sourceDocument: "NDC",
      sourceLabel: "T3",
      country: "Mongolia",
      isQuantitative: false,
      isTimeBound: false,
    },
  ];

  const categories = [
    { id: "cat_a", name: "Category A" },
    { id: "cat_b", name: "Category B" },
  ];

  it("counts targets by category and document type", () => {
    const classifications: ThematicClassification[] = [
      { targetId: "NAP_1", categoryId: "cat_a", taxonomyType: "nbs", isRelevant: true },
      { targetId: "NDC_1", categoryId: "cat_a", taxonomyType: "nbs", isRelevant: true },
      { targetId: "NDC_2", categoryId: "cat_b", taxonomyType: "nbs", isRelevant: true },
    ];

    const result = countByCategory(targets, classifications, categories);
    expect(result).toHaveLength(2);

    const catA = result.find((r) => r.categoryId === "cat_a");
    expect(catA!.total).toBe(2);
    expect(catA!.byDocument.NAP).toBe(1);
    expect(catA!.byDocument.NDC).toBe(1);

    const catB = result.find((r) => r.categoryId === "cat_b");
    expect(catB!.total).toBe(1);
    expect(catB!.byDocument.NDC).toBe(1);
  });

  it("handles empty input", () => {
    const result = countByCategory([], [], categories);
    expect(result).toHaveLength(2);
    expect(result[0].total).toBe(0);
    expect(result[1].total).toBe(0);
  });

  it("ignores non-relevant classifications", () => {
    const classifications: ThematicClassification[] = [
      { targetId: "NAP_1", categoryId: "cat_a", taxonomyType: "nbs", isRelevant: false },
      { targetId: "NDC_1", categoryId: "cat_a", taxonomyType: "nbs", isRelevant: true },
    ];

    const result = countByCategory(targets, classifications, categories);
    const catA = result.find((r) => r.categoryId === "cat_a");
    expect(catA!.total).toBe(1);
    expect(catA!.byDocument.NAP).toBe(0);
    expect(catA!.byDocument.NDC).toBe(1);
  });
});
