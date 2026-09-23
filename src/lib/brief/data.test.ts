import { describe, expect, it } from "vitest";
import { buildBriefData, themeDots, OTHER_THEME } from "./data";
import { pairExample, scopeOf } from "./compute";
import { briefFixture } from "./test-fixture";

describe("buildBriefData", () => {
  const source = briefFixture();
  const data = buildBriefData(source, scopeOf(source, ["A", "B", "C"]), "globe");

  it("counts the selection and reads its verdict", () => {
    expect(data.counts).toEqual({ reinforce: 72, partial: 21, apart: 15, none: 0, total: 108 });
    expect(data.lead).toBe("aligned");
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

describe("buildBriefData with recurring themes", () => {
  const source = briefFixture({ themes: true });
  const data = buildBriefData(source, scopeOf(source, ["A", "B", "C"]), null);

  it("gives every theme its own example, anchors first", () => {
    expect(
      data.apart.rows.map((r) => [r.storyline.name, r.count, r.example?.a.id, r.example?.b.id]),
    ).toEqual([
      ["Water allocation pressure", 9, "B5", "C4"],
      ["Goal overlap", 6, "A6", "B1"],
    ]);
    expect([data.apart.example?.a.id, data.apart.example?.b.id]).toEqual(["B5", "C4"]);
  });

  it("keeps the example of the leading pair only when no theme has one", () => {
    const narrow = buildBriefData(source, scopeOf(source, ["A", "C"]), null);
    expect(narrow.apart.rows).toEqual([]);
    expect(narrow.apart.example).toBeNull();
  });
});

describe("themeDots", () => {
  const source = briefFixture({ themes: true });
  const data = buildBriefData(source, scopeOf(source, ["A", "B", "C"]), null);

  it("splits a tone's target pairs into its themes and the rest", () => {
    // 54 of the 72 aligned pairs sit in the restoration theme's documents.
    expect(themeDots(data, "reinforce")).toEqual([
      { key: "Shared land restoration", count: 54 },
      { key: OTHER_THEME, count: 18 },
    ]);
  });

  it("leaves out the rest when every pair belongs to a theme", () => {
    expect(themeDots(data, "apart")).toEqual([
      { key: "Water allocation pressure", count: 9 },
      { key: "Goal overlap", count: 6 },
    ]);
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
