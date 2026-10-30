/**
 * One national target's entry in the country's 7th National Report, for the
 * row the brief opens. The report's text stays on the server; this ships one
 * target at a time, for a registered country. Unknown countries and malformed
 * target ids are rejected before any file access.
 */

import { NextRequest, NextResponse } from "next/server";
import { nr7Detail } from "@/lib/brief/nr7-detail";
import { briefPayload } from "@/lib/brief/payload";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const wanted = params.get("locale") ?? routing.defaultLocale;
  const locale = (routing.locales as readonly string[]).includes(wanted) ? wanted : routing.defaultLocale;
  const id = params.get("id") ?? "";
  if (!/^NT\d{1,3}$/.test(id)) return NextResponse.json({ error: "Unknown national target" }, { status: 400 });
  const payload = briefPayload({ country: params.get("country"), analysis: null }, locale);
  if (payload.kind !== "ok") {
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }
  const detail = nr7Detail(payload.data, id, locale);
  if (!detail) return NextResponse.json({ error: "Unknown national target" }, { status: 404 });
  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}
