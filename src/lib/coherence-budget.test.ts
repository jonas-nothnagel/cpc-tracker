import { describe, it, expect } from "vitest";
import { computeBudgetByGlobeCategory } from "./coherence-budget";
import type {
  BerData,
  GlobeCategory,
  GlobeSubcategory,
  ThematicClassification,
} from "@/types";

// computeBudgetByGlobeCategory serves two BER classification shapes:
//   - Mongolia: programmes classified to globe_sub, rolled up to parents
//   - Panama: programmes carry a single-level primary `globe` tag directly
// The wrapper must roll up when subcategory tags exist and fall back to the
// single-level shape when they don't.

const CATEGORIES: GlobeCategory[] = [
  { id: "globe_6", name: "Pollution management", description: "" },
  { id: "globe_7", name: "Protected areas", description: "" },
];

const SUBCATEGORIES: GlobeSubcategory[] = [
  { id: "6.01", parentId: "globe_6", name: "Soil and water", description: "" },
  { id: "7.01", parentId: "globe_7", name: "PA management", description: "" },
];

function berData(): BerData {
  return {
    programs: [
      { code: "P1", name: "P1", description: "", type: "environmental" },
      { code: "P2", name: "P2", description: "", type: "environmental" },
    ],
    expenditure: [
      { code: "P1", name: "P1", values: { "2020": 10 } },
      { code: "P2", name: "P2", values: { "2020": 5 } },
    ],
    currency: "PAB",
    unit: "million",
    period: { start: 2020, end: 2020 },
  };
}

function cls(
  targetId: string,
  categoryId: string,
  taxonomyType: ThematicClassification["taxonomyType"],
): ThematicClassification {
  return { targetId, categoryId, taxonomyType, isRelevant: true, isPrimary: true };
}

describe("computeBudgetByGlobeCategory", () => {
  it("rolls globe_sub tags up to parents when present (Mongolia shape)", () => {
    const r = computeBudgetByGlobeCategory({
      berData: berData(),
      globeCategories: CATEGORIES,
      globeSubcategories: SUBCATEGORIES,
      classifications: [
        cls("BER_P1", "6.01", "globe_sub"),
        cls("BER_P2", "7.01", "globe_sub"),
      ],
      targets: [],
      alignment: [],
    });
    expect(r).not.toBeNull();
    const byId = new Map(r!.entries.map((e) => [e.categoryId, e.totalBudget]));
    expect(byId.get("globe_6")).toBe(10);
    expect(byId.get("globe_7")).toBe(5);
  });

  it("falls back to single-level primary globe tags when no globe_sub BER tags exist (Panama shape)", () => {
    const r = computeBudgetByGlobeCategory({
      berData: berData(),
      globeCategories: CATEGORIES,
      globeSubcategories: SUBCATEGORIES,
      classifications: [
        cls("BER_P1", "globe_6", "globe"),
        cls("BER_P2", "globe_7", "globe"),
      ],
      targets: [],
      alignment: [],
    });
    expect(r).not.toBeNull();
    const byId = new Map(r!.entries.map((e) => [e.categoryId, e.totalBudget]));
    expect(byId.get("globe_6")).toBe(10);
    expect(byId.get("globe_7")).toBe(5);
    expect(r!.totalBudget).toBe(15);
  });

  it("still returns null when no BER classification exists in either shape", () => {
    const r = computeBudgetByGlobeCategory({
      berData: berData(),
      globeCategories: CATEGORIES,
      globeSubcategories: SUBCATEGORIES,
      classifications: [cls("policy_T1", "globe_6", "globe")],
      targets: [],
      alignment: [],
    });
    expect(r).toBeNull();
  });
});
