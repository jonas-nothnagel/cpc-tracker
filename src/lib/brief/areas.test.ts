import { describe, expect, it } from "vitest";
import { scopeOf } from "./compute";
import { briefFixture } from "./test-fixture";
import type { BriefSource } from "./source";
import {
  areaHeadline,
  areaPairDetail,
  areaPairs,
  cloudSizes,
  lensAreas,
  OTHER_AREA,
  partnersByArea,
  restClouds,
  rowCounts,
  rowOrder,
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
});

describe("areaHeadline", () => {
  it("names the pair of areas holding the most of the side's target pairs, as a share of all of them", () => {
    const lens = lensAreas(SOURCE, ALL, "globe");
    expect(areaHeadline(areaPairs(lens, ALL, "apart"))).toEqual({
      kind: "outside",
      share: 0.6,
      a: "g2",
      b: OTHER_AREA,
    });
    const strong = areaHeadline(areaPairs(lens, ALL, "reinforce"));
    expect(strong).toMatchObject({ kind: "outside", a: "g5" });
    expect(strong.kind !== "none" && strong.share).toBeCloseTo(10 / 36);
  });

  it("says between two areas", () => {
    const primary: Record<string, string> = {};
    for (const i of [1, 2, 3, 4, 5, 6]) {
      primary[`B${i}`] = "g2";
      primary[`C${i}`] = "g5";
    }
    const source = withPrimary(primary);
    const scope = scopeOf(source, ["A", "B", "C"]);
    expect(areaHeadline(areaPairs(lensAreas(source, scope, "globe"), scope, "apart"))).toEqual({
      kind: "between",
      share: 0.6,
      a: "g2",
      b: "g5",
    });
  });

  it("says within one area", () => {
    const source = withPrimary(Object.fromEntries(SOURCE.commitments.map((c) => [c.id, "g2"])));
    const scope = scopeOf(source, ["A", "B", "C"]);
    expect(areaHeadline(areaPairs(lensAreas(source, scope, "globe"), scope, "apart"))).toEqual({
      kind: "within",
      share: 1,
      a: "g2",
      b: "g2",
    });
  });

  it("says nothing without any of the side's target pairs", () => {
    const scope = scopeOf(SOURCE, ["A", "C"]);
    expect(areaHeadline(areaPairs(lensAreas(SOURCE, scope, "globe"), scope, "apart"))).toEqual({ kind: "none" });
  });
});

describe("the picture's states", () => {
  const lens = lensAreas(SOURCE, ALL, "globe");
  const links = sideLinks(ALL);
  const rest = restClouds(lens, links, "apart");
  const pair = areaPairs(lens, ALL, "apart").top[1]; // Agriculture · Water

  it("gives each placed target its cloud at rest", () => {
    expect(Object.fromEntries(rest)).toEqual({ A1: 0, A2: 0, A3: 0, B4: 1, B5: 4, B6: 7, C1: 1, C2: 1, C3: 1 });
  });

  it("keeps an open pair of areas' target pairs in its two rows, none elsewhere", () => {
    const clouds = cloudSizes(lens, links, "apart", { kind: "pair", pair });
    expect(Object.fromEntries(clouds)).toEqual({ A1: 0, A2: 0, A3: 0, B4: 0, B5: 0, B6: 3, C1: 1, C2: 1, C3: 1 });
  });

  it("lets every cloud fall around a picked target", () => {
    const clouds = cloudSizes(lens, links, "apart", { kind: "target", id: "B6" });
    expect([...clouds.values()].every((v) => v === 0)).toBe(true);
  });

  it("lines up each row: the tallest clouds first; in an open pair, that pair's; other rows as at rest", () => {
    expect(rowOrder(lens, rest, rest, { kind: "rest" }, links, "apart")).toEqual([
      { id: "g1", targets: ["A1", "A2", "A3"] },
      { id: "g2", targets: ["B6", "B5", "B4"] },
      { id: "g5", targets: ["C1", "C2", "C3"] },
    ]);
    const focus = { kind: "pair" as const, pair };
    const open = rowOrder(lens, rest, cloudSizes(lens, links, "apart", focus), focus, links, "apart");
    expect(open.map((r) => r.targets)).toEqual([
      ["A1", "A2", "A3"],
      ["B6", "B5", "B4"],
      ["C1", "C2", "C3"],
    ]);
  });

  it("keeps a picked target where it stood in its row, as at rest or in the open pair", () => {
    // B5 stands second in its row; picking it must not move it under the pointer.
    const focus = { kind: "target" as const, id: "B5" };
    const clouds = cloudSizes(lens, links, "apart", focus);
    expect(rowOrder(lens, rest, clouds, focus, links, "apart")[1].targets).toEqual(["B6", "B5", "B4"]);
    const basis = { kind: "pair" as const, pair };
    expect(rowOrder(lens, rest, clouds, focus, links, "apart", basis)[1].targets).toEqual(["B6", "B5", "B4"]);
  });

  it("keeps a picked target in place and puts its partners first in their rows", () => {
    // x3 is y1's only partner and the smallest cloud of its row.
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
    const rows = rowOrder(small, handRest, cloudSizes(small, handLinks, "apart", focus), focus, handLinks, "apart");
    expect(rows).toEqual([
      { id: "X", targets: ["x3", "x1", "x2"] },
      { id: "Y", targets: ["y1"] },
    ]);
  });

  it("counts each row's targets taking part: in the open pair, or as the picked target's partners", () => {
    expect(Object.fromEntries(rowCounts(lens, { kind: "pair", pair }, links, "apart"))).toEqual({ g2: 1, g5: 3 });
    expect(Object.fromEntries(rowCounts(lens, { kind: "target", id: "B6" }, links, "apart"))).toEqual({ g5: 3 });
    expect(rowCounts(lens, { kind: "rest" }, links, "apart").size).toBe(0);
  });

  it("inks the targets: the open pair's rows in ink; a picked target and its partners set apart", () => {
    const open = targetInks(lens, { kind: "pair", pair }, links, "apart");
    expect([open.get("A1"), open.get("B4"), open.get("C1")]).toEqual(["pale", "base", "base"]);
    const around = targetInks(lens, { kind: "target", id: "B6" }, links, "apart");
    expect([around.get("B6"), around.get("C1"), around.get("B5"), around.get("A1")]).toEqual([
      "focus",
      "lit",
      "pale",
      "pale",
    ]);
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
