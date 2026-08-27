import { NextResponse } from "next/server";

// Public, unauthenticated liveness probe (whitelisted in src/proxy.ts) so
// platform health checks are not blocked by the auth gate.
export function GET() {
  return NextResponse.json({ status: "ok" });
}
