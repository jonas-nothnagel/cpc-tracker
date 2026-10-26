import { describe, expect, it } from "vitest";
import { ownLensProblem, parseAreas } from "./own-areas";

const area = (name: string, description = `Policies on ${name.toLowerCase()}.`) => ({ name, description });

describe("ownLensProblem", () => {
  it("accepts named areas with descriptions", () => {
    expect(ownLensProblem({ name: "National priorities", areas: [area("Water"), area("Food")] })).toBeNull();
  });

  it("names what needs attention, as a code the page words itself", () => {
    expect(ownLensProblem({ name: " ", areas: [area("Water")] })).toEqual({ code: "name" });
    expect(ownLensProblem({ name: "National priorities", areas: [] })).toEqual({ code: "count" });
    expect(ownLensProblem({ name: "National priorities", areas: [area("")] })).toEqual({ code: "areaName" });
    expect(ownLensProblem({ name: "National priorities", areas: [area("Water", " ")] })).toEqual({
      code: "description",
      area: "Water",
    });
    expect(ownLensProblem({ name: "National priorities", areas: [area("Water"), area("water")] })).toEqual({
      code: "duplicate",
      area: "water",
    });
    expect(ownLensProblem({ name: "National priorities", source: "x".repeat(301), areas: [area("Water")] })).toEqual({
      code: "source",
    });
  });
});

describe("parseAreas", () => {
  it("reads two columns pasted from a spreadsheet, or a comma after the name", () => {
    expect(parseAreas("Food security\tAccess to food\nWater, Safe water for all\n\n")).toEqual([
      { name: "Food security", description: "Access to food" },
      { name: "Water", description: "Safe water for all" },
    ]);
  });

  it("keeps an area without a description, so the page can say what is missing", () => {
    expect(parseAreas("Energy\n")).toEqual([{ name: "Energy", description: "" }]);
  });
});
