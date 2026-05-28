import { describe, it, expect } from "vitest";
import {
  mapInsightFilterToWheelFilter,
  resolveExploreAction,
  type ResolveActionContext,
} from "./explore-actions";
import type { PolicyDocumentType } from "@/types";

describe("mapInsightFilterToWheelFilter", () => {
  it("maps contradiction filters to tensions", () => {
    expect(mapInsightFilterToWheelFilter("contradictions")).toBe("tensions");
    expect(mapInsightFilterToWheelFilter("high_contra")).toBe("tensions");
  });
  it("maps high-alignment filters to alignments", () => {
    expect(mapInsightFilterToWheelFilter("high")).toBe("alignments");
    expect(mapInsightFilterToWheelFilter("high_medium")).toBe("alignments");
  });
  it("passes through all", () => {
    expect(mapInsightFilterToWheelFilter("all")).toBe("all");
  });
  it("returns null for unknown or undefined", () => {
    expect(mapInsightFilterToWheelFilter("nope")).toBeNull();
    expect(mapInsightFilterToWheelFilter(undefined)).toBeNull();
  });
});

describe("resolveExploreAction", () => {
  const ctx: ResolveActionContext = {
    availableDocs: ["FSS", "NAP"] as PolicyDocumentType[],
    sectorCategoryIds: new Set(["globe_1", "globe_2"]),
    taxonomyType: "globe",
  };

  it("resolves set_filter via the wheel-filter map", () => {
    expect(
      resolveExploreAction({ type: "set_filter", filter: "contradictions" }, ctx),
    ).toEqual({ kind: "filter", filter: "tensions" });
  });

  it("ignores an unmappable set_filter", () => {
    expect(
      resolveExploreAction({ type: "set_filter", filter: "weird" }, ctx),
    ).toEqual({ kind: "none" });
  });

  it("treats a focus_category that is a document id as a doc focus", () => {
    expect(
      resolveExploreAction({ type: "focus_category", categoryId: "FSS" }, ctx),
    ).toEqual({ kind: "doc", id: "FSS" });
  });

  it("treats a focus_category that is a lens category as a sector focus", () => {
    expect(
      resolveExploreAction(
        { type: "focus_category", categoryId: "globe_2" },
        ctx,
      ),
    ).toEqual({ kind: "sector", id: "globe_2", taxonomyType: "globe" });
  });

  it("ignores a focus_category that matches neither", () => {
    expect(
      resolveExploreAction({ type: "focus_category", categoryId: "ghost" }, ctx),
    ).toEqual({ kind: "none" });
  });

  it("resolves select_pair", () => {
    expect(
      resolveExploreAction(
        { type: "select_pair", targetAId: "t1", targetBId: "t2" },
        ctx,
      ),
    ).toEqual({ kind: "pair", a: "t1", b: "t2" });
  });

  it("resolves select_target to a target intent", () => {
    expect(
      resolveExploreAction({ type: "select_target", targetId: "t1" }, ctx),
    ).toEqual({ kind: "target", id: "t1" });
  });

  it("resolves navigation-only actions to none", () => {
    expect(
      resolveExploreAction({ type: "set_mode", mode: "sector" }, ctx),
    ).toEqual({ kind: "none" });
    expect(
      resolveExploreAction({ type: "show_docs", ids: ["FSS"] }, ctx),
    ).toEqual({ kind: "none" });
  });
});
