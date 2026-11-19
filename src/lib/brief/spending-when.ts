import type { SpendingRecord } from "./spending";

// The reviewed spending set against one document's year: which charted years
// came before it, which after, and how much was spent on each side. A
// document's date is a year, sometimes with a month; the spending is by
// year. So the document's own year is neither before nor after it: its
// spending is stated apart, never split by a guess.

/** A charted year, as the document sees it. */
export type YearWhen = "before" | "at" | "after";

/** Reviewed spending summed over some of the charted years. */
export interface SpendingSum {
  /** How many charted years the sum covers: none, and there is no amount to state. */
  years: number;
  /** In the review's unit. */
  value: number;
  /** In whole US$, each year at its own rate; null where amounts are in US$. */
  usd: number | null;
  /** A year in the sum lacks a part of the budget, so the amount is a floor. */
  partial: boolean;
}

export interface SpendingAround {
  /** Each charted year against the document's year, in the chart's order. */
  when: YearWhen[];
  before: SpendingSum;
  /** The document's own year, where the record charts it. */
  at: SpendingSum;
  after: SpendingSum;
}

type Year = SpendingRecord["byYear"][number];

function sumOf(years: Year[]): SpendingSum {
  const held = years.flatMap((y) => y.parts.filter((p) => p.reviewed !== null));
  return {
    years: years.length,
    value: held.reduce((s, p) => s + (p.reviewed ?? 0), 0),
    usd: held.length > 0 && held.every((p) => p.usd !== null) ? held.reduce((s, p) => s + (p.usd ?? 0), 0) : null,
    partial: years.some((y) => !y.complete),
  };
}

/** The record's years before, in and after a document's year, with the
 *  reviewed spending their data hold on each side. */
export function spendingAround(record: SpendingRecord, year: number): SpendingAround {
  const when = record.byYear.map<YearWhen>((y) => (Number(y.year) < year ? "before" : Number(y.year) > year ? "after" : "at"));
  const side = (w: YearWhen) => sumOf(record.byYear.filter((_, i) => when[i] === w));
  return { when, before: side("before"), at: side("at"), after: side("after") };
}
