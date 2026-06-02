import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { dirname } from "path";

import { ledgerPath } from "./paths";
import { LEDGER_SCHEMA, type LedgerEvent } from "./types";

/**
 * Append one usage event to the shared ledger. Server-only (uses fs).
 *
 * Atomic: a single appendFileSync of a line below PIPE_BUF (4096 bytes) is
 * POSIX-atomic, so it never interleaves with the Python pipeline's appends.
 * Best-effort: on a read-only filesystem (e.g. Vercel) the write is skipped and
 * the caller is never affected.
 */
export function appendEvent(
  event: Omit<LedgerEvent, "schema" | "ts"> & { ts?: string },
): void {
  const row: LedgerEvent = {
    ...event,
    schema: LEDGER_SCHEMA,
    // Match the Python "YYYY-MM-DDTHH:MM:SSZ" format (drop sub-second precision).
    ts: event.ts ?? new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  };
  try {
    const path = ledgerPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(row) + "\n", { flag: "a" });
  } catch (err) {
    console.warn(
      "footprint ledger append skipped:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Read all ledger events. Returns [] if the ledger does not exist yet. Skips
 * malformed lines so a single bad row never breaks the dashboard.
 */
export function readLedger(): LedgerEvent[] {
  let raw: string;
  try {
    raw = readFileSync(ledgerPath(), "utf-8");
  } catch {
    return [];
  }
  const events: LedgerEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as LedgerEvent;
      if (typeof row.co2_geq === "number") events.push(row);
    } catch {
      // Skip malformed line.
    }
  }
  return events;
}
