import { describe, expect, it } from "vitest";

import type { ModelDisagreementRow, RatingsByCountry } from "@/types";

import { summarizeLedger } from "./analysis-sections";

const row = (a: string, b: string) =>
  ({ targetAId: a, targetBId: b }) as ModelDisagreementRow;

const rating = (ts = 1) => ({ rating: "real" as const, note: "", ts });

describe("summarizeLedger", () => {
  const report = {
    models: ["gpt-5-4", "deepseek-v4-pro"],
    uniqueSignalRandomSample: {
      "gpt-5-4": [row("NDC_1", "FSS_2"), row("NDC_3", "NBSAP_4")],
      "deepseek-v4-pro": [row("ILDN_5", "NRVTS_6")],
    },
    consensusFlaggedRandomSample: [row("HR_7", "NDC_8")],
  };

  it("splits ledger ratings into current-sample vs earlier-run buckets", () => {
    const ratings: RatingsByCountry = {
      "NDC_1::FSS_2": rating(), // in gpt sample
      "HR_7::NDC_8": rating(), // in consensus sample
      "OLD_1::OLD_2": rating(), // rated against an earlier run
      "OLD_3::OLD_4": rating(),
    };
    const s = summarizeLedger(report, ratings);
    expect(s.totalRated).toBe(4);
    expect(s.inCurrentSamples).toBe(2);
    expect(s.fromEarlierRuns).toBe(2);
    expect(s.perModel).toEqual([
      { slug: "gpt-5-4", sampleSize: 2, rated: 1, priorRated: 0 },
      { slug: "deepseek-v4-pro", sampleSize: 1, rated: 0, priorRated: 0 },
    ]);
    expect(s.consensus).toEqual({ sampleSize: 1, rated: 1 });
  });

  it("attributes prior ratings per model via the full flag sets", () => {
    const ratings: RatingsByCountry = {
      "NDC_1::FSS_2": rating(), // gpt sample + gpt flags
      "OLD_1::OLD_2": rating(), // only in gpt's full flag set
      "OLD_3::OLD_4": rating(), // flagged by BOTH models
      "OLD_6::OLD_5": rating(), // deepseek flags it reversed (order-insensitive)
      "GONE_1::GONE_2": rating(), // no current model flags it
    };
    const s = summarizeLedger(report, ratings, {
      "gpt-5-4": ["NDC_1::FSS_2", "OLD_1::OLD_2", "OLD_3::OLD_4"],
      "deepseek-v4-pro": ["OLD_3::OLD_4", "OLD_5::OLD_6"],
    });
    expect(s.perModel).toEqual([
      { slug: "gpt-5-4", sampleSize: 2, rated: 1, priorRated: 3 },
      { slug: "deepseek-v4-pro", sampleSize: 1, rated: 0, priorRated: 2 },
    ]);
    // The dropped pair still counts in the global totals.
    expect(s.totalRated).toBe(5);
    expect(s.fromEarlierRuns).toBe(4);
  });

  it("handles an empty ledger and missing sample maps", () => {
    const s = summarizeLedger(
      { models: ["gpt-5-4"], uniqueSignalRandomSample: {}, consensusFlaggedRandomSample: [] },
      {},
    );
    expect(s.totalRated).toBe(0);
    expect(s.fromEarlierRuns).toBe(0);
    expect(s.perModel).toEqual([
      { slug: "gpt-5-4", sampleSize: 0, rated: 0, priorRated: 0 },
    ]);
  });

  it("counts a pair rated in multiple samples once in the totals", () => {
    const shared = row("NDC_1", "FSS_2");
    const s = summarizeLedger(
      {
        models: ["gpt-5-4"],
        uniqueSignalRandomSample: { "gpt-5-4": [shared] },
        consensusFlaggedRandomSample: [shared],
      },
      { "NDC_1::FSS_2": rating() },
    );
    expect(s.totalRated).toBe(1);
    expect(s.inCurrentSamples).toBe(1);
    expect(s.perModel[0].rated).toBe(1);
    expect(s.consensus.rated).toBe(1);
  });
});
