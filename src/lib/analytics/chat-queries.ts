import { appendFileSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";

import { analyticsDir, currentMonth } from "./paths";

/**
 * Chat-query ledger: the verbatim questions users ask the assistant,
 * captured SERVER-SIDE in the coherence-chat route (the text already
 * transits there; no client change, and the main events ledger keeps its
 * no-free-text whitelist).
 *
 * Privacy posture (see README.md): stored WITHOUT the visitor id, so
 * questions cannot be linked into a per-person profile — how often the chat
 * is used still comes from the anonymous chat_message_sent event. The chat
 * UI carries a disclosure line ("Questions are stored to improve the
 * tool"). Do-Not-Track requests are skipped via the DNT header, and
 * NEXT_PUBLIC_ANALYTICS_DISABLED=1 disables capture server-side too.
 *
 * Monthly files (chat-queries-YYYY-MM.jsonl) beside the events ledger;
 * same single-instance append caveat as store.ts. Best-effort: failures
 * never affect the chat. REMOVABLE SYSTEM: see README.md.
 */

export const CHAT_QUERY_SCHEMA = 1;
export const CHAT_QUERY_MAX_CHARS = 2000;

export interface ChatQueryRow {
  schema: number;
  /** "YYYY-MM-DDTHH:MM:SSZ" (same format as the other ledgers). */
  ts: string;
  /** Verbatim user question, truncated to CHAT_QUERY_MAX_CHARS. */
  query: string;
  /** Country context of the dashboard the question was asked on. */
  country: string | null;
}

const MONTH_SEGMENT = /^\d{4}-\d{2}$/;

export function chatQueriesPath(month: string): string {
  if (!MONTH_SEGMENT.test(month)) {
    throw new Error(`chatQueriesPath: invalid month ${JSON.stringify(month)}`);
  }
  return join(analyticsDir(), `chat-queries-${month}.jsonl`);
}

/**
 * Record one chat question. `dntHeader` is the raw DNT request header;
 * "1" means the user opted out and nothing is stored.
 */
export function appendChatQuery(
  query: string,
  country: string | null,
  dntHeader: string | null,
): void {
  if (process.env.NEXT_PUBLIC_ANALYTICS_DISABLED === "1") return;
  if (dntHeader === "1") return;
  const trimmed = query.trim();
  if (!trimmed) return;
  const row: ChatQueryRow = {
    schema: CHAT_QUERY_SCHEMA,
    ts: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    query: trimmed.slice(0, CHAT_QUERY_MAX_CHARS),
    country:
      country && /^[a-z][a-z0-9-]{1,30}$/.test(country.toLowerCase())
        ? country.toLowerCase()
        : null,
  };
  try {
    const path = chatQueriesPath(currentMonth());
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(row) + "\n", { flag: "a" });
  } catch (err) {
    console.warn(
      "chat-query ledger append skipped:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Read chat questions for the given months, newest first. Missing months
 * and malformed lines are skipped.
 */
export function readChatQueries(months: string[]): ChatQueryRow[] {
  const rows: ChatQueryRow[] = [];
  for (const month of months) {
    let raw: string;
    try {
      raw = readFileSync(chatQueriesPath(month), "utf-8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as ChatQueryRow;
        if (typeof row.schema === "number" && typeof row.query === "string") {
          rows.push(row);
        }
      } catch {
        // Skip malformed line.
      }
    }
  }
  return rows.reverse();
}

/** Months that have a chat-query file, ascending. */
export function listChatQueryMonths(): string[] {
  let names: string[];
  try {
    names = readdirSync(analyticsDir());
  } catch {
    return [];
  }
  return names
    .map((n) => /^chat-queries-(\d{4}-\d{2})\.jsonl$/.exec(n)?.[1])
    .filter((m): m is string => Boolean(m))
    .sort();
}
