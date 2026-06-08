import { describe, it, expect } from "vitest";
import { frictionDimensionLabel } from "./theme-drawer";

describe("frictionDimensionLabel", () => {
  it("labels resource competition with the contested resources", () => {
    expect(
      frictionDimensionLabel("resource_competition", ["land", "water"], undefined),
    ).toBe("Competes for: land, water");
  });

  it("labels delivery friction with the shared place", () => {
    expect(
      frictionDimensionLabel("delivery_friction", undefined, "Panama Canal watershed"),
    ).toBe("Shared area: Panama Canal watershed");
  });

  it("returns null when the relevant field is empty", () => {
    expect(frictionDimensionLabel("resource_competition", [], undefined)).toBeNull();
    expect(frictionDimensionLabel("delivery_friction", undefined, "")).toBeNull();
  });

  it("does not cross-wire fields across mechanisms", () => {
    // delivery shows only the place; resource shows only the resources; goal
    // conflict shows nothing — matches what each section's UI displays.
    expect(frictionDimensionLabel("delivery_friction", ["land"], undefined)).toBeNull();
    expect(
      frictionDimensionLabel("resource_competition", undefined, "watershed"),
    ).toBeNull();
    expect(frictionDimensionLabel("goal_conflict", ["land"], "watershed")).toBeNull();
  });
});
