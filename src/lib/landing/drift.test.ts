import { describe, expect, it } from "vitest";
import { dealInTurn, landingDriftLines } from "./drift";

describe("dealInTurn", () => {
  it("takes one item from each list in turn, so no list leads", () => {
    expect(dealInTurn([["a1", "a2", "a3"], ["b1", "b2"], ["c1"]], 10)).toEqual(["a1", "b1", "c1", "a2", "b2", "a3"]);
  });

  it("stops at the limit", () => {
    expect(dealInTurn([["a1", "a2"], ["b1", "b2"]], 3)).toEqual(["a1", "b1", "a2"]);
  });

  it("deals nothing from nothing", () => {
    expect(dealInTurn([], 5)).toEqual([]);
    expect(dealInTurn([[], []], 5)).toEqual([]);
  });
});

// On the committed data, not fixtures: the landing shows the briefs' own targets.
describe("landingDriftLines", () => {
  it("fills the hero with verbatim targets, each clipped to one drifting line", () => {
    const lines = landingDriftLines("en");
    expect(lines).toHaveLength(198);
    expect(lines.every((line) => line.length > 0 && line.length <= 151)).toBe(true);
  });

  it("reads each country's targets in the language its brief opens in", () => {
    // In Spanish only Panama's brief opens in Spanish: its targets change,
    // every other country's stay in English at the same places.
    const en = landingDriftLines("en");
    const es = landingDriftLines("es");
    const same = es.filter((line, i) => line === en[i]).length;
    expect(same).toBeGreaterThan(0);
    expect(same).toBeLessThan(en.length);
  });
});
