import { describe, expect, it } from "vitest";
import { projectWheelSlice } from "./dashboard-data";
import { WHEEL_DRAWN_LEVELS, type AlignmentLevel } from "@/types";

// The landing wheel groups by document and aggregates ribbons per document
// pair; it reads nothing else from a target or a pair. The slice exists so the
// landing page does not download the full multi-megabyte dashboard payload
// to draw one wheel.
const countryConfig = { id: "testland", defaultHiddenDocTypes: ["ENR"] };

const input = {
  targets: [
    { id: "NDC_1", sourceDocument: "NDC", text: "Cut emissions", sourceLabel: "NDC 1", country: "Testland" },
    { id: "NBSAP_1", sourceDocument: "NBSAP", text: "Protect 30%", sourceLabel: "NBSAP 1", country: "Testland" },
  ],
  alignment: [
    { targetAId: "NDC_1", targetBId: "NBSAP_1", alignment: "high", description: "…", confidence: "high" },
    { targetAId: "NDC_1", targetBId: "NBSAP_2", alignment: "medium", description: "…" },
    { targetAId: "NDC_1", targetBId: "NBSAP_3", alignment: "flagged", description: "…", mechanism: "x" },
    { targetAId: "NDC_1", targetBId: "NBSAP_4", alignment: "low", description: "…" },
    { targetAId: "NDC_1", targetBId: "NBSAP_5", alignment: "none", description: "…" },
  ],
  countryConfig,
};

describe("projectWheelSlice", () => {
  it("keeps only the id and source document of each target", () => {
    const out = projectWheelSlice(input);
    expect(out.targets).toEqual([
      { id: "NDC_1", sourceDocument: "NDC" },
      { id: "NBSAP_1", sourceDocument: "NBSAP" },
    ]);
  });

  it("keeps only the pair ids and level, and drops pairs the wheel never draws", () => {
    const out = projectWheelSlice(input);
    expect(out.alignment).toEqual([
      { targetAId: "NDC_1", targetBId: "NBSAP_1", alignment: "high" },
      { targetAId: "NDC_1", targetBId: "NBSAP_2", alignment: "medium" },
      { targetAId: "NDC_1", targetBId: "NBSAP_3", alignment: "flagged" },
    ]);
    // The projection and the wheel agree on one shared set of drawn levels.
    for (const a of out.alignment) expect(WHEEL_DRAWN_LEVELS.has(a.alignment as AlignmentLevel)).toBe(true);
    expect(out).not.toHaveProperty("classifications");
  });

  it("passes the country config through unchanged", () => {
    expect(projectWheelSlice(input).countryConfig).toBe(countryConfig);
  });

  it("tolerates a missing country config", () => {
    expect(projectWheelSlice({ ...input, countryConfig: null }).countryConfig).toBeNull();
  });
});
