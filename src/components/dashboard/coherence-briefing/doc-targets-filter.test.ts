import { describe, expect, it } from "vitest";
import {
  buildDocTargetHaystacks,
  countDocTargetFilters,
  filterDocTargets,
  type DocTargetFilterId,
} from "./doc-targets-filter";
import type { Target } from "@/types";

function makeTarget(
  id: string,
  overrides: Partial<Target> = {},
): Target {
  return {
    id,
    text: `Text for ${id}`,
    sourceDocument: "NAP",
    sourceLabel: id,
    country: "Sri Lanka",
    isQuantitative: false,
    isTimeBound: false,
    ...overrides,
  };
}

const TARGETS: Target[] = [
  makeTarget("1.1", { text: "Mainstream adaptation into water planning" }),
  makeTarget("1.2", {
    text: "Expand irrigation coverage by 30%",
    isQuantitative: true,
  }),
  makeTarget("1.3", {
    text: "Complete the coastal survey by 2030",
    isTimeBound: true,
  }),
  makeTarget("2.1", {
    text: "Restore 500 hectares of mangrove by 2035",
    isQuantitative: true,
    isTimeBound: true,
  }),
];

const FLAGGED = new Map<string, number>([
  ["1.1", 3],
  ["2.1", 1],
]);

const HAYSTACKS = buildDocTargetHaystacks(TARGETS);

function run(query: string, activeFilters: DocTargetFilterId[] = []) {
  return filterDocTargets({
    targets: TARGETS,
    query,
    activeFilters,
    flaggedCountByTargetId: FLAGGED,
    haystacks: HAYSTACKS,
  }).map((t) => t.id);
}

describe("countDocTargetFilters", () => {
  it("counts each dimension over the whole document", () => {
    expect(countDocTargetFilters(TARGETS, FLAGGED)).toEqual({
      quantitative: 2,
      timeBound: 2,
      inMisalignments: 2,
    });
  });

  it("counts targets rather than pairs for potential misalignments", () => {
    // 1.1 alone accounts for three pairs but is one target.
    expect(
      countDocTargetFilters([TARGETS[0]], FLAGGED).inMisalignments,
    ).toBe(1);
  });

  it("reports zeros rather than hiding them, leaving that to the caller", () => {
    expect(countDocTargetFilters([makeTarget("x")], new Map())).toEqual({
      quantitative: 0,
      timeBound: 0,
      inMisalignments: 0,
    });
  });

  it("returns zeros for an empty document", () => {
    expect(countDocTargetFilters([], FLAGGED)).toEqual({
      quantitative: 0,
      timeBound: 0,
      inMisalignments: 0,
    });
  });
});

describe("filterDocTargets", () => {
  it("is the identity with no query and no filters", () => {
    expect(
      filterDocTargets({
        targets: TARGETS,
        query: "",
        activeFilters: [],
        flaggedCountByTargetId: FLAGGED,
        haystacks: HAYSTACKS,
      }),
    ).toBe(TARGETS);
  });

  it("preserves document order", () => {
    expect(run("")).toEqual(["1.1", "1.2", "1.3", "2.1"]);
    expect(run("", ["quantitative"])).toEqual(["1.2", "2.1"]);
  });

  it("treats a whitespace-only query as no query", () => {
    expect(run("   ")).toEqual(["1.1", "1.2", "1.3", "2.1"]);
  });

  it("filters by text", () => {
    expect(run("mangrove")).toEqual(["2.1"]);
    expect(run("coastal")).toEqual(["1.3"]);
  });

  it("matches on substrings, so a partial year narrows to both matches", () => {
    expect(run("by 20")).toEqual(["1.3", "2.1"]);
  });

  it("filters by reference label", () => {
    expect(run("1.3")).toEqual(["1.3"]);
  });

  it("combines filters with AND", () => {
    expect(run("", ["quantitative", "timeBound"])).toEqual(["2.1"]);
    expect(run("", ["quantitative", "inMisalignments"])).toEqual(["2.1"]);
  });

  it("combines the query with the filters", () => {
    expect(run("hectares", ["quantitative"])).toEqual(["2.1"]);
    expect(run("irrigation", ["timeBound"])).toEqual([]);
  });

  it("keeps only targets that are in potential misalignments", () => {
    expect(run("", ["inMisalignments"])).toEqual(["1.1", "2.1"]);
  });

  it("falls back to computing a haystack when one is missing", () => {
    expect(
      filterDocTargets({
        targets: TARGETS,
        query: "mangrove",
        activeFilters: [],
        flaggedCountByTargetId: FLAGGED,
        haystacks: new Map(),
      }).map((t) => t.id),
    ).toEqual(["2.1"]);
  });

  it("returns nothing when the query matches nothing", () => {
    expect(run("permafrost")).toEqual([]);
  });
});
