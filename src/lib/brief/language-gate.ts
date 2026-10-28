import { countryLocaleFor, getCountry, listVisibleCountries, type CountryEntry } from "@/config/countries";
import { routing } from "@/i18n/routing";
import type { LinkParams } from "./link";

/** Whether a country's brief is offered in a language: in English and in the
 *  country's own languages. The pages built and the addresses sent on to
 *  English both follow it. */
function offers(entry: Pick<CountryEntry, "languages">, locale: string): boolean {
  return countryLocaleFor(entry, locale) === locale;
}

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
  searchParams: LinkParams,
): string | null {
  if (offers(entry, locale)) return null;
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
  return listVisibleCountries().filter((c) => offers(c, locale));
}

/** No country's id: the one page built for a language no country offers. */
const NO_COUNTRY = "_";

/**
 * The brief pages' `generateStaticParams`, per language. Where one language
 * yields no country, Next builds none of the route's pages, so every address
 * would answer not found (next/dist/build/static-paths/app.js). A language no
 * country offers (say its one country is hidden for a while) therefore
 * yields a placeholder, built as not found and never linked: the detour sends
 * its countries' addresses to English first.
 */
export function briefStaticParams(locale: string): { country: string }[] {
  const countries = briefCountries(locale);
  return countries.length > 0 ? countries.map((c) => ({ country: c.id })) : [{ country: NO_COUNTRY }];
}

// A country's brief and every page under it, with the language in front
// where the address names one (English pages name none).
const BRIEF_PAGE = new RegExp(`^(?:/(${routing.locales.join("|")}))?/([^/]+)/(brief(?:/[^/]+)*)/?$`);

/**
 * Where a request for a country's brief page goes first, its link kept as it
 * came: to English (`/en/`, as in `briefInEnglish`) where the country does
 * not offer the language, and to the country's own id where the address
 * spells it otherwise or uses an alias. The pages are built only under those
 * (`briefCountries`). Null: no detour.
 */
export function briefDetour(pathname: string, search: string): string | null {
  const match = BRIEF_PAGE.exec(pathname);
  const entry = match ? getCountry(match[2]) : undefined;
  if (!match || !entry || !entry.visible) return null;
  const [, locale, slug, page] = match;
  const lang = locale ? countryLocaleFor(entry, locale) : undefined;
  if (lang === locale && slug === entry.id) return null;
  return `${lang ? `/${lang}` : ""}/${entry.id}/${page}${search}`;
}
