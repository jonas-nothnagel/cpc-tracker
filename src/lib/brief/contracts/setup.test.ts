import { describe, expect, it } from "vitest";
import type { ExploreLayers } from "../explore/layers";
import type { BriefSource } from "../source";
import { contractsSetup } from "./setup";
import { contractsFixture } from "./test-fixture";

const source = {
  countryId: "mongolia",
  countryName: "Mongolia",
  commitments: [
    { id: "T1", doc: "A", label: "1", text: "First" },
    { id: "T2", doc: "A", label: "2", text: "Second" },
  ],
  documents: [{ id: "A", code: "A", name: "Doc A", full: "Doc A", color: "#000", count: 2, defaultOn: true }],
  comparisons: [],
  lenses: [
    { id: "globe", taxonomyType: "globe", categories: [], primary: {} },
    { id: "hr", taxonomyType: "hr", categories: [], primary: {} },
  ],
  themes: null,
  model: null,
} as unknown as BriefSource;

const layers: ExploreLayers = {
  items: [
    { id: "BER_1", layer: "budget", label: "71404 Water", name: "Water", code: "71404", text: "Water" },
    { id: "BTR_1", layer: "adaptation", label: "Wells", name: "Wells", text: "Wells" },
  ],
  // [target, item, level (0 = high), mechanism]
  links: [
    ["T1", 0, 0, 0],
    ["T2", 1, 1, 0],
    ["T2", 1, 0, 0],
  ],
};

describe("contractsSetup", () => {
  const setup = contractsSetup({ file: contractsFixture(), source, layers });

  it("keeps the targets with a strongly matching budget line or reported action", () => {
    expect(setup.budget).toEqual(["T1"]);
    expect(setup.action).toEqual(["T2"]);
    expect(setup.backing.T1.budget).toEqual(["Water"]);
    expect(setup.backing.T2.action).toEqual(["Wells"]);
  });

  it("offers the three policy-area lenses only", () => {
    expect(setup.lenses.map((l) => l.id)).toEqual(["globe"]);
  });

  it("works without layers", () => {
    const bare = contractsSetup({ file: contractsFixture(), source, layers: null });
    expect(bare.budget).toEqual([]);
    expect(bare.targets).toHaveLength(2);
  });
});
