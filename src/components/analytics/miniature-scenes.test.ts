import { describe, expect, it } from "vitest";

import { MINIATURE_REGIONS } from "@/lib/analytics/miniature-regions";
import { SECTION_REGISTRY } from "@/lib/analytics/sections";

import { SCENES } from "./miniature-scenes";

describe("miniature scenes", () => {
  it("has exactly one scene per registry section", () => {
    expect(Object.keys(SCENES).sort()).toEqual(
      SECTION_REGISTRY.map((s) => s.id).sort(),
    );
  });

  it("binds only regions that exist in that section's registry", () => {
    for (const [section, scene] of Object.entries(SCENES)) {
      const known = new Set(MINIATURE_REGIONS[section].map((r) => r.id));
      for (const item of scene.items) {
        if ("region" in item && item.region) {
          expect(
            known.has(item.region),
            `${section}: unknown region ${item.region}`,
          ).toBe(true);
        }
      }
    }
  });

  it("gives every non-'other' region at least one primitive", () => {
    for (const [section, regions] of Object.entries(MINIATURE_REGIONS)) {
      const bound = new Set(
        SCENES[section].items
          .map((i) => ("region" in i ? i.region : undefined))
          .filter(Boolean),
      );
      for (const region of regions) {
        if (region.id === "other") continue;
        expect(
          bound.has(region.id),
          `${section}: region ${region.id} has no primitive`,
        ).toBe(true);
      }
    }
  });

  it("keeps every primitive inside the viewBox", () => {
    for (const [section, scene] of Object.entries(SCENES)) {
      for (const item of scene.items) {
        if (item.kind === "wheel") {
          expect(item.cx - item.r, section).toBeGreaterThanOrEqual(0);
          expect(item.cx + item.r, section).toBeLessThanOrEqual(560);
          expect(item.cy + item.r, section).toBeLessThanOrEqual(300);
        } else if ("x" in item) {
          expect(item.x, section).toBeGreaterThanOrEqual(0);
          const w = "w" in item ? item.w : "size" in item ? item.size : 0;
          expect(item.x + w, section).toBeLessThanOrEqual(560);
        }
      }
    }
  });
});
