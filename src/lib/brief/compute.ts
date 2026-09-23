import {
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

/** Which reading the overall picture leads with. Shares are of ALL
 *  comparisons, so the headline never claims more than the dots show:
 *  "aligned" when aligned comparisons are at least as many as partial ones,
 *  "partial" when partial links are the larger group, "empty" with none. */
export type OverallLead = "empty" | "aligned" | "partial";

export function overallLead(counts: ToneCounts): OverallLead {
  if (counts.total === 0) return "empty";
  return counts.partial > counts.reinforce ? "partial" : "aligned";
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
  /** Target pairs of the theme's tone between the documents it cites,
   *  counted live for the selection (coverage: themes may share pairs). */
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
  // Coverage, as the pipeline defines it and the dashboard shows it: a theme
  // counts the target pairs of its tone between the documents it cites, so
  // two themes citing the same pair of documents both count those pairs.
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

/**
 * Partner documents with their counts, largest first (document order breaks
 * ties). Rows state the counts ("21 with the NDC, 14 with LDN Targets"), so
 * the order names no winner; weighting by document size had made the label
 * point at the smallest document.
 */
function rankPartnerDocs(scope: Scope, partners: Map<string, number>): { doc: string; count: number }[] {
  const docOrder = new Map(scope.docs.map((d, i) => [d.id, i]));
  return [...partners.entries()]
    .map(([doc, count]) => ({ doc, count }))
    .sort((x, y) => y.count - x.count || (docOrder.get(x.doc) ?? 0) - (docOrder.get(y.doc) ?? 0));
}

/** The commitments in the most potential misalignments, with the documents
 *  those misalignments run to. */
export function commitmentsToReview(scope: Scope, limit = 8): CommitmentRow[] {
  const byId = new Map(scope.commitments.map((c) => [c.id, c]));
  return rankTargetsByFriction(scope.alignment, scope.targets, limit).map(
    ({ target, flaggedPairCount }) => {
      const partners = new Map<string, number>();
      for (const c of scope.comparisons) {
        if (c.level !== "flagged") continue;
        const other = c.a.id === target.id ? c.b : c.b.id === target.id ? c.a : null;
        if (other) partners.set(other.doc, (partners.get(other.doc) ?? 0) + 1);
      }
      return {
        commitment: byId.get(target.id)!,
        apart: flaggedPairCount,
        partnerDocs: rankPartnerDocs(scope, partners),
      };
    },
  );
}

export interface AlignedRow {
  commitment: BriefCommitment;
  /** Targets in other documents it is aligned with. */
  aligned: number;
  /** Targets in other documents it was compared with. */
  compared: number;
  /** Documents of its aligned partners, most first. */
  partnerDocs: { doc: string; count: number }[];
}

/**
 * The targets aligned with the largest share of the targets they were
 * compared with (a share, not a raw count, so a target in a large document
 * is not favoured for being compared more often); the count breaks ties,
 * then document order.
 */
export function alignedTargets(scope: Scope, limit = 8): AlignedRow[] {
  const rows = new Map(
    scope.commitments.map((c) => [
      c.id,
      { commitment: c, aligned: 0, compared: 0, partners: new Map<string, number>() },
    ]),
  );
  for (const c of scope.comparisons) {
    const aligned = toneOf(c.level) === "reinforce";
    for (const [self, other] of [
      [c.a, c.b],
      [c.b, c.a],
    ]) {
      const row = rows.get(self.id);
      if (!row) continue;
      row.compared += 1;
      if (!aligned) continue;
      row.aligned += 1;
      row.partners.set(other.doc, (row.partners.get(other.doc) ?? 0) + 1);
    }
  }
  const order = new Map(scope.commitments.map((c, i) => [c.id, i]));
  const share = (r: { aligned: number; compared: number }) =>
    r.compared > 0 ? r.aligned / r.compared : 0;
  return [...rows.values()]
    .filter((r) => r.aligned > 0)
    .sort(
      (x, y) =>
        share(y) - share(x) ||
        y.aligned - x.aligned ||
        (order.get(x.commitment.id) ?? 0) - (order.get(y.commitment.id) ?? 0),
    )
    .slice(0, limit)
    .map(({ commitment, aligned, compared, partners }) => ({
      commitment,
      aligned,
      compared,
      partnerDocs: rankPartnerDocs(scope, partners),
    }));
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

// ─── Partners ───────────────────────────────────────────────────────

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

/** Fewest comparisons a policy area needs before the brief rates it; the
 *  same floor as for a pair of documents. */
export const MIN_AREA_COMPARISONS = 30;

export interface AreaRow {
  id: string;
  name: string;
  /** Selected commitments whose primary area this is. */
  commitments: number;
  /** Comparisons touching one of those commitments, whatever their reading. */
  comparisons: number;
  apart: number;
  /** apart / comparisons; null below the minimum. */
  share: number | null;
}

/**
 * Policy areas of one lens, rated by their share of potential misalignment
 * over ALL their comparisons, the same basis as every other share in the
 * brief (a comparison between two areas counts for both). Areas without
 * selected commitments are left out; thin areas stay unrated.
 */
export function areaRows(
  source: BriefSource,
  scope: Scope,
  lensId: LensId,
  minComparisons = MIN_AREA_COMPARISONS,
): { rows: AreaRow[]; average: number; max: number } {
  const lens = source.lenses.find((l) => l.id === lensId);
  if (!lens) return { rows: [], average: 0, max: 0 };
  const inScope = new Set(scope.commitments.map((c) => c.id));
  const primary = new Map(
    Object.entries(lens.primary).filter(([targetId]) => inScope.has(targetId)),
  );
  const members = new Map<string, number>();
  for (const category of primary.values()) members.set(category, (members.get(category) ?? 0) + 1);

  const stats = new Map<string, { comparisons: number; apart: number }>();
  let touching = 0;
  let touchingApart = 0;
  for (const c of scope.comparisons) {
    const areas = new Set(
      [primary.get(c.a.id), primary.get(c.b.id)].filter((x): x is string => Boolean(x)),
    );
    if (areas.size === 0) continue;
    const apart = toneOf(c.level) === "apart";
    touching += 1;
    if (apart) touchingApart += 1;
    for (const area of areas) {
      const entry = stats.get(area) ?? { comparisons: 0, apart: 0 };
      entry.comparisons += 1;
      if (apart) entry.apart += 1;
      stats.set(area, entry);
    }
  }

  let max = 0;
  const rows: AreaRow[] = lens.categories
    .filter((cat) => (members.get(cat.id) ?? 0) > 0)
    .map((cat) => {
      const entry = stats.get(cat.id) ?? { comparisons: 0, apart: 0 };
      const share = entry.comparisons >= minComparisons ? entry.apart / entry.comparisons : null;
      if (share !== null && share > max) max = share;
      return {
        id: cat.id,
        name: cat.name,
        commitments: members.get(cat.id) ?? 0,
        comparisons: entry.comparisons,
        apart: entry.apart,
        share,
      };
    })
    .sort((x, y) => {
      if (x.share === null && y.share !== null) return 1;
      if (y.share === null && x.share !== null) return -1;
      const d = (y.share ?? 0) - (x.share ?? 0) || y.commitments - x.commitments;
      return d !== 0 ? d : x.name.localeCompare(y.name);
    });
  return { rows, average: touching > 0 ? touchingApart / touching : 0, max };
}

/**
 * An example for a pair of documents when no theme supplies one: a
 * comparison of the tone between the two documents, preferring a strong
 * over a moderate link, then the commitments that recur most among those
 * comparisons, then the pair key. Same rule as `themeExample`, minus anchors.
 */
export function pairExample(
  scope: Scope,
  docA: string,
  docB: string,
  tone: "reinforce" | "apart",
): ExamplePair | null {
  const between = (c: ScopedComparison) =>
    (c.a.doc === docA && c.b.doc === docB) || (c.a.doc === docB && c.b.doc === docA);
  const candidates = scope.comparisons.filter((c) => between(c) && toneOf(c.level) === tone);
  if (candidates.length === 0) return null;
  const involvement = new Map<string, number>();
  for (const c of candidates) {
    for (const id of [c.a.id, c.b.id]) involvement.set(id, (involvement.get(id) ?? 0) + 1);
  }
  const recurring = (c: ScopedComparison) =>
    (involvement.get(c.a.id) ?? 0) + (involvement.get(c.b.id) ?? 0);
  const best = [...candidates].sort((x, y) => {
    const d =
      (x.level === "high" ? 0 : 1) - (y.level === "high" ? 0 : 1) || recurring(y) - recurring(x);
    if (d !== 0) return d;
    const kx = commitmentPairKey(x.a.id, x.b.id);
    const ky = commitmentPairKey(y.a.id, y.b.id);
    return kx < ky ? -1 : kx > ky ? 1 : 0;
  })[0];
  return best.mechanism
    ? { a: best.a, b: best.b, level: best.level, mechanism: best.mechanism }
    : { a: best.a, b: best.b, level: best.level };
}

// ─── Documents ──────────────────────────────────────────────────────

/**
 * The aligned target pairs between two documents, strongest first: a strong
 * link before a moderate one, then the targets that recur most among them,
 * then the pair key, so the order never depends on data order.
 */
export function strongestAligned(scope: Scope, docA: string, docB: string): ScopedComparison[] {
  const between = scope.comparisons.filter(
    (c) =>
      toneOf(c.level) === "reinforce" &&
      ((c.a.doc === docA && c.b.doc === docB) || (c.a.doc === docB && c.b.doc === docA)),
  );
  const involvement = new Map<string, number>();
  for (const c of between) {
    for (const id of [c.a.id, c.b.id]) involvement.set(id, (involvement.get(id) ?? 0) + 1);
  }
  const recurring = (c: ScopedComparison) =>
    (involvement.get(c.a.id) ?? 0) + (involvement.get(c.b.id) ?? 0);
  return between.sort((x, y) => {
    const d =
      (x.level === "high" ? 0 : 1) - (y.level === "high" ? 0 : 1) || recurring(y) - recurring(x);
    if (d !== 0) return d;
    const kx = commitmentPairKey(x.a.id, x.b.id);
    const ky = commitmentPairKey(y.a.id, y.b.id);
    return kx < ky ? -1 : kx > ky ? 1 : 0;
  });
}

export interface DocStat {
  doc: BriefDocument;
  /** Every target pair the document takes part in. */
  counts: ToneCounts;
}

/** Each document with all its target pairs, most closely aligned first
 *  (share of aligned pairs; document order breaks ties). */
export function docStats(scope: Scope): DocStat[] {
  const byDoc = new Map(scope.docs.map((d) => [d.id, emptyCounts()]));
  for (const c of scope.comparisons) {
    const tone = toneOf(c.level);
    for (const doc of [c.a.doc, c.b.doc]) {
      const counts = byDoc.get(doc);
      if (!counts) continue;
      counts[tone] += 1;
      counts.total += 1;
    }
  }
  const aligned = (c: ToneCounts) => (c.total > 0 ? c.reinforce / c.total : 0);
  return scope.docs
    .map((doc, order) => ({ doc, order, counts: byDoc.get(doc.id)! }))
    .sort((x, y) => aligned(y.counts) - aligned(x.counts) || x.order - y.order)
    .map(({ doc, counts }) => ({ doc, counts }));
}

// ─── Documents' own shares ──────────────────────────────────────────

export interface DocToneShare {
  doc: BriefDocument;
  commitments: number;
  /** Comparisons the document takes part in (each counts for both documents). */
  total: number;
  reinforce: number;
  apart: number;
}

/** Each selected document's comparisons by tone: where the map's shading
 *  gathers, normalised by how often the document was compared. */
export function docToneShares(scope: Scope): DocToneShare[] {
  const byDoc = new Map<string, DocToneShare>(
    scope.docs.map((d) => [
      d.id,
      {
        doc: d,
        commitments: scope.commitments.filter((c) => c.doc === d.id).length,
        total: 0,
        reinforce: 0,
        apart: 0,
      },
    ]),
  );
  for (const c of scope.comparisons) {
    const tone = toneOf(c.level);
    for (const doc of [c.a.doc, c.b.doc]) {
      const entry = byDoc.get(doc);
      if (!entry) continue;
      entry.total += 1;
      if (tone === "reinforce") entry.reinforce += 1;
      else if (tone === "apart") entry.apart += 1;
    }
  }
  return [...byDoc.values()];
}
