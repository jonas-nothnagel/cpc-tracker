import { describe, expect, it } from "vitest";
import { scopeOf } from "../compute";
import { briefFixture } from "../test-fixture";
import { buildExploreLayers } from "./layers";
import { LAYER_DATA } from "./test-layers";
import { buildExploreModel, levelBetween, relationBetween } from "./model";
import { focusMembers, groupProfile, pairsBetween, parseFocusKey, rankMembers } from "./focus";

const SOURCE = briefFixture();
const DATA = LAYER_DATA;

describe("buildExploreLayers", () => {
  const layers = buildExploreLayers(DATA, SOURCE)!;

  it("keeps reported actions by kind and budget lines, in that order", () => {
    expect(layers.items.map((i) => [i.id, i.layer])).toEqual([
      ["BTR_1", "mitigation"],
      ["ADP_1", "adaptation"],
      ["BER_71401", "budget"],
    ]);
    expect(layers.items[0].status).toBe("Ongoing");
  });

  it("splits a budget line's code from its name and totals its spending", () => {
    const line = layers.items[2];
    expect(line.code).toBe("71401");
    expect(line.name).toBe("Waste management");
    expect(line.spend).toEqual({ total: 2, years: 2 });
    expect(layers.budget).toEqual({ currency: "MNT", unit: "billion", start: 2020, end: 2024 });
  });

  it("links targets in scope to actions and budget lines, and drops the rest", () => {
    // A1~BTR_1, B2~BTR_1, C3~ADP_1, A2~BER, A3~BER; Z9 is not a known target.
    expect(layers.links.map(([target, item]) => `${target}~${layers.items[item].id}`)).toEqual([
      "A1~BTR_1",
      "B2~BTR_1",
      "C3~ADP_1",
      "A2~BER_71401",
      "A3~BER_71401",
    ]);
  });

  it("gives an NBSAP target its least advanced NR7 status", () => {
    expect(layers.nr7).toEqual({ A1: "limited", A2: "unknown" });
  });

  it("is absent for a country without reported actions or budget lines", () => {
    expect(buildExploreLayers({ targets: [], alignment: [] }, SOURCE)).toBeNull();
  });
});

describe("the model with layers", () => {
  const layers = buildExploreLayers(DATA, SOURCE)!;
  const model = buildExploreModel(scopeOf(SOURCE, ["A", "B", "C"]), layers);
  const at = (id: string) => model.index.get(id)!;

  it("seats actions and budget lines after the targets", () => {
    expect(model.items).toHaveLength(21);
    expect(model.items[18].kind).toBe("action");
    expect(model.items[20].kind).toBe("budget");
    expect(model.items[20].doc).toBe("layer:budget");
  });

  it("counts only a strongly aligned action and a matching budget line", () => {
    expect(relationBetween(model, at("A1"), at("BTR_1"))).toBe("strong");
    expect(relationBetween(model, at("B2"), at("BTR_1"))).toBe("apart");
    // A moderate reading of an action is kept for the record, not counted.
    expect(levelBetween(model, at("C3"), at("ADP_1"))).toBe("medium");
    expect(relationBetween(model, at("C3"), at("ADP_1"))).toBe("none");
    expect(relationBetween(model, at("A2"), at("BER_71401"))).toBe("strong");
    // A budget line is matching or not; no potential misalignment is claimed.
    expect(relationBetween(model, at("A3"), at("BER_71401"))).toBe("none");
  });

  it("does not compare actions or budget lines with each other", () => {
    expect(relationBetween(model, at("BTR_1"), at("ADP_1"))).toBeNull();
    expect(relationBetween(model, at("BTR_1"), at("BER_71401"))).toBeNull();
  });

  it("keeps the targets' own readings", () => {
    expect(relationBetween(model, at("A6"), at("B1"))).toBe("apart");
    expect(relationBetween(model, at("A1"), at("B2"))).toBe("aligned");
  });
});

describe("groups across targets and layers", () => {
  const layers = buildExploreLayers(DATA, SOURCE)!;
  const model = buildExploreModel(scopeOf(SOURCE, ["A", "B", "C"]), layers);
  const at = (id: string) => model.index.get(id)!;

  it("reads targets against a layer by coverage: any strongly aligned action is enough", () => {
    const mitigation = groupProfile(model, focusMembers(model, parseFocusKey("doc:layer:mitigation"), []));
    expect(mitigation.tone[at("A1")]).toBe("reinforce");
    expect(mitigation.tone[at("B2")]).toBe("apart");
    expect(mitigation.tone[at("C1")]).toBe("unrelated");
  });

  it("reads a layer seat against a document by coverage too", () => {
    const doc = groupProfile(model, focusMembers(model, parseFocusKey("doc:A"), []));
    expect(doc.tone[at("BTR_1")]).toBe("reinforce");
    expect(doc.tone[at("BER_71401")]).toBe("reinforce");
  });

  it("keeps a document's own numbers to target pairs", () => {
    const doc = groupProfile(model, focusMembers(model, parseFocusKey("doc:A"), []));
    expect(doc.total).toBe(72);
    const ranked = rankMembers(model, doc);
    expect(ranked.strong.find((r) => model.items[r.id].id === "A1")?.count).toBe(6);
  });

  it("lists a layer's pairs with the group by the layer's own reading", () => {
    const doc = focusMembers(model, parseFocusKey("doc:A"), []);
    const budget = focusMembers(model, parseFocusKey("doc:layer:budget"), []);
    expect(pairsBetween(model, doc, budget, "strong")).toHaveLength(1);
    // A3's flagged budget reading is not a potential misalignment.
    expect(pairsBetween(model, doc, budget, "apart")).toHaveLength(0);
  });
});
