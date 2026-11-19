import { describe, expect, it } from "vitest";
import { briefFixture } from "./test-fixture";
import { lensAreas, targetsHeadline } from "./areas";
import { scopeOf } from "./compute";
import { parseBerAreas } from "./ber-areas";
import { parseBerNames } from "./ber-names-shared";
import {
  activitiesPayload as activities,
  holdersPayload as holders,
  legacyPayload as legacy,
  levelsPayload as mongoliaLike,
  sameNamePayload as sameName,
} from "./spending-fixture";
import { itemOpens, spendingAreas, spendingLens, spendingRecord, spendingSetup, type SpendingItem } from "./spending";

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
          { code: "71405", area: "g1", status: "second-agrees", first: { ranked: [{ reasoning: "Protected areas." }] }, second: { ranked: [{ reasoning: "Ranger wages." }] } },
          { code: "82212", area: null, status: "no-clear-area", first: { ranked: [] }, second: { ranked: [] } },
        ],
      },
      { globe: { "82212": { call: "change", area: "g2", by: "A reviewer", at: "2026-10-24" } } },
      "globe",
    );
    const setup = spendingSetup(mongoliaLike(), briefFixture(), { areas: { globe: areas } })!;
    expect(setup.lines.map((l) => [l.code, l.area, l.areaStatus])).toEqual([
      ["71405", "g1", "ai"],
      ["82212", "g2", "checked"],
    ]);
    // Claude Opus (the second reading) decides the area, so its reason is the one kept.
    expect(setup.lines[0].reason).toBe("Ranger wages.");
  });

  it("keeps a line with no area at the mark as general spending, with no specific area", () => {
    const areas = parseBerAreas(
      { lines: [{ code: "82212", area: null, status: "no-clear-area", first: { ranked: [{ reasoning: "Green areas." }] }, second: { ranked: [] } }] },
      null,
      "globe",
    )!;
    expect(areas.lines["82212"]).toEqual({ area: null, status: "apart", apart: "no-clear-area", reason: "Green areas." });
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
    // The chart splits by the rows' rule: Sri Lanka Customs, of the other
    // groups but counted at 100%, stands with the agencies counted in full.
    // The year's total stays the review's.
    expect(setup.years[0].reviewed).toEqual({ core: 8, other: 2 });
    expect(Object.values(setup.years[0].reviewed).reduce((s, v) => s! + (v ?? 0), 0)).toBe(10);
    expect(setup.scope).toBe("government");
    // "Counted in full" or "in part" by the rate applied, not by the group.
    expect(setup.items.map((i) => [i.code, i.sub, i.rate, i.rationale])).toEqual([
      ["FD", "core", undefined, undefined],
      ["CEA", "other", 0.5, "Main agency for EIAs."],
      ["SLC", "core", undefined, undefined],
    ]);
    // A row opens only where the review says more: CEA's rate and reason.
    expect(setup.items.map((i) => itemOpens(i))).toEqual([false, true, false]);
    // The areas are read from the project lines, a second view of the same money.
    expect(setup.lines.map((l) => l.code)).toEqual(["P082"]);
    expect(setup.linesKind).toBe("projects");
    expect(setup.notes).toContain("projects");
  });

  it("carries the review team's own description and tag of a Panama line, in the page's language", () => {
    const data = activities();
    const flies = data.berData.record.lines[0] as Record<string, unknown>;
    flies.reviewDescription = { en: "Infrastructure or equipment line.", es: "Línea de infraestructura o equipamiento." };
    flies.tags = { "2016": "Indirecto", "2017": "Indirecto" };
    const line = (locale: string, code: string) => spendingSetup(data, briefFixture(), { locale })!.lines.find((l) => l.code === code)!;
    expect([line("en", "0-10-1-3-1-1").description, line("en", "0-10-1-3-1-1").reviewTag]).toEqual(["Infrastructure or equipment line.", "indirect"]);
    expect(line("es", "0-10-1-3-1-1").description).toBe("Línea de infraestructura o equipamiento.");
    // A line the review does not describe or tag carries neither.
    expect([line("en", "0-27-0-2-1-1").description, line("en", "0-27-0-2-1-1").reviewTag]).toEqual([undefined, undefined]);
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
    // The targets' shares are read over the targets placed in an area of the
    // lens, as the thematic areas read them: 9 of the brief's 18.
    expect(reading.areas[0].targetShare).toBeCloseTo(3 / 9);
    expect(reading.placed).toBe(9);
    expect(reading.areas[0].spendShare).toBeCloseTo(0.7);
    expect(reading.areas[1].matched).toEqual(["A1", "A2"]);
    expect(reading.apart.lines).toEqual([]);
  });

  it("reads the targets from the brief's documents only", () => {
    const source = briefFixture();
    const reading = spendingAreas(spendingSetup(legacy(), source)!, source, ["A", "B"]);
    expect(reading.areas.map((r) => r.id)).toEqual(["g2", "g1"]);
    expect(reading.areas[0].targetShare).toBeCloseTo(3 / 6);
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

  /** Agriculture (g2) holds 5 of the 12 targets placed in an area, Protected
   *  areas (g1) 4, Water (g5) 3; B4-B6 and C4-C6 have no area. */
  function twelvePlaced() {
    const base = briefFixture();
    const primary: Record<string, string> = { A6: "g1", B1: "g1", B2: "g1", B3: "g1", C1: "g5", C2: "g5", C3: "g5" };
    for (const id of ["A1", "A2", "A3", "A4", "A5"]) primary[id] = "g2";
    return { ...base, lenses: [{ ...base.lenses[0], primary }] };
  }

  it("says how few areas, most targets first, hold half of the targets, with their share of the spending", () => {
    const source = twelvePlaced();
    const half = spendingAreas(spendingSetup(legacy(), source)!, source, ["A", "B", "C"]).half!;
    // Agriculture's 5 and Protected areas' 4 of the 12 placed.
    expect([half.areas, half.of]).toEqual([2, 3]);
    expect(half.targetShare).toBeCloseTo(9 / 12);
    // Agriculture's 7 and Protected areas' 3 of the 10 reviewed.
    expect(half.spendShare).toBeCloseTo(1);
  });

  it("counts the targets as the thematic areas do: the same denominator, the same share for the same areas", () => {
    const source = twelvePlaced();
    const docs = ["A", "B", "C"];
    const reading = spendingAreas(spendingSetup(legacy(), source)!, source, docs);
    const head = targetsHeadline(lensAreas(source, scopeOf(source, docs), "globe"));
    if (head.kind !== "top") throw new Error(`expected a sentence over several areas, got ${head.kind}`);
    expect(reading.placed).toBe(head.placed);
    expect(reading.half?.areas).toBe(head.areas);
    expect(reading.half?.targetShare).toBeCloseTo(head.share);
  });

  it("says nothing with fewer than three areas holding targets", () => {
    const source = briefFixture();
    expect(spendingAreas(spendingSetup(legacy(), source)!, source, ["A", "B"]).half).toBeNull();
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

describe("itemOpens", () => {
  it("opens a row with something behind it, never a bare one", () => {
    const bare: SpendingItem = { code: "P1", name: "Protected area security", kind: "line", total: 3, totalUsd: null };
    expect(itemOpens(bare)).toBe(false);
    expect(itemOpens({ ...bare, parts: [] })).toBe(false);
    expect(itemOpens({ ...bare, bodies: { year: "2021", count: 0, names: [] } })).toBe(false);
    expect(itemOpens({ ...bare, parts: [{ name: "An activity", amount: 1 }] })).toBe(true);
    expect(itemOpens({ ...bare, pays: [{ name: "Wages", share: 0.6 }] })).toBe(true);
    expect(itemOpens({ ...bare, rate: 0.5 })).toBe(true);
    expect(itemOpens({ ...bare, rationale: "Its biodiversity division." })).toBe(true);
    expect(
      itemOpens({ ...bare, rates: [{ code: "1", name: "Other", rate: 0.05, spent: 2, counted: 0.1, spentUsd: null, countedUsd: null }] }),
    ).toBe(true);
    expect(
      itemOpens({ ...bare, bodies: { year: "2021", count: 1, names: [{ name: "An administration", amount: 1, amountUsd: null }] } }),
    ).toBe(true);
  });
});

describe("the areas in a climate lens", () => {
  /** The fixture with a climate mitigation lens beside Biodiversity. */
  function withMitigation() {
    const base = briefFixture();
    const ipcc = {
      id: "ipcc" as const,
      taxonomyType: "sector",
      categories: [
        { id: "s1", name: "Energy" },
        { id: "s2", name: "Agriculture, forestry and other land use" },
      ],
      primary: { A1: "s1", A2: "s1", B4: "s2", B5: "s2", B6: "s2", C1: "s2" } as Record<string, string>,
    };
    return { ...base, lenses: [...base.lenses, ipcc] };
  }
  const placed = (lens: string, lines: [string, string | null][]) =>
    parseBerAreas({ lines: lines.map(([code, area]) => ({ code, area, status: area ? "second-agrees" : "no-clear-area" })) }, null, lens);

  it("places each line in every lens the brief offers that it is placed in, Biodiversity first", () => {
    const setup = spendingSetup(mongoliaLike(), withMitigation(), {
      areas: {
        globe: placed("globe", [["71405", "g1"], ["82212", null]]),
        ipcc: placed("sector", [["71405", "s2"], ["82212", "s1"]]),
        // The brief offers no climate adaptation lens here: its placements stay out.
        gga: placed("gga", [["71405", "gga_water"]]),
      },
    })!;
    expect(setup.lenses).toEqual(["globe", "ipcc"]);
    // A line's own area stays its biodiversity area.
    expect(setup.lines.map((l) => [l.code, l.area])).toEqual([
      ["71405", "g1"],
      ["82212", null],
    ]);
  });

  it("reads the areas, their targets and their money in the lens shown", () => {
    const source = withMitigation();
    const setup = spendingSetup(mongoliaLike(), source, {
      areas: { globe: placed("globe", [["71405", "g1"], ["82212", "g2"]]), ipcc: placed("sector", [["71405", "s2"], ["82212", null]]) },
    })!;
    const reading = spendingAreas(setup, source, ["A", "B", "C"], "ipcc");
    // Agriculture, forestry and other land use: B4-B6 and C1, and 71405's 7 of the 10.
    expect(reading.areas.map((a) => [a.id, a.targets.length, a.spend])).toEqual([
      ["s2", 4, 7],
      ["s1", 2, 0],
    ]);
    // Its targets' share over the 6 targets placed in a climate mitigation area.
    expect(reading.placed).toBe(6);
    expect(reading.areas[0].targetShare).toBeCloseTo(4 / 6);
    expect(reading.areas[0].lines.map((l) => [l.code, l.area, l.areaStatus])).toEqual([["71405", "s2", "ai"]]);
    expect(reading.apart.lines.map((l) => [l.code, l.area, l.areaStatus])).toEqual([["82212", null, "apart"]]);
    expect(reading.apart.spendShare).toBeCloseTo(3 / 10);
    // Biodiversity reads as it did.
    expect(spendingAreas(setup, source, ["A", "B", "C"]).areas.map((a) => [a.id, a.spend])).toEqual([
      ["g1", 7],
      ["g2", 3],
      ["g5", 0],
    ]);
  });

  it("counts a line placed in an area its lens does not list as kept apart, so no money is lost", () => {
    const source = withMitigation();
    const setup = spendingSetup(mongoliaLike(), source, {
      areas: { globe: placed("globe", [["71405", "g1"], ["82212", null]]), ipcc: placed("sector", [["71405", "s9"], ["82212", "s1"]]) },
    })!;
    const reading = spendingAreas(setup, source, ["A", "B", "C"], "ipcc");
    expect(reading.apart.lines.map((l) => l.code)).toEqual(["71405"]);
    expect(reading.areas.reduce((s, a) => s + a.spend, 0) + reading.apart.spend).toBe(10);
  });

  /** Climate mitigation with a fourth area, Industrial processes, that holds
   *  71405's spending (7 of the 10) and no target. */
  function withSpendOnly(primary: Record<string, string>) {
    const base = briefFixture();
    const ipcc = {
      id: "ipcc" as const,
      taxonomyType: "sector",
      categories: [
        { id: "s1", name: "Energy" },
        { id: "s2", name: "Agriculture, forestry and other land use" },
        { id: "s3", name: "Waste" },
        { id: "s4", name: "Industrial processes" },
      ],
      primary,
    };
    const source = { ...base, lenses: [...base.lenses, ipcc] };
    const setup = spendingSetup(mongoliaLike(), source, {
      areas: { globe: placed("globe", [["71405", "g1"], ["82212", null]]), ipcc: placed("sector", [["71405", "s4"], ["82212", "s2"]]) },
    })!;
    return { source, setup };
  }

  it("counts the areas holding targets, as the thematic areas do: an area with spending and no target is none of them", () => {
    const { source, setup } = withSpendOnly({ A1: "s1", A2: "s1", B4: "s2", B5: "s2", B6: "s2", C1: "s3" });
    const docs = ["A", "B", "C"];
    const reading = spendingAreas(setup, source, docs, "ipcc");
    expect(reading.areas.map((a) => [a.id, a.targets.length])).toEqual([
      ["s2", 3],
      ["s1", 2],
      ["s3", 1],
      ["s4", 0],
    ]);
    expect(reading.half?.of).toBe(3);
    expect(reading.half?.of).toBe(lensAreas(source, scopeOf(source, docs), "ipcc").areas.length);
  });

  it("says nothing where fewer than three areas hold targets, an area with spending alone beside them", () => {
    const { source, setup } = withSpendOnly({ A1: "s1", A2: "s1", B4: "s2", B5: "s2", B6: "s2" });
    const docs = ["A", "B", "C"];
    expect(spendingAreas(setup, source, docs, "ipcc").half).toBeNull();
    expect(targetsHeadline(lensAreas(source, scopeOf(source, docs), "ipcc")).kind).toBe("none");
  });

  it("shows the brief's lens where the lines are placed in it, else Biodiversity", () => {
    const source = withMitigation();
    const setup = spendingSetup(mongoliaLike(), source, { areas: { ipcc: placed("sector", [["71405", "s2"]]) } })!;
    expect(spendingLens(setup, "ipcc")).toBe("ipcc");
    expect(spendingLens(setup, "hr")).toBe("globe");
    expect(spendingLens(setup, null)).toBe("globe");
    // Read in a lens the lines are not placed in, the areas are Biodiversity's.
    expect(spendingAreas(setup, source, ["A", "B", "C"], "hr").areas.map((a) => a.id)).toEqual(["g5", "g2", "g1"]);
  });

  it("keeps Country X's illustrative file to Biodiversity", () => {
    expect(spendingSetup(legacy(), withMitigation())!.lenses).toEqual(["globe"]);
  });
});
