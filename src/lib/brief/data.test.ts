import { describe, expect, it } from "vitest";
import { buildBriefData } from "./data";
import { pairExample, scopeOf } from "./compute";
import { briefFixture } from "./test-fixture";

describe("buildBriefData", () => {
  const source = briefFixture();
  const data = buildBriefData(source, scopeOf(source, ["A", "B", "C"]), "globe");

  it("counts the selection and reads its verdict", () => {
    expect(data.counts).toEqual({ reinforce: 72, partial: 21, apart: 15, none: 0, total: 108 });
    expect(data.verdict).toBe("mixed");
  });

  it("names the pairs of documents that lead each way", () => {
    expect([data.leading.reinforce?.a.id, data.leading.reinforce?.b.id]).toEqual(["A", "C"]);
    expect([data.leading.apart?.a.id, data.leading.apart?.b.id]).toEqual(["B", "C"]);
  });

  it("finds where potential misalignment concentrates", () => {
    expect(data.concentration).toMatchObject({ total: 15, contested: 13, top: ["B6", "A6"] });
    expect(data.commitments.slice(0, 3).map((r) => [r.commitment.id, r.apart])).toEqual([
      ["B6", 7],
      ["A6", 6],
      ["B5", 4],
    ]);
  });

  it("falls back to an example from the leading pair when there are no themes", () => {
    expect(data.together.rows).toEqual([]);
    expect(data.together.example?.level).toBe("high");
    expect([data.together.example?.a.doc, data.together.example?.b.doc]).toEqual(["A", "C"]);
    expect(data.apart.example?.level).toBe("flagged");
    // B6 recurs in 6 of B~C's potential misalignments, C4-C6 in 2 each.
    expect([data.apart.example?.a.id, data.apart.example?.b.id]).toEqual(["B6", "C4"]);
  });

  it("rates the policy areas of the chosen lens, and none without a lens", () => {
    expect(data.areas?.rows.map((r) => r.name)).toEqual(["Agriculture", "Water", "Protected areas"]);
    expect(buildBriefData(source, scopeOf(source, ["A", "B"]), null).areas).toBeNull();
  });
});

describe("pairExample", () => {
  const source = briefFixture();
  const scope = scopeOf(source, ["A", "B", "C"]);

  it("picks a strong link, then the commitments that recur most, then the key", () => {
    const example = pairExample(scope, "A", "C", "reinforce");
    expect([example?.a.id, example?.b.id, example?.level]).toEqual(["A1", "C1", "high"]);
  });

  it("picks the potential misalignment through the busiest commitment", () => {
    const example = pairExample(scope, "B", "C", "apart");
    expect([example?.a.id, example?.b.id]).toEqual(["B6", "C4"]);
  });

  it("returns null when the two documents have no comparison of that tone", () => {
    expect(pairExample(scope, "A", "C", "apart")).toBeNull();
  });
});
