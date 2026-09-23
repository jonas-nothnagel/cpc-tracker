// Helpers for the printed sheet: its date and the lines a quote can show.

/**
 * The date on the brief's footer. English follows UNDP style, day first
 * ("23 September 2026"). Mongolian is spelled here rather than by Intl:
 * browsers without Mongolian date data fall back to English, and the server
 * and the browser would then print different dates.
 */
export function briefDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (locale === "mn") {
    return `${date.getUTCFullYear()} оны ${date.getUTCMonth() + 1}-р сарын ${date.getUTCDate()}`;
  }
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
