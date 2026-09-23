import { describe, expect, it } from "vitest";
import { buildNr7Report } from "./nr7-self-report";
import { groupRowsByGbfTarget, GBF_TARGET_COUNT } from "./gbf-groups";
import { gbfNumber } from "./gbf-chip";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "./test-fixture";

const model = buildNr7Report(FIXTURE_NR7, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;

describe("groupRowsByGbfTarget", () => {
  it("groups by the first GBF target filed, in GBF order, each national target once", () => {
    const { groups, hasGbf, uncovered } = groupRowsByGbfTarget(model.targets);
    expect(hasGbf).toBe(true);
    expect(groups.map((g) => [g.id, g.rows.map((r) => r.targetId)])).toEqual([
      ["T03", ["NT02"]],
      ["T06", ["NT03"]],
      ["T07", ["NT04"]], // also filed under T11: listed once, T11 becomes a chip
      ["T14", ["NT01"]],
    ]);
    expect(groups[0].title).toBe("30% of areas are effectively conserved");
    expect(groups.flatMap((g) => g.rows)).toHaveLength(model.targets.length);
    // Four national targets cover five GBF targets; the other eighteen are named.
    expect(uncovered).toHaveLength(GBF_TARGET_COUNT - 5);
    expect(uncovered.slice(0, 3)).toEqual(["T01", "T02", "T04"]);
    expect(uncovered).not.toContain("T11");
  });

  it("puts targets without a GBF reference last, and reports a file without the field as flat", () => {
    const rows = model.targets.map((r, i) => (i === 0 ? { ...r, gbfTargets: [] } : r));
    const { groups } = groupRowsByGbfTarget(rows);
    expect(groups.at(-1)).toMatchObject({ id: null, title: null });
    expect(groups.at(-1)!.rows.map((r) => r.targetId)).toEqual(["NT01"]);
    const legacy = groupRowsByGbfTarget(model.targets.map((r) => ({ ...r, gbfTargets: [] })));
    expect(legacy).toMatchObject({ hasGbf: false, uncovered: expect.arrayContaining(["T01", "T23"]) });
    expect(legacy.groups).toHaveLength(1);
  });

  it("reads the GBF number off the id", () => {
    expect(gbfNumber("T03")).toBe("3");
    expect(gbfNumber("T23")).toBe("23");
    expect(gbfNumber("odd")).toBe("odd");
  });
});
