/**
 * The brief's insight sentences share one reading: how few units, largest
 * first, between them hold at least half of what is counted ("72% of the 225
 * targets fall in 3 of the 9 thematic areas"). The overview's misalignment
 * line reads targets this way; the thematic areas and the reviewed spending
 * read areas and pairs of areas. The sentences themselves are fixed message
 * strings: nothing here is generated.
 */

/** With fewer units than this to choose from, or fewer things counted, a
 *  sentence says nothing and the section's title stands alone. */
export const INSIGHT_MIN_UNITS = 3;

/** The fewest of `counts` (largest first, as given) that together hold at
 *  least half of `of`, and what they hold; null when they never do. `of` may
 *  count more than the units hold (target pairs outside every area). */
export function fewestToHalf(counts: readonly number[], of: number): { units: number; count: number } | null {
  if (!(of > 0)) return null;
  let count = 0;
  for (let i = 0; i < counts.length; i++) {
    count += counts[i];
    if (count * 2 >= of) return { units: i + 1, count };
  }
  return null;
}

/** How few units hold half of what is counted, for a sentence: null with
 *  fewer than INSIGHT_MIN_UNITS units or things counted, when the units never
 *  reach half, or when it takes every unit holding any (none stands out). */
export function insightHalf(counts: readonly number[], of: number): { units: number; count: number } | null {
  if (counts.length < INSIGHT_MIN_UNITS || of < INSIGHT_MIN_UNITS) return null;
  const sorted = [...counts].sort((x, y) => y - x);
  const half = fewestToHalf(sorted, of);
  const holding = sorted.filter((c) => c > 0).length;
  return half && half.units < holding ? half : null;
}
