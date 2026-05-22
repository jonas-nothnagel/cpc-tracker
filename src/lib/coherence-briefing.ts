/**
 * Helpers for the findings-first prototype on /prototypes.
 *
 * Computes what the home sections need:
 *   - a headline verdict ("are policies pulling the same direction?")
 *   - the top-N fault lines (worst possible misalignments)
 *   - one aligned + one flagged primer pair for the Direction section
 *   - sector-level flag density and per-sector contradiction hubs
 *   - cross-document disagreement ranking
 *   - the most-flagged document (Section 3 wheel focus)
 *   - an anchor-centric headline (Section 1 paragraph)
 *
 * Discipline: every number quoted in the UI must trace back to the dataset
 * passed in; no LLM calls, no fabrication.
 */

import { isContradiction } from "@/types";
import { getDocMediumLabel } from "@/lib/utils";
import { aggregateAnchorCoverage } from "@/lib/vision-anchor";
import type {
  AlignmentLevel,
  AlignmentResult,
  CorpusStoryline,
  CorpusThemes,
  CountryConfig,
  DocPairSynthesis,
  PolicyDocumentType,
  SectorSynthesis,
  Target,
  ThematicClassification,
} from "@/types";

// ─── Headline verdict ───────────────────────────────────────────────

/**
 * Three-bucket verdict for the country headline.
 *
 * Phase A uses fixed-ratio thresholds; revisit once we have observations from
 * more than two countries (memory: feedback_data_driven_scoring suggests
 * quartile-based thresholds, but with N=2 quartiles are meaningless).
 */
export type VerdictBucket =
  | "mostly_aligned"
  | "mixed"
  | "lots_of_misalignment";

export interface HeadlineVerdict {
  bucket: VerdictBucket;
  headline: string;
  /** Total non-"none" pairs the verdict was computed from. */
  signalPairs: number;
  /** Strong alignments (medium + high). */
  alignmentPairs: number;
  /** All conflicts (any negative-side level). */
  tensionPairs: number;
  /** tensionPairs / (tensionPairs + alignmentPairs), in [0,1]. */
  tensionShare: number;
}

const VERDICT_HEADLINES: Record<VerdictBucket, string> = {
  mostly_aligned: "Mostly pulling in the same direction.",
  mixed: "Mixed signals across the policy set.",
  lots_of_misalignment:
    "Substantial possible misalignment across the policy set.",
};

export function pickHeadlineVerdict(
  alignment: AlignmentResult[],
): HeadlineVerdict {
  let alignmentPairs = 0;
  let tensionPairs = 0;
  let signalPairs = 0;
  for (const a of alignment) {
    if (a.alignment === "none") continue;
    signalPairs += 1;
    if (isContradiction(a.alignment)) tensionPairs += 1;
    else if (a.alignment === "medium" || a.alignment === "high") {
      alignmentPairs += 1;
    }
  }
  const denom = alignmentPairs + tensionPairs;
  const tensionShare = denom > 0 ? tensionPairs / denom : 0;
  const bucket: VerdictBucket =
    tensionShare < 0.15
      ? "mostly_aligned"
      : tensionShare < 0.3
        ? "mixed"
        : "lots_of_misalignment";
  return {
    bucket,
    headline: VERDICT_HEADLINES[bucket],
    signalPairs,
    alignmentPairs,
    tensionPairs,
    tensionShare,
  };
}

// ─── Fault lines ────────────────────────────────────────────────────

const SEVERITY_RANK: Record<AlignmentLevel, number> = {
  likely_conflict: 0,
  possible_conflict: 1,
  possible_misalignment: 2,
  // Positive side never ranked here, but the map needs to cover the union.
  none: 99,
  low: 99,
  medium: 99,
  high: 99,
};

export interface FaultLine {
  pair: AlignmentResult;
  targetA: Target;
  targetB: Target;
}

/**
 * Top-N tension pairs sorted by severity (likely_conflict first), then by
 * cross-document distance (cross-doc pairs surface above same-doc tensions
 * because the user's mental model is "are documents agreeing").
 *
 * Skips pairs whose targets we can't resolve (orphaned ids in measure_align
 * data are common); they would render as blank rows.
 */
