import { NextResponse } from "next/server";

import { appendFeedbackEvent } from "@/lib/feedback/store";
import { parseFeedbackBody } from "@/lib/feedback/validate";

/**
 * POST /api/feedback
 *
 * Records one anonymous feedback event (thumbs up/down, optional note) on an
 * AI-generated rationale or synthesis, appended to the per-country ledger on
 * the persistent volume (src/lib/feedback/store.ts).
 *
 * Deliberately POST-only: the UI restores a browser's own vote from its
 * localStorage mirror, and nothing in v1 reads the ledger over HTTP. A read
 * endpoint would expose aggregate vote counts, which we keep out of the UI
 * by design (own-vote-only visibility).
 *
 * On a read-only filesystem (e.g. the Vercel backup deployment) the append
 * fails and surfaces as 503 so the client can revert its optimistic state.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generous cap: max event is ~4.5 KB of fields; reject anything larger early. */
const MAX_BODY_BYTES = 32_768;

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

  const parsed = parseFeedbackBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = appendFeedbackEvent(parsed.event);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Feedback storage is not available on this deployment" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}
