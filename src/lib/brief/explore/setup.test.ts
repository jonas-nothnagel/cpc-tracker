import { describe, expect, it } from "vitest";
import { briefFixture } from "../test-fixture";
import { exploreFromLink, exploreSetup } from "./setup";
import { LAYER_DATA } from "./test-layers";

const SOURCE = briefFixture();
const DOCS = ["A", "B", "C"];
const SETUP = exploreSetup({ data: LAYER_DATA, source: SOURCE });

describe("exploreSetup", () => {
  it("gives the explorer its layers and groupings, the same for every reader", () => {
    expect(SETUP.groups).toEqual(["docs", "globe"]);
    expect(SETUP.layers?.items).toHaveLength(3);
  });

  it("offers every lens the source holds, human rights too", () => {
    const hr = { id: "hr" as const, taxonomyType: "hr", categories: [{ id: "hr1", name: "Right to water" }], primary: { B5: "hr1" } };
    const source = { ...SOURCE, lenses: [...SOURCE.lenses, hr] };
    const setup = exploreSetup({ data: LAYER_DATA, source });
    expect(setup.groups).toEqual(["docs", "globe", "hr"]);
    const { state } = exploreFromLink({ params: { group: "hr", focus: "area:hr:hr1" }, source, docs: DOCS, setup });
    expect(state.group).toBe("hr");
    expect(state.focus).toBe("area:hr:hr1");
  });
});

describe("exploreFromLink", () => {
  it("reads the explorer's part of a brief link", () => {
    const { state, pair } = exploreFromLink({
      params: { focus: "A1", pair: "A1~B2", layers: "budget", group: "globe", sections: "overall" },
      source: SOURCE,
      docs: DOCS,
      setup: SETUP,
    });
    expect(state.focus).toBe("A1");
    expect(state.group).toBe("globe");
    expect(state.layers).toEqual(["budget"]);
    expect(pair).toEqual({ a: "A1", b: "B2" });
  });

  it("opens a shared comparison only beside the centre it was shared with", () => {
    const { pair } = exploreFromLink({ params: { focus: "A1", pair: "B1~B2" }, source: SOURCE, docs: DOCS, setup: SETUP });
    expect(pair).toBeNull();
  });

  it("accepts a document, an area or a layer in the centre, and nothing outside the selection", () => {
    const pick = (focus: string, docs = DOCS) =>
      exploreFromLink({ params: { focus }, source: SOURCE, docs, setup: SETUP }).state.focus;
    expect(pick("doc:B")).toBe("doc:B");
    expect(pick("area:globe:g2")).toBe("area:globe:g2");
    expect(pick("doc:layer:budget")).toBe("doc:layer:budget");
    expect(pick("C1", ["A", "B"])).toBeNull();
  });

  it("leaves the explorer at rest for a link without its part", () => {
    expect(exploreFromLink({ params: {}, source: SOURCE, docs: DOCS, setup: SETUP })).toEqual({
      state: { focus: null, trail: [], group: "docs", query: "", lines: ["strong", "apart"], layers: [] },
      pair: null,
    });
  });
});
