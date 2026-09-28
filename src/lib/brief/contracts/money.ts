/** Money as the page states it: tugrik in words of scale, with an indicative US$. */

export type MoneyUnit = "trillion" | "billion" | "million" | "none";

/** A sum split for display ("₮50.4 trillion", "₮802 billion", "₮24.8 billion"):
 *  at most one decimal, none from a hundred up. */
export function moneyParts(value: number): { amount: number; unit: MoneyUnit } {
  const abs = Math.abs(value);
  const [div, unit]: [number, MoneyUnit] =
    abs >= 1e12 ? [1e12, "trillion"] : abs >= 1e9 ? [1e9, "billion"] : abs >= 1e6 ? [1e6, "million"] : [1, "none"];
  const scaled = value / div;
  const f = unit === "none" || Math.abs(scaled) >= 100 ? 1 : 10;
  return { amount: Math.round(scaled * f) / f, unit };
}

export function toUsd(value: number, rate: number): number {
  return rate > 0 ? value / rate : 0;
}

/** A share as tugrik of every hundred, one decimal: 1.6 for 0.0159. */
export function per100(share: number): number {
  return Math.round(share * 1000) / 10;
}
