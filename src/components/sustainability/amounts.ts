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
    day: (ts: string) =>
      mn
        ? mongolianDate(new Date(ts))
        : format.dateTime(new Date(ts), {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }),
    /** "June 2026", from "YYYY-MM" */
    month: (month: string) =>
      mn
        ? mongolianDate(new Date(`${month}-01T00:00:00Z`), { day: false })
        : format.dateTime(new Date(`${month}-01T00:00:00Z`), {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }),
    /** "Jun", for the start of a month in milliseconds */
    monthShort: (ms: number) =>
      mn
        ? mongolianDate(new Date(ms), { day: false, year: false })
        : format.dateTime(new Date(ms), { month: "short", timeZone: "UTC" }),
    /** "June 2" or "June 2, 2026", from "YYYY-MM-DD" */
    date: (day: string, withYear = true) =>
      mn
        ? mongolianDate(new Date(`${day}T00:00:00Z`), { year: withYear })
        : format.dateTime(new Date(`${day}T00:00:00Z`), {
            day: "numeric",
            month: "long",
            ...(withYear ? { year: "numeric" as const } : {}),
            timeZone: "UTC",
          }),
  };
}
