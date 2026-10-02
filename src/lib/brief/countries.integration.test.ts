import { describe, expect, it } from "vitest";
import { COUNTRIES } from "@/config/countries";
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
