import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";

import {
  EXTRACTION_REVIEW_SCHEMA,
  type ExtractionReviewEvent,
} from "./types";

/**
 * Append-only extraction-review ledger. Server-only (uses fs).
 *
 * Same storage story as the vote ledger (paths.ts): lives under
 * CPC_LEDGER_DIR/feedback on the Azure persistent mount, repo-relative
 * python/output/feedback locally, excluded from git and the Docker image so
 * deploys can never wipe it. One file per country slug.
 */

const COUNTRY_SLUG_MAX = 32;

/** Slugify the wizard's free-text country into a safe path segment. */
export function countrySlug(raw: string): string {
  const slug = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, COUNTRY_SLUG_MAX);
  return slug || "unknown";
}

export function extractionReviewPath(countrySlugValue: string): string {
  const root = process.env.CPC_LEDGER_DIR;
  const base =
    root && root.length > 0 ? root : join(process.cwd(), "python", "output");
  return join(base, "feedback", `extraction-review-${countrySlugValue}.jsonl`);
}

export function appendExtractionReviewEvent(
  event: Omit<ExtractionReviewEvent, "schema" | "ts">,
): { ok: true } | { ok: false; reason: string } {
  const row: ExtractionReviewEvent = {
    ...event,
    schema: EXTRACTION_REVIEW_SCHEMA,
    ts: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  };
  try {
    const path = extractionReviewPath(event.country);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(row) + "\n", { flag: "a" });
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("extraction-review ledger append failed:", reason);
    return { ok: false, reason };
  }
}

/** Read all events for one country slug; [] when no ledger exists yet. */
export function readExtractionReviewEvents(
  countrySlugValue: string,
): ExtractionReviewEvent[] {
  let raw: string;
  try {
    raw = readFileSync(extractionReviewPath(countrySlugValue), "utf-8");
  } catch {
    return [];
  }
  const events: ExtractionReviewEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as ExtractionReviewEvent;
      if (typeof row.schema === "number" && Array.isArray(row.items)) {
        events.push(row);
      }
    } catch {
      // Skip malformed line.
    }
  }
  return events;
}
