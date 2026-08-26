/**
 * Ink budget for the explorer wheel's ambient ribbons.
 *
 * The wheel draws every edge in the current filter as its own path; the only
 * density control is how much ink each path carries. Before this helper the
 * count-aware ramp applied only to the default "strong + potential
 * misalignment" state, and the "potential misalignment only" state drew every
 * dashed red ribbon at a fixed 0.55 opacity / 2 px, which turned Sri Lanka's
 * 866 flagged pairs into a solid mass. Both states now share one rule: ink
 * falls linearly with the number of drawn edges between RAMP_START and
 * RAMP_END, with the flagged ramp starting higher because dashed strokes carry
 * less ink per pixel than solid ones.
 */

/**
 * `default` / `flagged`: the ambient web in the two filter states.
 * `focus` / `focusFlagged`: the edges that survive a group focus (a hovered
 * legend row or a focal arc). They start higher because the noise is gone,
 * but a document like an NDC can still touch hundreds of pairs, so they thin
 * on the same count ramp instead of staying at full ink.
 */
export type RibbonInkMode = "default" | "flagged" | "focus" | "focusFlagged";

export interface RibbonInk {
  opacity: number;
  strokeWidth: number;
}

/** Edge count at or below which a ribbon keeps its full presence. */
export const RAMP_START = 50;
/** Edge count at or above which a ribbon sits at its faintest. */
export const RAMP_END = 1000;
/** Ribbons that start wider than 1 px reach width 1 by this many edges. */
const WIDTH_RAMP_END = 400;

const RAMP: Record<RibbonInkMode, { opacityFrom: number; opacityTo: number; widthFrom: number }> = {
  default: { opacityFrom: 0.25, opacityTo: 0.03, widthFrom: 1 },
  flagged: { opacityFrom: 0.55, opacityTo: 0.08, widthFrom: 2 },
  focus: { opacityFrom: 0.55, opacityTo: 0.06, widthFrom: 1.2 },
  focusFlagged: { opacityFrom: 0.7, opacityTo: 0.1, widthFrom: 1.8 },
};

function lerpDown(from: number, to: number, count: number, start: number, end: number): number {
  if (count <= start) return from;
  if (count >= end) return to;
  const t = (count - start) / (end - start);
  return from - t * (from - to);
}

export function ambientRibbonInk(count: number, mode: RibbonInkMode): RibbonInk {
  const ramp = RAMP[mode];
  const opacity = lerpDown(ramp.opacityFrom, ramp.opacityTo, count, RAMP_START, RAMP_END);
  const strokeWidth = lerpDown(ramp.widthFrom, 1, count, RAMP_START, WIDTH_RAMP_END);
  return { opacity, strokeWidth };
}
