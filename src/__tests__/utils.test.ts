import { describe, it, expect } from "vitest";
import {
  chartDocKey,
  countByCategory,
  getDocColor,
  getDocFriendlyName,
  getDocFullLabel,
  getDocLabel,
  getDocMediumLabel,
  getDocTypeOrder,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import type { CountryConfig, Target, ThematicClassification } from "@/types";

// ---------------------------------------------------------------------------
// isContradiction
// ---------------------------------------------------------------------------

describe("isContradiction", () => {
  it("returns true for the flagged level", () => {
    expect(isContradiction("flagged")).toBe(true);
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
    // Under the open PolicyDocumentType contract, `byDoc` only holds keys
    // for document types that actually appeared in the loop. NAP never does
    // here because the sole NAP target is filtered out as non-relevant, so
    // the key is absent rather than zero. Consumers must use `?? 0` when
    // they want arithmetic behaviour.
    expect(catA.byDocument.NAP ?? 0).toBe(0);
  });

  it("buckets targets under a synthetic key when resolveDocKey is provided", () => {
    // Mirror the dashboard's BTR-split: mitigation under "BTR", adaptation
    // under "BTR_ADP". The chart relies on this to render two separate stacks.
    const btrTargets: Target[] = [
      { id: "BTR_1", text: "BTR mit", sourceDocument: "BTR", sourceLabel: "x", country: "Test", isQuantitative: false, isTimeBound: false, actionType: "mitigation" },
      { id: "ADP_1", text: "BTR adp", sourceDocument: "BTR", sourceLabel: "y", country: "Test", isQuantitative: false, isTimeBound: false, actionType: "adaptation" },
    ];
    const cls: ThematicClassification[] = [
      { targetId: "BTR_1", categoryId: "cat_a", taxonomyType: "sector", isRelevant: true, isPrimary: true },
      { targetId: "ADP_1", categoryId: "cat_a", taxonomyType: "sector", isRelevant: true, isPrimary: true },
    ];
    const result = countByCategory(btrTargets, cls, categories, chartDocKey);
    const catA = result.find((r) => r.categoryId === "cat_a")!;
    expect(catA.total).toBe(2);
    expect(catA.byDocument.BTR).toBe(1);
    expect(catA.byDocument.BTR_ADP).toBe(1);
  });
});

describe("chartDocKey", () => {
  it("routes BTR adaptation actions to the synthetic BTR_ADP bucket", () => {
    expect(
      chartDocKey({ id: "ADP_1", text: "x", sourceDocument: "BTR", sourceLabel: "x", country: "T", isQuantitative: false, isTimeBound: false, actionType: "adaptation" }),
    ).toBe("BTR_ADP");
  });

  it("keeps BTR mitigation actions on the regular BTR key", () => {
    expect(
      chartDocKey({ id: "BTR_1", text: "x", sourceDocument: "BTR", sourceLabel: "x", country: "T", isQuantitative: false, isTimeBound: false, actionType: "mitigation" }),
    ).toBe("BTR");
  });

  it("returns sourceDocument unchanged for non-BTR targets", () => {
    expect(
      chartDocKey({ id: "T1", text: "x", sourceDocument: "NDC", sourceLabel: "x", country: "T", isQuantitative: false, isTimeBound: false }),
    ).toBe("NDC");
  });
});

// ---------------------------------------------------------------------------
// Country-driven document type helpers
// ---------------------------------------------------------------------------

const mongoliaConfig: CountryConfig = {
  documentTypes: [
    { id: "NDC", shortLabel: "NDC", mediumLabel: "NDC (Climate)",
      fullLabel: "Nationally Determined Contribution", color: "#0468b1" },
    { id: "NBSAP", shortLabel: "NBSAP", mediumLabel: "NBSAP (Biodiversity)",
      fullLabel: "National Biodiversity Strategy & Action Plan", color: "#0d9488" },
  ],
};

const panamaConfig: CountryConfig = {
  documentTypes: [
    { id: "NP", shortLabel: "NP", mediumLabel: "NP (Nature Pledge)",
      fullLabel: "Nature Pledge", color: "#0468b1" },
    { id: "ENR", shortLabel: "ENR", mediumLabel: "ENR (REDD+)",
      fullLabel: "Estrategia Nacional REDD+", color: "#4f7942" },
  ],
};

describe("getDocLabel", () => {
  it("returns the country-specific short label", () => {
    expect(getDocLabel(mongoliaConfig, "NDC")).toBe("NDC");
    expect(getDocLabel(panamaConfig, "NP")).toBe("NP");
  });

  it("returns the reserved BTR short label even without a country config", () => {
    expect(getDocLabel(null, "BTR")).toBe("BTR Action");
    expect(getDocLabel(undefined, "BTR")).toBe("BTR Action");
    expect(getDocLabel(mongoliaConfig, "BTR")).toBe("BTR Action");
  });

  it("returns the reserved BTR_ADP short label for the adaptation split", () => {
    expect(getDocLabel(null, "BTR_ADP")).toBe("BTR Adaptation");
    expect(getDocLabel(mongoliaConfig, "BTR_ADP")).toBe("BTR Adaptation");
  });

  it("returns the reserved OTHER short label even without a country config", () => {
    expect(getDocLabel(null, "OTHER")).toBe("Other");
    expect(getDocLabel(mongoliaConfig, "OTHER")).toBe("Other");
  });

  it("falls back to the raw id for unknown documents", () => {
    expect(getDocLabel(mongoliaConfig, "UNKNOWN")).toBe("UNKNOWN");
    expect(getDocLabel(null, "UNKNOWN")).toBe("UNKNOWN");
  });

  it("lets a country override the reserved BTR entry when present", () => {
    const custom: CountryConfig = {
      documentTypes: [
        { id: "BTR", shortLabel: "BUR", mediumLabel: "BUR",
          fullLabel: "Biennial Update Report", color: "#123456" },
      ],
    };
    expect(getDocLabel(custom, "BTR")).toBe("BUR");
  });
});

describe("getDocMediumLabel", () => {
  it("returns the country-specific medium label", () => {
    expect(getDocMediumLabel(mongoliaConfig, "NDC")).toBe("NDC (Climate)");
  });

  it("returns the reserved medium label for BTR", () => {
    expect(getDocMediumLabel(null, "BTR")).toBe("BTR (Transparency)");
  });

  it("falls back to the raw id for unknown documents", () => {
    expect(getDocMediumLabel(mongoliaConfig, "UNKNOWN")).toBe("UNKNOWN");
  });
});

describe("getDocFullLabel", () => {
  it("returns the country-specific full label", () => {
    expect(getDocFullLabel(mongoliaConfig, "NDC")).toBe("Nationally Determined Contribution");
  });

  it("returns the reserved full label for OTHER", () => {
    expect(getDocFullLabel(null, "OTHER")).toBe("Other Policy Document");
  });

  it("falls back to the raw id for unknown documents", () => {
    expect(getDocFullLabel(null, "UNKNOWN")).toBe("UNKNOWN");
  });
});

describe("getDocFriendlyName", () => {
  it("extracts the parenthetical from mediumLabel", () => {
    expect(getDocFriendlyName(mongoliaConfig, "NDC")).toBe("Climate");
  });

  it("returns the mediumLabel when there is no parenthetical", () => {
    // Mongolia's Vision 2050 has mediumLabel = "Vision 2050" (no parens)
    const cfg = {
      documentTypes: [{ id: "Vision 2050", shortLabel: "Vision 2050", mediumLabel: "Vision 2050", fullLabel: "Vision 2050", color: "#000" }],
    };
    expect(getDocFriendlyName(cfg, "Vision 2050")).toBe("Vision 2050");
  });

  it("falls back to raw id for unknown documents", () => {
    expect(getDocFriendlyName(null, "UNKNOWN")).toBe("UNKNOWN");
  });
});

describe("getDocColor", () => {
  it("returns the country-specific color", () => {
    expect(getDocColor(mongoliaConfig, "NDC")).toBe("#0468b1");
    expect(getDocColor(panamaConfig, "ENR")).toBe("#4f7942");
  });

  it("returns the reserved BTR color without a country config", () => {
    expect(getDocColor(null, "BTR")).toBe("#7c3aed");
  });

  it("returns the reserved BTR_ADP color (fuchsia) for the adaptation split", () => {
    expect(getDocColor(null, "BTR_ADP")).toBe("#c026d3");
  });

  it("returns a neutral gray for unknown documents", () => {
    expect(getDocColor(mongoliaConfig, "UNKNOWN")).toBe("#94a3b8");
    expect(getDocColor(null, "UNKNOWN")).toBe("#94a3b8");
  });
});

describe("getDocTypeOrder", () => {
  it("returns the country's declared index", () => {
    expect(getDocTypeOrder(mongoliaConfig, "NDC")).toBe(0);
    expect(getDocTypeOrder(mongoliaConfig, "NBSAP")).toBe(1);
    expect(getDocTypeOrder(panamaConfig, "ENR")).toBe(1);
  });

  it("sorts reserved tokens after country-declared entries", () => {
    const btrOrder = getDocTypeOrder(mongoliaConfig, "BTR");
    const otherOrder = getDocTypeOrder(mongoliaConfig, "OTHER");
    expect(btrOrder).toBeGreaterThan(getDocTypeOrder(mongoliaConfig, "NBSAP"));
    expect(otherOrder).toBeGreaterThan(btrOrder);
  });

  it("places BTR_ADP immediately after BTR so the two render adjacent", () => {
    const btrOrder = getDocTypeOrder(mongoliaConfig, "BTR");
    const btrAdpOrder = getDocTypeOrder(mongoliaConfig, "BTR_ADP");
    const otherOrder = getDocTypeOrder(mongoliaConfig, "OTHER");
    expect(btrAdpOrder).toBe(btrOrder + 1);
    expect(otherOrder).toBeGreaterThan(btrAdpOrder);
  });

  it("sorts unknown ids to the very end", () => {
    expect(getDocTypeOrder(mongoliaConfig, "UNKNOWN")).toBe(Number.MAX_SAFE_INTEGER);
    expect(getDocTypeOrder(null, "UNKNOWN")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("uses the country override for BTR when declared in the country config", () => {
    const custom: CountryConfig = {
      documentTypes: [
        { id: "BTR", shortLabel: "BTR", mediumLabel: "BTR", fullLabel: "BTR", color: "#000" },
        { id: "NDC", shortLabel: "NDC", mediumLabel: "NDC", fullLabel: "NDC", color: "#000" },
      ],
    };
    // Country index wins: BTR is position 0 here, not the reserved offset.
    expect(getDocTypeOrder(custom, "BTR")).toBe(0);
    expect(getDocTypeOrder(custom, "NDC")).toBe(1);
  });
});
