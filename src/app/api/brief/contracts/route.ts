/**
 * One public contract's record for the contracts page: its published fields
 * and the AI's explanations against the targets. The page ships only the
 * compact record to the browser; this loads the rest on request. Unknown
 * countries are rejected by the registry before any file access, and ids are
 * checked for shape.
 */

import { NextResponse } from "next/server";
import { getCountry } from "@/config/countries";
import { loadContractRecord } from "@/lib/brief/contracts/load";

export const dynamic = "force-dynamic";

const ID = /^[0-9A-Za-z_-]{1,40}$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const entry = getCountry((params.get("country") ?? "").toLowerCase());
  if (!entry || !entry.visible) {
    return NextResponse.json({ error: "Unknown country" }, { status: 404 });
  }
  const id = params.get("contract") ?? "";
  const record = ID.test(id) ? loadContractRecord(entry.id, id) : null;
  if (!record) return NextResponse.json({ error: "Unknown contract" }, { status: 404 });
  return NextResponse.json(record, { headers: { "Cache-Control": "no-store" } });
}