export function pickFaultLines(
  alignment: AlignmentResult[],
  targets: Target[],
  n: number,
): FaultLine[] {
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const candidates: FaultLine[] = [];
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    const tA = targetMap.get(a.targetAId);
    const tB = targetMap.get(a.targetBId);
    if (!tA || !tB) continue;
    candidates.push({ pair: a, targetA: tA, targetB: tB });
  }
  candidates.sort((x, y) => {
    const dS = SEVERITY_RANK[x.pair.alignment] - SEVERITY_RANK[y.pair.alignment];
    if (dS !== 0) return dS;
    const xCross = x.targetA.sourceDocument === x.targetB.sourceDocument ? 1 : 0;
    const yCross = y.targetA.sourceDocument === y.targetB.sourceDocument ? 1 : 0;
    return xCross - yCross;
  });
  return candidates.slice(0, n);
}

// ─── Primer pair examples (Scene 2) ─────────────────────────────────

export interface PrimerExamples {
  aligned: FaultLine | null;
  tension: FaultLine | null;
}

/**
 * One aligned pair + one tension pair to teach the reader what a "pair" is in
 * Scene 2. We deliberately pick:
 *   - aligned: highest-strength cross-document pair (most intuitive)
 *   - tension: highest-severity cross-document pair (also the lead fault line)
 *
 * Cross-document because same-document "alignment" reads as tautological in a
 * primer (of course the same document agrees with itself).
 */
export function pickPrimerExamples(
  alignment: AlignmentResult[],
  targets: Target[],
): PrimerExamples {
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  let alignedBest: FaultLine | null = null;
  let tensionBest: FaultLine | null = null;
  for (const a of alignment) {
    const tA = targetMap.get(a.targetAId);
    const tB = targetMap.get(a.targetBId);
    if (!tA || !tB) continue;
    if (tA.sourceDocument === tB.sourceDocument) continue;
    if (a.alignment === "high") {
      if (!alignedBest) alignedBest = { pair: a, targetA: tA, targetB: tB };
    } else if (isContradiction(a.alignment)) {
      const cur = SEVERITY_RANK[a.alignment];
      const prev = tensionBest ? SEVERITY_RANK[tensionBest.pair.alignment] : 99;
      if (cur < prev) tensionBest = { pair: a, targetA: tA, targetB: tB };
    }
  }
  return { aligned: alignedBest, tension: tensionBest };
}

// ─── Sector tension density (Q2 grid) ───────────────────────────────

export interface SectorTension {
  categoryId: string;
  categoryName: string;
  /** Number of policy targets primary-classified to this category. */
  targetCount: number;
  /** Number of tension pairs where at least one side sits in this category. */
  tensionCount: number;
  /** Maximum severity observed for this category (most negative wins). */
  peakSeverity: AlignmentLevel | null;
}

/**
 * For each category in `categories`, count how many tension pairs touch one of
 * its primary-classified targets. Used by the Q2 sector grid.
 *
 * Same target can be touched by multiple tensions; each tension is counted
 * once per side it touches, but at most once per category (so a tension whose
 * both sides land in the same category does not double-count).
 */
export function buildSectorTensionDensity(args: {
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: Array<{
    targetId: string;
    categoryId: string;
    taxonomyType: string;
    isPrimary?: boolean;
  }>;
  categories: { id: string; name: string }[];
  taxonomyType: string;
}): SectorTension[] {
  const { targets, alignment, classifications, categories, taxonomyType } =
    args;
  const targetIds = new Set(targets.map((t) => t.id));
  const primaryByTarget = new Map<string, string>();
  for (const c of classifications) {
    if (!c.isPrimary || c.taxonomyType !== taxonomyType) continue;
    if (!targetIds.has(c.targetId)) continue;
    primaryByTarget.set(c.targetId, c.categoryId);
  }
  const targetsByCat = new Map<string, Set<string>>();
  for (const cat of categories) targetsByCat.set(cat.id, new Set());
  for (const [tid, cid] of primaryByTarget) {
    if (!targetsByCat.has(cid)) targetsByCat.set(cid, new Set());
    targetsByCat.get(cid)!.add(tid);
  }
  const tensionsByCat = new Map<string, number>();
  const peakByCat = new Map<string, AlignmentLevel>();
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    const catA = primaryByTarget.get(a.targetAId);
    const catB = primaryByTarget.get(a.targetBId);
    const touched = new Set<string>();
    if (catA) touched.add(catA);
    if (catB) touched.add(catB);
    for (const c of touched) {
      tensionsByCat.set(c, (tensionsByCat.get(c) ?? 0) + 1);
      const prev = peakByCat.get(c);
      if (
        !prev ||
        SEVERITY_RANK[a.alignment] < SEVERITY_RANK[prev]
      ) {
        peakByCat.set(c, a.alignment);
      }
    }
  }
  return categories.map((cat) => ({
    categoryId: cat.id,
    categoryName: cat.name,
    targetCount: (targetsByCat.get(cat.id) ?? new Set()).size,
    tensionCount: tensionsByCat.get(cat.id) ?? 0,
    peakSeverity: peakByCat.get(cat.id) ?? null,
  }));
}

