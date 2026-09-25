"use client";

import { useFormatter } from "next-intl";

/**
 * The brief's two inks. Green = aligned; red = potential misalignment. Green
 * and red are NOT separable under protanopia (ΔE 3.6), so wherever both
 * appear, position, a text label, a dash or a texture carries the difference
 * as well; text itself always stays in ink.
 */
export const INK = {
  text: "#232e3d",
  muted: "#55606e",
  reinforce: "#2a7443",
  apart: "#d2432c",
  partial: "#cdd3c9",
  none: "#e9e9e6",
} as const;

/** Locale-aware number and percent formatting (never the machine locale). */
export function useNumbers() {
  const format = useFormatter();
  return {
    n: (value: number) => format.number(value),
    pct: (share: number) => {
      if (share > 0 && share < 0.005) {
        return `<${format.number(0.01, { style: "percent", maximumFractionDigits: 0 })}`;
      }
      return format.number(share, { style: "percent", maximumFractionDigits: 0 });
    },
  };
}

/** First `max` characters of a verbatim text, cut at a word boundary. */
export { clip } from "@/lib/brief/text";

/** A commitment as one readable line: its label, followed by the start of
 *  its verbatim text when the label is only a number. Clipped, never
 *  paraphrased. */
export { targetLine as commitmentLine } from "@/lib/brief/text";
