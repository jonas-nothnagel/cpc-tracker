import { describe, expect, it } from "vitest";
import { briefFixture } from "./test-fixture";
import { parseBerAreas } from "./ber-areas";
import { parseBerNames } from "./ber-names-shared";
import {
  activitiesPayload as activities,
  holdersPayload as holders,
  legacyPayload as legacy,
  levelsPayload as mongoliaLike,
  sameNamePayload as sameName,
} from "./spending-fixture";
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

  it("keeps each of the review's categories with its own name and amounts, two at one rate too", () => {
    const data = mongoliaLike();
    const line = data.berData.record.lines[0] as Record<string, unknown>;
    line.relevance = [
      { code: "80101", name: "Core operational expenditures", rate: 1, actual: 6, counted: 6 },
      { code: "80918", name: "Other", rate: 0.05, actual: 20, counted: 1 },
      { code: "80303", name: "Research and scientific studies", rate: 1, actual: 2, counted: 2 },
    ];
    const [first] = spendingSetup(data, briefFixture())!.items;
    expect(first.rates?.map((r) => [r.code, r.name, r.rate, r.spent, r.counted])).toEqual([
      ["80918", "Other", 0.05, 20, 1],
      ["80101", "Core operational expenditures", 1, 6, 6],
      ["80303", "Research and scientific studies", 1, 2, 2],
    ]);
  });

  it("names a line's categories, payments and spending units in the review's Mongolian on the Mongolian page", () => {
    const data = mongoliaLike();
    const line = data.berData.record.lines[0] as Record<string, unknown>;
    line.relevance = [
      { code: "80101", name: "Core operational expenditures", nameMn: "Үндсэн үйл ажиллагааны зардал", rate: 1, actual: 6, counted: 6 },
    ];
    line.payments = [{ name: "Wages and salaries, bonuses", nameMn: "Цалин, хөлс болон нэмэгдэл урамшил", share: 0.61 }];
    const mn = spendingSetup(data, briefFixture(), { locale: "mn" })!.items[0];
    expect([mn.rates?.[0].name, mn.pays?.[0].name, mn.bodies?.names[0].name]).toEqual([
      "Үндсэн үйл ажиллагааны зардал",
      "Цалин, хөлс болон нэмэгдэл урамшил",
      "Хан Хэнтий",
    ]);
    const en = spendingSetup(data, briefFixture(), { locale: "en" })!.items[0];
    expect([en.rates?.[0].name, en.pays?.[0].name, en.bodies?.names[0].name]).toEqual([
      "Core operational expenditures",
      "Wages and salaries, bonuses",
      "Khan Khentii administration",
    ]);
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
            // An agency of the other groups that the review counts in full.
            { code: "SLC", kind: "institution", group: "OASBE", name: "Sri Lanka Customs", amounts: { "2015": { all: { gross: 1, rate: 1, counted: 1 } } } },
            { code: "P082", kind: "project", name: "Construction of Electric Fences", ministry: "Ministry of Environment", tags: ["Wildlife protection"], amounts: { "2015": { all: { gross: 3, rate: 1, counted: 3 } } } },
          ],
        },
      },
    };
    const setup = spendingSetup(data, briefFixture())!;
    expect(setup.series).toEqual(["core", "other"]);
    expect(setup.years[0].reviewed).toEqual({ core: 7, other: 3 });
    expect(setup.scope).toBe("government");
    // "Counted in full" or "in part" by the rate applied, not by the group.
    expect(setup.items.map((i) => [i.code, i.sub, i.rate, i.rationale])).toEqual([
      ["FD", "core", undefined, undefined],
      ["CEA", "other", 0.5, "Main agency for EIAs."],
      ["SLC", "core", undefined, undefined],
    ]);
    // The areas are read from the project lines, a second view of the same money.
    expect(setup.lines.map((l) => l.code)).toEqual(["P082"]);
    expect(setup.linesKind).toBe("projects");
    expect(setup.notes).toContain("projects");
  });

  it("lists Panama's programmes, and the same money by the institution that runs each", () => {
    const names = parseBerNames({
      names: {
        "0-10": { es: "Ministerio de Desarrollo Agropecuario", en: "Ministry of Agricultural Development" },
        "0-27": { es: "Ministerio de Ambiente", en: "Ministry of Environment" },
        "0-10-1-3": { es: "Sanidad Agropecuaria", en: "Agricultural Health" },
      },
    });
    const setup = spendingSetup(activities(), briefFixture(), { names, locale: "en" })!;
    // By programme: the agriculture ministry's programme is the largest, its
    // institution named in the page's language.
    expect(setup.items.map((i) => [i.code, i.total, i.sub])).toEqual([
      ["0-10-1-3", 6, "Ministry of Agricultural Development"],
      ["0-27-0-2", 4, "Ministry of Environment"],
      ["0-27-1-1", 3, "Ministry of Environment"],
    ]);
    // By institution: the environment ministry spends the most, over two programmes.
    expect(setup.institutions?.map((i) => [i.code, i.name, i.original, i.kind, i.total, i.partsCount])).toEqual([
      ["0-27", "Ministry of Environment", "Ministerio de Ambiente", "institutionGroup", 7, 2],
      ["0-10", "Ministry of Agricultural Development", "Ministerio de Desarrollo Agropecuario", "institutionGroup", 6, 1],
    ]);
    expect(setup.institutions?.[0].parts?.map((p) => [p.name, p.amount])).toEqual([
      ["Dirección General y Administración", 4],
      ["Áreas Protegidas y Vida Silvestre", 3],
    ]);
    // Balboas at par: no US$ twin to add up.
    expect(setup.institutions?.[0].totalUsd).toBeNull();
  });

  it("tells an institution's programmes of one name apart by the budget they are in", () => {
    const setup = spendingSetup(sameName(), briefFixture())!;
    expect(setup.items.map((i) => [i.code, i.name, i.budget])).toEqual([
      ["0-10-1-3", "Sanidad Agropecuaria", undefined],
      ["0-27-0-2", "Áreas Protegidas y Biodiversidad", "operating"],
      ["0-27-1-1", "Áreas Protegidas y Biodiversidad", "investment"],
    ]);
    expect(setup.institutions?.[0].parts?.map((p) => [p.name, p.budget])).toEqual([
      ["Áreas Protegidas y Biodiversidad", "operating"],
      ["Áreas Protegidas y Biodiversidad", "investment"],
    ]);
    // A name used once carries no budget.
    expect(spendingSetup(activities(), briefFixture())!.items.some((i) => i.budget)).toBe(false);
  });

  it("keeps the one view where the record carries no institution codes", () => {
    const setup = spendingSetup(activities(false), briefFixture())!;
    expect(setup.items.map((i) => i.sub)).toEqual(["Ministerio de Desarrollo Agropecuario", "Ministerio de Ambiente", "Ministerio de Ambiente"]);
    expect(setup.institutions).toBeUndefined();
    expect(spendingSetup(mongoliaLike(), briefFixture())!.institutions).toBeUndefined();
  });

  it("gathers Mongolia's lines by who holds their budget, each year at its own rate", () => {
    const setup = spendingSetup(holders(), briefFixture())!;
    // The holders' amounts add up to the lines' counted amounts: 7 + 3.
    expect(setup.institutions?.map((i) => [i.code, i.name, i.total, i.partsCount])).toEqual([
      ["013", "Minister for Nature and Tourism", 7, 1],
      ["059", "Capital city", 2.5, 1],
      ["043", "Bulgan province", 0.5, 1],
    ]);
    // US$ in whole dollars: ₮3 bn at 2,000 and ₮4 bn at 2,500.
    expect(setup.institutions?.[0].totalUsd).toBeCloseTo(3e9 / 2000 + 4e9 / 2500);
    expect(setup.institutions?.[1].parts).toEqual([
      { name: "Solid waste removal", amount: 2.5, amountUsd: 1e9 / 2000 + 1.5e9 / 2500 },
    ]);
    // On the Mongolian page, the workbook's own Mongolian names.
    const mn = spendingSetup(holders(), briefFixture(), {
      names: parseBerNames({ names: { "013": { mn: "Байгаль орчин, аялал жуулчлалын сайд" } } }),
      locale: "mn",
    })!;
    expect(mn.institutions?.[0].name).toBe("Байгаль орчин, аялал жуулчлалын сайд");
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
