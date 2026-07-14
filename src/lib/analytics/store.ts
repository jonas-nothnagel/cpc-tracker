import { appendFileSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { dirname } from "path";

import { analyticsDir, analyticsPath, currentMonth } from "./paths";
import type { AnalyticsEvent, AnalyticsEventType } from "./types";

/**
 * Append-only monthly analytics ledger. Server-only (uses fs).
 *
 * Mirrors the footprint ledger (src/lib/footprint/ledger.ts): best-effort
 * writes — on a read-only filesystem (e.g. Vercel) the append is skipped
 * and the caller is never affected. Telemetry must never surface errors.
 *
 * Atomicity caveat (same as src/lib/feedback/store.ts): a batch of events
 * is written with ONE appendFileSync call, which a single process serializes
 * on one fd, but a large batch exceeds the 4096-byte PIPE_BUF guarantee.
 * Interleaving therefore requires App Service scale-out to multiple
 * instances on the same CIFS mount. Readers skip malformed lines, so the
 * worst case is a few lost events. Revisit before enabling scale-out.
 */

const EVENT_TYPES: ReadonlySet<AnalyticsEventType> = new Set([
  "page_view",
  "page_leave",
  "click",
  "track",
]);

/** Append fully validated + stamped rows to the current month's file. */
export function appendAnalyticsEvents(events: AnalyticsEvent[]): void {
  if (events.length === 0) return;
  try {
    const path = analyticsPath(currentMonth());
    mkdirSync(dirname(path), { recursive: true });
    const lines = events.map((e) => JSON.stringify(e) + "\n").join("");
    appendFileSync(path, lines, { flag: "a" });
  } catch (err) {
    console.warn(
      "analytics ledger append skipped:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Read events for the given months (oldest first within each file's order).
 * Missing months are skipped; malformed lines are skipped so a single bad
 * row never breaks the dashboard.
 */
export function readAnalyticsEvents(months: string[]): AnalyticsEvent[] {
  const events: AnalyticsEvent[] = [];
  for (const month of months) {
    let raw: string;
    try {
      raw = readFileSync(analyticsPath(month), "utf-8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as AnalyticsEvent;
        if (typeof row.schema === "number" && EVENT_TYPES.has(row.type)) {
          events.push(row);
        }
      } catch {
        // Skip malformed line.
      }
    }
  }
  return events;
}

/** Months that have a ledger file, ascending ("2026-05", "2026-06", ...). */
export function listAnalyticsMonths(): string[] {
  let names: string[];
  try {
    names = readdirSync(analyticsDir());
  } catch {
    return [];
  }
  return names
    .map((n) => /^events-(\d{4}-\d{2})\.jsonl$/.exec(n)?.[1])
    .filter((m): m is string => Boolean(m))
    .sort();
}
