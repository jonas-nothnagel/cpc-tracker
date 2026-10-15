import { describe, expect, it } from "vitest";
import {
  alsoServed,
  areaSynergy,
  areaTargetCounts,
  closerGaps,
  closerRows,
  fullYears,
  mapFinding,
  moneyByPlace,
  rateFinding,
  squaresOf,
  targetStats,
  tenderFinding,
  tenders,
  topTenders,
  unitFor,
  yearFocus,
} from "./angles";
import type { Contract } from "./model";
import { briefSide, contractsFixture } from "./test-fixture";

// The fixture, plus one potentially misaligned tender that names a place.
const base = contractsFixture();
const extra: Contract = {
  id: "n5",
  tender: "t12",
  year: 2025,
  tier: "none",
  value: 2e9,
  title: "Coal for heating",
  translated: true,
  place: "MN-1",
  areas: {},
  matches: [],
  misaligned: ["A1"],
};
const file = { ...base, contracts: [...base.contracts, extra] };
const side = briefSide();
const docOf = new Map(side.targets.map((t) => [t.id, t.doc]));
const all = () => true;

describe("units", () => {
  it("picks the largest unit that still gives the money about a hundred squares", () => {
    expect(unitFor(775e9)).toBe(5e9);
    expect(unitFor(24e9)).toBe(2e8);
    expect(unitFor(0)).toBe(5e6);
  });
});

describe("the years", () => {
  it("counts the principal money in focus by year", () => {
    const m = yearFocus(file.contracts, (c) => c.place === "MN-043");
    expect(m.get(2024)).toBe(10e9);
    expect(m.get(2025)).toBe(4e9);
  });

  it("keeps the full years, a thin one below a fifth of the median", () => {
    const years = [
      { ...file.years[0], year: 2018, contracts: 2 },
      ...file.years,
      { ...file.years[1], year: 2026, contracts: 2 },
    ];
    expect(fullYears(years)).toEqual([2024, 2025]);
  });
});

describe("the map's money", () => {
  it("sums the principal money in focus by place, several and none together", () => {
    const by = moneyByPlace(file.contracts, all);
    expect(by.get("MN-043")).toBe(14e9);
    expect(by.get("MN-1")).toBe(4e9);
    expect(by.get("none")).toBe(4e9);
  });

  it("names the place holding far more of the focus than of all the money, with guards", () => {
    const baseBy = moneyByPlace(file.contracts, all);
    const restoration = (c: Contract) => c.areas.globe === "g_restoration";
    const f = mapFinding(moneyByPlace(file.contracts, restoration), baseBy, file.contracts, restoration, 1e9);
    // Restoration: 4B in MN-1 (50%) against 4B of 22B overall (18%); 4B in MN-043 (50%) against 64%.
    expect(f.lead).toEqual({ code: "MN-1", share: 0.5, baseShare: 4 / 22, over: true });
    expect(f.one?.id).toBe("p2");
  });

  it("falls back to the largest place when none is over-represented", () => {
    const baseBy = moneyByPlace(file.contracts, all);
    const f = mapFinding(baseBy, baseBy, file.contracts, all, 1e9);
    expect(f.lead).toMatchObject({ code: "MN-043", over: false });
    expect(f.noneShare).toBeCloseTo(4 / 22);
  });

  it("states each place's money for nature or climate per ₮100 of its record", () => {
    const r = rateFinding(file.places!, moneyByPlace(file.contracts, all));
    expect(r.rates.get("MN-043")).toBeCloseTo(14 / 30);
    expect(r.top?.code).toBe("MN-043");
    expect(r.overall).toBeCloseTo(22 / 250);
  });
});

describe("tenders on the map", () => {
  it("counts a tender once, where its largest contract is", () => {
    const mis = tenders(file.contracts, "mis", all);
    expect(mis.map((t) => [t.tender, t.place, t.lots.length])).toEqual([
      ["t10", "none", 3],
      ["t12", "MN-1", 1],
    ]);
  });

  it("keeps only tenders with a target in focus", () => {
    expect(tenders(file.contracts, "match", (id) => id === "B2").map((t) => t.tender)).toEqual(["t11"]);
  });

  it("states where the potentially misaligned tenders are without naming an aimag", () => {
    const f = tenderFinding(tenders(file.contracts, "mis", all), null);
    expect(f).toEqual({ total: 2, none: 1, placed: 1, noneValue: 3e9, placedValue: 2e9, noneShare: 0.5, top: { code: "MN-1", share: 0.5 }, over: null });
  });

  it("names a place only when a focus holds far more there than all tenders do", () => {
    const allMatch = tenders(file.contracts, "match", all);
    const b = tenders(file.contracts, "match", (id) => docOf.get(id) === "B");
    // B's 4 tenders: 2 in MN-043 (50%), against 2 of all 7 strongly matching tenders there.
    expect(tenderFinding(b, allMatch, 1).over).toEqual({ code: "MN-043", share: 0.5, baseShare: 2 / 7 });
    // With the page's minimum of 5 tenders, 2 are too few to name a place.
    expect(tenderFinding(b, allMatch).over).toBeNull();
  });
});

describe("documents served together", () => {
  it("shares each other document among a document's contracts, and those serving it alone", () => {
    const s = alsoServed(file.contracts, "C", docOf, all);
    expect(s.n).toBe(2);
    expect(s.alone).toBe(0.5);
    expect(s.shares.find((x) => x.doc === "A")?.share).toBe(0.5);
  });

  it("gives an area's share of contracts serving three documents or more, against all", () => {
    const s = areaSynergy(file.contracts, (c) => c.areas.globe ?? "none", "g_pollution", docOf, all, 3);
    expect(s).toEqual({ n: 2, share: 0.5, base: 1 / 7 });
  });
});

describe("the targets", () => {
  const stats = targetStats(file.contracts, all);

  it("counts each target's strongly matching and potentially misaligned tenders", () => {
    expect(stats.get("A1")).toMatchObject({ matchContracts: 3 });
    expect(stats.get("A1")!.match.size).toBe(3);
    expect(stats.get("A1")!.mis.size).toBe(1);
    expect(stats.get("C1")!.mis.size).toBe(1);
  });

  it("counts an area's targets with each", () => {
    expect(areaTargetCounts(["A1", "A2", "C1"], stats)).toEqual({ red: 2, green: 3, total: 3 });
  });

  it("orders the targets to look closer at by their potentially misaligned tenders", () => {
    expect(closerRows(["A1", "B1", "C1"], stats)).toEqual(["A1", "C1"]);
  });

  it("gathers the targets no contract strongly matches, by document", () => {
    expect(closerGaps(["A1", "C2", "B2"], file.contracts, docOf, ["A", "B", "C"])).toEqual([{ doc: "C", ids: ["C2"] }]);
  });

  it("merges tenders with the same title, most targets first", () => {
    const twin: Contract = { ...extra, id: "n6", tender: "t13", misaligned: ["C1"] };
    const list = tenders([...file.contracts, twin], "mis", all);
    const top = topTenders(list, 5);
    expect(top[0]).toMatchObject({ title: "Coal for heating", tenders: ["t12", "t13"], contracts: 2, targets: 2 });
    expect(top).toHaveLength(2);
  });
});

describe("squares for a sum", () => {
  it("gives any money at least one square, and none to nothing", () => {
    expect(squaresOf(2e6, 5e6)).toBe(1);
    expect(squaresOf(0, 5e6)).toBe(0);
    expect(squaresOf(10e9, 5e9)).toBe(2);
  });
});
