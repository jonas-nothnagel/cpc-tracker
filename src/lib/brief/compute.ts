import {
  buildSectorCoherenceShare,
  computeStorylineLiveStats,
  computeTargetConcentration,
  getDocPairKey,
  getStorylineDocPairKeys,
  rankStorylines,
  rankTargetsByFriction,
  selectCorpusThemesForState,
} from "@/lib/coherence-briefing";
import type {
  AlignmentLevel,
  AlignmentMechanism,
  AlignmentResult,
  CorpusStoryline,
  Target,
} from "@/types";
import {
  LEVEL_CODES,
  MECHANISM_CODES,
  type BriefCommitment,
  type BriefDocument,
  type BriefSource,
  type LensId,
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

// ─── Recurring themes ───────────────────────────────────────────────

export interface ThemeRow {
  storyline: CorpusStoryline;
  /** Comparisons of the theme's tone inside its pairs of documents,
   *  counted live for the selection. */
  count: number;
  /** Document id -> share of the theme's comparisons it takes part in
   *  (a comparison counts for both its documents). */
  docShares: Record<string, number>;
}

/**
 * The AI-identified recurring themes of one tone, for the selected documents:
 * names from the theme state written for this selection (or the full set,
 * with `exact` false), counts and document shares computed live from the
 * ratings, ranked as the dashboard ranks them. Themes with nothing left in
 * the selection are dropped.
 */
export function themeRows(
  source: BriefSource,
  scope: Scope,
  type: "reinforcement" | "friction",
): { rows: ThemeRow[]; exact: boolean } {
  const { themes, isExact } = selectCorpusThemesForState(source.themes, scope.hiddenDocs);
  if (!themes) return { rows: [], exact: true };
  const storylines = themes.storylines.filter((s) => s.type === type);
  const stats = computeStorylineLiveStats(storylines, scope.alignment, scope.targets);
  const rows: ThemeRow[] = [];
  for (const s of rankStorylines(storylines, type, (x) => stats.get(x)?.liveCount ?? 0)) {
    const st = stats.get(s);
    if (!st || st.liveCount === 0) continue;
    const docShares: Record<string, number> = {};
    for (const [doc, n] of st.docCounts) docShares[doc] = n / st.liveCount;
    rows.push({ storyline: s, count: st.liveCount, docShares });
  }
  return { rows, exact: isExact };
}

/** Three steps for how much of a theme a document carries; 0 = no part. */
export function shareStep(share: number): 0 | 1 | 2 | 3 {
  if (share <= 0) return 0;
  if (share <= 0.1) return 1;
  if (share <= 0.25) return 2;
  return 3;
}

export interface ExamplePair {
  a: BriefCommitment;
  b: BriefCommitment;
  level: AlignmentLevel;
  mechanism?: AlignmentMechanism;
}

function commitmentPairKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

/**
 * One example for a theme, chosen by rule rather than taste: a comparison of
 * the theme's tone inside its pairs of documents, preferring the commitments
 * the theme was written around (its anchors), then a strong over a moderate
 * link, then the commitments that recur most in the theme, then the pair key.
 */
export function themeExample(scope: Scope, storyline: CorpusStoryline): ExamplePair | null {
  const keys = getStorylineDocPairKeys(storyline);
  const friction = storyline.type === "friction";
  const candidates = scope.comparisons.filter(
    (c) =>
      keys.has(getDocPairKey(c.a.doc, c.b.doc)) &&
      (friction ? c.level === "flagged" : c.level === "high" || c.level === "medium"),
  );
  if (candidates.length === 0) return null;
  const anchors = new Set(storyline.anchor_target_ids ?? []);
  const involvement = new Map<string, number>();
  for (const c of candidates) {
    for (const id of [c.a.id, c.b.id]) involvement.set(id, (involvement.get(id) ?? 0) + 1);
  }
  const anchorsIn = (c: ScopedComparison) =>
    (anchors.has(c.a.id) ? 1 : 0) + (anchors.has(c.b.id) ? 1 : 0);
  const levelRank = (c: ScopedComparison) => (c.level === "high" ? 0 : 1);
  const recurring = (c: ScopedComparison) =>
    (involvement.get(c.a.id) ?? 0) + (involvement.get(c.b.id) ?? 0);
  const best = [...candidates].sort((x, y) => {
    const d =
      anchorsIn(y) - anchorsIn(x) || levelRank(x) - levelRank(y) || recurring(y) - recurring(x);
    if (d !== 0) return d;
    const kx = commitmentPairKey(x.a.id, x.b.id);
    const ky = commitmentPairKey(y.a.id, y.b.id);
    return kx < ky ? -1 : kx > ky ? 1 : 0;
  })[0];
  return best.mechanism
    ? { a: best.a, b: best.b, level: best.level, mechanism: best.mechanism }
    : { a: best.a, b: best.b, level: best.level };
}

// ─── Commitments ────────────────────────────────────────────────────

export interface CommitmentRow {
  commitment: BriefCommitment;
  /** Potential misalignments the commitment is part of. */
  apart: number;
  /** Documents of its partners in those potential misalignments, most first. */
  partnerDocs: { doc: string; count: number }[];
}

/** The commitments in the most potential misalignments, with the documents
 *  those misalignments run to. */
export function commitmentsToReview(scope: Scope, limit = 8): CommitmentRow[] {
  const byId = new Map(scope.commitments.map((c) => [c.id, c]));
  const docOrder = new Map(scope.docs.map((d, i) => [d.id, i]));
  return rankTargetsByFriction(scope.alignment, scope.targets, limit).map(
    ({ target, flaggedPairCount }) => {
      const partners = new Map<string, number>();
      for (const c of scope.comparisons) {
        if (c.level !== "flagged") continue;
        const other = c.a.id === target.id ? c.b : c.b.id === target.id ? c.a : null;
        if (other) partners.set(other.doc, (partners.get(other.doc) ?? 0) + 1);
      }
      const partnerDocs = [...partners.entries()]
        .map(([doc, count]) => ({ doc, count }))
        .sort(
          (x, y) => y.count - x.count || (docOrder.get(x.doc) ?? 0) - (docOrder.get(y.doc) ?? 0),
        );
      return { commitment: byId.get(target.id)!, apart: flaggedPairCount, partnerDocs };
    },
  );
}

export interface Concentration {
  /** Potential misalignments in the selection. */
  total: number;
  /** Commitments part of at least one. */
  contested: number;
  /** Fewest commitments (ids, most involved first) covering at least half. */
  top: string[];
  /** Share of potential misalignments those commitments are part of. */
  share: number;
  /** Few commitments carry it: at most a fifth of the contested ones. */
  concentrated: boolean;
}

export function concentrationOf(scope: Scope): Concentration {
  const c = computeTargetConcentration(scope.alignment, scope.targets, 0.5);
  const top = c.topTargets.map((t) => t.target.id);
  return {
    total: c.totalFlaggedPairs,
    contested: c.contestedTargetCount,
    top,
    share: c.coveredPairShare,
    concentrated: top.length > 0 && top.length <= 0.2 * c.contestedTargetCount,
  };
}

// ─── Map cells ──────────────────────────────────────────────────────

export interface MapCell {
  commitment: BriefCommitment;
  apart: number;
  reinforce: number;
  total: number;
}

export function mapCells(scope: Scope): MapCell[] {
  const cells = new Map(
    scope.commitments.map((c) => [c.id, { commitment: c, apart: 0, reinforce: 0, total: 0 }]),
  );
  for (const c of scope.comparisons) {
    const tone = toneOf(c.level);
    for (const id of [c.a.id, c.b.id]) {
      const cell = cells.get(id);
      if (!cell) continue;
      cell.total += 1;
      if (tone === "apart") cell.apart += 1;
      else if (tone === "reinforce") cell.reinforce += 1;
    }
  }
  return [...cells.values()];
}

/** Lower bounds of the map's potential-misalignment steps:
 *  0, 1-2, 3-5, 6-10, 11-20, 21 and more. */
export const APART_STEPS = [0, 1, 3, 6, 11, 21] as const;

export function apartStep(n: number): 0 | 1 | 2 | 3 | 4 | 5 {
  let step = 0;
  for (let i = 0; i < APART_STEPS.length; i++) if (n >= APART_STEPS[i]) step = i;
  return step as 0 | 1 | 2 | 3 | 4 | 5;
}

/** Quarters of the share of a commitment's comparisons that reinforce. */
export function reinforceStep(share: number): 0 | 1 | 2 | 3 {
  if (share < 0.25) return 0;
  if (share < 0.5) return 1;
  if (share < 0.75) return 2;
  return 3;
}

/** A commitment's partners by tone, in document order. */
export function partnersOf(
  scope: Scope,
  id: string,
): { apart: BriefCommitment[]; reinforce: BriefCommitment[] } {
  const apart = new Set<string>();
  const reinforce = new Set<string>();
  for (const c of scope.comparisons) {
    const other = c.a.id === id ? c.b.id : c.b.id === id ? c.a.id : null;
    if (!other) continue;
    const tone = toneOf(c.level);
    if (tone === "apart") apart.add(other);
    else if (tone === "reinforce") reinforce.add(other);
  }
  return {
    apart: scope.commitments.filter((c) => apart.has(c.id)),
    reinforce: scope.commitments.filter((c) => reinforce.has(c.id)),
  };
}

// ─── Policy areas ───────────────────────────────────────────────────

export interface AreaRow {
  id: string;
  name: string;
  /** Selected commitments whose primary area this is. */
  commitments: number;
  /** Comparisons touching the area that reinforce or show potential misalignment. */
  reviewed: number;
  apart: number;
  /** apart / reviewed; null below the dashboard's minimum sample. */
  share: number | null;
}

/**
 * Policy areas of one lens, rated by their share of potential misalignment
 * (the dashboard's `buildSectorCoherenceShare`, which leaves thin areas
 * unrated). Areas without selected commitments are left out.
 */
export function areaRows(
  source: BriefSource,
  scope: Scope,
  lensId: LensId,
): { rows: AreaRow[]; average: number; max: number } {
  const lens = source.lenses.find((l) => l.id === lensId);
  if (!lens) return { rows: [], average: 0, max: 0 };
  const inScope = new Set(scope.commitments.map((c) => c.id));
  const classifications = Object.entries(lens.primary)
    .filter(([targetId]) => inScope.has(targetId))
    .map(([targetId, categoryId]) => ({
      targetId,
      categoryId,
      taxonomyType: lens.taxonomyType,
      isPrimary: true,
    }));
  const summary = buildSectorCoherenceShare({
    targets: scope.targets,
    alignment: scope.alignment,
    classifications,
    categories: lens.categories,
    taxonomyType: lens.taxonomyType,
  });
  const members = new Map<string, number>();
  for (const c of classifications) members.set(c.categoryId, (members.get(c.categoryId) ?? 0) + 1);
  const rows: AreaRow[] = lens.categories
    .filter((cat) => (members.get(cat.id) ?? 0) > 0)
    .map((cat) => {
      const share = summary.byCategory.get(cat.id);
      return {
        id: cat.id,
        name: cat.name,
        commitments: members.get(cat.id) ?? 0,
        reviewed: share?.reviewedPairs ?? 0,
        apart: share?.flaggedPairs ?? 0,
        share: share?.flaggedShare ?? null,
      };
    })
    .sort((x, y) => {
      if (x.share === null && y.share !== null) return 1;
      if (y.share === null && x.share !== null) return -1;
      const d = (y.share ?? 0) - (x.share ?? 0) || y.commitments - x.commitments;
      return d !== 0 ? d : x.name.localeCompare(y.name);
    });
  return { rows, average: summary.mid, max: summary.maxShare };
}
