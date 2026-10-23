import { describe, expect, it } from "vitest";
import { briefFixture } from "./test-fixture";
import { parseBerAreas } from "./ber-areas";
import { legacyPayload as legacy, levelsPayload as mongoliaLike } from "./spending-fixture";
import { percentLabel, spendingAreas, spendingRecord, spendingSetup } from "./spending";

describe("spendingSetup from Country X's file", () => {
  it("keeps the lines with spending, their area and their strong matches", () => {
    const setup = spendingSetup(legacy(), briefFixture())!;
    expect(setup.years.map((y) => y.year)).toEqual(["2020", "2021"]);
    expect(setup.series).toEqual(["all"]);
    expect(setup.illustrative).toBe(true);
    expect(setup.showMatches).toBe(true);
    expect(setup.lines.map((l) => [l.id, l.total, l.area, l.areaStatus])).toEqual([
      ["BER_P1", 3, "g1", "ai"],
      ["BER_P2", 7, "g2", "ai"],
    ]);
    expect(setup.lines[0].matches.sort()).toEqual(["A1", "A2"]);
    expect(setup.items.map((i) => i.code)).toEqual(["P2", "P1"]);
  });

  it("is null without the public spending the review is part of", () => {
    expect(spendingSetup(legacy(null), briefFixture())).toBeNull();
    expect(spendingSetup(legacy({ publicSpending: { "2020": 100 } }), briefFixture())).toBeNull();
    expect(spendingSetup({}, briefFixture())).toBeNull();
  });
});

