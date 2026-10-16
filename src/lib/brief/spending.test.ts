import { describe, expect, it } from "vitest";
import { briefFixture } from "./test-fixture";
import { percentLabel, spendingAreas, spendingRecord, spendingSetup } from "./spending";

/** A review of three budget lines: P1 in area g1, P2 in g2, P3 with no spending. */
function payload(scope: Record<string, unknown> | null = { publicSpending: { "2020": 100, "2021": 200 }, illustrative: true }) {
  return {
    berData: {
      programs: [
        { code: "P1", name: "Protected area security" },
        { code: "P2", name: "Irrigation support" },
        { code: "P3", name: "Unspent line" },
      ],
      expenditure: [
        { code: "P1", values: { "2020": 1, "2021": 2 } },
        { code: "P2", values: { "2020": 3, "2021": 4 } },
        { code: "P3", values: { "2020": null, "2021": null } },
      ],
      currency: "US$",
      unit: "million",
      period: { start: 2020, end: 2021 },
      ...(scope ? { scope } : {}),
    },
    classifications: [
      { targetId: "BER_P1", taxonomyType: "globe", categoryId: "g1", isPrimary: true },
      { targetId: "BER_P2", taxonomyType: "globe", categoryId: "g2", isPrimary: true },
      { targetId: "BER_P2", taxonomyType: "globe", categoryId: "g1", isPrimary: false },
    ],
    budgetAlignment: [
      { targetAId: "A1", targetBId: "BER_P1", alignment: "high" },
      { targetAId: "BER_P1", targetBId: "A2", alignment: "high" },
      { targetAId: "B4", targetBId: "BER_P2", alignment: "medium" },
    ],
  };
}

describe("spendingSetup", () => {
  it("keeps the lines with spending, their area and their strong matches", () => {
    const setup = spendingSetup(payload(), briefFixture())!;
    expect(setup.years).toEqual(["2020", "2021"]);
    expect(setup.illustrative).toBe(true);
    expect(setup.lines.map((l) => [l.id, l.total, l.area])).toEqual([
      ["BER_P1", 3, "g1"],
      ["BER_P2", 7, "g2"],
    ]);
    expect(setup.lines[0].matches.sort()).toEqual(["A1", "A2"]);
    expect(setup.lines[1].matches).toEqual([]);
  });

  it("is null without the public spending the review is part of", () => {
    expect(spendingSetup(payload(null), briefFixture())).toBeNull();
    expect(spendingSetup(payload({ publicSpending: { "2020": 100 } }), briefFixture())).toBeNull();
    expect(spendingSetup({}, briefFixture())).toBeNull();
  });
});

describe("spendingRecord", () => {
  it("sets the reviewed lines against all public spending, in total and by year", () => {
    const record = spendingRecord(spendingSetup(payload(), briefFixture())!);
    expect(record.reviewed).toBe(10);
    expect(record.public).toBe(300);
    expect(record.share).toBeCloseTo(1 / 30);
    expect(record.byYear.map((y) => [y.year, y.reviewed, y.share])).toEqual([
      ["2020", 4, 0.04],
      ["2021", 6, 0.03],
    ]);
  });
});

describe("spendingAreas", () => {
  it("puts each area's share of the targets beside its share of the spending", () => {
    const source = briefFixture();
    const setup = spendingSetup(payload(), source)!;
    const rows = spendingAreas(setup, source, ["A", "B", "C"]);
    // As many targets each: the area with more spending first.
    expect(rows.map((r) => [r.id, r.targets.length, r.spend])).toEqual([
      ["g2", 3, 7],
      ["g1", 3, 3],
      ["g5", 3, 0],
    ]);
    expect(rows[0].targetShare).toBeCloseTo(3 / 18);
    expect(rows[0].spendShare).toBeCloseTo(0.7);
    expect(rows[1].matched).toEqual(["A1", "A2"]);
  });

  it("reads the targets from the brief's documents only", () => {
    const source = briefFixture();
    const rows = spendingAreas(spendingSetup(payload(), source)!, source, ["A", "B"]);
    expect(rows.map((r) => r.id)).toEqual(["g2", "g1"]);
    expect(rows[0].targetShare).toBeCloseTo(3 / 12);
  });
});

describe("percentLabel", () => {
  it("rounds to whole percentages and keeps a small share visible", () => {
    expect(percentLabel(0.613)).toBe("61%");
    expect(percentLabel(0.004)).toBe("<1%");
    expect(percentLabel(0)).toBe("0%");
  });
});
