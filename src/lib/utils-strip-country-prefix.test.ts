import { describe, it, expect } from "vitest";
import { stripCountryIdPrefix } from "./utils";

// Real id shapes per corpus (python/data/*-targets.json): only Panama
// namespaces target ids with the country slug; every other corpus uses
// bare `<DOC>_<n>` ids that must pass through untouched.
describe("stripCountryIdPrefix", () => {
  it("strips a canonical registry slug prefix", () => {
    expect(stripCountryIdPrefix("panama_CNR_1")).toBe("CNR_1");
    expect(stripCountryIdPrefix("mongolia_NDC_2")).toBe("NDC_2");
  });

  it("strips alias slug prefixes too", () => {
    expect(stripCountryIdPrefix("cote-divoire_NDC_1")).toBe("NDC_1");
    expect(stripCountryIdPrefix("cote-d-ivoire_NDC_1")).toBe("NDC_1");
  });

  it("passes bare document-prefixed ids through untouched", () => {
    for (const id of ["NBSAP_1", "LDN_1", "NDC_3", "BER_71401", "BTR_5"]) {
      expect(stripCountryIdPrefix(id)).toBe(id);
    }
  });

  it("only strips at the start of the id", () => {
    expect(stripCountryIdPrefix("NDC_panama_1")).toBe("NDC_panama_1");
  });
});
