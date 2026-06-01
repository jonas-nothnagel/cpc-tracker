/**
 * Pure ribbon-width math for the coherence wheel, kept out of the React
 * component so the "truthful encoding" can be unit-tested and locked against
 * regression.
 *
 * The wheel draws one green base ribbon per document-pair carrying the whole
 * relationship, with a terracotta core on top whose width is the LINEAR flagged
 * share. Because the core is `baseWidth * flaggedShare` (not `sqrt`), the red
 * area on the wheel tracks the corpus flagged share (~13-15% for a typical
 * corpus) instead of the square-root-inflated ~50% the old per-side
 * `sqrt(count)` encoding produced for the same data.
 */

/** Narrow band: ribbon width is a gentle volume cue, not a focal variable. */
export const RIBBON_MIN_PX = 2.5;
export const RIBBON_MAX_PX = 22;
/** Hairline floor so a real low-share flag stays findable without distorting the gestalt. */
export const CORE_MIN_PX = 0.75;

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Per-corpus width multiplier. The widest relationship (by total scored
 * pair count) tops out at RIBBON_MAX_PX, so a 5-document corpus and a
 * 44k-pair corpus both fit the same wheel without hand-tuned constants.
 */
export function ribbonWidthScale(maxTotal: number): number {
  if (maxTotal <= 0) return 1;
  return Math.min(1, RIBBON_MAX_PX / Math.sqrt(maxTotal));
}

/** Green base ribbon width: gentle sqrt(volume), clamped to the band. */
export function ribbonBaseWidth(total: number, widthScale: number): number {
  if (total <= 0) return 0;
  return clamp(Math.sqrt(total) * widthScale, RIBBON_MIN_PX, RIBBON_MAX_PX);
}

/**
 * Terracotta core width: the LINEAR flagged share of the base ribbon, with a
 * hairline floor. A link that is 15% flagged shows a core 15% of the ribbon's
 * width, not the ~42% the square-root encoding produced.
 */
export function ribbonCoreWidth(baseWidth: number, flaggedShare: number): number {
  return Math.max(CORE_MIN_PX, baseWidth * flaggedShare);
}
