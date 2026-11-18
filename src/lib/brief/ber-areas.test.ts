import { describe, expect, it } from "vitest";
import { loadBerAreasByLens } from "./ber-areas";

// On the committed files (python/output/{country}/ber_areas_<lens>.json).
describe("loadBerAreasByLens", () => {
  it("reads each country's placements by the brief's lens, climate mitigation from the pipeline's sector file", () => {
    expect(Object.keys(loadBerAreasByLens("mongolia"))).toEqual(["globe", "ipcc", "gga"]);
    expect(Object.keys(loadBerAreasByLens("panama"))).toEqual(["globe", "ipcc", "gga"]);
    // Sri Lanka's own adaptation sectors stand in for the GGA's.
    expect(Object.keys(loadBerAreasByLens("sri-lanka"))).toEqual(["globe", "ipcc", "adaptation"]);
    expect(loadBerAreasByLens("countryx")).toEqual({});
  });

  it("reads a person's calls under the file's own lens", () => {
    expect(loadBerAreasByLens("panama").ipcc?.lens).toBe("sector");
    expect(loadBerAreasByLens("panama").globe?.lens).toBe("globe");
  });
});
