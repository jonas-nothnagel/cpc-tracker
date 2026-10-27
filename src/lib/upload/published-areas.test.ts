import { describe, expect, it } from "vitest";
import { publishedLenses } from "./published-areas";

describe("publishedLenses", () => {
  it("reads the four sets every upload's run classifies in, from the file the run copies, in the brief's order", () => {
    const lenses = publishedLenses("en");
    expect(lenses.map((l) => l.id)).toEqual(["globe", "ipcc", "gga", "hr"]);
    expect(lenses.map((l) => l.areas.length)).toEqual([9, 7, 7, 9]);
    expect(lenses[0].areas).toContain("Restoration");
    expect(lenses[1].areas.slice(0, 2)).toEqual(["Energy", "Transport"]);
    expect(lenses[3].areas).toContain("Gender equality");
  });

  it("names the areas in the page's language where a translation is kept", () => {
    expect(publishedLenses("es")[1].areas.slice(0, 2)).toEqual(["Energía", "Transporte"]);
  });
});
