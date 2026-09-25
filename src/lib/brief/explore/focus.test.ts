import { describe, expect, it } from "vitest";
import { scopeOf } from "../compute";
import { briefFixture } from "../test-fixture";
import { buildExploreModel } from "./model";
import {
  focusKey,
  focusMembers,
  groupProfile,
  groupSeatOrder,
  pairsBetween,
  parseFocusKey,
  rankMembers,
} from "./focus";

const SOURCE = briefFixture();
const MODEL = buildExploreModel(scopeOf(SOURCE, ["A", "B", "C"]));
const at = (id: string) => MODEL.index.get(id)!;
const ids = (list: number[]) => list.map((i) => MODEL.items[i].id);

describe("focus keys", () => {
  it("names a target, a document or a policy area in one string", () => {
    expect(focusKey({ kind: "target", id: "A1" })).toBe("A1");
    expect(focusKey({ kind: "doc", id: "A" })).toBe("doc:A");
    expect(focusKey({ kind: "area", lens: "globe", id: "g2" })).toBe("area:globe:g2");
    expect(parseFocusKey("doc:A")).toEqual({ kind: "doc", id: "A" });
    expect(parseFocusKey("area:globe:g2")).toEqual({ kind: "area", lens: "globe", id: "g2" });
    expect(parseFocusKey("A1")).toEqual({ kind: "target", id: "A1" });
  });

  it("finds the targets of each", () => {
    expect(ids(focusMembers(MODEL, parseFocusKey("A1"), SOURCE.lenses))).toEqual(["A1"]);
    expect(ids(focusMembers(MODEL, parseFocusKey("doc:C"), SOURCE.lenses))).toEqual(["C1", "C2", "C3", "C4", "C5", "C6"]);
    expect(ids(focusMembers(MODEL, parseFocusKey("area:globe:g2"), SOURCE.lenses))).toEqual(["B4", "B5", "B6"]);
    expect(focusMembers(MODEL, parseFocusKey("area:globe:nope"), SOURCE.lenses)).toEqual([]);
  });
});

describe("groupProfile", () => {
  const doc = groupProfile(MODEL, focusMembers(MODEL, parseFocusKey("doc:A"), SOURCE.lenses));

  it("counts every target pair between the group and the rest", () => {
    // A~B: 12 strong, 12 moderate, 6 partial, 6 potential misalignment;
    // A~C: 15 strong, 15 moderate, 6 partial.
    expect(doc.total).toBe(72);
    expect(doc.totals).toMatchObject({ strong: 27, aligned: 27, partial: 12, apart: 6 });
  });

  it("reads each other target by its strongest signal with the group", () => {
    // Every B target has a potential misalignment with A6.
    expect(doc.relation[at("B1")]).toBe("apart");
    // C1 is strongly aligned with A1-A5; C2 only moderately.
    expect(doc.relation[at("C1")]).toBe("strong");
    expect(doc.relation[at("C2")]).toBe("aligned");
    expect(doc.pairs[at("C1")].strong).toBe(5);
    // The group's own targets are not read against it.
    expect(doc.relation[at("A3")]).toBe("unrelated");
  });

  it("is the target's own reading for a group of one", () => {
    const one = groupProfile(MODEL, [at("B5")]);
    expect(one.relation[at("A6")]).toBe("apart");
    expect(one.relation[at("A5")]).toBe("partial");
    expect(one.relation[at("A1")]).toBe("strong");
    expect(one.relation[at("B1")]).toBe("unrelated");
  });
});

describe("group tone", () => {
  it("reads each other target by the reading most of its pairs with the group have", () => {
    const doc = groupProfile(MODEL, focusMembers(MODEL, parseFocusKey("doc:A"), SOURCE.lenses));
    // B1: four strong alignments, one partial, one potential misalignment (with A6):
    // mostly aligned, though it keeps a potential misalignment.
    expect(doc.tone[at("B1")]).toBe("reinforce");
    expect(doc.relation[at("B1")]).toBe("apart");
    expect(doc.tone[at("A2")]).toBe("unrelated");
  });

  it("is the target's own reading for a group of one", () => {
    const one = groupProfile(MODEL, [at("B5")]);
    expect(one.tone[at("A6")]).toBe("apart");
    expect(one.tone[at("A5")]).toBe("partial");
    expect(one.tone[at("A1")]).toBe("reinforce");
    expect(one.tone[at("B1")]).toBe("unrelated");
  });

  it("leads with potential misalignment where it is the most common reading", () => {
    const area = groupProfile(MODEL, focusMembers(MODEL, parseFocusKey("area:globe:g2"), SOURCE.lenses));
    // C4 against B4-B6: partial, potential misalignment, potential misalignment.
    expect(area.tone[at("C4")]).toBe("apart");
    // C1: partial, partial, potential misalignment.
    expect(area.tone[at("C1")]).toBe("partial");
  });
});

describe("groupSeatOrder", () => {
  it("sorts an arc by most common reading, those with any potential misalignment towards the red end", () => {
    const doc = groupProfile(MODEL, focusMembers(MODEL, parseFocusKey("doc:A"), SOURCE.lenses));
    // Every B target is mostly aligned with A and has one potential misalignment;
    // the moderately aligned ones sit before the strongly aligned ones.
    const b = focusMembers(MODEL, parseFocusKey("doc:B"), SOURCE.lenses);
    expect(ids(groupSeatOrder(b, doc))).toEqual(["B2", "B4", "B6", "B1", "B3", "B5"]);
  });

  it("sorts an arc from potential misalignment to strong alignment, busiest first within a reading", () => {
    const profile = groupProfile(MODEL, focusMembers(MODEL, parseFocusKey("area:globe:g2"), SOURCE.lenses));
    // Against B4-B6: C4-C6 are in potential misalignment with both B5 and B6,
    // C1-C3 only with B6.
    const order = groupSeatOrder([at("C1"), at("C2"), at("C3"), at("C4"), at("C5"), at("C6")], profile);
    expect(ids(order).slice(0, 3)).toEqual(["C4", "C5", "C6"]);
  });
});

describe("rankMembers", () => {
  it("ranks the group's targets by potential misalignment and by strong alignment with the rest", () => {
    const profile = groupProfile(MODEL, focusMembers(MODEL, parseFocusKey("doc:A"), SOURCE.lenses));
    const ranked = rankMembers(MODEL, profile);
    expect(ids(ranked.apart.map((r) => r.id))).toEqual(["A6"]);
    expect(ranked.apart[0].count).toBe(6);
    expect(ids(ranked.strong.map((r) => r.id))).toEqual(["A1", "A2", "A3", "A4", "A5"]);
    expect(ranked.strong.map((r) => r.count)).toEqual([6, 6, 6, 6, 3]);
  });
});

describe("pairsBetween", () => {
  it("lists the pairs of one reading between the group and an arc, most recurring targets first", () => {
    const members = focusMembers(MODEL, parseFocusKey("area:globe:g2"), SOURCE.lenses);
    const c = focusMembers(MODEL, parseFocusKey("doc:C"), SOURCE.lenses);
    const pairs = pairsBetween(MODEL, members, c, "apart");
    // B6 is in potential misalignment with all of C, B5 with C4-C6.
    expect(pairs).toHaveLength(9);
    expect(pairs.slice(0, 6).map(([a]) => MODEL.items[a].id)).toEqual(["B6", "B6", "B6", "B6", "B6", "B6"]);
    // Within B6's pairs, C4-C6 recur most (they also meet B5).
    expect(ids(pairs.slice(0, 3).map(([, b]) => b))).toEqual(["C4", "C5", "C6"]);
  });
});
