/**
 * The first sentence of every AI reading of one target (or reported action,
 * or budget line), for the explorer's pointer: the verdict and its reason
 * without opening the pair. The brief keeps the readings on the server;
 * this ships one centre's worth at a time. Unknown countries are rejected
 * by the registry before any file access.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { readingsFor } from "@/lib/brief/pair";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const entry = getCountry((params.get("country") ?? "").toLowerCase());
  if (!entry || !entry.visible) {
    return NextResponse.json({ error: "Unknown country" }, { status: 404 });
  }
  const wanted = params.get("locale") ?? routing.defaultLocale;
  const locale = (routing.locales as readonly string[]).includes(wanted) ? wanted : routing.defaultLocale;
  const result = getCountryDashboardPayload(entry.id, locale, null);
  if (result.kind !== "ok") {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const readings = readingsFor(result.payload.data as unknown as Record<string, unknown>, params.get("id") ?? "");
  return NextResponse.json({ readings }, { headers: { "Cache-Control": "no-store" } });
}
