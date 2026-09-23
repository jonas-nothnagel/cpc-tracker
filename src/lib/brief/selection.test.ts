import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECTIONS,
  defaultSelection,
  parseSelection,
  selectionQuery,
} from "./selection";
import type { BriefDocument, BriefLens, BriefSource } from "./source";

function doc(id: string, defaultOn = true): BriefDocument {
  return { id, code: id, name: id, full: id, color: "#000", count: 3, defaultOn };
}

function lens(id: BriefLens["id"]): BriefLens {
  return { id, taxonomyType: id, categories: [{ id: "c", name: "C" }], primary: { x: "c" } };
}

const SOURCE: BriefSource = {
  countryId: "panama",
  countryName: "Panama",
  commitments: [],
  documents: [doc("NP"), doc("PEG"), doc("PNSH"), doc("ENR", false), doc("HR", false)],
  comparisons: [],
  lenses: [lens("globe"), lens("gga")],
  themes: null,
  model: null,
};

describe("defaultSelection", () => {
  it("takes the documents on by default, the first lens and the standard sections", () => {
    expect(defaultSelection(SOURCE)).toEqual({
      docs: ["NP", "PEG", "PNSH"],
      lens: "globe",
      sections: DEFAULT_SECTIONS,
    });
  });

  it("falls back to every document when fewer than two are on by default", () => {
    const source = { ...SOURCE, documents: [doc("A"), doc("B", false), doc("C", false)] };
    expect(defaultSelection(source).docs).toEqual(["A", "B", "C"]);
  });

  it("has no lens when the country has none", () => {
    expect(defaultSelection({ ...SOURCE, lenses: [] }).lens).toBeNull();
  });
});

describe("parseSelection", () => {
  it("keeps known documents in config order and ignores the rest", () => {
    expect(parseSelection({ docs: "HR,NP,XYZ" }, SOURCE).docs).toEqual(["NP", "HR"]);
  });

  it("falls back to the default documents when fewer than two remain", () => {
    expect(parseSelection({ docs: "NP" }, SOURCE).docs).toEqual(["NP", "PEG", "PNSH"]);
  });

  it("falls back to the default lens when the requested one is not available", () => {
    expect(parseSelection({ lens: "hr" }, SOURCE).lens).toBe("globe");
    expect(parseSelection({ lens: "gga" }, SOURCE).lens).toBe("gga");
  });

  it("drops unknown and repeated sections and keeps the given order", () => {
    expect(parseSelection({ sections: "map,bogus,overall,map" }, SOURCE).sections).toEqual([
      "map",
      "overall",
    ]);
  });

  it("falls back to the standard sections when none survive", () => {
    expect(parseSelection({ sections: "bogus" }, SOURCE).sections).toEqual(DEFAULT_SECTIONS);
  });

  it("drops the policy-area section when the country has no lens", () => {
    const source = { ...SOURCE, lenses: [] };
    expect(parseSelection({ sections: "areas,overall" }, source).sections).toEqual(["overall"]);
  });

  it("reads the first value of a repeated parameter", () => {
    expect(parseSelection({ lens: ["gga", "globe"] }, SOURCE).lens).toBe("gga");
  });
});

describe("selectionQuery", () => {
  it("is empty for the standard brief", () => {
    expect(selectionQuery(defaultSelection(SOURCE), SOURCE)).toBe("");
  });

  it("writes only what differs from the standard brief and round-trips", () => {
    const selection = {
      docs: ["NP", "PEG", "ENR"],
      lens: "gga" as const,
      sections: ["map" as const, "overall" as const],
    };
    const query = selectionQuery(selection, SOURCE);
    expect(query).toBe("docs=NP%2CPEG%2CENR&lens=gga&sections=map%2Coverall");
    const params = Object.fromEntries(new URLSearchParams(query));
    expect(parseSelection(params, SOURCE)).toEqual(selection);
  });
});
