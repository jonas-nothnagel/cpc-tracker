import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { dirname } from "path";

import { feedbackPath } from "./paths";
import {
  FEEDBACK_SCHEMA,
  type FeedbackEvent,
  type FeedbackVote,
} from "./types";

/**
 * Append-only per-country feedback ledger. Server-only (uses fs).
 *
 * Mirrors the footprint ledger (src/lib/footprint/ledger.ts) with one
 * deliberate deviation: append failures are RETURNED, not swallowed, because
 * the voting UI must revert its optimistic state and tell the user (e.g. on
 * Vercel's read-only filesystem).
 *
 * Atomicity caveat: a worst-case event (2000-char multibyte comment plus
 * snapshot) can exceed the 4096-byte PIPE_BUF guarantee the footprint ledger
 * relies on. Today only the single Next.js process writes these files, and
 * appendFileSync on one fd is serialized within a process, so interleaving
 * requires App Service scale-out to multiple instances on the same CIFS
 * mount. Readers skip malformed lines, so the worst case is one lost event.
 * Revisit (cap sizes or lock) before enabling scale-out.
 */

const VOTES: ReadonlySet<FeedbackVote> = new Set(["up", "down", "retracted"]);

export function appendFeedbackEvent(
  event: Omit<FeedbackEvent, "schema" | "ts"> & { ts?: string },
): { ok: true } | { ok: false; reason: string } {
  const row: FeedbackEvent = {
    ...event,
    schema: FEEDBACK_SCHEMA,
    // Match the footprint ledger's "YYYY-MM-DDTHH:MM:SSZ" format.
    ts: event.ts ?? new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  };
  try {
    const path = feedbackPath(event.country);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(row) + "\n", { flag: "a" });
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("feedback ledger append failed:", reason);
    return { ok: false, reason };
  }
}

/**
 * Read all feedback events for one country. Returns [] if no ledger exists
 * yet. Skips malformed lines so a single bad row never breaks consumers.
 */
export function readFeedbackEvents(countryId: string): FeedbackEvent[] {
  let raw: string;
  try {
    raw = readFileSync(feedbackPath(countryId), "utf-8");
  } catch {
    return [];
  }
  const events: FeedbackEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as FeedbackEvent;
      if (typeof row.schema === "number" && VOTES.has(row.vote)) {
        events.push(row);
      }
    } catch {
      // Skip malformed line.
    }
  }
  return events;
}

/**
 * Fold events (in file order) to the current state per browser + surface +
 * anchor: the last event wins. A "retracted" winner means that browser holds
 * no active vote. Not used by the POST route; serves analysis and the future
 * golden-set export, which should also compare contentHash against current
 * pipeline output to separate live feedback from feedback on superseded text.
 */
export function foldFeedback(
  events: FeedbackEvent[],
): Map<string, FeedbackEvent> {
  const folded = new Map<string, FeedbackEvent>();
  for (const event of events) {
    folded.set(
      `${event.clientId}|${event.surface}|${event.anchorKey}`,
      event,
    );
  }
  return folded;
}
