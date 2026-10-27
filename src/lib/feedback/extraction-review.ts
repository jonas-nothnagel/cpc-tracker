import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";

import {
  EXTRACTION_REVIEW_SCHEMA,
  EXTRACTION_REVIEW_TEXT_MAX,
  type ExtractionReviewEvent,
  type ExtractionReviewItemOutcome,
  type ExtractionReviewPostBody,
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

const MAX_ITEMS = 300;
const ACTIONS = new Set(["kept", "edited", "removed", "added"]);

function clip(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return value.slice(0, EXTRACTION_REVIEW_TEXT_MAX);
}

/** Check a review event from the page and append it: the reviewer's
 *  corrections are the extractor's learning signal. */
export function recordExtractionReview(
  body: ExtractionReviewPostBody,
): { ok: true } | { ok: false; reason: string } {
  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray(body.items) ||
    body.items.length > MAX_ITEMS ||
    (body.outcome !== "accepted" && body.outcome !== "discarded") ||
    typeof body.clientId !== "string"
  ) {
    return { ok: false, reason: "invalid payload" };
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

  return result;
}
