// The brief's dates in each of its languages, and the lines a quote can show
// on the printed sheet.

/**
 * A date in Mongolian ("2026 оны 9-р сарын 23"), its month alone ("2026 оны
 * 9-р сар"), or either without the year ("9-р сарын 23", "9-р сар"), as CLDR
 * writes it with the short month name (what Node and Safari print). Spelled
 * here rather than by Intl: browsers without Mongolian date data, such as
 * Chrome, write the date in their own interface language, so the page the
 * browser draws would differ from the one the server sent.
 */
export function mongolianDate(
  date: Date,
  { day = true, year = true }: { day?: boolean; year?: boolean } = {},
): string {
  const month = date.getUTCMonth() + 1;
  const monthDay = day ? `${month}-р сарын ${date.getUTCDate()}` : `${month}-р сар`;
  return year ? `${date.getUTCFullYear()} оны ${monthDay}` : monthDay;
}

/**
 * A day as the brief writes it, from "2026-09-23" or a full timestamp: the
 * footer's date and a contract's dates. English follows UNDP style, day first
 * ("23 September 2026"); Mongolian is spelled by `mongolianDate`. A value that
 * is not a date is shown as it came, never as "NaN".
 */
export function briefDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (locale === "mn") return mongolianDate(date);
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

/** Whole lines of text that fit a height, at least one so the text never
 *  disappears, at most `max`. */
export function fitLines(available: number, lineHeight: number, max: number): number {
  if (!(lineHeight > 0)) return max;
  return Math.max(1, Math.min(max, Math.floor(available / lineHeight)));
}
