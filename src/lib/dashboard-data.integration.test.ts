import { describe, it, expect } from "vitest";
import { assembleDashboardData, derivePaths } from "./dashboard-data";
import { computeBudgetByGlobeCategory } from "./coherence-budget";
import type {
  AlignmentResult,
  BerData,
  GlobeCategory,
  GlobeSubcategory,
  Target,
  ThematicClassification,
} from "@/types";

// Integration check against the REAL committed Panama files (python/data +
// python/output/panama), not fixtures: the financing slide needs berData,
// budgetAlignment, and a non-null GLOBE rollup (Panama BER programmes carry
// single-level primary `globe` tags, exercised via the fallback in
// computeBudgetByGlobeCategory). Guards the production data shape the
// July 2026 Panama feedback changes depend on.

describe("Panama dashboard payload (real files)", () => {
  const derived = derivePaths(null, "panama", null);

  it("resolves panama in the country registry", () => {
    expect(derived.kind).toBe("country");
  });

  it("ships the rebuilt record, budgetAlignment, and a GLOBE spend rollup once its lines are classified", () => {
    if (derived.kind !== "country") throw new Error("unreachable");
    const result = assembleDashboardData(derived.paths, "country");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");

    const berData = result.data.berData as (BerData & { record?: unknown }) | null;
    expect(berData).not.toBeNull();
    expect(berData!.programs.length).toBeGreaterThan(0);
    expect(berData!.period).toBeTruthy();
    // The review rebuilt from BIOFIN's own database (BER plan, step 1).
    expect(berData!.record).toBeTruthy();

    const budgetAlignment = result.data.budgetAlignment as AlignmentResult[] | null;
    expect(budgetAlignment).not.toBeNull();
    expect(budgetAlignment!.length).toBeGreaterThan(0);

    const classifications = result.data.classifications as ThematicClassification[];
    const summary = computeBudgetByGlobeCategory({
      berData: berData!,
      globeCategories: result.data.globeCategories as GlobeCategory[],
      globeSubcategories: result.data.globeSubcategories as GlobeSubcategory[],
      classifications,
      targets: result.data.targets as Target[],
      alignment: result.data.alignment as AlignmentResult[],
    });
    // The previous dashboard's rollup reads the pipeline's own GLOBE tags of
    // the review's lines (single-level for Panama, via the fallback); the
    // rebuilt lines get theirs when the budget step runs on them (step 3).
    const lines = new Set(berData!.programs.map((p) => `BER_${p.code}`));
    const tagged = classifications.some((c) => c.taxonomyType === "globe" && lines.has(c.targetId));
    if (tagged) {
      expect(summary).not.toBeNull();
      expect(summary!.totalBudget).toBeGreaterThan(0);
      expect(summary!.entries.some((e) => e.totalBudget > 0)).toBe(true);
    } else {
      expect(summary === null || summary.totalBudget === 0).toBe(true);
    }
  });
});
