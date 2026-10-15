import { describe, expect, it } from "vitest";
import type { BriefSource } from "../source";
import { contractsSetup, scopeSetup } from "./setup";
import { contractsFixture, setupFixture } from "./test-fixture";

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

describe("scopeSetup", () => {
  const setup = setupFixture();
  const scoped = scopeSetup(setup, ["A", "B"]);
  const contract = (id: string) => scoped.file.contracts.find((c) => c.id === id)!;

  it("keeps the brief's documents and their targets only", () => {
    expect(scoped.documents.map((d) => d.id)).toEqual(["A", "B"]);
    expect(scoped.targets.map((x) => x.id)).toEqual(["A1", "A2", "B1", "B2"]);
  });

  it("keeps each contract's strong matches and potential misalignments with those targets only", () => {
    expect(contract("p1").matches).toEqual(["A1", "B1"]);
    expect(contract("s3").matches).toEqual([]);
    expect(contract("n1").misaligned).toEqual([]);
  });

  it("keeps the money whole: every contract, its value and the record's totals", () => {
    expect(scoped.file.contracts).toHaveLength(13);
    expect(contract("s3").value).toBe(2e9);
    expect(scoped.file.census).toEqual({ contracts: 40, tenders: 30, value: 250e9 });
  });

  it("is the setup itself while every document is in the brief", () => {
    expect(scopeSetup(setup, ["A", "B", "C"])).toBe(setup);
  });
});
