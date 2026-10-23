/**
 * One comparison with both commitments, for the coherence brief's drill-downs.
 * The brief ships only compact ratings to the browser; the AI reading and the
 * full commitment records load here on demand, for a registered country or a
 * completed upload (`analysis=`). A potential misalignment in a country with
 * a baked contract record also carries the contracts that serve both of its
 * targets. Unknown countries and malformed analysis ids are rejected before
 * any file access.
 */

import { NextRequest, NextResponse } from "next/server";
import { findPair } from "@/lib/brief/pair";
import { briefPayload } from "@/lib/brief/payload";
import { servingBoth } from "@/lib/brief/contracts/both";
import { loadContracts } from "@/lib/brief/contracts/load";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const wanted = params.get("locale") ?? routing.defaultLocale;
  const locale = (routing.locales as readonly string[]).includes(wanted)
    ? wanted
    : routing.defaultLocale;
  const payload = briefPayload({ country: params.get("country"), analysis: params.get("analysis") }, locale);
  if (payload.kind !== "ok") {
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
  const found = findPair(payload.data, params.get("a") ?? "", params.get("b") ?? "", locale);
  if (!found) return NextResponse.json({ error: "Unknown comparison" }, { status: 404 });
  const file = payload.countryId && found.pair.alignment === "flagged" ? loadContracts(payload.countryId) : null;
  const both = file ? servingBoth(file, found.pair.targetAId, found.pair.targetBId) : null;
  return NextResponse.json(both ? { ...found, both } : found, { headers: { "Cache-Control": "no-store" } });
}
