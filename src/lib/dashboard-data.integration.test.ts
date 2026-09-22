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

  it("ships berData, budgetAlignment, and a non-null GLOBE spend rollup", () => {
    if (derived.kind !== "country") throw new Error("unreachable");
    const result = assembleDashboardData(derived.paths, "country");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");

    const berData = result.data.berData as BerData | null;
    expect(berData).not.toBeNull();
    expect(berData!.programs.length).toBeGreaterThan(0);
    expect(berData!.period).toBeTruthy();

    const budgetAlignment = result.data.budgetAlignment as AlignmentResult[] | null;
    expect(budgetAlignment).not.toBeNull();
    expect(budgetAlignment!.length).toBeGreaterThan(0);

    const summary = computeBudgetByGlobeCategory({
      berData: berData!,
      globeCategories: result.data.globeCategories as GlobeCategory[],
      globeSubcategories: result.data.globeSubcategories as GlobeSubcategory[],
      classifications: result.data.classifications as ThematicClassification[],
      targets: result.data.targets as Target[],
      alignment: result.data.alignment as AlignmentResult[],
    });
    // Before the single-level fallback this was null for Panama (BER
    // programmes have primary `globe` tags, no `globe_sub`).
    expect(summary).not.toBeNull();
    expect(summary!.totalBudget).toBeGreaterThan(0);
    expect(summary!.entries.some((e) => e.totalBudget > 0)).toBe(true);
  });
});
