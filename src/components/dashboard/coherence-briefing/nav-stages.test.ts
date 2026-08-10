import { describe, it, expect } from "vitest";
import { SECTION_STAGES, resolveStages } from "./nav-stages";

/**
 * The nav order a country actually renders. Financing drops without BER data
 * and Implementation without BTR data (see `visibleSectionOrder` in index.tsx),
 * so these are the three real shapes today.
 */
const PANAMA = [
  "direction",
  "doc-focus",
  "doc-pairs",
  "friction-types",
  "where-to-focus",
  "sectors",
  "financing",
  "implementation",
  "explore",
];
const SRI_LANKA = PANAMA.filter(
  (id) => id !== "financing" && id !== "implementation",
);

function shape(order: string[]) {
  return (resolveStages(order) ?? []).map((s) => [s.id, s.sections] as const);
}

describe("resolveStages", () => {
  it("groups a full corpus into the four stages, in scroll order", () => {
    expect(shape(PANAMA)).toEqual([
      ["policies", ["direction", "doc-focus", "doc-pairs"]],
      ["friction", ["friction-types", "where-to-focus", "sectors"]],
      ["delivery", ["financing", "implementation"]],
      ["explore", ["explore"]],
    ]);
  });

  it("drops a stage that has no sections rather than rendering an empty heading", () => {
    // Sri Lanka is coherence-only: no BER, no BTR, so "delivery" empties.
    const ids = shape(SRI_LANKA).map(([id]) => id);
    expect(ids).not.toContain("delivery");
    expect(ids).toEqual(["policies", "friction", "explore"]);
  });

  it("keeps a stage that is only partly present", () => {
    // A country with BTR but no BER keeps delivery, with one section.
    const order = PANAMA.filter((id) => id !== "financing");
    expect(shape(order)).toContainEqual(["delivery", ["implementation"]]);
  });

  it("covers every rendered section exactly once", () => {
    for (const order of [PANAMA, SRI_LANKA]) {
      const covered = shape(order).flatMap(([, sections]) => sections);
      expect([...covered].sort()).toEqual([...order].sort());
    }
  });

  it("numbers sections by their position in the full order, not within a stage", () => {
    const stages = resolveStages(PANAMA)!;
    // "delivery" starts at financing, which is index 6 (nav label 07).
    expect(stages.find((s) => s.id === "delivery")?.firstIndex).toBe(6);
  });

  it("shows a section no stage claims rather than hiding it", () => {
    const withNew = [...PANAMA, "brand-new-section"];
    const covered = shape(withNew).flatMap(([, sections]) => sections);
    expect(covered).toContain("brand-new-section");
  });

  it("returns nothing for an empty order", () => {
    expect(resolveStages([])).toEqual([]);
  });

  it("declares each section in at most one stage", () => {
    const seen = new Set<string>();
    for (const stage of SECTION_STAGES ?? []) {
      for (const id of stage.sections) {
        expect(seen.has(id), `${id} is claimed twice`).toBe(false);
        seen.add(id);
      }
    }
  });
});
