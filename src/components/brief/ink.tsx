"use client";

import { useFormatter } from "next-intl";

/**
 * The brief's two inks. Green = the commitments reinforce each other; red =
 * potential misalignment. Ramps are one hue each, validated as ordinal ramps
 * on white with the dataviz validator (monotone lightness, visible steps, the
 * light end clears 2:1). Green and red are NOT separable under protanopia
 * (ΔE 3.6), so wherever both appear, position, a text label or the red hatch
 * carries the difference as well; text itself always stays in ink.
 */
export const INK = {
  text: "#232e3d",
  muted: "#55606e",
  hairline: "#e5e7eb",
  desk: "#f7f7f7",
  paper: "#ffffff",
  reinforce: "#2a7443",
  apart: "#d2432c",
  apartTint: "#f7cfc7",
  partial: "#cdd3c9",
  none: "#e9e9e6",
  /** Four-step reinforcement ramp (map shading). */
  green: ["#84bc91", "#4a955f", "#2a7443", "#174f2c"],
  /** Five-step potential-misalignment ramp (map shading). */
  red: ["#f29583", "#e8664f", "#d2432c", "#a8301d", "#7a2213"],
  /** Three-step ramps for how much of a theme a document carries. */
  greenSteps: ["#84bc91", "#3f8a55", "#174f2c"],
  redSteps: ["#f29583", "#d2432c", "#7a2213"],
} as const;

/** CSS background for red marks drawn in HTML: tone-on-tone 45° hatch. */
export const RED_HATCH = `repeating-linear-gradient(45deg, ${INK.apart} 0 2px, ${INK.apartTint} 2px 4px)`;

/** SVG hatch for red marks; pass a document-unique id (React `useId`). */
export function HatchPattern({ id }: { id: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={4} height={4} patternTransform="rotate(45)">
      <rect width={4} height={4} fill={INK.apartTint} />
      <line x1={1} y1={0} x2={1} y2={4} stroke={INK.apart} strokeWidth={2} />
    </pattern>
  );
}

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
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}
