import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type {
  PairRating,
  PairRatingValue,
  RatingsFile,
} from "@/types";

/**
 * POST /api/ratings/[country]
 *
 * Persists a human rating for one policy-pair to
 * `python/output/{country}/_ratings.json`. Reads-merges-writes the file
 * so a write is idempotent per pair (last write wins for the same pair
 * key). The file lives alongside the model outputs it describes — same
 * persistence model as `_model_comparison.json` and `alignment.json`.
 *
 * Request body: { pairKey: string, rating: PairRating }
 * pairKey format: "{targetAId}::{targetBId}".
 *
 * Deployment assumption: Azure App Service (persistent `/home` mount). The
 * same on-disk write pattern is used by `src/app/api/analyze/route.ts`. This
 * route is NOT compatible with serverless platforms (Vercel, AWS Lambda)
 * whose filesystems are ephemeral and read-only.
 */

const PROJECT_ROOT = process.cwd();
const PYTHON_OUTPUT = join(PROJECT_ROOT, "python", "output");

// Matches the slug shape used everywhere else in the codebase. Prevents
// path traversal via the [country] URL segment.
const COUNTRY_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PAIR_KEY_RE = /^[A-Za-z0-9_.-]+::[A-Za-z0-9_.-]+$/;

const VALID_RATINGS: ReadonlySet<PairRatingValue> = new Set([
  "real",
  "thin",
  "skip",
]);

function ratingsPath(country: string): string {
  return join(PYTHON_OUTPUT, country, "_ratings.json");
}

function readRatingsFile(country: string): RatingsFile {
  const path = ratingsPath(country);
  if (!existsSync(path)) {
    return { country, version: 1, ratings: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as RatingsFile;
    if (!parsed.ratings || typeof parsed.ratings !== "object") {
      return { country, version: 1, ratings: {} };
    }
    return { country, version: 1, ratings: parsed.ratings };
  } catch {
    // Corrupt file = treat as empty, create fresh on next write. We don't
    // overwrite immediately because the caller might want to inspect the
    // corrupt file first.
    return { country, version: 1, ratings: {} };
  }
}

function validateRating(input: unknown): PairRating | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (typeof r.rating !== "string" || !VALID_RATINGS.has(r.rating as PairRatingValue)) {
    return null;
  }
  const note = typeof r.note === "string" ? r.note.slice(0, 2000) : "";
  const ts = typeof r.ts === "number" && Number.isFinite(r.ts) ? r.ts : Date.now();
  return {
    rating: r.rating as PairRatingValue,
    note,
    ts,
  };
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
  const countryDir = join(PYTHON_OUTPUT, country);
  if (!existsSync(countryDir)) {
    return NextResponse.json(
      { error: `no output directory for country '${country}'` },
      { status: 404 },
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
      { error: "invalid rating (must be {rating: 'real'|'thin'|'skip', note: string, ts: number})" },
      { status: 400 },
    );
  }

  const file = readRatingsFile(country);
  file.ratings[pairKey] = rating;
  writeFileSync(ratingsPath(country), JSON.stringify(file, null, 2));

  return NextResponse.json({ ok: true, rating });
}
