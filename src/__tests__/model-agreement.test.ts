import { describe, expect, it } from "vitest";

import type { RatingsByCountry } from "@/types";

import { computeModelAgreement } from "@/lib/dashboard-data";

const rate = (rating: RatingsByCountry[string]["rating"]) => ({
  rating,
  note: "",
  ts: 1,
});

describe("computeModelAgreement", () => {
  const labelsByModel = {
    "gpt-5-4": {
      "NDC_1::FSS_2": "flagged",
      "NDC_3::NBSAP_4": "medium",
      "ILDN_5::NRVTS_6": "low",
    },
    "deepseek-v4-pro": {
      "NDC_1::FSS_2": "flagged",
      "NDC_3::NBSAP_4": "flagged",
    },
  };

  it("counts exact and flag-level matches per model", () => {
    const ratings: RatingsByCountry = {
      "NDC_1::FSS_2": rate("flagged"), // gpt exact+flag; deepseek exact+flag
      "NDC_3::NBSAP_4": rate("high"), // gpt no exact, flag-match (both non-flag); deepseek flag-mismatch
      "ILDN_5::NRVTS_6": rate("low"), // gpt exact+flag; deepseek has no verdict
    };
    expect(computeModelAgreement(labelsByModel, ratings)).toEqual([
      { slug: "gpt-5-4", n: 3, exactMatches: 2, flagMatches: 3 },
      { slug: "deepseek-v4-pro", n: 2, exactMatches: 1, flagMatches: 1 },
    ]);
  });

  it("matches pair keys order-insensitively", () => {
    const ratings: RatingsByCountry = { "FSS_2::NDC_1": rate("flagged") };
    const [gpt] = computeModelAgreement(labelsByModel, ratings);
    expect(gpt).toEqual({
      slug: "gpt-5-4",
      n: 1,
      exactMatches: 1,
      flagMatches: 1,
    });
  });

  it("ignores rated pairs the model has no verdict for", () => {
    const ratings: RatingsByCountry = { "GONE_1::GONE_2": rate("none") };
    for (const m of computeModelAgreement(labelsByModel, ratings)) {
      expect(m.n).toBe(0);
      expect(m.exactMatches).toBe(0);
      expect(m.flagMatches).toBe(0);
    }
  });

  it("handles empty inputs", () => {
    expect(computeModelAgreement({}, {})).toEqual([]);
    expect(computeModelAgreement(labelsByModel, {})).toEqual([
      { slug: "gpt-5-4", n: 0, exactMatches: 0, flagMatches: 0 },
      { slug: "deepseek-v4-pro", n: 0, exactMatches: 0, flagMatches: 0 },
    ]);
  });
});
