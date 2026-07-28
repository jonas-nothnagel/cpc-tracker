import { describe, it, expect } from "vitest";
import { itemisedActivities, activitiesActionsCount } from "./target-text";
import type { Target } from "@/types";

/**
 * Newlines in `activities` mean different things per data source, so the UI
 * only itemises where a curation step listed the activities separately. These
 * fixtures mirror the two real shapes in python/data/*-targets.json.
 */
const base = { id: "X_1", text: "t", sourceDocument: "X", country: "C" } as unknown as Target;

// Sri Lanka NBSAP_7: five actions, each recorded with its own source entry.
const itemisedTarget = {
  ...base,
  activities:
    "Develop, implement and monitor a national programme that reduces reliance on agrochemical usage\n" +
    "Develop and implement a national strategy that reduces the release of pollutants\n" +
    "Establish real time monitoring systems for assessing water, air and soil quality",
  activitySources: [{ section: "7.1" }, { section: "7.2" }, { section: "7.3" }],
} as Target;

// Mongolia NDC_4: one block of document text whose newlines are line wraps.
const documentTextTarget = {
  ...base,
  actions:
    "Measures:\n1. Including river headwater sources under special protection,\n" +
    "2. Increasing monitoring of groundwater wells, improving databases and reporting\nmechanisms,",
} as Target;

describe("itemisedActivities", () => {
  it("lists each activity when the data records them separately", () => {
    expect(itemisedActivities(itemisedTarget)).toHaveLength(3);
    expect(itemisedActivities(itemisedTarget)[0]).toMatch(/^Develop, implement/);
  });

  it("keeps unitemised document text whole so wrapped lines are not split", () => {
    expect(itemisedActivities(documentTextTarget)).toEqual([]);
    expect(itemisedActivities({ ...base, activities: "a\nb" } as Target)).toEqual([]);
  });

  it("ignores blank lines and Windows line endings", () => {
    const t = { ...itemisedTarget, activities: "one\r\n\r\ntwo\n  \nthree" } as Target;
    expect(itemisedActivities(t)).toEqual(["one", "two", "three"]);
  });
});

describe("activitiesActionsCount", () => {
  it("counts individual activities when they are itemised", () => {
    expect(activitiesActionsCount(itemisedTarget)).toBe(3);
  });

  it("counts sections, not wrapped lines, for document text", () => {
    // The source lists two measures across four lines; neither number is
    // knowable here, so the toggle reports the one section on show.
    expect(activitiesActionsCount(documentTextTarget)).toBe(1);
  });

  it("counts both sections when a target has activities and actions", () => {
    expect(activitiesActionsCount({ ...base, activities: "a", actions: "b" } as Target)).toBe(2);
  });

  it("is zero when the target has neither", () => {
    expect(activitiesActionsCount(base)).toBe(0);
  });
});
