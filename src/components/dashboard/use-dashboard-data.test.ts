import { describe, it, expect } from "vitest";
import { normalize } from "./use-dashboard-data";
import {
  activitiesActionsCount,
  itemisedActivities,
} from "@/components/viz/target-text";
import type { DashboardResponse } from "@/lib/dashboard-data";

/**
 * `normalizeTarget` is a whitelist: a field the API ships but the normalizer
 * does not name never reaches the UI. These cases go through the normalizer
 * on purpose, because the July 2026 activities fix was tested only with a
 * hand-built target and shipped while the whitelist silently dropped the
 * field it depended on (Sri Lanka NBT 1 showed "Activities & Actions (1)"
 * for eleven actions).
 */
const raw = {
  targets: [
    {
      id: "NBSAP_1",
      text: "Restore degraded terrestrial, freshwater, marine and coastal ecosystems.",
      sourceDocument: "NBSAP",
      sourceLabel: "NBT 1",
      country: "Sri Lanka",
      activities:
        "IUCN Global Ecosystems typology is adopted\n" +
        "Identify and map degraded natural habitats",
      activitySources: [
        { text: "IUCN Global Ecosystems typology is adopted", section: "1.1" },
        { text: "Identify and map degraded natural habitats", section: "1.2" },
      ],
      sources: [
        {
          sourceText:
            "NBT 1. Restore degraded terrestrial, freshwater, marine and coastal ecosystems",
          section: "NBT 1",
        },
      ],
    },
  ],
} as unknown as DashboardResponse;

describe("normalize", () => {
  it("keeps activitySources so itemised activities survive the whitelist", () => {
    const [target] = normalize(raw).targets;
    expect(target.activitySources).toHaveLength(2);
    expect(itemisedActivities(target)).toHaveLength(2);
    expect(activitiesActionsCount(target)).toBe(2);
  });

  it("keeps sources so the verbatim quote and public source links get data", () => {
    const [target] = normalize(raw).targets;
    expect(target.sources?.[0]?.sourceText).toMatch(/^NBT 1\. Restore/);
  });
});
