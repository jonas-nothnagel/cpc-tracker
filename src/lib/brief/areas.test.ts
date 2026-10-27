import { describe, expect, it } from "vitest";
import { scopeOf } from "./compute";
import { briefFixture } from "./test-fixture";
import type { BriefSource } from "./source";
import {
  areaFocus,
  areaInks,
  areaPairDetail,
  areaPairs,
  lensAreas,
  OTHER_AREA,
  partnersByArea,
  rowCounts,
  rowOrder,
  sideCounts,
  sideLinks,
  splitAcronym,
  targetInks,
  type LensAreas,
  type SideLinks,
} from "./areas";

const SOURCE = briefFixture();
const ALL = scopeOf(SOURCE, ["A", "B", "C"]);

/** The fixture with its one lens placing other targets. */
function withPrimary(primary: Record<string, string>, categories = SOURCE.lenses[0].categories): BriefSource {
  return { ...SOURCE, lenses: [{ ...SOURCE.lenses[0], categories, primary }] };
}

describe("splitAcronym", () => {
  it("moves a trailing acronym in brackets out of the name", () => {
    expect(splitAcronym("Land use, land-use change and forestry (LULUCF)")).toEqual({
      name: "Land use, land-use change and forestry",
      acronym: "LULUCF",
    });
  });

  it("keeps a name without one as written, commas and all", () => {
    expect(splitAcronym("Free, meaningful and active public participation")).toEqual({
      name: "Free, meaningful and active public participation",
      acronym: null,
    });
    expect(splitAcronym("Targets (2030)")).toEqual({ name: "Targets (2030)", acronym: null });
  });
});

describe("lensAreas", () => {
  it("lists the areas holding targets, most first, ties in the taxonomy's order", () => {
    const lens = lensAreas(SOURCE, ALL, "globe");
    expect(lens.areas.map((a) => [a.id, a.targets])).toEqual([
      ["g1", ["A1", "A2", "A3"]],
      ["g2", ["B4", "B5", "B6"]],
      ["g5", ["C1", "C2", "C3"]],
    ]);
    expect([lens.placed, lens.total]).toEqual([9, 18]);
  });

  it("sorts the areas by their number of targets", () => {
    const source = withPrimary({ A1: "g5", A2: "g5", B4: "g5", B5: "g5", A3: "g1", B6: "g2", C1: "g2" });
    const lens = lensAreas(source, scopeOf(source, ["A", "B", "C"]), "globe");
    expect(lens.areas.map((a) => [a.id, a.targets.length])).toEqual([
      ["g5", 4],
      ["g2", 2],
      ["g1", 1],
    ]);
  });

  it("keeps to the documents in the brief", () => {
    const lens = lensAreas(SOURCE, scopeOf(SOURCE, ["B", "C"]), "globe");
    expect(lens.areas.map((a) => a.id)).toEqual(["g2", "g5"]);
    expect([lens.placed, lens.total]).toEqual([6, 12]);
  });

  it("has no areas for a lens the country lacks", () => {
    expect(lensAreas(SOURCE, ALL, "ipcc")).toEqual({ areas: [], placed: 0, total: 18 });
  });
});

describe("sideLinks", () => {
  it("gives each target its partners on each side", () => {
    const links = sideLinks(ALL);
    expect(links.apart.get("B6")).toEqual(["A6", "C1", "C2", "C3", "C4", "C5", "C6"]);
    expect(links.reinforce.get("A1")).toEqual(["B1", "B3", "B5", "C1", "C3", "C5"]);
    expect(links.apart.get("A1")).toBeUndefined();
  });
});

