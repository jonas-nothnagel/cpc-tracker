import { describe, expect, it } from "vitest";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { loadBerAreas } from "./ber-areas";
import { loadBerNames } from "./ber-names";
import { scopeOf } from "./compute";
import { buildExploreModel } from "./explore/model";
import { nr7Detail } from "./nr7-detail";
import { nr7Pairs, nr7Reading, nr7Setup } from "./nr7";
import { buildBriefSource } from "./source";
import { defaultSelection } from "./selection";
import { spendingSetup } from "./spending";

// The section on each country's committed data, not fixtures: the join from
// the report to the targets is the thing that broke before (a hand-kept map
// was wrong for 17 of Mongolia's 20), so it is pinned on the real files.
const COUNTRIES = [
  ["mongolia", "Mongolia", 20, 13],
  ["panama", "Panama", 30, 13],
  ["sri-lanka", "Sri Lanka", 16, 15],
] as const;

function load(id: string, name: string) {
  const result = getCountryDashboardPayload(id, "en", null);
  if (result.kind !== "ok") throw new Error(`${id}: ${result.error}`);
  const data = result.payload.data as unknown as Record<string, unknown>;
  const source = buildBriefSource({ countryId: id, countryName: name, data, locale: "en" });
  const spending = spendingSetup(data, source, { areas: loadBerAreas(id), names: loadBerNames(id), locale: "en" });
  return { data, source, setup: nr7Setup(data, spending)! };
}

describe.each(COUNTRIES)("the national targets of %s", (id, name, total, behind) => {
  const { data, source, setup } = load(id, name);
  const docs = defaultSelection({ ...source, nr7: true }).docs;
  const scope = scopeOf(source, docs);
  const reading = nr7Reading(setup, source, scope);

  it("reads every national target with its rating", () => {
    expect(reading.rows).toHaveLength(total);
    expect(reading.behind).toBe(behind);
  });

  it("finds a corpus target for every national target, each one once", () => {
    const targets = setup.rows.map((r) => r.targetId);
    expect(targets.every(Boolean)).toBe(true);
    expect(new Set(targets).size).toBe(total);
    const known = new Set(source.commitments.map((c) => c.id));
    expect(targets.filter((t) => !known.has(t as string))).toEqual([]);
  });

  it("offers the section by default", () => {
    expect(defaultSelection({ ...source, nr7: true }).sections).toContain("nr7");
  });

  it("gives an entry for every row", () => {
    for (const row of setup.rows) {
      const detail = nr7Detail(data, row.id, "en");
      expect(detail, row.id).not.toBeNull();
      expect(detail!.words.actions ?? detail!.words.progress, row.id).toBeTruthy();
    }
  });

  it("can put every row's target in the ring's centre", () => {
    const model = buildExploreModel(scope, null);
    const missing = reading.rows.filter((r) => r.pairs > 0 && !model.index.has(r.targetId as string));
    expect(missing.map((r) => r.id)).toEqual([]);
    expect(reading.rows.filter((r) => r.pairs > 0)).toHaveLength(total);
  });

  it("lists exactly the targets behind each row's two shares", () => {
    for (const row of reading.rows) {
      const pairs = nr7Pairs(scope, row.targetId as string);
      if (row.apart === null || row.aligned === null) continue;
      expect(pairs.apart.length / row.pairs, row.id).toBeCloseTo(row.apart);
      expect(pairs.aligned.length / row.pairs, row.id).toBeCloseTo(row.aligned);
    }
  });
});

it("carries Sri Lanka's report filed under GBF targets to its national targets", () => {
  const { data } = load("sri-lanka", "Sri Lanka");
  const entry = nr7Detail(data, "NT02", "en")!;
  expect(entry.gbf.map((g) => g.code)).toEqual(["GBF-T01", "GBF-T12", "GBF-T14"]);
  expect(entry.words.challenges).toContain("GBF-T01:");
});

it("matches Panama's short titles to the Nature Pledge in order", () => {
  const { setup } = load("panama", "Panama");
  for (const row of setup.rows) expect(row.targetId).toBe(`panama_NP_${Number(row.number) + 6}`);
});
