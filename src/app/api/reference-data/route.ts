/**
 * Serves the pre-loaded "reference data" (targets file) for a given country
 * from `python/data/{country}-targets.json`.
 *
 * Used by the upload wizard's "Add reference targets" step so the user can
 * drop in the UNDP-curated pilot data instead of re-typing it.
 *
 * Security: the country registry is the allowlist. Callers must use `?country=<id>`;
 * the id is lowercased, format-checked, and registry-looked-up BEFORE any
 * filesystem access. This is the same pattern as /api/dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { getCountry, isValidCountryId } from "@/config/countries";

const PYTHON_DATA = join(process.cwd(), "python", "data");
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/** Reduced target shape returned by this endpoint. Matches what the upload
 *  wizard's reference-data step needs — everything required to display and
 *  add the target, nothing more. Translation fields pass through in PR2. */
type ReferenceTarget = {
  id: string;
  text: string;
  sourceDocument: string;
  sourceLabel: string;
  country: string;
  activities?: string;
  actions?: string;
  textOriginal?: string;
  sourceLabelOriginal?: string;
};

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function jsonError(error: string, status: 400 | 404) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

export async function GET(request: NextRequest) {
  const rawCountry = request.nextUrl.searchParams.get("country");
  const countryLower = rawCountry?.toLowerCase() ?? null;

  if (!countryLower) {
    return jsonError("Missing country param", 400);
  }
  if (!isValidCountryId(countryLower)) {
    return jsonError("Invalid country format", 400);
  }
  const entry = getCountry(countryLower);
  if (!entry) {
    // 400, not 404 — registry miss is a security-gate rejection, not a
    // "file doesn't exist" report.
    return jsonError("Country not in registry", 400);
  }

  const filePath = join(PYTHON_DATA, `${entry.id}-targets.json`);
  const raw = readJson<Record<string, unknown>[]>(filePath);
  if (!raw) {
    return jsonError("Country targets file not found", 404);
  }

  const targets: ReferenceTarget[] = raw.map((t) => ({
    id: String(t.id),
    text: String(t.text),
    sourceDocument: String(t.sourceDocument),
    sourceLabel: String(t.sourceLabel),
    country: String(t.country ?? entry.name),
    activities: t.activities ? String(t.activities) : undefined,
    actions: t.actions ? String(t.actions) : undefined,
    textOriginal: t.textOriginal ? String(t.textOriginal) : undefined,
    sourceLabelOriginal: t.sourceLabelOriginal ? String(t.sourceLabelOriginal) : undefined,
  }));

  return NextResponse.json(targets, {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}