describe("areaPairs", () => {
  const lens = lensAreas(SOURCE, ALL, "globe");

  it("counts the side's target pairs by pair of areas, the targets outside the lens together", () => {
    const pairs = areaPairs(lens, ALL, "apart");
    expect(pairs.total).toBe(15);
    expect(pairs.top.map((p) => [p.key, p.count, p.pairs])).toEqual([
      [`g2|${OTHER_AREA}`, 9, 18],
      ["g2|g5", 3, 9],
    ]);
    expect(pairs.rest).toEqual({ groups: 4, pairs: 54, count: 0 });
  });

  it("counts the side's target pairs that fall between two targets outside the lens", () => {
    // 15 potential misalignments: 12 touch a placed target, 3 (A6 with B1-B3) touch none.
    expect(areaPairs(lens, ALL, "apart").outside).toBe(3);
    // 36 strong alignments: 29 in the list, 7 between targets outside the lens.
    expect(areaPairs(lens, ALL, "reinforce").outside).toBe(7);
  });

  it("knows each target's part in a pair of areas", () => {
    const pair = areaPairs(lens, ALL, "apart").top[1];
    expect(Object.fromEntries(pair.involvement)).toEqual({ B6: 3, C1: 1, C2: 1, C3: 1 });
  });

  it("reads strong alignments the same way", () => {
    const pairs = areaPairs(lens, ALL, "reinforce");
    expect(pairs.total).toBe(36);
    expect(pairs.top.map((p) => [p.key, p.count, p.pairs])).toEqual([
      [`g5|${OTHER_AREA}`, 10, 18],
      [`g1|${OTHER_AREA}`, 9, 18],
      ["g1|g5", 6, 9],
      ["g1|g2", 3, 9],
      [`g2|${OTHER_AREA}`, 1, 18],
    ]);
    expect(pairs.rest).toEqual({ groups: 1, pairs: 9, count: 0 });
  });

  it("names at most six pairs of areas, ties by their target pairs, then by name", () => {
    const categories = [
      { id: "a1", name: "A6 area" },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `b${i}`, name: `B${i} area` })),
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `c${i}`, name: `C${i} area` })),
    ];
    const primary: Record<string, string> = { A6: "a1" };
    for (const i of [1, 2, 3, 4, 5, 6]) {
      primary[`B${i}`] = `b${i}`;
      primary[`C${i}`] = `c${i}`;
    }
    const source = withPrimary(primary, categories);
    const scope = scopeOf(source, ["A", "B", "C"]);
    const pairs = areaPairs(lensAreas(source, scope, "globe"), scope, "apart");
    expect(pairs.top.map((p) => p.key)).toEqual(["a1|b1", "a1|b2", "a1|b3", "a1|b4", "a1|b5", "a1|b6"]);
    expect(pairs.rest).toEqual({ groups: 54, pairs: 102, count: 9 });
  });

  it("lists, for a picked area, its pairs of areas that hold any of the side's target pairs, the rest summed", () => {
    const pairs = areaPairs(lens, ALL, "apart", "g5");
    expect(pairs.top.map((p) => [p.key, p.count, p.pairs])).toEqual([["g2|g5", 3, 9]]);
    // Water's other pairs: with Protected areas (9) and with targets outside the lens (18).
    expect(pairs.rest).toEqual({ groups: 2, pairs: 27, count: 0 });
    expect(pairs.total).toBe(15);
  });

  it("names every pair of areas a picked area holds, past six", () => {
    // B6's potential misalignments: A6 (area a1) and C1-C6 (areas c1-c6), one each.
    const categories = [
      { id: "a1", name: "A6 area" },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `b${i}`, name: `B${i} area` })),
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `c${i}`, name: `C${i} area` })),
    ];
    const primary: Record<string, string> = { A6: "a1" };
    for (const i of [1, 2, 3, 4, 5, 6]) {
      primary[`B${i}`] = `b${i}`;
      primary[`C${i}`] = `c${i}`;
    }
    const source = withPrimary(primary, categories);
    const scope = scopeOf(source, ["A", "B", "C"]);
    const pairs = areaPairs(lensAreas(source, scope, "globe"), scope, "apart", "b6");
    expect(pairs.top.map((p) => p.key)).toEqual(["a1|b6", "b6|c1", "b6|c2", "b6|c3", "b6|c4", "b6|c5", "b6|c6"]);
    expect(pairs.rest).toEqual({ groups: 1, pairs: 5, count: 0 });
  });
});