// ─── Per-sector briefing (Q2 drawer MVP) ────────────────────────────

export interface SectorBriefing {
  categoryId: string;
  categoryName: string;
  targetCount: number;
  /** Total flagged pairs touching the sector (any negative-side level). */
  flaggedCount: number;
  /** Top tension pairs (any side touches this sector), severity-sorted. */
  topTensions: FaultLine[];
  /** Top strong alignments (any side touches this sector), high first. */
  topAlignments: FaultLine[];
  /** Total pairs of any positive or negative level that touch the sector. */
  signalCount: number;
  /** Most-flagged target inside the sector, if any pair has 2+ flags. */
  recurringHub: SectorHub | null;
  /** Pre-composed factual sentence summarising the sector for the drawer header. */
  synthesisSentence: string;
}

/**
 * Build the Q2 drawer payload for a single sector. Caps each list at
 * `cap` rows so the drawer stays scannable even on a heavy sector.
 *
 * "Touches the sector" = at least one side of the pair is primary-classified
 * to the category under the named taxonomy. Same-sector both-sides pairs
 * count once.
 */
export function buildSectorBriefing(args: {
  categoryId: string;
  categoryName: string;
  taxonomyType: string;
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  cap?: number;
}): SectorBriefing {
  const {
    categoryId,
    categoryName,
    taxonomyType,
    targets,
    alignment,
    classifications,
    cap = 5,
  } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  // Targets whose PRIMARY classification under the lens taxonomy matches.
  const sectorTargetIds = new Set<string>();
  for (const c of classifications) {
    if (!c.isPrimary || c.taxonomyType !== taxonomyType) continue;
    if (c.categoryId !== categoryId) continue;
    if (!targetMap.has(c.targetId)) continue;
    sectorTargetIds.add(c.targetId);
  }
  const tensions: FaultLine[] = [];
  const aligns: FaultLine[] = [];
  let signalCount = 0;
  for (const a of alignment) {
    if (a.alignment === "none") continue;
    if (
      !sectorTargetIds.has(a.targetAId) &&
      !sectorTargetIds.has(a.targetBId)
    ) {
      continue;
    }
    const tA = targetMap.get(a.targetAId);
    const tB = targetMap.get(a.targetBId);
    if (!tA || !tB) continue;
    signalCount += 1;
    if (isContradiction(a.alignment)) {
      tensions.push({ pair: a, targetA: tA, targetB: tB });
    } else if (a.alignment === "high" || a.alignment === "medium") {
      aligns.push({ pair: a, targetA: tA, targetB: tB });
    }
  }
  tensions.sort((x, y) => {
    const dS =
      SEVERITY_RANK[x.pair.alignment] - SEVERITY_RANK[y.pair.alignment];
    if (dS !== 0) return dS;
    const xCross = x.targetA.sourceDocument === x.targetB.sourceDocument ? 1 : 0;
    const yCross = y.targetA.sourceDocument === y.targetB.sourceDocument ? 1 : 0;
    return xCross - yCross;
  });
  const ALIGN_RANK: Record<AlignmentLevel, number> = {
    high: 0,
    medium: 1,
    low: 2,
    likely_conflict: 99,
    possible_conflict: 99,
    possible_misalignment: 99,
    none: 99,
  };
  aligns.sort(
    (x, y) => ALIGN_RANK[x.pair.alignment] - ALIGN_RANK[y.pair.alignment],
  );
  // Recurring-target hub: the single target inside this sector that appears
  // in the most flagged pairs. Reuses the standalone helper so the logic is
  // shared between the section row hover-out and the drawer header.
  const recurringHub = findSectorContradictionHub({
    categoryId,
    taxonomyType,
    classifications,
    alignment,
    targets,
  });
  const flaggedCount = tensions.length;
  const synthesisSentence = composeSectorSynthesis({
    categoryName,
    targetCount: sectorTargetIds.size,
    flaggedCount,
    hub: recurringHub,
  });
  return {
    categoryId,
    categoryName,
    targetCount: sectorTargetIds.size,
    flaggedCount,
    topTensions: tensions.slice(0, cap),
    topAlignments: aligns.slice(0, cap),
    signalCount,
    recurringHub,
    synthesisSentence,
  };
}

