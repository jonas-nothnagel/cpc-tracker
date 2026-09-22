import { describe, it, expect } from "vitest";
import {
  DOC_CLASSES,
  docTierSortKey,
  getDocClass,
  getDocTier,
  groupDocsByTier,
  hasDocTaxonomy,
  isDocClass,
} from ".";
import type { CountryConfig } from "@/types";

/** A country that has classified its corpus (shaped like Panama's config). */
const TIERED: CountryConfig = {
  documentTypes: [
    { id: "NP", shortLabel: "NP", mediumLabel: "NP", fullLabel: "NP", color: "#000", docClass: "commitment", docTier: 1 },
    { id: "PEG", shortLabel: "PEG", mediumLabel: "PEG", fullLabel: "PEG", color: "#000", docClass: "strategic_plan", docTier: 2 },
    { id: "PNSH", shortLabel: "PNSH", mediumLabel: "PNSH", fullLabel: "PNSH", color: "#000", docClass: "sector_plan", docTier: 3 },
    { id: "PENCYT", shortLabel: "PENCYT", mediumLabel: "PENCYT", fullLabel: "PENCYT", color: "#000", docClass: "sector_plan", docTier: 3 },
    { id: "PIOTA", shortLabel: "PIOTA", mediumLabel: "PIOTA", fullLabel: "PIOTA", color: "#000", docClass: "territorial_instrument", docTier: 4 },
  ],
};

/** A country that has not classified anything — the rollback state. */
const UNTIERED: CountryConfig = {
  documentTypes: [
    { id: "NDC", shortLabel: "NDC", mediumLabel: "NDC", fullLabel: "NDC", color: "#000" },
    { id: "NBSAP", shortLabel: "NBSAP", mediumLabel: "NBSAP", fullLabel: "NBSAP", color: "#000" },
  ],
};

describe("vocabulary", () => {
  it("accepts every declared class and rejects anything else", () => {
    for (const c of DOC_CLASSES) expect(isDocClass(c)).toBe(true);
    expect(isDocClass("pledge")).toBe(false);
    expect(isDocClass("")).toBe(false);
  });

  it("ignores a class outside the vocabulary rather than passing it through", () => {
    const rogue: CountryConfig = {
      documentTypes: [
        { id: "X", shortLabel: "X", mediumLabel: "X", fullLabel: "X", color: "#000", docClass: "made_up", docTier: 2 },
      ],
    };
    expect(getDocClass(rogue, "X")).toBeUndefined();
    // The tier is still honoured: an unrecognised class must not silently
    // remove a document from its tier grouping.
    expect(getDocTier(rogue, "X")).toBe(2);
  });
});

describe("accessors", () => {
  it("reads class and tier from the country config", () => {
    expect(getDocClass(TIERED, "NP")).toBe("commitment");
    expect(getDocTier(TIERED, "NP")).toBe(1);
    expect(getDocClass(TIERED, "PIOTA")).toBe("territorial_instrument");
    expect(getDocTier(TIERED, "PIOTA")).toBe(4);
  });

  it("gives BTR the reserved reporting taxonomy without the country declaring it", () => {
    expect(getDocClass(TIERED, "BTR")).toBe("reporting");
    expect(getDocTier(TIERED, "BTR")).toBe(5);
    expect(getDocClass(TIERED, "BTR_ADP")).toBe("reporting");
  });

  it("returns undefined for an untiered country, an unknown id, and no config", () => {
    expect(getDocClass(UNTIERED, "NDC")).toBeUndefined();
    expect(getDocTier(UNTIERED, "NDC")).toBeUndefined();
    expect(getDocClass(TIERED, "NOPE")).toBeUndefined();
    expect(getDocTier(null, "NP")).toBeUndefined();
  });

  it("does not classify OTHER — a catch-all has no honest tier", () => {
    expect(getDocClass(TIERED, "OTHER")).toBeUndefined();
    expect(getDocTier(TIERED, "OTHER")).toBeUndefined();
  });
});

describe("hasDocTaxonomy", () => {
  it("is true only when the country itself tiered something", () => {
    expect(hasDocTaxonomy(TIERED)).toBe(true);
    // Reserved BTR taxonomy alone must not switch on tier-grouped UI.
    expect(hasDocTaxonomy(UNTIERED)).toBe(false);
    expect(hasDocTaxonomy(null)).toBe(false);
    expect(hasDocTaxonomy({})).toBe(false);
  });
});

describe("docTierSortKey", () => {
  it("orders by tier ahead of the caller's existing order", () => {
    // PEG is declared second but is more senior than PNSH/PENCYT.
    const keys = ["PNSH", "PEG", "NP"].map((id, i) => ({
      id,
      key: docTierSortKey(TIERED, id, i),
    }));
    const sorted = [...keys].sort((a, b) => a.key - b.key).map((k) => k.id);
    expect(sorted).toEqual(["NP", "PEG", "PNSH"]);
  });

  it("breaks ties within a tier using the caller's order", () => {
    // PNSH and PENCYT are both tier 3; the fallback index decides.
    expect(docTierSortKey(TIERED, "PNSH", 2)).toBeLessThan(
      docTierSortKey(TIERED, "PENCYT", 3),
    );
  });

  it("sends untiered documents to the end regardless of fallback index", () => {
    expect(docTierSortKey(UNTIERED, "NDC", 0)).toBe(Number.MAX_SAFE_INTEGER);
    expect(docTierSortKey(TIERED, "PIOTA", 999)).toBeLessThan(
      docTierSortKey(UNTIERED, "NDC", 0),
    );
  });
});

describe("groupDocsByTier", () => {
  it("groups most senior first and preserves input order inside a tier", () => {
    expect(groupDocsByTier(TIERED, ["PENCYT", "NP", "PNSH", "PEG"])).toEqual([
      { tier: 1, docIds: ["NP"] },
      { tier: 2, docIds: ["PEG"] },
      { tier: 3, docIds: ["PENCYT", "PNSH"] },
    ]);
  });

  it("keeps untiered documents visible, in a final group", () => {
    const groups = groupDocsByTier(TIERED, ["NP", "MYSTERY"]);
    expect(groups[0]).toEqual({ tier: 1, docIds: ["NP"] });
    expect(groups[groups.length - 1].docIds).toEqual(["MYSTERY"]);
    expect(groups[groups.length - 1].tier).toBeGreaterThan(5);
  });

  it("returns a single untiered group for a country with no taxonomy", () => {
    const groups = groupDocsByTier(UNTIERED, ["NDC", "NBSAP"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].docIds).toEqual(["NDC", "NBSAP"]);
  });

  it("returns nothing for an empty document list", () => {
    expect(groupDocsByTier(TIERED, [])).toEqual([]);
  });
});
