import { normalizeTarget } from "@/lib/normalize-target";
import type { AlignmentResult, Target } from "@/types";

/** Longest commitment id the endpoint will look up; real ids are short. */
const MAX_ID_LENGTH = 120;

export interface FoundPair {
  pair: AlignmentResult;
  targetA: Target;
  targetB: Target;
}

/**
 * One comparison with both commitments, for the brief's drill-downs. Found
 * whichever way round it is asked for, but returned in the stored order so
 * an AI reading that says "the first target" still points at `targetA`.
 */
export function findPair(
  data: Record<string, unknown>,
  aId: string,
  bId: string,
  locale: string,
): FoundPair | null {
  if (!aId || !bId || aId.length > MAX_ID_LENGTH || bId.length > MAX_ID_LENGTH) return null;
  const rows = (data.alignment as AlignmentResult[] | undefined) ?? [];
  const pair = rows.find(
    (r) =>
      (r.targetAId === aId && r.targetBId === bId) || (r.targetAId === bId && r.targetBId === aId),
  );
  if (!pair) return null;
  const targets = (data.targets as Record<string, unknown>[] | undefined) ?? [];
  const rawA = targets.find((t) => t.id === pair.targetAId);
  const rawB = targets.find((t) => t.id === pair.targetBId);
  if (!rawA || !rawB) return null;
  return {
    pair,
    targetA: normalizeTarget(rawA, locale),
    targetB: normalizeTarget(rawB, locale),
  };
}
