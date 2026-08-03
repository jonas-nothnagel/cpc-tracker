import { anchorKeyOf } from "@/lib/feedback/anchor";
import { isContradiction } from "@/types";
import type {
  AlignmentMechanism,
  AlignmentResult,
  PairRatingValue,
  RatingsByCountry,
  Target,
} from "@/types";

/** Everything the "Why this pair stands out" strip states; every field is
 *  computed from stored data, never generated. Absent field = line not shown. */
export interface SignificanceFacts {
  /** How many models independently mark this pair, of how many that ran. */
  modelsFlagging?: { count: number; total: number };
  /** How common this pair's pattern is among policy-to-policy comparisons. */
  typeRarity?: {
    mechanism: AlignmentMechanism;
    count: number;
    totalComparisons: number;
  };
  /** The busier of the two targets: how many potentially misaligned pairs
   *  involve it, against the corpus total. */
  concentration?: {
    targetId: string;
    sourceLabel: string;
    count: number;
    flaggedTotal: number;
  };
  /** Reviewer verdict from the ratings ledger; null = explicitly unreviewed,
   *  undefined = no ledger supplied. */
  review?: { rating: PairRatingValue; note: string; ts: number } | null;
}

export interface SignificanceOptions {
  /** pairKey -> number of models flagging (multi-model countries only). */
  consensusCounts?: Record<string, number>;
  /** How many models ran for this country. */
  modelsTotal?: number;
  /** Folded ratings ledger keyed `${targetAId}::${targetBId}`. */
  ratings?: RatingsByCountry;
}

/** Reported-measure pseudo-targets; excluded so the counts match the
 *  policy-to-policy story told on the dashboard. */
const PSEUDO_DOCUMENTS = new Set(["BTR", "BER"]);

export function computeSignificanceFacts(
  alignment: unknown[],
  targets: unknown[],
  pair: AlignmentResult,
  opts?: SignificanceOptions,
): SignificanceFacts {
  const byId = new Map<string, Target>();
  for (const t of (Array.isArray(targets) ? targets : []) as Target[]) {
    if (t && typeof t.id === "string") byId.set(t.id, t);
  }
  const isPseudo = (id: string) => {
    const doc = byId.get(id)?.sourceDocument;
    return doc !== undefined && PSEUDO_DOCUMENTS.has(doc);
  };

  let totalComparisons = 0;
  let flaggedTotal = 0;
  let sameMechanism = 0;
  const flaggedPerTarget = new Map<string, number>();
  for (const r of (Array.isArray(alignment) ? alignment : []) as AlignmentResult[]) {
    if (!r || typeof r.targetAId !== "string" || typeof r.targetBId !== "string")
      continue;
    if (isPseudo(r.targetAId) || isPseudo(r.targetBId)) continue;
    totalComparisons += 1;
    if (!isContradiction(r.alignment)) continue;
    flaggedTotal += 1;
    if (pair.mechanism && r.mechanism === pair.mechanism) sameMechanism += 1;
    for (const id of [r.targetAId, r.targetBId]) {
      flaggedPerTarget.set(id, (flaggedPerTarget.get(id) ?? 0) + 1);
    }
  }

  const facts: SignificanceFacts = {};

  if (isContradiction(pair.alignment) && pair.mechanism) {
    facts.typeRarity = {
      mechanism: pair.mechanism,
      count: sameMechanism,
      totalComparisons,
    };
  }

  const candidates = [pair.targetAId, pair.targetBId]
    .map((id) => ({
      id,
      target: byId.get(id),
      count: flaggedPerTarget.get(id) ?? 0,
    }))
    .filter((c) => c.target !== undefined)
    .sort((x, y) => y.count - x.count);
  const busiest = candidates[0];
  if (busiest && busiest.count > 0) {
    facts.concentration = {
      targetId: busiest.id,
      sourceLabel: busiest.target?.sourceLabel ?? busiest.id,
      count: busiest.count,
      flaggedTotal,
    };
  }

  if (opts?.consensusCounts && (opts.modelsTotal ?? 0) > 1) {
    const key = anchorKeyOf([pair.targetAId, pair.targetBId]);
    const mapped = opts.consensusCounts[key];
    const count = mapped ?? (isContradiction(pair.alignment) ? 1 : 0);
    if (count > 0) {
      facts.modelsFlagging = { count, total: opts.modelsTotal as number };
    }
  }

  if (opts?.ratings) {
    const direct = opts.ratings[`${pair.targetAId}::${pair.targetBId}`];
    const reversed = opts.ratings[`${pair.targetBId}::${pair.targetAId}`];
    const hit = direct ?? reversed;
    facts.review = hit
      ? { rating: hit.rating, note: hit.note, ts: hit.ts }
      : null;
  }

  return facts;
}
