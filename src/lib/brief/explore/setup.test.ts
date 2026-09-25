import { describe, expect, it } from "vitest";
import { briefFixture } from "../test-fixture";
import { exploreSetup } from "./setup";
import { LAYER_DATA } from "./test-layers";

const SOURCE = briefFixture();
const DOCS = ["A", "B", "C"];

describe("exploreSetup", () => {
  it("reads the explorer's part of a brief link", () => {
    const setup = exploreSetup({
      data: LAYER_DATA,
      source: SOURCE,
      docs: DOCS,
      searchParams: { focus: "A1", pair: "A1~B2", layers: "budget", group: "globe", sections: "overall" },
    });
    expect(setup.initialState.focus).toBe("A1");
    expect(setup.initialState.group).toBe("globe");
    expect(setup.initialState.layers).toEqual(["budget"]);
    expect(setup.initialPair).toEqual({ a: "A1", b: "B2" });
    expect(setup.groups).toEqual(["docs", "globe"]);
    expect(setup.layers?.items).toHaveLength(3);
  });

  it("opens a shared comparison only beside the centre it was shared with", () => {
    const setup = exploreSetup({ data: LAYER_DATA, source: SOURCE, docs: DOCS, searchParams: { focus: "A1", pair: "B1~B2" } });
    expect(setup.initialPair).toBeNull();
  });

  it("accepts a document, an area or a layer in the centre, and nothing outside the selection", () => {
    const pick = (focus: string, docs = DOCS) =>
      exploreSetup({ data: LAYER_DATA, source: SOURCE, docs, searchParams: { focus } }).initialState.focus;
    expect(pick("doc:B")).toBe("doc:B");
    expect(pick("area:globe:g2")).toBe("area:globe:g2");
    expect(pick("doc:layer:budget")).toBe("doc:layer:budget");
    expect(pick("C1", ["A", "B"])).toBeNull();
  });
});
