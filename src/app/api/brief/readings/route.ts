/**
 * The first sentence of every AI reading of one target (or reported action,
 * or budget line), for the explorer's pointer: the verdict and its reason
 * without opening the pair. The brief keeps the readings on the server;
 * this ships one centre's worth at a time, for a registered country or a
 * completed upload (`analysis=`). Unknown countries and malformed analysis
 * ids are rejected before any file access.
 */

import { NextRequest, NextResponse } from "next/server";
import { readingsFor } from "@/lib/brief/pair";
import { briefPayload } from "@/lib/brief/payload";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const wanted = params.get("locale") ?? routing.defaultLocale;
  const locale = (routing.locales as readonly string[]).includes(wanted) ? wanted : routing.defaultLocale;
  const payload = briefPayload({ country: params.get("country"), analysis: params.get("analysis") }, locale);
  if (payload.kind !== "ok") {
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
  const readings = readingsFor(payload.data, params.get("id") ?? "");
  return NextResponse.json({ readings }, { headers: { "Cache-Control": "no-store" } });
}