function composeSectorSynthesis({
  categoryName,
  targetCount,
  flaggedCount,
  hub,
}: {
  categoryName: string;
  targetCount: number;
  flaggedCount: number;
  hub: SectorHub | null;
}): string {
  if (flaggedCount === 0) {
    if (targetCount === 0) {
      return `No targets primary-classified to ${categoryName} yet.`;
    }
    return `No possible misalignments touch ${categoryName} so far.`;
  }
  if (hub && hub.flaggedPairCount >= 2) {
    const pct = Math.round((hub.flaggedPairCount / flaggedCount) * 100);
    return `${flaggedCount} flagged pair${flaggedCount === 1 ? "" : "s"} touch ${categoryName}; ${hub.flaggedPairCount} of them (${pct}%) involve the same target.`;
  }
  return `${flaggedCount} flagged pair${flaggedCount === 1 ? "" : "s"} touch ${categoryName}, spread across different targets.`;
}

// ─── Pair fingerprint coordinates ───────────────────────────────────

export interface PairDot {
  pair: AlignmentResult;
  /** 0 → 1. 0 = identical thematic profile, 1 = no overlap. */
  thematicDistance: number;
  /** Signed alignment, -1 (likely_conflict) → +1 (high). */
  alignmentY: number;
}

const ALIGNMENT_Y: Record<AlignmentLevel, number> = {
  likely_conflict: -1,
  possible_conflict: -0.66,
  possible_misalignment: -0.33,
  none: 0,
  low: 0.33,
  medium: 0.66,
  high: 1,
};

/**
 * Project every non-"none" pair to a (thematicDistance, alignmentY) coordinate
 * for the Fingerprint centerpiece.
 *
 * Distance uses Jaccard on the set of `relevant` classifications shared by the
 * two targets, across every taxonomy. Two targets sharing many relevant
 * categories sit on the left (close); two with no overlap sit on the right
 * (distant). The metric is taxonomy-agnostic — combining all taxonomies
 * dampens noise from any single one.
 */
export function buildPairDots(
  alignment: AlignmentResult[],
  targets: Target[],
  classifications: ThematicClassification[],
): PairDot[] {
  const targetIds = new Set(targets.map((t) => t.id));
  const relevantByTarget = new Map<string, Set<string>>();
  for (const c of classifications) {
    if (!c.isRelevant) continue;
    if (!targetIds.has(c.targetId)) continue;
    const key = `${c.taxonomyType}:${c.categoryId}`;
    const set = relevantByTarget.get(c.targetId) ?? new Set<string>();
    set.add(key);
    relevantByTarget.set(c.targetId, set);
  }
  const out: PairDot[] = [];
  for (const a of alignment) {
    if (a.alignment === "none") continue;
    if (!targetIds.has(a.targetAId) || !targetIds.has(a.targetBId)) continue;
    const setA = relevantByTarget.get(a.targetAId) ?? new Set<string>();
    const setB = relevantByTarget.get(a.targetBId) ?? new Set<string>();
    if (setA.size === 0 && setB.size === 0) {
      out.push({ pair: a, thematicDistance: 1, alignmentY: ALIGNMENT_Y[a.alignment] });
      continue;
    }
    let intersect = 0;
    for (const k of setA) if (setB.has(k)) intersect += 1;
    const union = setA.size + setB.size - intersect;
    const jaccard = union === 0 ? 0 : intersect / union;
    out.push({
      pair: a,
      thematicDistance: 1 - jaccard,
      alignmentY: ALIGNMENT_Y[a.alignment],
    });
  }
  return out;
}

// ─── Anchor-centric headline (Section 1) ────────────────────────────

