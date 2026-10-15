/**
 * Which step leads the field while the page scrolls. The contracts page's
 * steps run taller than the window (the map's places, the areas' table), so
 * the brief's rule, a step leads while it crosses the middle, changed the
 * picture while the end of the step before was still being read. Here a step
 * leads once its top has passed a line 30% down the window.
 */

export const LEAD_LINE = 0.3;

/** The last step whose top has passed the line; null before the first has. */
export function leadingStep<S extends string>(tops: readonly { step: S; top: number }[], line: number): S | null {
  let lead: S | null = null;
  for (const s of tops) if (s.top <= line) lead = s.step;
  return lead;
}
