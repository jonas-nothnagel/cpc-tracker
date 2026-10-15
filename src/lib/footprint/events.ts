import type { FootprintMetrics, LedgerEvent } from "./types";

/**
 * Events on the running total: the moments the footprint grew for a reason
 * worth naming (a model comparison, a translation batch, the procurement
 * screening). An event only describes; its figures always come from the
 * ledger rows it covers, so it can never add to the totals.
 */

export type Localized = Record<"en" | "es" | "mn", string>;

export interface FootprintEvent {
  id: string;
  /** First and last moment of the event, ISO timestamps (UTC), inclusive. */
  from: string;
  to: string;
  /** Rows of these countries only; null stands for work of no single
   *  country. Every country when absent. */
  countries?: (string | null)[];
  /** Rows whose run id starts with one of these only. Any run when absent. */
  runIds?: string[];
  title: Localized;
  detail: Localized;
  /** Where the event is documented (commit, pull request, handoff); not shown. */
  source: string;
}

/** The ledger rows an event covers. */
export function eventRows(event: FootprintEvent, ledger: LedgerEvent[]): LedgerEvent[] {
  return ledger.filter(
    (row) =>
      row.ts >= event.from &&
      row.ts <= event.to &&
      (!event.countries || event.countries.includes(row.country ?? null)) &&
      (!event.runIds || event.runIds.some((prefix) => row.run_id?.startsWith(prefix))),
  );
}

/** What an event amounts to in requests and in the chosen resource. */
export function eventFigures(rows: LedgerEvent[], metric: keyof FootprintMetrics) {
  let requests = 0;
  let amount = 0;
  let first = "";
  let last = "";
  for (const row of rows) {
    requests += row.call_count;
    amount += row[metric];
    if (!first || row.ts < first) first = row.ts;
    if (!last || row.ts > last) last = row.ts;
  }
  return { requests, amount, first, last };
}

export interface NumberedEvent {
  /** 1, 2, 3 ... in the order the events happened. */
  n: number;
  event: FootprintEvent;
  rows: LedgerEvent[];
}

/** The events that cover at least one row, numbered in the order they began. */
export function orderedEvents(events: FootprintEvent[], ledger: LedgerEvent[]): NumberedEvent[] {
  return events
    .map((event) => ({ event, rows: eventRows(event, ledger) }))
    .filter((e) => e.rows.length > 0)
    .sort((a, b) => eventFigures(a.rows, "co2_geq").first.localeCompare(eventFigures(b.rows, "co2_geq").first))
    .map((e, i) => ({ n: i + 1, ...e }));
}
