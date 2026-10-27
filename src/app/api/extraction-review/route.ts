import { NextRequest, NextResponse } from "next/server";

import { recordExtractionReview } from "@/lib/feedback/extraction-review";
import type { ExtractionReviewPostBody } from "@/lib/feedback/types";

/**
 * POST /api/extraction-review
 *
 * Records the reviewer's corrections to an extraction run (kept / edited /
 * removed / added) in the append-only extraction-review ledger. Fire-and-
 * forget from the wizard: failures are logged server-side and reported in
 * the response, but the client never blocks the review flow on them.
 */

export async function POST(request: NextRequest) {
  let body: ExtractionReviewPostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid JSON" }, { status: 400 });
  }

  const result = recordExtractionReview(body);
  if (!result.ok && result.reason === "invalid payload") {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
