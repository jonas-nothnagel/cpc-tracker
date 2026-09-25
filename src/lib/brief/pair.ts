import { normalizeTarget } from "@/lib/normalize-target";
import type { AlignmentLevel, AlignmentMechanism, AlignmentResult, Target } from "@/types";
import { firstSentence } from "./text";

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
  const pair = readingRows(data).find(
    (r) =>
      (r.targetAId === aId && r.targetBId === bId) || (r.targetAId === bId && r.targetBId === aId),
  );
  if (!pair) return null;
  // Budget lines are kept apart from the targets and reported actions.
  const targets = [
    ...((data.targets as Record<string, unknown>[] | undefined) ?? []),
    ...((data.budgetPseudoTargets as Record<string, unknown>[] | undefined) ?? []),
  ];
  const rawA = targets.find((t) => t.id === pair.targetAId);
  const rawB = targets.find((t) => t.id === pair.targetBId);
  if (!rawA || !rawB) return null;
  return {
    pair,
    targetA: normalizeTarget(rawA, locale),
    targetB: normalizeTarget(rawB, locale),
  };
}

/** Every stored reading: target pairs and reported actions (`alignment`),
 *  and budget lines (`budgetAlignment`). */
function readingRows(data: Record<string, unknown>): AlignmentResult[] {
  return [
    ...((data.alignment as AlignmentResult[] | undefined) ?? []),
    ...((data.budgetAlignment as AlignmentResult[] | undefined) ?? []),
  ];
}

export interface Reading {
  level: AlignmentLevel;
  mechanism?: AlignmentMechanism;
  /** The first sentence of the AI explanation. */
  first: string;
}

/**
 * The first sentence of the AI explanation of every reading of one target,
 * reported action or budget line, keyed by the other side's id: enough for
 * a pointer to show the verdict and its reason without opening the pair.
 */
export function readingsFor(data: Record<string, unknown>, id: string): Record<string, Reading> {
  const out: Record<string, Reading> = {};
  if (!id || id.length > MAX_ID_LENGTH) return out;
  for (const r of readingRows(data)) {
    const partner = r.targetAId === id ? r.targetBId : r.targetBId === id ? r.targetAId : null;
    if (!partner) continue;
    out[partner] = {
      level: r.alignment,
      ...(r.mechanism ? { mechanism: r.mechanism } : {}),
      first: firstSentence(r.description ?? "").first,
    };
  }
  return out;
}
