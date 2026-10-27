/**
 * Reading a country's expenditure-review record (python/data/{country}-ber.json,
 * `record`, written by the adapters of step 1 of the BER plan). Shared by the
 * brief's spending section and the Explore ring's budget layer, so both read
 * the same lines over the same years.
 */

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

/** The record inside a payload's `berData`, or null for a file without one. */
export function berRecord(berData: unknown): Json | null {
  return asRecord(asRecord(berData)?.record);
}

/** The years with every part of the budget in the review's data. */
export function completeYears(record: Json): string[] {
  return ((record.years as Json[] | undefined) ?? []).filter((y) => y.complete === true).map((y) => String(y.year));
}

/** The kinds of line the review decided on, which take a policy area:
 *  Mongolia's programmes and purpose codes, Panama's activities, Sri Lanka's
 *  project lines (its institutions carry the total but no area). */
export function areaLines(record: Json): Json[] {
  const lines = (record.lines as Json[] | undefined) ?? [];
  const kinds = new Set(lines.map((l) => String(l.kind)));
  const wanted = kinds.has("activity") ? ["activity"] : kinds.has("project") ? ["project"] : ["programme", "purpose"];
  return lines.filter((l) => wanted.includes(String(l.kind)));
}

/** A line's counted amount in a year, all parts of the budget together. */
export function countedIn(line: Json, year: string): number {
  const cells = asRecord(asRecord(line.amounts)?.[year]) ?? {};
  return Object.values(cells).reduce<number>((s, c) => {
    const v = asRecord(c)?.counted;
    return s + (typeof v === "number" && Number.isFinite(v) ? v : 0);
  }, 0);
}

/** The currency the brief states amounts in: Panama's balboa is at par with
 *  the US$ and is shown as such. */
export function shownCurrency(record: Json): "MNT" | "LKR" | "US$" {
  return record.currency === "PAB" ? "US$" : record.currency === "LKR" ? "LKR" : "MNT";
}

/** A line's text for a reader: the review's own description where it has
 *  one, else where the line sits in the budget. */
export function lineText(line: Json): string {
  if (typeof line.description === "string" && line.description) return line.description;
  const parts = [line.programmeName, line.institution, line.ministry].filter((p): p is string => typeof p === "string" && p !== "");
  const tags = Array.isArray(line.tags) ? (line.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
  return [...parts, ...tags].join(" · ") || String(line.name ?? "");
}
