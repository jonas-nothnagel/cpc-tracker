import { pairCount } from "./documents";
import type { Draft } from "./types";

/** A draft's figures as the builder column and the start show them. */
export interface DraftCounts {
  /** Kept targets of the documents that are read. */
  targets: number;
  /** BTR reported actions. */
  actions: number;
  /** What counts toward the limit of 150: targets and reported actions. */
  items: number;
  /** Target pairs from two different documents. */
  pairs: number;
  /** Documents with at least one kept target. */
  withTargets: number;
}

export function draftCounts(draft: Draft | null): DraftCounts {
  const kept = (draft?.documents ?? [])
    .filter((d) => d.state === "read")
    .map((d) => d.targets.filter((t) => !t.removed).length)
    .filter((n) => n > 0);
  const targets = kept.reduce((s, n) => s + n, 0);
  const actions = draft?.btr?.actions ?? 0;
  return { targets, actions, items: targets + actions, pairs: pairCount(kept), withTargets: kept.length };
}