describe("spendingSetup from a rebuilt record", () => {
  it("keeps the budget levels apart and a missing level as not in the data", () => {
    const setup = spendingSetup(mongoliaLike(), briefFixture())!;
    expect(setup.series).toEqual(["central", "local"]);
    expect(setup.complete).toEqual(["2020", "2021"]);
    expect(setup.scope).toBe("stateLocal");
    expect(setup.years[2].reviewed).toEqual({ central: null, local: 5 });
    expect(setup.notes).toContain("levels");
  });

  it("lists the review's own lines with what it counted and who spends", () => {
    const setup = spendingSetup(mongoliaLike(), briefFixture())!;
    const [first, second] = setup.items;
    expect([first.code, first.total, first.kind]).toEqual(["71405", 7, "programme"]);
    expect(second.kind).toBe("purpose");
    expect(first.rates?.map((r) => [r.rate, r.spent, r.counted])).toEqual([
      [0.05, 20, 1],
      [1, 6, 6],
    ]);
    // A body's amount is one year's: its US$ twin at that year's rate.
    expect(first.bodies).toEqual({
      year: "2021",
      count: 31,
      names: [{ name: "Khan Khentii administration", amount: 0.8, amountUsd: 0.8e9 / 2500 }],
    });
    // US$ in whole dollars, each year at its own rate: 3 bn / 2000 + 4 bn / 2500.
    expect(first.totalUsd).toBeCloseTo(3e9 / 2000 + 4e9 / 2500);
    // The rates hold totals over the complete years: converted as the line is.
    const factor = first.totalUsd! / first.total;
    expect(first.rates?.[0].spentUsd).toBeCloseTo(20 * factor);
    expect(first.rates?.[0].countedUsd).toBeCloseTo(1 * factor);
  });

  it("gives every line its US$ twin, each year at its own rate", () => {
    const setup = spendingSetup(mongoliaLike(), briefFixture())!;
    expect(setup.lines.map((l) => [l.code, l.total])).toEqual([
      ["71405", 7],
      ["82212", 3],
    ]);
    expect(setup.lines[0].totalUsd).toBeCloseTo(3e9 / 2000 + 4e9 / 2500);
    expect(setup.lines[1].totalUsd).toBeCloseTo(1e9 / 2000 + 2e9 / 2500);
  });

  it("hides the earlier comparisons until they are rebuilt for these lines", () => {
    expect(spendingSetup(mongoliaLike(), briefFixture())!.lines[0].matches).toEqual([]);
    const rebuilt = spendingSetup(mongoliaLike({ budgetAlignmentBasis: "ber-record" }), briefFixture())!;
    expect(rebuilt.showMatches).toBe(true);
    expect(rebuilt.lines[0].matches).toEqual(["A1"]);
  });

  it("takes each line's area from step 2, a person's call first", () => {
    const areas = parseBerAreas(
      {
        lines: [
          { code: "71405", area: "g1", status: "models-agree", first: { ranked: [{ reasoning: "Protected areas." }] } },
          { code: "82212", area: null, status: "models-differ", first: { ranked: [] } },
        ],
      },
      { globe: { "82212": { call: "change", area: "g2", by: "A reviewer", at: "2026-10-24" } } },
      "globe",
    );
    const setup = spendingSetup(mongoliaLike(), briefFixture(), { areas })!;
    expect(setup.lines.map((l) => [l.code, l.area, l.areaStatus])).toEqual([
      ["71405", "g1", "ai"],
      ["82212", "g2", "checked"],
    ]);
  });

  it("falls back to the pipeline's own classification without step 2", () => {
    const setup = spendingSetup(mongoliaLike(), briefFixture())!;
    expect(setup.lines.map((l) => [l.code, l.area, l.areaStatus])).toEqual([
      ["71405", "g5", "ai"],
      ["82212", null, "apart"],
    ]);
  });

  it("reads agency groups and project lines the way the Sri Lanka adapter writes them", () => {
    const data = {
      berData: {
        record: {
          currency: "LKR",
          unit: "million",
          levels: [{ id: "all", name: "Central government" }],
          groups: [{ id: "CBA" }, { id: "DBU" }, { id: "OASBE" }, { id: "OAMBE" }],
          years: [
            { year: "2015", levels: ["all"], complete: true, reviewed: { all: 10 }, byGroup: { CBA: 6, DBU: 1, OASBE: 2, OAMBE: 1 }, public: { all: 1000 }, usdRate: 136 },
          ],
          lines: [
            { code: "FD", kind: "institution", group: "CBA", name: "Forest Department", amounts: { "2015": { all: { gross: 6, rate: 1, counted: 6 } } } },
            { code: "CEA", kind: "institution", group: "OASBE", name: "Central Environment Authority", rationale: "Main agency for EIAs.", amounts: { "2015": { all: { gross: 4, rate: 0.5, counted: 2 } } } },
            { code: "P082", kind: "project", name: "Construction of Electric Fences", ministry: "Ministry of Environment", tags: ["Wildlife protection"], amounts: { "2015": { all: { gross: 3, rate: 1, counted: 3 } } } },
          ],
        },
      },
    };
    const setup = spendingSetup(data, briefFixture())!;
    expect(setup.series).toEqual(["core", "other"]);
    expect(setup.years[0].reviewed).toEqual({ core: 7, other: 3 });
    expect(setup.scope).toBe("government");
    expect(setup.items.map((i) => [i.code, i.sub, i.rate, i.rationale])).toEqual([
      ["FD", "core", undefined, undefined],
      ["CEA", "other", 0.5, "Main agency for EIAs."],
    ]);
    // The areas are read from the project lines, a second view of the same money.
    expect(setup.lines.map((l) => l.code)).toEqual(["P082"]);
    expect(setup.linesKind).toBe("projects");
    expect(setup.notes).toContain("projects");
  });
});

