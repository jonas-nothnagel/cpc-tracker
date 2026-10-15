import { describe, expect, it } from "vitest";
import { briefFixture } from "./test-fixture";
import { briefOverview } from "./overview";
import type { BriefSource } from "./source";

/** The fixture with document C off by default: the brief opens on A and B. */
function withoutC(): BriefSource {
  const source = briefFixture();
  return {
    ...source,
    documents: source.documents.map((d) => (d.id === "C" ? { ...d, defaultOn: false } : d)),
  };
}

describe("briefOverview", () => {
  it("gives the figures the brief opens with, for its standard documents only", () => {
    // A~B alone: 36 comparisons, 24 reinforce, 6 partial, 6 potential misalignment.
    expect(briefOverview(withoutC())).toEqual({
      documents: 2,
      targets: 12,
      counts: { reinforce: 24, partial: 6, apart: 6, none: 0, total: 36 },
      lead: "aligned",
    });
  });

  it("leads with partial alignment when partial links outnumber aligned ones", () => {
    const source = withoutC();
    // Every high or medium rating (codes 0 and 1) read as low (code 2).
    const comparisons = source.comparisons.map((code, i) => (i % 4 === 2 && code < 2 ? 2 : code));
    const overview = briefOverview({ ...source, comparisons });
    expect(overview.counts).toEqual({ reinforce: 0, partial: 30, apart: 6, none: 0, total: 36 });
    expect(overview.lead).toBe("partial");
  });
});
