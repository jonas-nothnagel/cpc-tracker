/**
 * One comparison with both commitments, for the coherence brief's drill-downs.
 * The brief ships only compact ratings to the browser; the AI reading and the
 * full commitment records load here on demand. Unknown countries are rejected
 * by the registry before any file access.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { findPair } from "@/lib/brief/pair";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const entry = getCountry((params.get("country") ?? "").toLowerCase());
  if (!entry || !entry.visible) {
    return NextResponse.json({ error: "Unknown country" }, { status: 404 });
  }
  const wanted = params.get("locale") ?? routing.defaultLocale;
  const locale = (routing.locales as readonly string[]).includes(wanted)
    ? wanted
    : routing.defaultLocale;
  const result = getCountryDashboardPayload(entry.id, locale, null);
  if (result.kind !== "ok") {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const found = findPair(
    result.payload.data as unknown as Record<string, unknown>,
    params.get("a") ?? "",
    params.get("b") ?? "",
    locale,
  );
  if (!found) return NextResponse.json({ error: "Unknown comparison" }, { status: 404 });
  return NextResponse.json(found, { headers: { "Cache-Control": "no-store" } });
}