export interface AnchorHeadline {
  /** Has a country anchor doc been configured AND found in the dataset? */
  isAnchored: boolean;
  /** Raw doc id from `countryConfig.anchorDocType`. */
  anchorDocType: string | null;
  /** Display label (`mediumLabel`) for the anchor doc, e.g. "Vision 2050". */
  anchorName: string | null;
  /** Number of anchor targets present in the dataset. */
  anchorTargetCount: number;
  /** Distinct peripheral docs that share at least one scored pair with the anchor. */
  peripheralDocCount: number;
  /** Anchor-to-peripheral records at medium or high. */
  alignedRecordCount: number;
  /** Anchor-to-peripheral records on any negative-side level. */
  flaggedRecordCount: number;
  /** Strongest peripheral by aligned (medium+high) count, or null. */
  strongestPeripheral: PeripheralDocStat | null;
  /** Most flagged peripheral by flagged-record count, or null. */
  mostFlaggedPeripheral: PeripheralDocStat | null;
}

export interface PeripheralDocStat {
  docType: string;
  label: string;
  alignedCount: number;
  flaggedCount: number;
}

/**
 * Composes the data the Section 1 paragraph needs. Reuses
 * `aggregateAnchorCoverage` from `vision-anchor.ts` so the headline shares its
 * aggregation rules with the production Vision Anchor view (no second source
 * of truth). When the country has no anchor configured, returns
 * `{ isAnchored: false, ... }` so the section can fall back to a doc-agnostic
 * sentence.
 */
export function buildAnchorHeadline(args: {
  targets: Target[];
  alignment: AlignmentResult[];
  countryConfig: CountryConfig | null;
}): AnchorHeadline {
  const { targets, alignment, countryConfig } = args;
  const anchorDocType = countryConfig?.anchorDocType ?? null;
  const empty: AnchorHeadline = {
    isAnchored: false,
    anchorDocType: anchorDocType,
    anchorName: anchorDocType
      ? getDocMediumLabel(countryConfig, anchorDocType)
      : null,
    anchorTargetCount: 0,
    peripheralDocCount: 0,
    alignedRecordCount: 0,
    flaggedRecordCount: 0,
    strongestPeripheral: null,
    mostFlaggedPeripheral: null,
  };
  if (!anchorDocType) return empty;
  const anchorTargetCount = targets.filter(
    (t) => t.sourceDocument === anchorDocType,
  ).length;
  if (anchorTargetCount === 0) return empty;

  const coverage = aggregateAnchorCoverage(targets, alignment, anchorDocType);
  // Sum cells by peripheral docType.
  const byDoc = new Map<string, PeripheralDocStat>();
  for (const row of coverage.rows) {
    for (const cell of row.cells.values()) {
      let stat = byDoc.get(cell.docType);
      if (!stat) {
        stat = {
          docType: cell.docType,
          label: getDocMediumLabel(countryConfig, cell.docType),
          alignedCount: 0,
          flaggedCount: 0,
        };
        byDoc.set(cell.docType, stat);
      }
      const medium = cell.byLevel.medium ?? 0;
      const high = cell.byLevel.high ?? 0;
      stat.alignedCount += medium + high;
      const pm = cell.byLevel.possible_misalignment ?? 0;
      const pc = cell.byLevel.possible_conflict ?? 0;
      const lc = cell.byLevel.likely_conflict ?? 0;
      stat.flaggedCount += pm + pc + lc;
    }
  }

  let alignedRecordCount = 0;
  let flaggedRecordCount = 0;
  let strongestPeripheral: PeripheralDocStat | null = null;
  let mostFlaggedPeripheral: PeripheralDocStat | null = null;
  for (const stat of byDoc.values()) {
    alignedRecordCount += stat.alignedCount;
    flaggedRecordCount += stat.flaggedCount;
    if (
      !strongestPeripheral ||
      stat.alignedCount > strongestPeripheral.alignedCount
    ) {
      strongestPeripheral = stat;
    }
    if (
      !mostFlaggedPeripheral ||
      stat.flaggedCount > mostFlaggedPeripheral.flaggedCount
    ) {
      mostFlaggedPeripheral = stat;
    }
  }
  // Suppress callouts that would be misleading (no records on that axis).
  if (strongestPeripheral && strongestPeripheral.alignedCount === 0) {
    strongestPeripheral = null;
  }
  if (mostFlaggedPeripheral && mostFlaggedPeripheral.flaggedCount === 0) {
    mostFlaggedPeripheral = null;
  }

  return {
    isAnchored: true,
    anchorDocType,
    anchorName: getDocMediumLabel(countryConfig, anchorDocType),
    anchorTargetCount,
    peripheralDocCount: byDoc.size,
    alignedRecordCount,
    flaggedRecordCount,
    strongestPeripheral,
    mostFlaggedPeripheral,
  };
}

