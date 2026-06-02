/**
 * GET /api/sustainability
 *
 * Reads the append-only footprint ledger and returns a rolled-up view (totals
 * plus by-model / component / region / day breakdowns) for the /sustainability
 * page. Dynamic + no-store: the ledger changes between requests (every pipeline
 * run and chat message appends to it).
 */

import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "node:zlib";

import { readLedger } from "@/lib/footprint/ledger";
import { rollUp } from "@/lib/footprint/rollup";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const acceptsGzip = (request.headers.get("accept-encoding") ?? "").includes(
    "gzip",
  );
  const rollup = rollUp(readLedger());
  const json = JSON.stringify(rollup);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Vary: "Accept-Encoding",
    "Cache-Control": "no-store",
  };

  if (acceptsGzip && json.length > 2048) {
    headers["Content-Encoding"] = "gzip";
    // A Uint8Array is a valid response body at runtime; the cast works around
    // the DOM BodyInit typings not accepting Node's Uint8Array cleanly.
    return new NextResponse(gzipSync(json) as unknown as BodyInit, {
      status: 200,
      headers,
    });
  }
  return new NextResponse(json, { status: 200, headers });
}
