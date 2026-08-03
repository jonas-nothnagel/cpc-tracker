import { isContradiction } from "@/types";
import type { AlignmentResult, Target } from "@/types";

export interface PulseDoc {
  id: string;
  targetCount: number;
}

export interface PulseEdge {
  /** Document ids, ordered by the supplied document order. */
  a: string;
  b: string;
  compared: number;
  flagged: number;
  /** Share of compared pairs at high/medium/low (a relationship exists). */
  alignedShare: number;
  /** Share of compared pairs marked as potential misalignment. */
  flaggedShare: number;
  /** flaggedShare relative to the corpus mean over document pairs. */
  rel: number;
  /** True when this pair's flagged share is at or above the corpus mean:
   *  the within-corpus definition of "where it concentrates", so a healthy
   *  corpus still surfaces its own worst pathways. */
  inflamed: boolean;
}

export interface PulseModel {
  docs: PulseDoc[];
  edges: PulseEdge[];
  meanFlaggedShare: number;
  totalCompared: number;
  totalFlagged: number;
}

/** Reported-measure pseudo-documents stay off the desk. */
const PSEUDO_DOCUMENTS = new Set(["BTR", "BER"]);

/**
 * Aggregate target-pair alignment into the document-level model behind the
 * coherence canvas: documents as they exist in the target set, plus one edge
 * per cross-document pair with normalized shares. No invented thresholds:
 * inflammation is defined relative to the corpus's own mean flagged share.
 */
export function computePulseModel(
  alignment: unknown[],
  targets: unknown[],
  docOrder: string[],
): PulseModel {
  const docCount = new Map<string, number>();
  const docOf = new Map<string, string>();
  for (const t of (Array.isArray(targets) ? targets : []) as Target[]) {
    if (!t || typeof t.id !== "string") continue;
    if (PSEUDO_DOCUMENTS.has(t.sourceDocument)) continue;
    docOf.set(t.id, t.sourceDocument);
    docCount.set(t.sourceDocument, (docCount.get(t.sourceDocument) ?? 0) + 1);
  }
  const orderIdx = (d: string) => {
    const i = docOrder.indexOf(d);
    return i === -1 ? docOrder.length : i;
  };
  const docs: PulseDoc[] = [...docCount.entries()]
    .sort(
      (x, y) =>
        orderIdx(x[0]) - orderIdx(y[0]) || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0),
    )
    .map(([id, targetCount]) => ({ id, targetCount }));

  const acc = new Map<
    string,
    { a: string; b: string; compared: number; flagged: number; related: number }
  >();
  let totalCompared = 0;
  let totalFlagged = 0;
  for (const r of (Array.isArray(alignment) ? alignment : []) as AlignmentResult[]) {
    if (!r) continue;
    const da = docOf.get(r.targetAId);
    const db = docOf.get(r.targetBId);
    if (!da || !db || da === db) continue;
    const [a, b] = orderIdx(da) <= orderIdx(db) ? [da, db] : [db, da];
    const key = `${a}~${b}`;
    let e = acc.get(key);
    if (!e) {
      e = { a, b, compared: 0, flagged: 0, related: 0 };
      acc.set(key, e);
    }
    e.compared += 1;
    totalCompared += 1;
    if (isContradiction(r.alignment)) {
      e.flagged += 1;
      totalFlagged += 1;
    } else if (r.alignment !== "none") {
      e.related += 1;
    }
  }

  const shares = [...acc.values()].map((e) =>
    e.compared > 0 ? e.flagged / e.compared : 0,
  );
  const meanFlaggedShare =
    shares.length > 0 ? shares.reduce((s, v) => s + v, 0) / shares.length : 0;

  const edges: PulseEdge[] = [...acc.values()]
    .sort(
      (x, y) =>
        orderIdx(x.a) - orderIdx(y.a) || orderIdx(x.b) - orderIdx(y.b),
    )
    .map((e) => {
      const flaggedShare = e.compared > 0 ? e.flagged / e.compared : 0;
      return {
        a: e.a,
        b: e.b,
        compared: e.compared,
        flagged: e.flagged,
        alignedShare: e.compared > 0 ? e.related / e.compared : 0,
        flaggedShare,
        rel: meanFlaggedShare > 0 ? flaggedShare / meanFlaggedShare : 0,
        inflamed:
          e.flagged > 0 &&
          meanFlaggedShare > 0 &&
          flaggedShare >= meanFlaggedShare,
      };
    });

  return { docs, edges, meanFlaggedShare, totalCompared, totalFlagged };
}
