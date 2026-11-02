/**
 * The figures a country's brief opens with, for the landing's preview: its
 * standard documents, their targets and how every target pair reads. Read
 * when the landing is built, from the same payload the prerendered brief is
 * built from, so the two always agree and a visit costs the server nothing.
 * The figures do not depend on the language (the page formats them), so they
 * come from the default locale's payload.
 */

import { getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { routing } from "@/i18n/routing";
import { buildBriefSource } from "./source";
import { briefOverview, type BriefOverview } from "./overview";

/** A visible country's brief figures, or null when its data cannot be read. */
export function countryOverview(countryId: string): BriefOverview | null {
  const entry = getCountry(countryId);
  if (!entry || !entry.visible) return null;
  const locale = routing.defaultLocale;
  const result = getCountryDashboardPayload(entry.id, locale, null);
  if (result.kind !== "ok") return null;
  const data = result.payload.data as unknown as Record<string, unknown>;
  return briefOverview(buildBriefSource({ countryId: entry.id, countryName: entry.name, data, locale }));
}
