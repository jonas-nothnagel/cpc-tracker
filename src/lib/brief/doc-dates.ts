import { briefMonth } from "./sheet";

// When each document came out, for the brief's year views: reviewed spending
// and public contracts by year. The date is `publishedOn` in the country's
// config, entered by hand from the free-text `published` beside it, as a year
// ("2016") or a year and a month ("2024-12"). A document whose config states
// no date is never placed under a year.

/** A document's date: its year, and its month where the config states one. */
export interface DocDate {
  year: number;
  month: number | null;
}

const DOC_DATE = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/;

/** `publishedOn` as a date, or null for anything else (free text, a period,
 *  a full day): the brief never reads a date out of a value it does not know. */
export function parseDocDate(value: unknown): DocDate | null {
  const match = typeof value === "string" ? DOC_DATE.exec(value) : null;
  return match ? { year: Number(match[1]), month: match[2] ? Number(match[2]) : null } : null;
}

/** The documents of a year view, set against its charted years. */
export interface DocMarks<D> {
  /** The first and last charted year. */
  first: number;
  last: number;
  /** Every document with a date, earliest first. */
  dated: D[];
  /** Documents under the charted year they came out in: within a year by
   *  month (a year alone first), then in the brief's own order. */
  byYear: Map<number, D[]>;
  /** Came out before the first charted year, or after the last: earliest first. */
  before: D[];
  after: D[];
  /** Came out in a year the chart skips between two it holds. */
  between: D[];
  /** The config states no date. */
  undated: D[];
}

/**
 * Each document set against the charted years: under its own year, before
 * the first, after the last, or without a date. Null where there is nothing
 * to mark: no document states a date, or no year is charted.
 */
export function markDocuments<D extends { publishedOn?: string }>(
  docs: readonly D[],
  years: readonly (number | string)[],
): DocMarks<D> | null {
  const charted = years.map(Number).filter(Number.isFinite);
  const dated = docs
    .map((doc, order) => ({ doc, order, date: parseDocDate(doc.publishedOn) }))
    .filter((d): d is { doc: D; order: number; date: DocDate } => d.date !== null)
    .sort((a, b) => a.date.year - b.date.year || (a.date.month ?? 0) - (b.date.month ?? 0) || a.order - b.order);
  if (charted.length === 0 || dated.length === 0) return null;

  const first = Math.min(...charted);
  const last = Math.max(...charted);
  const held = new Set(charted);
  const marks: DocMarks<D> = {
    first,
    last,
    dated: dated.map((d) => d.doc),
    byYear: new Map(),
    before: [],
    after: [],
    between: [],
    undated: docs.filter((d) => parseDocDate(d.publishedOn) === null),
  };
  for (const { doc, date } of dated) {
    if (date.year < first) marks.before.push(doc);
    else if (date.year > last) marks.after.push(doc);
    else if (!held.has(date.year)) marks.between.push(doc);
    else marks.byYear.set(date.year, [...(marks.byYear.get(date.year) ?? []), doc]);
  }
  return marks;
}

/** The year a document came out, as a number; null without a date. */
export function docYear(publishedOn: string | undefined): number | null {
  return parseDocDate(publishedOn)?.year ?? null;
}

/** A document's date as the brief writes it: the year alone, or the month
 *  in the page's language ("December 2024", "2024 оны 12-р сар"). */
export function docDateLabel(publishedOn: string, locale: string): string {
  const date = parseDocDate(publishedOn);
  if (!date) return publishedOn;
  return date.month === null ? String(date.year) : briefMonth(publishedOn, locale);
}
