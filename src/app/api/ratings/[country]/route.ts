import { NextRequest, NextResponse } from "next/server";
import { appendFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { PairRating, PairRatingValue } from "@/types";

/**
 * POST /api/ratings/[country]
 *
 * Appends one rating event to `python/output/ratings-ledger.jsonl`.
 * Event shape:
 *   { country, pairKey, rating, note, ts }
 *
 * Ledger over JSON-per-country: appends are atomic on POSIX for lines
 * under PIPE_BUF (4KB), so concurrent reviewers can't tear each other's
 * writes. Reads fold events → keep the latest per (country, pairKey) by
 * `ts`. Every change is a line in the ledger → full audit trail.
 *
 * Deploy: the ledger lives at the top of `python/output/`, so `start.sh`
 * preserves it by default (per-country resync only touches subdirectories).
 * A seed copy in the image is reconciled with the persistent-volume copy
 * via `python/scripts/merge_ledger.py` (same call shape as
 * `footprint-ledger.jsonl`) so live ratings survive image rebuilds.
 *
 * Deployment assumption: Azure App Service (persistent `/home` mount).
 * Serverless platforms (Vercel, AWS Lambda) have ephemeral filesystems
 * and are NOT compatible with this route.
 */

const PROJECT_ROOT = process.cwd();
const RATINGS_LEDGER = join(
  PROJECT_ROOT,
  "python",
  "output",
  "ratings-ledger.jsonl",
);

const COUNTRY_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PAIR_KEY_RE = /^[A-Za-z0-9_.-]+::[A-Za-z0-9_.-]+$/;

// The reviewer rates on the models' own alignment scale. Legacy events in
// the ledger use the retired "real" | "thin" | "skip" scheme; they are not
// accepted for new writes.
const VALID_RATINGS: ReadonlySet<PairRatingValue> = new Set([
  "none",
  "low",
  "medium",
  "high",
  "flagged",
]);

function validateRating(input: unknown): PairRating | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (typeof r.rating !== "string" || !VALID_RATINGS.has(r.rating as PairRatingValue)) {
    return null;
  }
  const note = typeof r.note === "string" ? r.note.slice(0, 2000) : "";
  const ts = typeof r.ts === "number" && Number.isFinite(r.ts) ? r.ts : Date.now();
  return { rating: r.rating as PairRatingValue, note, ts };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ country: string }> },
) {
  const { country } = await params;
  if (!COUNTRY_SLUG_RE.test(country)) {
    return NextResponse.json(
      { error: "invalid country slug" },
      { status: 400 },
    );
  }

  let body: { pairKey?: unknown; rating?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { pairKey, rating: ratingInput } = body;
  if (typeof pairKey !== "string" || !PAIR_KEY_RE.test(pairKey)) {
    return NextResponse.json(
      { error: "invalid or missing pairKey (expected '{aId}::{bId}')" },
      { status: 400 },
    );
  }
  const rating = validateRating(ratingInput);
  if (!rating) {
    return NextResponse.json(
      { error: "invalid rating (must be {rating: 'none'|'low'|'medium'|'high'|'flagged', note: string, ts: number})" },
      { status: 400 },
    );
  }

  // Ensure the output dir exists (fresh dev checkouts, first deploy). The
  // ledger file itself is created lazily by appendFileSync on first append.
  mkdirSync(dirname(RATINGS_LEDGER), { recursive: true });
  const event = { country, pairKey, ...rating };
  appendFileSync(RATINGS_LEDGER, JSON.stringify(event) + "\n");

  return NextResponse.json({ ok: true, rating });
}
