import { describe, expect, it } from "vitest";
import { buildFindingHeadline } from "./headline";

describe("buildFindingHeadline", () => {
  it("names the contested resources when present", () => {
    const h = buildFindingHeadline({
      level: "flagged",
      mechanism: "resource_competition",
      contestedResources: ["land"],
      sameDoc: false,
    });
    expect(h.key).toBe("headline.flaggedResourceNamed");
    expect(h.values.resources).toBe("land");
    expect(h.docsKey).toBe("headline.docsPair");
  });

  it("joins multiple contested resources", () => {
    const h = buildFindingHeadline({
      level: "flagged",
      mechanism: "resource_competition",
      contestedResources: ["land", "water"],
      sameDoc: false,
    });
    expect(h.values.resources).toBe("land, water");
  });

  it("falls back when resource competition names no resources", () => {
    const h = buildFindingHeadline({
      level: "flagged",
      mechanism: "resource_competition",
      contestedResources: [],
      sameDoc: false,
    });
    expect(h.key).toBe("headline.flaggedResource");
    expect(h.values.resources).toBeUndefined();
  });

  it("selects the goal-conflict phrasing", () => {
    const h = buildFindingHeadline({
      level: "flagged",
      mechanism: "goal_conflict",
      sameDoc: false,
    });
    expect(h.key).toBe("headline.flaggedGoal");
  });

  it("includes shared context for delivery friction when present", () => {
    const h = buildFindingHeadline({
      level: "flagged",
      mechanism: "delivery_friction",
      sharedContext: "pastoral landscapes",
      sameDoc: false,
    });
    expect(h.key).toBe("headline.flaggedDeliveryContext");
    expect(h.values.context).toBe("pastoral landscapes");
  });

  it("selects plain delivery phrasing without shared context", () => {
    const h = buildFindingHeadline({
      level: "flagged",
      mechanism: "delivery_friction",
      sameDoc: false,
    });
    expect(h.key).toBe("headline.flaggedDelivery");
  });

  it("falls back to the generic flagged phrasing without a mechanism", () => {
    const h = buildFindingHeadline({ level: "flagged", sameDoc: false });
    expect(h.key).toBe("headline.flaggedGeneric");
  });

  it("covers every aligned level", () => {
    expect(buildFindingHeadline({ level: "high", sameDoc: false }).key).toBe(
      "headline.alignedHigh",
    );
    expect(buildFindingHeadline({ level: "medium", sameDoc: false }).key).toBe(
      "headline.alignedMedium",
    );
    expect(buildFindingHeadline({ level: "low", sameDoc: false }).key).toBe(
      "headline.alignedLow",
    );
    expect(buildFindingHeadline({ level: "none", sameDoc: false }).key).toBe(
      "headline.alignedNone",
    );
  });

  it("uses the same-document phrasing key when both targets share a document", () => {
    const h = buildFindingHeadline({
      level: "flagged",
      mechanism: "goal_conflict",
      sameDoc: true,
    });
    expect(h.docsKey).toBe("headline.docsSame");
  });
});
