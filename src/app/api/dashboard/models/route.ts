/**
 * Lists the per-model output subdirs available for a country.
 *
 * Used by the dashboard to render the model selector when more than one model
 * has been run. Returns an empty list (and 200) for countries whose layout is
 * still flat — clients treat that as "no selector".
 */

import { NextRequest, NextResponse } from "next/server";
import { getCountry, isValidCountryId } from "@/config/countries";
import { listAvailableModels } from "@/lib/dashboard-data";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country")?.toLowerCase() ?? null;
  if (!country) {
    return NextResponse.json({ error: "Missing country param" }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (!isValidCountryId(country)) {
    return NextResponse.json({ error: "Invalid country format" }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const entry = getCountry(country);
  if (!entry) {
    return NextResponse.json({ error: "Country not in registry" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const models = listAvailableModels(entry.id);
  return NextResponse.json({
    country: entry.id,
    models,
    defaultModel: models[0] ?? null,
  });
}
