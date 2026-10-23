import { countryLocales, getCountry } from "@/config/countries";
import type { BriefSource } from "./source";

/** Where a brief's data lives: a registered country, or an uploaded analysis
 *  (which carries an empty country slug and its analysis id). */
export type BriefOrigin = Pick<BriefSource, "countryId" | "analysisId" | "languages">;

/** The query the brief's routes read: the analysis by its id, else the
 *  country by its slug, followed by the request's own parameters. */
export function briefQuery(origin: BriefOrigin, params: Record<string, string>): URLSearchParams {
  const query = new URLSearchParams(
    origin.analysisId ? { analysis: origin.analysisId } : { country: origin.countryId },
  );
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  return query;
}

/** The brief in a language, the language always named: an address without
 *  one would reopen the reader's saved language. */
export function briefHref(origin: BriefOrigin, locale: string): string {
  return origin.analysisId ? `/${locale}/analysis/${origin.analysisId}` : `/${locale}/${origin.countryId}/brief`;
}

/** The same data in the previous dashboard, the language named as in `briefHref`. */
export function dashboardHref(origin: BriefOrigin, locale: string): string {
  return origin.analysisId
    ? `/${locale}/dashboard?analysisId=${origin.analysisId}`
    : `/${locale}/dashboard?country=${origin.countryId}`;
}

/** The brief's languages: English and the country's own, or for an upload,
 *  English and the language it was started in. */
export function briefLocales(origin: BriefOrigin): string[] {
  return origin.analysisId
    ? ["en", ...(origin.languages ?? []).filter((l) => l !== "en")]
    : countryLocales(getCountry(origin.countryId) ?? {});
}
