import { selectFindingCandidates, type FindingCandidate } from "@/lib/finding/candidates";
import type {
  AlignmentConfidence,
  AlignmentManageability,
  AlignmentMechanism,
  AlignmentResult,
} from "@/types";

export interface StrandSignalLabels {
  confidence: Record<AlignmentConfidence, string>;
  manageability: Record<AlignmentManageability, string>;
  mechanism: Record<AlignmentMechanism, string>;
}

/**
 * The pathway dive's strands: every flagged policy-to-policy pair, filed under
 * the key the canvas draws its pathway with (`computePulseModel`'s edge key)
 * and ranked within it by confidence, then manageability, then mechanism, the
 * order the production dashboard uses for every country. Cross-model consensus
 * is not a key: comparison runs exist for one country and lag its corpus.
 */
export function strandsByPathway(
  alignment: unknown[],
  targets: unknown[],
  docOrder: string[],
): Map<string, FindingCandidate[]> {
  const orderIdx = (d: string) => {
    const i = docOrder.indexOf(d);
    return i === -1 ? docOrder.length : i;
  };
  const grouped = new Map<string, FindingCandidate[]>();
  for (const c of selectFindingCandidates(alignment, targets)) {
    const da = c.targetA.sourceDocument;
    const db = c.targetB.sourceDocument;
    const [a, b] = orderIdx(da) <= orderIdx(db) ? [da, db] : [db, da];
    const key = `${a}~${b}`;
    const list = grouped.get(key);
    if (list) list.push(c);
    else grouped.set(key, [c]);
  }
  return grouped;
}

/** A strand's caption line: the pipeline's own confidence, manageability and
 *  mechanism labels, skipping any it did not return. */
export function strandSignals(pair: AlignmentResult, labels: StrandSignalLabels): string {
  return [
    pair.confidence ? labels.confidence[pair.confidence] : null,
    pair.manageability ? labels.manageability[pair.manageability] : null,
    pair.mechanism ? labels.mechanism[pair.mechanism] : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
