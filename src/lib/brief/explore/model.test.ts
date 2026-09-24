import { describe, expect, it } from "vitest";
import { scopeOf } from "../compute";
import { briefFixture } from "../test-fixture";
import {
  buildExploreModel,
  focusProfile,
  groupByDocument,
  groupByLens,
  levelBetween,
  relationOf,
  seatOrder,
  toneCountsOf,
  OTHER_GROUP,
  arcTally,
} from "./model";

const SOURCE = briefFixture();
const SCOPE = scopeOf(SOURCE, ["A", "B", "C"]);
const MODEL = buildExploreModel(SCOPE);
const at = (id: string) => MODEL.index.get(id)!;
const ids = (list: number[]) => list.map((i) => MODEL.items[i].id);

describe("buildExploreModel", () => {
  it("holds every target in scope, in document order", () => {
    expect(MODEL.items).toHaveLength(18);
    expect(MODEL.items[0].id).toBe("A1");
    expect(MODEL.items[17].id).toBe("C6");
  });

  it("reads a comparison either way round", () => {
    expect(levelBetween(MODEL, at("A6"), at("B1"))).toBe("flagged");
    expect(levelBetween(MODEL, at("B1"), at("A6"))).toBe("flagged");
    expect(levelBetween(MODEL, at("A1"), at("B1"))).toBe("high");
    expect(levelBetween(MODEL, at("A1"), at("B2"))).toBe("medium");
  });

  it("has no reading for two targets of the same document", () => {
    expect(levelBetween(MODEL, at("A1"), at("A2"))).toBeNull();
  });

  it("leaves out documents outside the scope", () => {
    const model = buildExploreModel(scopeOf(SOURCE, ["A", "B"]));
    expect(model.items).toHaveLength(12);
    expect(model.index.has("C1")).toBe(false);
  });
});

describe("relationOf", () => {
  it("maps the stored levels to how a seat reads", () => {
    expect(relationOf("high")).toBe("strong");
    expect(relationOf("medium")).toBe("aligned");
    expect(relationOf("low")).toBe("partial");
    expect(relationOf("none")).toBe("none");
    expect(relationOf("flagged")).toBe("apart");
  });
});

describe("focusProfile", () => {
  it("counts a target's comparisons by how they read", () => {
    // A6: potential misalignment with all of B, partially aligned with all of C.
    const p = focusProfile(MODEL, at("A6"));
    expect(p.total).toBe(12);
    expect(p.counts.apart).toBe(6);
    expect(p.counts.partial).toBe(6);
    expect(p.counts.strong + p.counts.aligned).toBe(0);
    expect(p.byGroup.get("B")?.apart).toBe(6);
    expect(p.byGroup.get("C")?.partial).toBe(6);
  });

  it("lists the partners of each reading in document order", () => {
    const p = focusProfile(MODEL, at("B6"));
    expect(ids(p.partners.apart)).toEqual(["A6", "C1", "C2", "C3", "C4", "C5", "C6"]);
  });

  it("separates strong from moderate alignment", () => {
    const p = focusProfile(MODEL, at("A1"));
    expect(p.counts.strong).toBe(6);
    expect(p.counts.aligned).toBe(6);
  });

  it("gives the brief's tone counts for its result bar", () => {
    const tones = toneCountsOf(focusProfile(MODEL, at("A1")));
    expect(tones).toEqual({ reinforce: 12, partial: 0, apart: 0, none: 0, total: 12 });
  });
});

describe("grouping", () => {
  it("groups seats by document in document order", () => {
    const groups = groupByDocument(MODEL, SCOPE.docs);
    expect(groups.map((g) => [g.key, g.ids.length])).toEqual([
      ["A", 6],
      ["B", 6],
      ["C", 6],
    ]);
  });

  it("groups seats by policy area, in the lens's order, the rest last", () => {
    const groups = groupByLens(MODEL, SOURCE.lenses[0]);
    expect(groups.map((g) => [g.key, g.ids.length])).toEqual([
      ["g1", 3],
      ["g2", 3],
      ["g5", 3],
      [OTHER_GROUP, 9],
    ]);
  });
});

describe("seatOrder", () => {
  it("keeps document order without a focus", () => {
    const group = groupByDocument(MODEL, SCOPE.docs)[0];
    expect(ids(seatOrder(MODEL, group.ids, null))).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
  });

  it("sorts an arc from potential misalignment to strong alignment", () => {
    // Against B5: A6 potential misalignment, A5 partially aligned, A1-A4 strongly aligned.
    const group = groupByDocument(MODEL, SCOPE.docs)[0];
    expect(ids(seatOrder(MODEL, group.ids, at("B5")))).toEqual(["A6", "A5", "A1", "A2", "A3", "A4"]);
  });

  it("keeps the focus's own document in its order (not compared)", () => {
    const group = groupByDocument(MODEL, SCOPE.docs)[1];
    expect(ids(seatOrder(MODEL, group.ids, at("B5")))).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
  });
});

describe("arcTally", () => {
  it("counts how an arc's seats read against the centre", () => {
    const group = groupByDocument(MODEL, SCOPE.docs)[0];
    const tally = arcTally(MODEL, group.ids, at("B5"));
    expect(tally.apart).toBe(1);
    expect(tally.partial).toBe(1);
    expect(tally.strong).toBe(4);
    expect(tally.unrelated).toBe(0);
  });

  it("counts the rest of the centre's own document as not compared", () => {
    const group = groupByDocument(MODEL, SCOPE.docs)[1];
    expect(arcTally(MODEL, group.ids, at("B5")).unrelated).toBe(5);
  });
});
