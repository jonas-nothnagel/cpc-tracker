/**
 * Serves pipeline output for the dashboard.
 *
 * Two addressing modes:
 *   - ?analysisId=xxx (upload flow) → reads python/analyses/{id}/   — never cached
 *   - ?country=<id>   (pilot flow)  → reads python/data/ + python/output/{id}/ — cached + gzipped
 *
 * Precedence: analysisId wins when both are present. Unknown or malformed
 * country params are rejected with 400 BEFORE any filesystem access — the
 * registry is the security gate against path traversal.
 *
 * The data assembly itself lives in `@/lib/dashboard-data` so it can also be
 * called server-side from the dashboard page (no client round trip). This route
 * adds transport concerns: gzip compression (the payload is ~10 MB raw, ~1.4 MB
 * gzipped) and cache headers.
 */

import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
import {
  derivePaths,
  assembleDashboardData,
  getCountryDashboardPayload,
} from "@/lib/dashboard-data";

// Re-exported for the path-derivation unit test, which imports it from here.
export { derivePaths } from "@/lib/dashboard-data";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
// Pilot-country data only changes on deploy (new container). A short browser TTL
// keeps it fresh after a redeploy while still avoiding re-fetches within a visit.
const COUNTRY_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";

/** Build a JSON response, sending the pre-gzipped buffer when the client
 *  accepts gzip and falling back to the raw string otherwise. */
function buildJsonResponse(json: string, gzip: Uint8Array | null, cacheControl: string): NextResponse {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Vary": "Accept-Encoding",
    "Cache-Control": cacheControl,
  };
  if (gzip) {
    headers["Content-Encoding"] = "gzip";
    // A Uint8Array is a valid response body at runtime; the cast works around the
    // DOM BodyInit typings not accepting Node's Uint8Array<ArrayBufferLike> cleanly.
    return new NextResponse(gzip as unknown as BodyInit, { status: 200, headers });
  }
  return new NextResponse(json, { status: 200, headers });
}

export async function GET(request: NextRequest) {
  const analysisId = request.nextUrl.searchParams.get("analysisId");
  const country = request.nextUrl.searchParams.get("country");
  const locale = request.nextUrl.searchParams.get("locale") ?? undefined;
  const acceptsGzip = (request.headers.get("accept-encoding") ?? "").includes("gzip");

  // Upload flow: per-analysis data is dynamic and may still be processing, so
  // it is never cached. analysisId wins over country when both are present.
  if (analysisId) {
    const result = derivePaths(analysisId, null);
    if (result.kind === "error") {
      return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE_HEADERS });
    }
    const assembled = assembleDashboardData(result.paths, "analysis", locale);
    if (assembled.kind === "error") {
      return NextResponse.json(
        { error: assembled.error, missing: assembled.missing },
        { status: assembled.status, headers: NO_STORE_HEADERS },
      );
    }
    const json = JSON.stringify(assembled.data);
    return buildJsonResponse(json, acceptsGzip ? gzipSync(json) : null, "no-store");
  }

  // Pilot flow: assembled once per container, then served from the cached
  // (and pre-gzipped) payload.
  const payloadResult = getCountryDashboardPayload(country ?? "", locale);
  if (payloadResult.kind === "error") {
    return NextResponse.json(
      payloadResult.missing
        ? { error: payloadResult.error, missing: payloadResult.missing }
        : { error: payloadResult.error },
      { status: payloadResult.status, headers: NO_STORE_HEADERS },
    );
  }
  const { json, gzip } = payloadResult.payload;
  return buildJsonResponse(json, acceptsGzip ? gzip : null, COUNTRY_CACHE_CONTROL);
}
