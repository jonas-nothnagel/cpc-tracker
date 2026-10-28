// Helpers for the printed sheet: its date and the lines a quote can show.

/**
 * A date in Mongolian ("2026 оны 9-р сарын 23"), or its month alone ("2026
 * оны 9-р сар"), spelled here rather than by Intl: browsers without Mongolian
 * date data fall back to English, so the page the browser draws would differ
 * from the one the server sent, and the reader would get an English date.
 */
export function mongolianDate(date: Date, { day = true }: { day?: boolean } = {}): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return day ? `${year} оны ${month}-р сарын ${date.getUTCDate()}` : `${year} оны ${month}-р сар`;
}

/**
 * The date on the brief's footer. English follows UNDP style, day first
 * ("23 September 2026"); Mongolian is spelled by `mongolianDate`.
 */
export function briefDate(iso: string, locale: string): string {
  const date = new Date(iso);
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
