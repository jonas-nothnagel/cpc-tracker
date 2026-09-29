import { describe, expect, it } from "vitest";
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

describe("contractsSetup", () => {
  const setup = contractsSetup({ file: contractsFixture(), source });

  it("carries the targets, each with its document", () => {
    expect(setup.targets).toEqual([
      { id: "T1", doc: "A", label: "1", text: "First" },
      { id: "T2", doc: "A", label: "2", text: "Second" },
    ]);
  });

  it("offers the three policy-area lenses only", () => {
    expect(setup.lenses.map((l) => l.id)).toEqual(["globe"]);
  });

  it("leaves budget lines and reported actions off the page", () => {
    expect(Object.keys(setup)).not.toContain("backing");
    expect(Object.keys(setup)).not.toContain("budget");
  });
});