describe("the picture's states", () => {
  const lens = lensAreas(SOURCE, ALL, "globe");
  const links = sideLinks(ALL);
  const rest = sideCounts(lens, links, "apart");
  const pair = areaPairs(lens, ALL, "apart").top[1]; // Agriculture · Water

  it("counts each placed target's target pairs on the side", () => {
    expect(Object.fromEntries(rest)).toEqual({ A1: 0, A2: 0, A3: 0, B4: 1, B5: 4, B6: 7, C1: 1, C2: 1, C3: 1 });
  });

  it("keeps in ink, with a pair of areas open, only the targets taking part in its target pairs", () => {
    const open = targetInks(lens, { kind: "pair", pair }, links, "apart");
    expect(Object.fromEntries(open)).toEqual({
      A1: "pale",
      A2: "pale",
      A3: "pale",
      B4: "pale",
      B5: "pale",
      B6: "base",
      C1: "base",
      C2: "base",
      C3: "base",
    });
  });

  it("keeps, in the targets view, a picked area's targets in ink and the picked target ringed", () => {
    expect([...areaInks(lens, null, null).values()].every((ink) => ink === "base")).toBe(true);
    const water = areaInks(lens, "g5", null);
    expect([water.get("C1"), water.get("C3"), water.get("A1"), water.get("B6")]).toEqual(["base", "base", "pale", "pale"]);
    expect(areaInks(lens, "g5", "C2").get("C2")).toBe("focus");
    expect(areaInks(lens, null, "B6").get("A1")).toBe("base");
  });

  it("lines up each row: the most target pairs first; in an open pair, that pair's; other rows as at rest", () => {
    expect(rowOrder(lens, rest, { kind: "rest" }, links, "apart")).toEqual([
      { id: "g1", targets: ["A1", "A2", "A3"] },
      { id: "g2", targets: ["B6", "B5", "B4"] },
      { id: "g5", targets: ["C1", "C2", "C3"] },
    ]);
    const focus = { kind: "pair" as const, pair };
    const open = rowOrder(lens, rest, focus, links, "apart");
    expect(open.map((r) => r.targets)).toEqual([
      ["A1", "A2", "A3"],
      ["B6", "B5", "B4"],
      ["C1", "C2", "C3"],
    ]);
  });

  it("keeps a picked target where it stood in its row, as at rest or in the open pair", () => {
    // B5 stands second in its row; picking it must not move it under the pointer.
    const focus = { kind: "target" as const, id: "B5" };
    expect(rowOrder(lens, rest, focus, links, "apart")[1].targets).toEqual(["B6", "B5", "B4"]);
    const basis = { kind: "pair" as const, pair };
    expect(rowOrder(lens, rest, focus, links, "apart", basis)[1].targets).toEqual(["B6", "B5", "B4"]);
  });

  it("keeps a picked target in place and puts its partners first in their rows", () => {
    // x3 is y1's only partner and the fewest target pairs of its row.
    const small: LensAreas = {
      areas: [
        { id: "X", name: "X", acronym: null, order: 0, targets: ["x1", "x2", "x3"] },
        { id: "Y", name: "Y", acronym: null, order: 1, targets: ["y1"] },
      ],
      placed: 4,
      total: 4,
    };
    const handLinks: SideLinks = {
      apart: new Map([
        ["y1", ["x3"]],
        ["x3", ["y1"]],
      ]),
      reinforce: new Map(),
    };
    const handRest = new Map([
      ["x1", 5],
      ["x2", 3],
      ["x3", 1],
      ["y1", 1],
    ]);
    const focus = { kind: "target" as const, id: "y1" };
    const rows = rowOrder(small, handRest, focus, handLinks, "apart");
    expect(rows).toEqual([
      { id: "X", targets: ["x3", "x1", "x2"] },
      { id: "Y", targets: ["y1"] },
    ]);
  });

  it("counts, beside each row, the picked target's target pairs there; none at rest or with a pair open", () => {
    expect(Object.fromEntries(rowCounts(lens, { kind: "target", id: "B6" }, links, "apart"))).toEqual({ g5: 3 });
    expect(rowCounts(lens, { kind: "pair", pair }, links, "apart").size).toBe(0);
    expect(rowCounts(lens, { kind: "rest" }, links, "apart").size).toBe(0);
  });

  it("inks the targets: the open pair's rows in ink; a picked target and its partners set apart", () => {
    const open = targetInks(lens, { kind: "pair", pair }, links, "apart");
    expect([open.get("A1"), open.get("B4"), open.get("B6"), open.get("C1")]).toEqual(["pale", "pale", "base", "base"]);
    const around = targetInks(lens, { kind: "target", id: "B6" }, links, "apart");
    expect([around.get("B6"), around.get("C1"), around.get("B5"), around.get("A1")]).toEqual([
      "focus",
      "lit",
      "pale",
      "pale",
    ]);
  });

  it("counts, around a picked area, each target's target pairs that involve it: all of its own targets', the others' with it", () => {
    // Agriculture's own B6 keeps all 7; Water's C1 keeps its one with B6.
    expect(Object.fromEntries(areaFocus(lens, links, "apart", "g2").involvement)).toEqual({
      A1: 0,
      A2: 0,
      A3: 0,
      B4: 1,
      B5: 4,
      B6: 7,
      C1: 1,
      C2: 1,
      C3: 1,
    });
    // Around Water, B6 keeps only its 3 with Water's targets.
    const water = areaFocus(lens, links, "apart", "g5");
    expect(water.area).toBe("g5");
    expect(Object.fromEntries(water.involvement)).toEqual({
      A1: 0,
      A2: 0,
      A3: 0,
      B4: 0,
      B5: 0,
      B6: 3,
      C1: 1,
      C2: 1,
      C3: 1,
    });
  });

  it("counts, beside each row, a picked area's target pairs there, as the list does, and all of them in its own row", () => {
    // Agriculture's 12: 3 with Water's targets, 9 with targets outside the lens.
    expect(Object.fromEntries(rowCounts(lens, areaFocus(lens, links, "apart", "g2"), links, "apart"))).toEqual({
      g2: 12,
      g5: 3,
    });
    // Protected areas holds no potential misalignment: its row still says so.
    expect(Object.fromEntries(rowCounts(lens, areaFocus(lens, links, "apart", "g1"), links, "apart"))).toEqual({
      g1: 0,
    });
  });

  it("counts a target pair within a picked area once in its own row", () => {
    // A6 against B1 and B2, all three in Protected areas; A6 against B3-B6, outside the lens.
    const source = withPrimary({ A6: "g1", B1: "g1", B2: "g1", C1: "g5" });
    const scope = scopeOf(source, ["A", "B", "C"]);
    const own = lensAreas(source, scope, "globe");
    const ownLinks = sideLinks(scope);
    expect(Object.fromEntries(rowCounts(own, areaFocus(own, ownLinks, "apart", "g1"), ownLinks, "apart"))).toEqual({
      g1: 6,
    });
    expect(areaPairs(own, scope, "apart", "g1").top.map((p) => [p.key, p.count])).toEqual([
      [`g1|${OTHER_AREA}`, 4],
      ["g1|g1", 2],
    ]);
  });

  it("inks a picked area's targets and those taking part with it; the rest set back", () => {
    const water = targetInks(lens, areaFocus(lens, links, "apart", "g5"), links, "apart");
    expect([water.get("C1"), water.get("B6"), water.get("B5"), water.get("A1")]).toEqual(["base", "base", "pale", "pale"]);
    const protectedAreas = targetInks(lens, areaFocus(lens, links, "apart", "g1"), links, "apart");
    expect([protectedAreas.get("A1"), protectedAreas.get("B6")]).toEqual(["base", "pale"]);
  });

  it("lines up every row around a picked area by those target pairs, and keeps a target picked there in place", () => {
    // Around Y, x3 (y1's only partner) leads its row; x1 stays second when picked.
    const small: LensAreas = {
      areas: [
        { id: "X", name: "X", acronym: null, order: 0, targets: ["x1", "x2", "x3"] },
        { id: "Y", name: "Y", acronym: null, order: 1, targets: ["y1"] },
      ],
      placed: 4,
      total: 4,
    };
    const handLinks: SideLinks = {
      apart: new Map([
        ["y1", ["x3"]],
        ["x3", ["y1"]],
      ]),
      reinforce: new Map(),
    };
    const handRest = new Map([
      ["x1", 5],
      ["x2", 3],
      ["x3", 1],
      ["y1", 1],
    ]);
    const around = areaFocus(small, handLinks, "apart", "Y");
    const rows = rowOrder(small, handRest, around, handLinks, "apart");
    expect(rows).toEqual([
      { id: "X", targets: ["x3", "x1", "x2"] },
      { id: "Y", targets: ["y1"] },
    ]);
    const focus = { kind: "target" as const, id: "x1" };
    expect(rowOrder(small, handRest, focus, handLinks, "apart", around)[0].targets).toEqual(["x3", "x1", "x2"]);
  });

  it("says where a picked target's partners sit", () => {
    expect(partnersByArea(lens, links, "apart", "B6")).toEqual({
      areas: [{ id: "g5", count: 3 }],
      outside: 4,
      total: 7,
    });
  });

  it("lists a pair of areas' target pairs through its most involved targets first", () => {
    const between = areaPairDetail(lens, ALL, "apart", "g2|g5");
    expect(between.pairs).toBe(9);
    expect(between.rows.map((c) => `${c.a.id}-${c.b.id}`)).toEqual(["B6-C1", "B6-C2", "B6-C3"]);
    const outside = areaPairDetail(lens, ALL, "apart", `g2|${OTHER_AREA}`);
    expect(outside.pairs).toBe(18);
    expect(outside.rows.map((c) => `${c.a.id}-${c.b.id}`)).toEqual([
      "A6-B5",
      "A6-B6",
      "B5-C4",
      "B5-C5",
      "B5-C6",
      "B6-C4",
      "B6-C5",
      "B6-C6",
      "A6-B4",
    ]);
  });
});