// ─── Sector concentration (Section 2) ───────────────────────────────

export interface ConcentrationStat {
  /** Sectors examined (rows with at least one primary-classified target). */
  populatedSectors: number;
  /** Total flagged-pair touches across populated sectors. */
  totalFlags: number;
  /** Names of the top sectors (by flag count) that together hold ≥ `targetShare` of all flags. */
  topNames: string[];
  /** Share of all flags concentrated in `topNames` (0..1). */
  share: number;
}

/**
 * Smallest set of sectors whose flag counts together cover at least
 * `targetShare` of the total flag touches. Drives "friction concentrates in N
 * of M sectors" — N is `topNames.length`, M is `populatedSectors`. When no
 * flags exist, returns `topNames: []` and `share: 0`.
 */
export function computeConcentrationStat(
  sectorRows: SectorTension[],
  targetShare = 0.7,
): ConcentrationStat {
  const populated = sectorRows.filter((r) => r.targetCount > 0);
  const totalFlags = populated.reduce((s, r) => s + r.tensionCount, 0);
  if (totalFlags === 0) {
    return {
      populatedSectors: populated.length,
      totalFlags: 0,
      topNames: [],
      share: 0,
    };
  }
  const sorted = [...populated].sort(
    (a, b) => b.tensionCount - a.tensionCount,
  );
  const topNames: string[] = [];
  let running = 0;
  for (const row of sorted) {
    if (row.tensionCount === 0) break;
    topNames.push(row.categoryName);
    running += row.tensionCount;
    if (running / totalFlags >= targetShare) break;
  }
  return {
    populatedSectors: populated.length,
    totalFlags,
    topNames,
    share: totalFlags > 0 ? running / totalFlags : 0,
  };
}

// ─── Sector contradiction hub (Section 2 cards) ─────────────────────

export interface SectorHub {
  target: Target;
  /** Number of flagged pairs the target appears in, scoped to this sector. */
  flaggedPairCount: number;
}

/**
 * The target inside a sector that appears in the most flagged pairs.
 * "Inside a sector" = primary-classified to `categoryId` under `taxonomyType`.
 * Flagged pairs counted are those where the target is on either side. Returns
 * null if no target has ≥1 flagged pair in this sector.
 */
export function findSectorContradictionHub(args: {
  categoryId: string;
  taxonomyType: string;
  classifications: ThematicClassification[];
  alignment: AlignmentResult[];
  targets: Target[];
}): SectorHub | null {
  const { categoryId, taxonomyType, classifications, alignment, targets } =
    args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const sectorTargetIds = new Set<string>();
  for (const c of classifications) {
    if (!c.isPrimary || c.taxonomyType !== taxonomyType) continue;
    if (c.categoryId !== categoryId) continue;
    if (!targetMap.has(c.targetId)) continue;
    sectorTargetIds.add(c.targetId);
  }
  if (sectorTargetIds.size === 0) return null;
  const counts = new Map<string, number>();
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    if (sectorTargetIds.has(a.targetAId)) {
      counts.set(a.targetAId, (counts.get(a.targetAId) ?? 0) + 1);
    }
    if (sectorTargetIds.has(a.targetBId)) {
      counts.set(a.targetBId, (counts.get(a.targetBId) ?? 0) + 1);
    }
  }
  let best: SectorHub | null = null;
  for (const [tid, count] of counts) {
    if (count === 0) continue;
    const target = targetMap.get(tid);
    if (!target) continue;
    if (!best || count > best.flaggedPairCount) {
      best = { target, flaggedPairCount: count };
    }
  }
  return best;
}

// ─── Doc-pair disagreement (Section 3 + chat starter) ───────────────

export interface DocPairDisagreement {
  /** Lexicographically-ordered pair so (A,B) and (B,A) collapse. */
  docA: PolicyDocumentType;
  docB: PolicyDocumentType;
  /** Cross-doc scored pairs at any non-`none` level. */
  totalScored: number;
  /** Flagged subset of `totalScored`. */
  flaggedCount: number;
  /** flaggedCount / totalScored in [0,1]. */
  share: number;
}

