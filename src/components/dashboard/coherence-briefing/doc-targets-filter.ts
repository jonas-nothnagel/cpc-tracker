/**
 * Search and filter logic for the document target browser, kept out of the
 * component so it can be tested directly.
 *
 * The three filters are all data-derived: nothing here is a fixed list of
 * categories that may or may not apply to a country. A document whose targets
 * carry no deadlines simply reports zero for "time-bound", and the browser then
 * omits that control rather than offering a filter that can only empty the list.
 */

import { buildTargetHaystack, matchesTargetQuery } from "@/lib/text-search";
import type { Target } from "@/types";

export type DocTargetFilterId =
  | "quantitative"
  | "timeBound"
  | "inMisalignments";

export const DOC_TARGET_FILTER_IDS: readonly DocTargetFilterId[] = [
  "quantitative",
  "timeBound",
  "inMisalignments",
];

export type DocTargetFilterCounts = Record<DocTargetFilterId, number>;

/**
 * How many of this document's targets each filter would keep. Counts are
 * reported even when zero; hiding a control is a presentation decision the
 * browser makes, not something to bury here.
 *
 * "inMisalignments" counts targets, not pairs: one target involved in four
 * potentially misaligned pairs contributes one.
 */
export function countDocTargetFilters(
  targets: Target[],
  flaggedCountByTargetId: Map<string, number>,
): DocTargetFilterCounts {
  let quantitative = 0;
  let timeBound = 0;
  let inMisalignments = 0;
  for (const target of targets) {
    if (target.isQuantitative) quantitative += 1;
    if (target.isTimeBound) timeBound += 1;
    if ((flaggedCountByTargetId.get(target.id) ?? 0) > 0) inMisalignments += 1;
  }
  return { quantitative, timeBound, inMisalignments };
}

function passesFilters(
  target: Target,
  active: readonly DocTargetFilterId[],
  flaggedCountByTargetId: Map<string, number>,
): boolean {
  // Filters combine with AND: each one the reader turns on narrows further.
  for (const id of active) {
    if (id === "quantitative" && !target.isQuantitative) return false;
    if (id === "timeBound" && !target.isTimeBound) return false;
    if (
      id === "inMisalignments" &&
      (flaggedCountByTargetId.get(target.id) ?? 0) === 0
    ) {
      return false;
    }
  }
  return true;
}

/**
 * The targets to show, in the order they appear in the document. Order is never
 * changed: a reader scanning a policy expects its own numbering, and re-ranking
 * by relevance would quietly imply a judgement the tool has not made.
 *
 * `haystacks` is prepared once per document by the caller. Normalising 206
 * multi-sentence targets on every keystroke is the only part of this that is
 * expensive enough to notice.
 */
export function filterDocTargets({
  targets,
  query,
  activeFilters,
  flaggedCountByTargetId,
  haystacks,
}: {
  targets: Target[];
  query: string;
  activeFilters: readonly DocTargetFilterId[];
  flaggedCountByTargetId: Map<string, number>;
  haystacks: Map<string, string>;
}): Target[] {
  const trimmed = query.trim();
  if (trimmed === "" && activeFilters.length === 0) return targets;
  return targets.filter((target) => {
    if (!passesFilters(target, activeFilters, flaggedCountByTargetId)) {
      return false;
    }
    if (trimmed === "") return true;
    const haystack = haystacks.get(target.id) ?? buildTargetHaystack(target);
    return matchesTargetQuery(haystack, trimmed);
  });
}

/** Prepare the normalised text each target is searched against. */
export function buildDocTargetHaystacks(
  targets: Target[],
): Map<string, string> {
  return new Map(targets.map((t) => [t.id, buildTargetHaystack(t)]));
}
