import type { AlignmentLevel, AlignmentMechanism, AlignmentResult, Target } from "@/types";
import {
  LEVEL_CODES,
  MECHANISM_CODES,
  type BriefCommitment,
  type BriefDocument,
  type BriefSource,
} from "./source";

// ─── Scope ──────────────────────────────────────────────────────────

/** The four ways a comparison reads in the brief. */
export type Tone = "reinforce" | "partial" | "apart" | "none";

export function toneOf(level: AlignmentLevel): Tone {
  switch (level) {
    case "high":
    case "medium":
      return "reinforce";
    case "low":
      return "partial";
    case "flagged":
      return "apart";
    default:
      return "none";
  }
}

export interface ScopedComparison {
  a: BriefCommitment;
  b: BriefCommitment;
  level: AlignmentLevel;
  mechanism?: AlignmentMechanism;
}

export interface Scope {
  /** Selected documents, in document order. */
  docs: BriefDocument[];
  commitments: BriefCommitment[];
  comparisons: ScopedComparison[];
  /** The same comparisons as lite `AlignmentResult`s, for the shared
   *  helpers in `src/lib/coherence-briefing.ts` and `src/lib/pulse`. */
  alignment: AlignmentResult[];
  /** The commitments as lite `Target`s, for the same helpers. */
  targets: Target[];
  /** Source documents left out of the selection (keys theme states). */
  hiddenDocs: string[];
}

/** Restrict the source to the selected documents. */
export function scopeOf(source: BriefSource, docIds: string[]): Scope {
  const selected = new Set(docIds);
  const docs = source.documents.filter((d) => selected.has(d.id));
  const commitments = source.commitments.filter((c) => selected.has(c.doc));
  const comparisons: ScopedComparison[] = [];
  const alignment: AlignmentResult[] = [];
  const rows = source.comparisons;
  for (let i = 0; i + 3 < rows.length; i += 4) {
    const a = source.commitments[rows[i]];
    const b = source.commitments[rows[i + 1]];
    if (!a || !b || !selected.has(a.doc) || !selected.has(b.doc)) continue;
    const level = LEVEL_CODES[rows[i + 2]];
    const mechanism = MECHANISM_CODES[rows[i + 3]] ?? undefined;
    comparisons.push(mechanism ? { a, b, level, mechanism } : { a, b, level });
    alignment.push({
      targetAId: a.id,
      targetBId: b.id,
      alignment: level,
      ...(mechanism ? { mechanism } : {}),
      description: "",
    });
  }
  const targets: Target[] = commitments.map((c) => ({
    id: c.id,
    text: c.text,
    sourceDocument: c.doc,
    sourceLabel: c.label,
    country: source.countryName,
    isQuantitative: false,
    isTimeBound: false,
  }));
  const hiddenDocs = source.documents.filter((d) => !selected.has(d.id)).map((d) => d.id);
  return { docs, commitments, comparisons, alignment, targets, hiddenDocs };
}

// ─── Tones and the overall verdict ──────────────────────────────────

export interface ToneCounts {
  reinforce: number;
  partial: number;
  apart: number;
  none: number;
  total: number;
}

export function emptyCounts(): ToneCounts {
  return { reinforce: 0, partial: 0, apart: 0, none: 0, total: 0 };
}

export function toneCounts(comparisons: { level: AlignmentLevel }[]): ToneCounts {
  const counts = emptyCounts();
  for (const c of comparisons) {
    counts[toneOf(c.level)] += 1;
    counts.total += 1;
  }
  return counts;
}

export type Verdict = "mostly_aligned" | "mixed" | "lots_of_misalignment";

/** The dashboard's headline verdict (`pickHeadlineVerdict`): the share of
 *  potential misalignment among comparisons with a clear reading, against
 *  the same 15% and 30% thresholds. */
export function verdictOf(counts: ToneCounts): Verdict {
  const clear = counts.apart + counts.reinforce;
  const share = clear > 0 ? counts.apart / clear : 0;
  if (share < 0.15) return "mostly_aligned";
  if (share < 0.3) return "mixed";
  return "lots_of_misalignment";
}

// ─── Pairs of documents ─────────────────────────────────────────────

export interface DocPairStat {
  /** Earlier document in document order. */
  a: BriefDocument;
  b: BriefDocument;
  counts: ToneCounts;
}

export function pairKeyOf(a: string, b: string): string {
  return `${a}~${b}`;
}

/** One entry per pair of selected documents that were compared, in document
 *  order, whichever way round each comparison was stored. */
export function docPairStats(scope: Scope): DocPairStat[] {
  const order = new Map(scope.docs.map((d, i) => [d.id, i]));
  const byKey = new Map<string, DocPairStat>();
  for (const c of scope.comparisons) {
    const [x, y] =
      (order.get(c.a.doc) ?? 0) <= (order.get(c.b.doc) ?? 0) ? [c.a.doc, c.b.doc] : [c.b.doc, c.a.doc];
    const key = pairKeyOf(x, y);
    let stat = byKey.get(key);
    if (!stat) {
      stat = {
        a: scope.docs[order.get(x) ?? 0],
        b: scope.docs[order.get(y) ?? 0],
        counts: emptyCounts(),
      };
      byKey.set(key, stat);
    }
    stat.counts[toneOf(c.level)] += 1;
    stat.counts.total += 1;
  }
  return [...byKey.values()].sort(
    (p, q) =>
      (order.get(p.a.id) ?? 0) - (order.get(q.a.id) ?? 0) ||
      (order.get(p.b.id) ?? 0) - (order.get(q.b.id) ?? 0),
  );
}

/** Fewest comparisons a pair of documents needs before the brief names it. */
export const MIN_PAIR_COMPARISONS = 30;

export function shareOf(counts: ToneCounts, tone: Tone): number {
  return counts.total > 0 ? counts[tone] / counts.total : 0;
}

/** The pair of documents with the highest share of a tone, among pairs with
 *  enough comparisons; ties go to the larger pair, then document order. */
export function leadingPair(
  stats: DocPairStat[],
  tone: "reinforce" | "apart",
  minTotal = MIN_PAIR_COMPARISONS,
): DocPairStat | null {
  let best: DocPairStat | null = null;
  for (const s of stats) {
    if (s.counts.total < minTotal || s.counts[tone] === 0) continue;
    if (!best) {
      best = s;
      continue;
    }
    const d = shareOf(s.counts, tone) - shareOf(best.counts, tone);
    if (d > 0 || (d === 0 && s.counts.total > best.counts.total)) best = s;
  }
  return best;
}