/**
 * Cross-document pairs only. Per ordered pair of documents (alphabetical), sum
 * the number of flagged target-pairs and total scored pairs. Returns the list
 * sorted by `flaggedCount` desc, tie-broken by `share` desc. Same-document
 * pairs are excluded — the user's mental model is cross-doc coherence.
 */
export function findDocPairDisagreement(
  alignment: AlignmentResult[],
  targets: Target[],
): DocPairDisagreement[] {
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const map = new Map<string, DocPairDisagreement>();
  for (const a of alignment) {
    if (a.alignment === "none") continue;
    const tA = targetMap.get(a.targetAId);
    const tB = targetMap.get(a.targetBId);
    if (!tA || !tB) continue;
    if (tA.sourceDocument === tB.sourceDocument) continue;
    const [docA, docB] =
      tA.sourceDocument < tB.sourceDocument
        ? [tA.sourceDocument, tB.sourceDocument]
        : [tB.sourceDocument, tA.sourceDocument];
    const key = `${docA}__${docB}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { docA, docB, totalScored: 0, flaggedCount: 0, share: 0 };
      map.set(key, entry);
    }
    entry.totalScored += 1;
    if (isContradiction(a.alignment)) entry.flaggedCount += 1;
  }
  const out: DocPairDisagreement[] = [];
  for (const entry of map.values()) {
    entry.share =
      entry.totalScored > 0 ? entry.flaggedCount / entry.totalScored : 0;
    out.push(entry);
  }
  out.sort((x, y) => {
    if (y.flaggedCount !== x.flaggedCount) {
      return y.flaggedCount - x.flaggedCount;
    }
    return y.share - x.share;
  });
  return out;
}

// ─── Most-flagged document (Section 3 wheel focus) ──────────────────

export interface FlaggedDocStat {
  docType: PolicyDocumentType;
  /** Flagged cross-doc pairs that touch this document. */
  flaggedCount: number;
}

/**
 * Cross-doc only. The single document touched by the most flagged pairs.
 * Used to default the Misalignments section's wheel focus to the doc most
 * worth examining. Returns null if no cross-doc flagged pair exists.
 */
export function pickMostFlaggedDoc(
  alignment: AlignmentResult[],
  targets: Target[],
): FlaggedDocStat | null {
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const counts = new Map<PolicyDocumentType, number>();
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    const tA = targetMap.get(a.targetAId);
    const tB = targetMap.get(a.targetBId);
    if (!tA || !tB) continue;
    if (tA.sourceDocument === tB.sourceDocument) continue;
    counts.set(
      tA.sourceDocument,
      (counts.get(tA.sourceDocument) ?? 0) + 1,
    );
    counts.set(
      tB.sourceDocument,
      (counts.get(tB.sourceDocument) ?? 0) + 1,
    );
  }
  let best: FlaggedDocStat | null = null;
  for (const [docType, flaggedCount] of counts) {
    if (flaggedCount === 0) continue;
    if (!best || flaggedCount > best.flaggedCount) {
      best = { docType, flaggedCount };
    }
  }
  return best;
}

// ─── Sector alignment density (Section 2 positive-side mirror) ──────

export interface SectorAlignment {
  categoryId: string;
  categoryName: string;
  targetCount: number;
  alignmentCount: number;
  peakAlignmentLevel: AlignmentLevel | null;
}

/**
 * Mirror of buildSectorTensionDensity for positive-side levels (medium/high).
 * "low" is included as a weak signal but never wins peak — it loses to medium
 * which loses to high.
 */
export function buildSectorAlignmentDensity(args: {
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: Array<{
    targetId: string;
    categoryId: string;
    taxonomyType: string;
    isPrimary?: boolean;
  }>;
  categories: { id: string; name: string }[];
  taxonomyType: string;
}): SectorAlignment[] {
  const { targets, alignment, classifications, categories, taxonomyType } =
    args;
  const targetIds = new Set(targets.map((t) => t.id));
  const primaryByTarget = new Map<string, string>();
  for (const c of classifications) {
    if (!c.isPrimary || c.taxonomyType !== taxonomyType) continue;
    if (!targetIds.has(c.targetId)) continue;
    primaryByTarget.set(c.targetId, c.categoryId);
  }
  const targetsByCat = new Map<string, Set<string>>();
  for (const cat of categories) targetsByCat.set(cat.id, new Set());
  for (const [tid, cid] of primaryByTarget) {
    if (!targetsByCat.has(cid)) targetsByCat.set(cid, new Set());
    targetsByCat.get(cid)!.add(tid);
  }
  const countByCat = new Map<string, number>();
  const peakByCat = new Map<string, AlignmentLevel>();
  const ALIGN_RANK: Record<AlignmentLevel, number> = {
    high: 0,
    medium: 1,
    low: 2,
    likely_conflict: 99,
    possible_conflict: 99,
    possible_misalignment: 99,
    none: 99,
  };
  for (const a of alignment) {
    if (a.alignment !== "high" && a.alignment !== "medium" && a.alignment !== "low") {
      continue;
    }
    const catA = primaryByTarget.get(a.targetAId);
    const catB = primaryByTarget.get(a.targetBId);
    const touched = new Set<string>();
    if (catA) touched.add(catA);
    if (catB) touched.add(catB);
    for (const c of touched) {
      countByCat.set(c, (countByCat.get(c) ?? 0) + 1);
      const prev = peakByCat.get(c);
      if (!prev || ALIGN_RANK[a.alignment] < ALIGN_RANK[prev]) {
        peakByCat.set(c, a.alignment);
      }
    }
  }
  return categories.map((cat) => ({
    categoryId: cat.id,
    categoryName: cat.name,
    targetCount: (targetsByCat.get(cat.id) ?? new Set()).size,
    alignmentCount: countByCat.get(cat.id) ?? 0,
    peakAlignmentLevel: peakByCat.get(cat.id) ?? null,
  }));
}

// ─── Synthesis-layer helpers (doc-pair / corpus / sector) ───────────

interface SynthesisPayload {
  docPairSynthesis?: unknown;
  corpusThemes?: unknown;
  sectorSynthesis?: unknown;
}

export function loadDocPairSyntheses(
  payload: SynthesisPayload | null | undefined,
): DocPairSynthesis[] {
  const raw = payload?.docPairSynthesis;
  return Array.isArray(raw) ? (raw as DocPairSynthesis[]) : [];
}

export function loadCorpusThemes(
  payload: SynthesisPayload | null | undefined,
): CorpusThemes | null {
  const raw = payload?.corpusThemes;
  if (!raw || typeof raw !== "object") return null;
  return raw as CorpusThemes;
}

export function loadSectorSyntheses(
  payload: SynthesisPayload | null | undefined,
): SectorSynthesis[] {
  const raw = payload?.sectorSynthesis;
  return Array.isArray(raw) ? (raw as SectorSynthesis[]) : [];
}

/** Index sector syntheses by `${taxonomy_type}:${category_id}` for O(1) lookup. */
export function indexSectorSyntheses(
  arr: SectorSynthesis[],
): Map<string, SectorSynthesis> {
  const m = new Map<string, SectorSynthesis>();
  for (const s of arr) {
    m.set(`${s.taxonomy_type}:${s.category_id}`, s);
  }
  return m;
}

export interface DocPairBalance {
  alignedShare: number;
  flaggedShare: number;
  total: number;
}

/** Deterministic proportions for the doc-pair balance bar. */
export function computeDocPairBalance(dp: DocPairSynthesis): DocPairBalance {
  const total = dp.aligned_count + dp.flagged_count;
  if (total <= 0) return { alignedShare: 0, flaggedShare: 0, total: 0 };
  return {
    alignedShare: dp.aligned_count / total,
    flaggedShare: dp.flagged_count / total,
    total,
  };
}

/** Parses "FSS<->NAP" → { a: "FSS", b: "NAP" }. Tolerates surrounding whitespace. */
export function parseContributingDocPair(
  s: string,
): { a: string; b: string } | null {
  const m = s.split("<->");
  if (m.length !== 2) return null;
  const a = m[0].trim();
  const b = m[1].trim();
  if (!a || !b) return null;
  return { a, b };
}

/** Canonical "A<->B" ordering (lexicographic) so set membership is symmetric. */
export function getDocPairKey(a: string, b: string): string {
  return a < b ? `${a}<->${b}` : `${b}<->${a}`;
}

/** Canonicalised set of contributing doc-pairs for filter intersection. */
export function getStorylineDocPairKeys(s: CorpusStoryline): Set<string> {
  const out = new Set<string>();
  for (const raw of s.contributing_doc_pairs) {
    const p = parseContributingDocPair(raw);
    if (!p) continue;
    out.add(getDocPairKey(p.a, p.b));
  }
  return out;
}
