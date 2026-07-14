import { NextResponse } from "next/server";

import { appendAnalyticsEvents } from "@/lib/analytics/store";
import { parseAnalyticsBatch } from "@/lib/analytics/validate";

/**
 * POST /api/analytics
 *
 * Ingests a batch of anonymous first-party usage events (page views, clicks,
 * named interactions) and appends them to the monthly ledger on the
 * persistent volume (src/lib/analytics/store.ts). Sent via sendBeacon, so
 * responses are bodyless and best-effort: storage failures still return 204
 * — telemetry must never surface errors to users. 400/413 only for
 * malformed or oversized input.
 *
 * REMOVABLE SYSTEM: see src/lib/analytics/README.md.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Batch cap is 32 KB client-side; leave headroom for encoding overhead. */
const MAX_BODY_BYTES = 65_536;

export async function POST(req: Request) {
  // Reject declared-oversize bodies before buffering; the post-read check
  // below stays as the fallback for chunked requests with no Content-Length.
  const declaredLength = Number(req.headers.get("content-length"));
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseAnalyticsBatch(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  appendAnalyticsEvents(parsed.events);
  return new NextResponse(null, { status: 204 });
}
