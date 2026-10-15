import { countryLocaleFor, listVisibleCountries, type CountryEntry } from "@/config/countries";
import { getCountryDashboardPayload, type CountryPayload } from "@/lib/dashboard-data";
import { buildBriefSource } from "@/lib/brief/source";
import { scopeOf } from "@/lib/brief/compute";
import { defaultSelection } from "@/lib/brief/selection";
import { clip } from "@/lib/brief/text";

/** Deal lists out in turn, one item from each while any remain, up to `max`. */
export function dealInTurn(lists: string[][], max: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < max && lists.some((list) => i < list.length); i++) {
    for (const list of lists) {
      if (i < list.length && out.length < max) out.push(list[i]);
    }
  }
  return out;
}

const briefLines = new WeakMap<CountryPayload, string[]>();

/** A country's verbatim targets as its brief's landing deals them: the
 *  standard documents in turn. None when its data cannot be read. */
function linesOf(entry: CountryEntry, locale: string): string[] {
  const result = getCountryDashboardPayload(entry.id, locale, null);
  if (result.kind !== "ok") return [];
  let lines = briefLines.get(result.payload);
  if (!lines) {
    const data = result.payload.data as unknown as Record<string, unknown>;
    const source = buildBriefSource({ countryId: entry.id, countryName: entry.name, data, locale });
    const scope = scopeOf(source, defaultSelection(source).docs);
    const byDoc = scope.docs.map((d) => scope.commitments.filter((c) => c.doc === d.id).map((c) => clip(c.text, 150)));
    lines = dealInTurn(byDoc, Infinity);
    briefLines.set(result.payload, lines);
  }
  return lines;
}

/**
 * The landing's drifting text: verbatim targets from every country on the
 * landing, dealt across the countries in turn so no country leads. Each
 * country's targets read in the language its brief opens in for this reader.
 * Enough lines for nine a row across the hero's rows.
 */
export function landingDriftLines(locale: string, max = 198): string[] {
  const perCountry = listVisibleCountries().map((entry) => linesOf(entry, countryLocaleFor(entry, locale)));
  return dealInTurn(perCountry, max);
}
