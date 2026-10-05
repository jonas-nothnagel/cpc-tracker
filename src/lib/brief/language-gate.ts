import { countryLocales, type CountryEntry } from "@/config/countries";

type Params = Record<string, string | string[] | undefined>;

/**
 * Where a brief page opened in a language its country does not offer sends
 * the reader: the same page and choices in English, or null where the
 * language is offered. The address names English (`/en/`), so the language
 * middleware switches the reader's saved language instead of sending them
 * back to the one they came from.
 */
export function briefInEnglish(
  entry: Pick<CountryEntry, "id" | "languages">,
  locale: string,
  path: string,
  searchParams: Params,
): string | null {
  if (countryLocales(entry).some((l) => l === locale)) return null;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  const q = query.toString();
  return `/en/${entry.id}/${path}${q ? `?${q}` : ""}`;
}
