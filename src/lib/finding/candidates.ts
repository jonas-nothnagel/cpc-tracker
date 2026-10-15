import { anchorKeyOf } from "@/lib/feedback/anchor";
import { isContradiction } from "@/types";
import type { AlignmentResult, Target } from "@/types";

export interface FindingCandidate {
  pairKey: string;
  pair: AlignmentResult;
  targetA: Target;
  targetB: Target;
  /** How many models flag this pair; present only when consensus counts were given. */
  modelsFlagging?: number;
}

export interface CandidateOptions {
  /** pairKey -> number of models flagging (multi-model countries only). */
  consensusCounts?: Record<string, number>;
}

/** Reported-measure pseudo-targets; excluded so the shortlist stays policy-to-policy. */
const PSEUDO_DOCUMENTS = new Set(["BTR", "BER"]);

// Ranking is lexicographic over enums the pipeline already carries; no
// composite score, no invented weights. Missing values sort last.
const CONFIDENCE_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const MANAGEABILITY_RANK: Record<string, number> = { fundamental: 0, manageable: 1 };
const MECHANISM_RANK: Record<string, number> = {
  goal_conflict: 0,
  resource_competition: 1,
  delivery_friction: 2,
};

function rank(table: Record<string, number>, value: string | undefined, missing: number): number {
  return value !== undefined && value in table ? table[value] : missing;
}

/**
 * The shortlist behind /{country}/findings: flagged pairs across two policy
 * documents, ordered by (models flagging desc, confidence, manageability,
 * mechanism, pairKey). The data narrows; a human chooses.
 */
export function selectFindingCandidates(
  alignment: unknown[],
  targets: unknown[],
  opts?: CandidateOptions,
): FindingCandidate[] {
  const byId = new Map<string, Target>();
  for (const t of (Array.isArray(targets) ? targets : []) as Target[]) {
    if (t && typeof t.id === "string") byId.set(t.id, t);
  }

  const counts = opts?.consensusCounts;
  const candidates: FindingCandidate[] = [];
  for (const r of (Array.isArray(alignment) ? alignment : []) as AlignmentResult[]) {
    if (!r || !isContradiction(r.alignment)) continue;
    const targetA = byId.get(r.targetAId);
    const targetB = byId.get(r.targetBId);
    if (!targetA || !targetB) continue;
    if (targetA.sourceDocument === targetB.sourceDocument) continue;
    if (
      PSEUDO_DOCUMENTS.has(targetA.sourceDocument) ||
      PSEUDO_DOCUMENTS.has(targetB.sourceDocument)
    )
      continue;
    const pairKey = anchorKeyOf([r.targetAId, r.targetBId]);
    candidates.push({
      pairKey,
      pair: r,
      targetA,
      targetB,
      ...(counts ? { modelsFlagging: counts[pairKey] ?? 1 } : {}),
    });
  }

  candidates.sort((a, b) => {
    const consensus = (b.modelsFlagging ?? 0) - (a.modelsFlagging ?? 0);
    if (consensus !== 0) return consensus;
    const confidence =
      rank(CONFIDENCE_RANK, a.pair.confidence, 3) -
      rank(CONFIDENCE_RANK, b.pair.confidence, 3);
    if (confidence !== 0) return confidence;
    const manageability =
      rank(MANAGEABILITY_RANK, a.pair.manageability, 1) -
      rank(MANAGEABILITY_RANK, b.pair.manageability, 1);
    if (manageability !== 0) return manageability;
    const mechanism =
      rank(MECHANISM_RANK, a.pair.mechanism, 3) -
      rank(MECHANISM_RANK, b.pair.mechanism, 3);
    if (mechanism !== 0) return mechanism;
    return a.pairKey < b.pairKey ? -1 : a.pairKey > b.pairKey ? 1 : 0;
  });

  return candidates;
}