describe("spendingRecord", () => {
  it("sets the reviewed lines against all public spending, in total and by year", () => {
    const record = spendingRecord(spendingSetup(legacy(), briefFixture())!);
    expect(record.reviewed).toBe(10);
    expect(record.public).toBe(300);
    expect(record.share).toBeCloseTo(1 / 30);
    expect(record.byYear.map((y) => [y.year, y.total, y.parts[0].share])).toEqual([
      ["2020", 4, 0.04],
      ["2021", 6, 0.03],
    ]);
  });

  it("totals the complete years only, and gives each level its own share", () => {
    const record = spendingRecord(spendingSetup(mongoliaLike(), briefFixture())!);
    expect(record.reviewed).toBe(10);
    expect(record.public).toBe(300);
    expect(record.byYear[2].total).toBeNull();
    expect(record.byYear[2].parts.map((p) => [p.series, p.reviewed, p.share])).toEqual([
      ["central", null, null],
      ["local", 5, 5 / 60],
    ]);
    expect(record.byYear[0].parts[0].share).toBeCloseTo(0.03);
    expect(record.reviewedUsd).toBeCloseTo(4e9 / 2000 + 6e9 / 2500);
    // All public spending, ₮150 bn in each complete year, at each year's rate.
    expect(record.publicUsd).toBeCloseTo(150e9 / 2000 + 150e9 / 2500);
    expect(record.byYear.map((y) => y.totalUsd)).toEqual([4e9 / 2000, 6e9 / 2500, null]);
  });

  it("has no US$ twins for a review in US$", () => {
    const record = spendingRecord(spendingSetup(legacy(), briefFixture())!);
    expect([record.reviewedUsd, record.publicUsd]).toEqual([null, null]);
  });
});

describe("spendingAreas", () => {
  it("puts each area's share of the targets beside its share of the spending", () => {
    const source = briefFixture();
    const reading = spendingAreas(spendingSetup(legacy(), source)!, source, ["A", "B", "C"]);
    // As many targets each: the area with more spending first.
    expect(reading.areas.map((r) => [r.id, r.targets.length, r.spend])).toEqual([
      ["g2", 3, 7],
      ["g1", 3, 3],
      ["g5", 3, 0],
    ]);
    expect(reading.areas[0].targetShare).toBeCloseTo(3 / 18);
    expect(reading.areas[0].spendShare).toBeCloseTo(0.7);
    expect(reading.areas[1].matched).toEqual(["A1", "A2"]);
    expect(reading.apart.lines).toEqual([]);
  });

  it("reads the targets from the brief's documents only", () => {
    const source = briefFixture();
    const reading = spendingAreas(spendingSetup(legacy(), source)!, source, ["A", "B"]);
    expect(reading.areas.map((r) => r.id)).toEqual(["g2", "g1"]);
    expect(reading.areas[0].targetShare).toBeCloseTo(3 / 12);
  });

  it("sets each area's coherence beside its money, rated from the brief's floor", () => {
    const source = briefFixture();
    // B4-B6 against the six targets of A and of C: 36 target pairs.
    const all = spendingAreas(spendingSetup(legacy(), source)!, source, ["A", "B", "C"]).areas[0];
    expect(all.id).toBe("g2");
    expect(all.coherence.total).toBe(36);
    expect(all.coherence.reinforce + all.coherence.partial + all.coherence.apart + all.coherence.none).toBe(36);
    expect(all.coherence.rated).toBe(true);
    // Against A's targets only: 18 target pairs, below the floor of 30.
    const two = spendingAreas(spendingSetup(legacy(), source)!, source, ["A", "B"]).areas[0];
    expect(two.coherence.total).toBe(18);
    expect(two.coherence.rated).toBe(false);
  });

  it("counts the lines not yet placed apart, with their share", () => {
    const source = briefFixture();
    const reading = spendingAreas(spendingSetup(mongoliaLike(), source)!, source, ["A", "B", "C"]);
    expect(reading.apart.lines.map((l) => l.code)).toEqual(["82212"]);
    expect(reading.apart.spendShare).toBeCloseTo(3 / 10);
    expect(reading.apart.spendUsd).toBeCloseTo(1e9 / 2000 + 2e9 / 2500);
    // The area of 71405 (g5 from the pipeline's classification) in US$ too.
    expect(reading.areas.find((a) => a.id === "g5")?.spendUsd).toBeCloseTo(3e9 / 2000 + 4e9 / 2500);
  });
});

describe("percentLabel", () => {
  it("rounds to whole percentages and keeps a small share visible", () => {
    expect(percentLabel(0.613)).toBe("61%");
    expect(percentLabel(0.004)).toBe("<1%");
    expect(percentLabel(0)).toBe("0%");
  });
});
