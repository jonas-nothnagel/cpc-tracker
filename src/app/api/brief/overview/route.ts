/**
 * The figures a country's brief opens with, for the landing's preview: its
 * standard documents, their targets and how every target pair reads. A few
 * numbers instead of the payload. They do not depend on the language, so
 * they are read from the default locale's payload, and remembered for as
 * long as that payload is cached. Unknown countries are rejected by the
 * registry before any file access.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCountry } from "@/config/countries";
import { getCountryDashboardPayload, type CountryPayload } from "@/lib/dashboard-data";
import { buildBriefSource } from "@/lib/brief/source";
import { briefOverview, type BriefOverview } from "@/lib/brief/overview";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

const overviews = new WeakMap<CountryPayload, BriefOverview>();

export async function GET(request: NextRequest) {
  const entry = getCountry((request.nextUrl.searchParams.get("country") ?? "").toLowerCase());
  if (!entry || !entry.visible) {
    return NextResponse.json({ error: "Unknown country" }, { status: 404 });
  }
  const locale = routing.defaultLocale;
  const result = getCountryDashboardPayload(entry.id, locale, null);
  if (result.kind !== "ok") {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  let overview = overviews.get(result.payload);
  if (!overview) {
    const data = result.payload.data as unknown as Record<string, unknown>;
    overview = briefOverview(buildBriefSource({ countryId: entry.id, countryName: entry.name, data, locale }));
    overviews.set(result.payload, overview);
  }
  return NextResponse.json(overview, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400" },
  });
}
