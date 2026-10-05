import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COUNTRIES, countryLocales, getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { buildBriefSource } from "./source";
import { targetLine } from "./text";

// The brief on every visible country's committed data (python/data and
// python/output), not fixtures. Its rules for naming targets were first read
// on Mongolia, and each corpus brings its own label shapes: Côte d'Ivoire
// numbers its biodiversity targets "1" to "21", Country X names its plans'
// sections "Agriculture and food security 30". Every row has to say which
// target it is and what it is about.
const VISIBLE = COUNTRIES.filter((c) => c.visible).map((c) => [c.id, c.name] as const);

function commitmentsOf(id: string, name: string) {
  const result = getCountryDashboardPayload(id, "en", null);
  if (result.kind !== "ok") throw new Error(`${id}: ${result.error}`);
  const data = result.payload.data as unknown as Record<string, unknown>;
  return buildBriefSource({ countryId: id, countryName: name, data, locale: "en" }).commitments;
}

describe.each(VISIBLE)("the brief's targets in %s", (id, name) => {
  const commitments = commitmentsOf(id, name);

  it("never names a target by a number alone", () => {
    const bare = commitments.filter((c) => /^[\s(]*\d+(?:\.\d+)*[.)]?\s*$/.test(c.label));
    expect(bare.map((c) => `${c.id}: "${c.label}"`)).toEqual([]);
  });

  it("never stops a target's line at a section's clause number while the target has text", () => {
    const alone = commitments.filter(
      (c) =>
        c.text.trim() !== "" &&
        c.text.trim() !== c.label.trim() &&
        targetLine(c) === c.label &&
        /(?:^|\D)\d{1,3}$/.test(c.label.replace(/\s*\([^)]*\)\s*$/, "")),
    );
    expect(alone.map((c) => `${c.id}: "${c.label}"`)).toEqual([]);
  });
});

// The map names every document by the same rules in every country: its code
// over its plain name, in the page's language. Reported actions, budget lines
// and the catch-all are layers, never on the map.
const LAYERS = new Set(["BTR", "BER", "OTHER"]);

describe.each(VISIBLE)("the map's names in %s", (id) => {
  const config = JSON.parse(readFileSync(join(process.cwd(), "python", "data", `${id}-country-config.json`), "utf8"));
  const docs = (config.documentTypes as { id: string; plainName?: string; labels?: Record<string, { plainName?: string }> }[])
    .filter((d) => !LAYERS.has(d.id));
  // A brief is in English and its country's own language only.
  const own: string[] = countryLocales(getCountry(id)!).filter((l) => l !== "en");

  it("gives every document a plain name in English and in the country's own language", () => {
    const missing = docs.flatMap((d) => [
      ...(d.plainName ? [] : [`${d.id}: en`]),
      ...own.filter((l) => !d.labels?.[l]?.plainName).map((l) => `${d.id}: ${l}`),
    ]);
    expect(missing).toEqual([]);
  });

  it("carries no other country's language", () => {
    const foreign = docs.flatMap((d) =>
      Object.keys(d.labels ?? {})
        .filter((l) => !own.includes(l))
        .map((l) => `${d.id}: ${l}`),
    );
    expect(foreign).toEqual([]);
  });
});

describe("Mongolia's brief in Mongolian", () => {
  it("names every document in Mongolian", () => {
    const result = getCountryDashboardPayload("mongolia", "mn", null);
    if (result.kind !== "ok") throw new Error(result.error);
    const data = result.payload.data as unknown as Record<string, unknown>;
    const { documents } = buildBriefSource({ countryId: "mongolia", countryName: "Mongolia", data, locale: "mn" });
    const latin = documents.filter((d) => !LAYERS.has(d.id) && !/\p{Script=Cyrillic}/u.test(d.name));
    expect(latin.map((d) => `${d.id}: ${d.name}`)).toEqual([]);
  });
});
