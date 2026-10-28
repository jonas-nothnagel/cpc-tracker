import { describe, expect, it } from "vitest";
import { mongolianNumbersAsEnglish } from "./mongolian-numbers";

// The forms the pages ask for: plain, one decimal, percent, whole numbers.
const OPTIONS: Intl.NumberFormatOptions[] = [
  {},
  { maximumFractionDigits: 1 },
  { minimumFractionDigits: 1, maximumFractionDigits: 1 },
  { style: "percent", maximumFractionDigits: 0 },
  { style: "percent", maximumFractionDigits: 1 },
  { maximumFractionDigits: 0 },
];
const NUMBERS = [0, 1, 1.5, 12.34, 999, 1000, 75312, 1234567.891, 0.005, 0.5, 48.8, 13404, -3.2];

/** A browser's Intl without Mongolian data: "mn" is not supported, and the
 *  locales each formatter was made for are kept. */
function browserWithoutMongolian() {
  const made: unknown[] = [];
  const withoutMn = <T extends typeof Intl.NumberFormat | typeof Intl.PluralRules>(Native: T) => {
    const Fake = function (locales?: string | string[], options?: object) {
      made.push(locales);
      return new (Native as unknown as new (l?: string | string[], o?: object) => object)(locales, options);
    } as unknown as T;
    Object.assign(Fake, { supportedLocalesOf: (l: string) => (l.startsWith("mn") ? [] : [l]) });
    Object.defineProperty(Fake, "prototype", { value: Native.prototype });
    return Fake;
  };
  const intl = { ...Intl, NumberFormat: withoutMn(Intl.NumberFormat), PluralRules: withoutMn(Intl.PluralRules) };
  return { intl: intl as typeof Intl, made };
}

describe("Mongolian numbers", () => {
  it("are written and pluralised exactly as English ones, in the server's own data", () => {
    for (const options of OPTIONS) {
      for (const n of NUMBERS) {
        expect(new Intl.NumberFormat("mn", options).format(n)).toBe(new Intl.NumberFormat("en", options).format(n));
      }
    }
    for (let n = 0; n <= 2000; n++) {
      expect(new Intl.PluralRules("mn").select(n)).toBe(new Intl.PluralRules("en").select(n));
    }
  });

  it("read as English where the browser has no Mongolian data, and nothing else changes", () => {
    const { intl, made } = browserWithoutMongolian();
    mongolianNumbersAsEnglish(intl);
    expect(new intl.NumberFormat("mn", { maximumFractionDigits: 1 }).format(75312.04)).toBe("75,312");
    // Without `new`, as Intl's own constructors allow, and for every way of naming Mongolian.
    expect(intl.NumberFormat("mn-MN").format(48.8)).toBe("48.8");
    expect(new intl.PluralRules(["mn"]).select(21)).toBe("other");
    new intl.NumberFormat("ru");
    new intl.NumberFormat(["es", "en"]);
    expect(made).toEqual(["en", "en", ["en"], "ru", ["es", "en"]]);
    expect(new intl.NumberFormat("mn")).toBeInstanceOf(intl.NumberFormat);
  });

  it("are left to the browser where it has Mongolian data, and set up only once", () => {
    const native = Intl.NumberFormat;
    mongolianNumbersAsEnglish(Intl);
    expect(Intl.NumberFormat).toBe(native);
    const { intl } = browserWithoutMongolian();
    mongolianNumbersAsEnglish(intl);
    const once = intl.NumberFormat;
    mongolianNumbersAsEnglish(intl);
    expect(intl.NumberFormat).toBe(once);
  });
});
