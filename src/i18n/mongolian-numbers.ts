/**
 * Chrome and Edge ship no Mongolian number data. Asked for "mn", their Intl
 * falls back to the browser's own interface language: a Russian or German
 * Chrome writes "75 312" and "48,8" where the server wrote "75,312" and
 * "48.8". The page the browser draws then differs from the one the server
 * sent (React error #418), and the reader gets foreign separators.
 *
 * Mongolian writes numbers and picks plural forms exactly as English does
 * (CLDR; mongolian-numbers.test.ts checks this against the server's own
 * data). So where a browser lacks Mongolian, numbers and plurals asked for
 * in Mongolian are worked out in English: the same text the server wrote.
 * Dates are not: they are spelled by hand (lib/brief/sheet.ts).
 */

type Locales = string | readonly string[] | undefined;
type Constructor = { supportedLocalesOf(locales: string): string[] };

const MONGOLIAN = /^mn(?:-|$)/i;
const PATCHED = Symbol.for("cpc.mongolianNumbersAsEnglish");

function asEnglish(locales: Locales): Locales {
  if (locales === undefined) return locales;
  if (typeof locales === "string") return MONGOLIAN.test(locales) ? "en" : locales;
  return locales.map((l) => (MONGOLIAN.test(String(l)) ? "en" : l));
}

/** Where `intl` lacks Mongolian number or plural data, makes "mn" read as
 *  English for NumberFormat and PluralRules. Elsewhere, and on a second
 *  call, it changes nothing. */
export function mongolianNumbersAsEnglish(intl: typeof Intl = Intl): void {
  for (const name of ["NumberFormat", "PluralRules"] as const) {
    const Native = intl[name] as unknown as (new (locales?: Locales, options?: unknown) => object) &
      Constructor & { [PATCHED]?: true };
    if (Native[PATCHED] || Native.supportedLocalesOf("mn").length > 0) continue;
    // A plain function, so it works with and without `new`, as Intl's own do.
    const Patched = function (locales?: Locales, options?: unknown) {
      return new Native(asEnglish(locales), options);
    } as unknown as typeof Native;
    Object.setPrototypeOf(Patched, Native);
    Patched.prototype = Native.prototype;
    Object.defineProperty(Patched, PATCHED, { value: true });
    Object.defineProperty(intl, name, { value: Patched, writable: true, configurable: true });
  }
}
