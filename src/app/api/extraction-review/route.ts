import { NextRequest, NextResponse } from "next/server";

import {
  appendExtractionReviewEvent,
  countrySlug,
} from "@/lib/feedback/extraction-review";
import {
  EXTRACTION_REVIEW_TEXT_MAX,
  type ExtractionReviewItemOutcome,
  type ExtractionReviewPostBody,
} from "@/lib/feedback/types";

/**
 * POST /api/extraction-review
 *
 * Records the reviewer's corrections to an extraction run (kept / edited /
 * removed / added) in the append-only extraction-review ledger. Fire-and-
 * forget from the wizard: failures are logged server-side and reported in
 * the response, but the client never blocks the review flow on them.
 */

const MAX_ITEMS = 300;
const ACTIONS = new Set(["kept", "edited", "removed", "added"]);

function clip(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return value.slice(0, EXTRACTION_REVIEW_TEXT_MAX);
}

export async function POST(request: NextRequest) {
  let body: ExtractionReviewPostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid JSON" }, { status: 400 });
  }

  if (
    !Array.isArray(body.items) ||
    body.items.length > MAX_ITEMS ||
    (body.outcome !== "accepted" && body.outcome !== "discarded") ||
    typeof body.clientId !== "string"
  ) {
    return NextResponse.json({ ok: false, reason: "invalid payload" }, { status: 400 });
  }

  const items: ExtractionReviewItemOutcome[] = [];
  for (const item of body.items) {
    if (!item || !ACTIONS.has(item.action)) continue;
    items.push({
      action: item.action,
      label: (typeof item.label === "string" ? item.label : "").slice(0, 120),
      ...(clip(item.textBefore) !== undefined ? { textBefore: clip(item.textBefore) } : {}),
      ...(clip(item.textAfter) !== undefined ? { textAfter: clip(item.textAfter) } : {}),
      ...(typeof item.textCleanup === "string" ? { textCleanup: item.textCleanup.slice(0, 20) } : {}),
      ...(item.hadProvenanceFlag ? { hadProvenanceFlag: true } : {}),
    });
  }

  const result = appendExtractionReviewEvent({
    country: countrySlug(String(body.countryRaw ?? "")),
    countryRaw: String(body.countryRaw ?? "").slice(0, 120),
    fileName: String(body.fileName ?? "").slice(0, 200),
    docType: String(body.docType ?? "").slice(0, 40),
    outcome: body.outcome,
    counts: {
      extracted: Number(body.counts?.extracted ?? 0),
      kept: Number(body.counts?.kept ?? 0),
      edited: Number(body.counts?.edited ?? 0),
      removed: Number(body.counts?.removed ?? 0),
      added: Number(body.counts?.added ?? 0),
    },
    items,
    clientId: body.clientId.slice(0, 64),
    locale: String(body.locale ?? "en").slice(0, 8),
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
