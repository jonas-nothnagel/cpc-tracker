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
 * Every flagged policy-to-policy pair, filed under its pair of documents
 * (`A~B`, the two ids in document order; the brief's pair-of-documents panel).
 * Within a pair of documents, strands through the target in the most of its
 * potential misalignments come first (then by the other target's count), so
 * the list opens on the targets its misalignment runs through.
 * Confidence, manageability and mechanism only break ties: nearly every flag
 * carries the same values. Cross-model consensus is not a key: comparison runs
 * exist for one country and lag its corpus.
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

  for (const list of grouped.values()) {
    const involved = new Map<string, number>();
    for (const c of list) {
      for (const id of [c.targetA.id, c.targetB.id]) {
        involved.set(id, (involved.get(id) ?? 0) + 1);
      }
    }
    const counts = (c: FindingCandidate) => {
      const a = involved.get(c.targetA.id) ?? 0;
      const b = involved.get(c.targetB.id) ?? 0;
      return a >= b ? [a, b] : [b, a];
    };
    // Stable sort: equal counts keep the candidates' confidence, manageability,
    // mechanism, key order.
    list.sort((x, y) => {
      const [xBusier, xOther] = counts(x);
      const [yBusier, yOther] = counts(y);
      return yBusier - xBusier || yOther - xOther;
    });
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
