import { countryLocales, getCountry, listVisibleCountries, type CountryEntry } from "@/config/countries";
import { routing } from "@/i18n/routing";
import { linkParams } from "./link";

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

/** The countries whose brief pages are built in a language: every visible
 *  country in English and in its own languages. */
export function briefCountries(locale: string): CountryEntry[] {
  return listVisibleCountries().filter((c) => countryLocales(c).some((l) => l === locale));
}

/**
 * The brief pages' `generateStaticParams`, per language. Where one language
 * yields no country, Next builds none of the route's pages, so every address
 * would answer not found (next/dist/build/static-paths/app.js): a language
 * no country offers stops the build instead.
 */
export function briefStaticParams(locale: string): { country: string }[] {
  const countries = briefCountries(locale);
  if (countries.length === 0) {
    throw new Error(`No country offers its brief in "${locale}": give one the language, or leave the language out.`);
  }
  return countries.map((c) => ({ country: c.id }));
}

// A country's brief pages, with the language in front where the address
// names one (English pages name none).
const BRIEF_PAGE = new RegExp(`^(?:/(${routing.locales.join("|")}))?/([^/]+)/(brief(?:/explore|/contracts)?)/?$`);

/**
 * Where a request for a country's brief page goes first, its link kept: to
 * English where the country does not offer the language, and to the
 * country's own id where the address spells it otherwise or uses an alias.
 * The pages are built only under those (`briefCountries`). Null: no detour.
 */
export function briefDetour(pathname: string, search: string): string | null {
  const match = BRIEF_PAGE.exec(pathname);
  const entry = match ? getCountry(match[2]) : undefined;
  if (!match || !entry || !entry.visible) return null;
  const [, locale, slug, page] = match;
  const english = locale ? briefInEnglish(entry, locale, page, linkParams(search)) : null;
  if (english) return english;
  return slug === entry.id ? null : `${locale ? `/${locale}` : ""}/${entry.id}/${page}${search}`;
}
