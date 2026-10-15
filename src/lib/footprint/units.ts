import type { FootprintMetrics } from "./types";

/** Each resource's base unit as the ledger stores it, and the unit a
 *  thousand of them make. */
const UNITS = {
  co2_geq: ["g", "kg"],
  energy_wh: ["Wh", "kWh"],
  water_ml: ["mL", "L"],
  minerals_ugsbeq: ["µg", "mg"],
} as const satisfies Record<keyof FootprintMetrics, readonly [string, string]>;

export type AmountUnit = (typeof UNITS)[keyof typeof UNITS][number];

/** An amount in the unit a reader expects: the larger unit from a
 *  thousand base units on ("40.2 kg", not "40,164 g"). */
export function scaleAmount(
  value: number,
  metric: keyof FootprintMetrics,
): { value: number; unit: AmountUnit } {
  const [base, large] = UNITS[metric];
  return value >= 1000 ? { value: value / 1000, unit: large } : { value, unit: base };
}

/** Fraction digits for about three significant figures ("317", "40.2",
 *  "1.3"); amounts under a tenth keep two, so they never read as zero. */
export function fractionDigits(value: number): number {
  const v = Math.abs(value);
  if (v >= 100) return 0;
  if (v >= 0.1) return 1;
  return 2;
}

/** A share as a percentage that never rounds a part up to the whole
 *  ("99.8%", ">99.9%") or down to nothing ("<1%"). `percent` formats a
 *  share with the given fraction digits in the page's locale. */
export function shareText(
  share: number,
  percent: (value: number, digits: number) => string,
): string {
  if (share > 0 && share < 0.005) return `<${percent(0.01, 0)}`;
  if (share >= 0.9995 && share < 1) return `>${percent(0.999, 1)}`;
  if (share >= 0.995 && share < 1) return percent(share, 1);
  return percent(share, 0);
}
