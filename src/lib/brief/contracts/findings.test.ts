import { describe, expect, it } from "vitest";
import { areaFinding, areaRows, NO_AREA } from "./areas";
import { misalignedRows } from "./misaligned";
import { NO_PLACE, tierTotals } from "./model";
import { placeFinding, placeRows } from "./places";
import { synergy } from "./synergy";
import { coverage, targetStats } from "./targets";
import { briefSide, contractsFixture } from "./test-fixture";

const file = contractsFixture();
const side = briefSide();
const docOf = new Map(side.targets.map((t) => [t.id, t.doc]));
const principal = tierTotals(file, "principal").value;

describe("policy areas", () => {
  const rows = areaRows(file.contracts, "globe", side.categories, side.primary, side.targets.map((t) => t.id));

  it("has a row per area with targets or money, most targets first, the unclaimed last", () => {
    expect(rows.map((r) => r.id)).toEqual(["g_sustainable", "g_pollution", "g_restoration", NO_AREA]);
    expect(rows[0].targets).toEqual(["A1", "A2", "C1"]);
    expect(rows[1].principal).toEqual({ contracts: 1, value: 10e9 });
    expect(rows[1].significant).toEqual({ contracts: 1, value: 8e9 });
  });

  it("gathers what no area claims: its targets and its money", () => {
    const rest = rows[3];
    expect(rest.targets).toEqual(["C2"]);
    expect(rest.principal.value).toBe(2e9);
    expect(rest.significant.value).toBe(2e9);
  });

  it("names the area with most targets and least money, and the area drawing most", () => {
    const f = areaFinding(rows, 6, principal);
    expect(f.gap?.row.id).toBe("g_sustainable");
    expect(f.gap?.targetShare).toBeCloseTo(0.5);
    expect(f.gap?.moneyShare).toBeCloseTo(2 / 22);
    expect(f.top?.row.id).toBe("g_pollution");
  });

  it("names no gap where the money follows the targets", () => {
    const even = rows.map((r) => ({ ...r, principal: { contracts: 1, value: r.targets.length } }));
    expect(areaFinding(even, 6, 6).gap).toBeNull();
  });
});

describe("places", () => {
  const rows = placeRows(file.contracts);

  it("orders places by money mainly for nature or climate, the unnamed last", () => {
    expect(rows.map((r) => r.id)).toEqual(["MN-043", "MN-1", "MN-057", NO_PLACE]);
    expect(rows[0].principal).toEqual({ contracts: 2, value: 14e9 });
    expect(rows[3].principal.value).toBe(4e9);
  });

  it("never names the unnamed as a place", () => {
    const f = placeFinding(rows, principal);
    expect(f?.first.id).toBe("MN-043");
    expect(f?.first.share).toBeCloseTo(14 / 22);
    expect(f?.second?.id).toBe("MN-1");
  });
});

describe("targets", () => {
  const stats = targetStats(file.contracts, side.targets, side.budget, side.action);
  const byId = new Map(stats.map((s) => [s.id, s]));

  it("counts a target's matching contracts, tenders and value", () => {
    expect(byId.get("A1")).toMatchObject({ matching: 3, matchingTenders: 3, value: 22e9, misalignedTenders: 0 });
    expect(byId.get("C1")).toMatchObject({ matching: 2, misalignedTenders: 1 });
  });

  it("keeps a budget line for a target without a contract, which is then not a gap of all three", () => {
    const cov = coverage(stats, side.docOrder);
    expect(cov.covered).toBe(5);
    expect(cov.none).toBe(1);
    expect(cov.noneOfThree).toBe(0);
    expect(cov.docs[2].none.map((s) => s.id)).toEqual(["C2"]);
    expect(cov.docs[2].none[0].budget).toBe(true);
  });
});

describe("one contract, many targets", () => {
  const s = synergy(file.contracts, docOf, side.docOrder);

  it("counts contracts by the documents they serve", () => {
    expect(s.distribution).toEqual([0, 5, 1, 1]);
  });

  it("lists those serving three documents or more", () => {
    expect(s.rows.map((r) => r.contract.id)).toEqual(["p1"]);
    expect(s.rows[0].docs).toEqual(["A", "B", "C"]);
    expect(s.count).toBe(1);
    expect(s.value).toBe(10e9);
  });
});

describe("potentially misaligned", () => {
  const m = misalignedRows(file.contracts, docOf);

  it("counts the lots of one tender once", () => {
    expect(m.tenders).toBe(1);
    expect(m.contracts).toBe(3);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].target).toBe("C1");
    expect(m.rows[0].tenders[0].contracts).toHaveLength(3);
    expect(m.rows[0].tenders[0].value).toBe(3e9);
  });

  it("sets the target's strongly matching tenders beside them, and names the document most involved", () => {
    expect(m.rows[0].matchingTenders).toBe(2);
    expect(m.topDoc).toEqual({ doc: "C", share: 1 });
  });
});
