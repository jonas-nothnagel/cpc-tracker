"use client";

import { useFormatter, useLocale } from "next-intl";

import { mongolianDate } from "@/lib/brief/sheet";
import type { FootprintMetrics } from "@/lib/footprint/types";
import { fractionDigits, scaleAmount, shareText, type AmountUnit } from "@/lib/footprint/units";

/** Amounts, shares and dates for the footprint page, in the page's locale
 *  (never the machine's). Ledger timestamps are UTC, and so are the dates.
 *  Mongolian dates are spelled by `mongolianDate`: browsers without Mongolian
 *  date data would write them in their own interface language. */
export function useAmounts() {
  const format = useFormatter();
  const mn = useLocale() === "mn";
  const number = (value: number, digits = 0) =>
    format.number(value, { maximumFractionDigits: digits });
  const amount = (
    value: number,
    metric: keyof FootprintMetrics,
  ): { value: string; unit: AmountUnit } => {
    const scaled = scaleAmount(value, metric);
    return { value: number(scaled.value, fractionDigits(scaled.value)), unit: scaled.unit };
  };
  /** A date with the parts asked for, in UTC. */
  const when = (d: Date, parts: Pick<Intl.DateTimeFormatOptions, "day" | "month" | "year">) =>
    mn
      ? mongolianDate(d, { day: parts.day !== undefined, year: parts.year !== undefined })
      : format.dateTime(d, { ...parts, timeZone: "UTC" });
  /** "June 2" or "June 2, 2026", from "YYYY-MM-DD" */
  const date = (day: string, withYear = true) =>
    when(new Date(`${day}T00:00:00Z`), {
      day: "numeric",
      month: "long",
      ...(withYear ? { year: "numeric" as const } : {}),
    });
  return {
    number,
    amount,
    /** "40.2 kg", "317 L", "1.3 g" */
    text: (value: number, metric: keyof FootprintMetrics) => {
      const a = amount(value, metric);
      return `${a.value} ${a.unit}`;
    },
    share: (value: number) =>
      shareText(value, (v, digits) =>
        format.number(v, { style: "percent", maximumFractionDigits: digits }),
      ),
    /** "Jun 26, 2026" */
    day: (ts: string) => when(new Date(ts), { day: "numeric", month: "short", year: "numeric" }),
    /** "Jun", for the start of a month in milliseconds */
    monthShort: (ms: number) => when(new Date(ms), { month: "short" }),
    date,
    /** Two different days, from "YYYY-MM-DD", for the "span" message. Within
     *  one year the year is named once, where the language writes it: on the
     *  end in English and Spanish ("June 2 to October 27, 2026"), on the start
     *  in Mongolian, which writes the year first. */
    spanDates: (from: string, to: string) => {
      const sameYear = from.slice(0, 4) === to.slice(0, 4);
      return mn
        ? { from: date(from), to: date(to, !sameYear) }
        : { from: date(from, !sameYear), to: date(to) };
    },
  };
}
