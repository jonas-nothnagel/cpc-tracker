"use client";

import { useFormatter } from "next-intl";

import type { FootprintMetrics } from "@/lib/footprint/types";
import { fractionDigits, scaleAmount, shareText, type AmountUnit } from "@/lib/footprint/units";

/** Amounts, shares and dates for the footprint page, in the page's locale
 *  (never the machine's). Ledger timestamps are UTC, and so are the dates. */
export function useAmounts() {
  const format = useFormatter();
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
      format.dateTime(new Date(ts), {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
    /** "June 2026", from "YYYY-MM" */
    month: (month: string) =>
      format.dateTime(new Date(`${month}-01T00:00:00Z`), {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    /** "Jun", for the start of a month in milliseconds */
    monthShort: (ms: number) =>
      format.dateTime(new Date(ms), { month: "short", timeZone: "UTC" }),
    /** "June 2" or "June 2, 2026", from "YYYY-MM-DD" */
    date: (day: string, withYear = true) =>
      format.dateTime(new Date(`${day}T00:00:00Z`), {
        day: "numeric",
        month: "long",
        ...(withYear ? { year: "numeric" as const } : {}),
        timeZone: "UTC",
      }),
  };
}
