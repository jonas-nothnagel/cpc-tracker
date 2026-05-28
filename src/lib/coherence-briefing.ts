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
import { getDocColor, getDocMediumLabel } from "@/lib/utils";
import { aggregateAnchorCoverage } from "@/lib/vision-anchor";
import type {
  AlignmentLevel,
  AlignmentMechanism,
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

// v2.1: single negative state. Higher manageability/confidence values can be
// surfaced via the AlignmentResult sub-fields when ranking flagged pairs.
const SEVERITY_RANK: Record<AlignmentLevel, number> = {
  flagged: 0,
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
    flagged: 99,
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
  flagged: -1,
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
  /**
   * Optional override. When set, builds the headline against this doc
   * instead of the country's configured anchor. Used by the merged
   * top section so users can interactively pick which doc to focus
   * the verdict sentence on. When null/undefined the country's
   * configured anchorDocType is used (legacy behaviour).
   */
  anchorDocTypeOverride?: string | null;
}): AnchorHeadline {
  const { targets, alignment, countryConfig, anchorDocTypeOverride } = args;
  const anchorDocType =
    anchorDocTypeOverride ?? countryConfig?.anchorDocType ?? null;
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
      stat.flaggedCount += cell.byLevel.flagged ?? 0;
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

// ─── Document coherence graph (Coherence Field centerpiece) ─────────

export interface DocCoherenceNode {
  docType: PolicyDocumentType;
  /** mediumLabel for the doc (e.g. "Vision 2050"). */
  label: string;
  /** Doc colour from the country config (or neutral fallback). */
  color: string;
  /** Targets sourced from this document. Drives a label/tooltip, never node size. */
  targetCount: number;
}

export interface DocCoherenceEdge {
  /** Lexicographically-ordered doc pair so (A,B) and (B,A) collapse. */
  a: PolicyDocumentType;
  b: PolicyDocumentType;
  /** Cross-doc target-pairs at medium or high. */
  alignedCount: number;
  /** Cross-doc target-pairs on the flagged (negative) side. */
  flaggedCount: number;
  /** Cross-doc target-pairs at any non-`none` level (the denominator). */
  totalScored: number;
  /** alignedCount / totalScored, in [0,1]. Drives proximity (attraction). */
  alignedShare: number;
  /** flaggedCount / totalScored, in [0,1]. Drives separation + filament weight. */
  flaggedShare: number;
}

/**
 * Document-level coherence graph for the Coherence Field landing viz.
 *
 * Nodes: one per source document present in `targets`. Edges: one per ordered
 * pair of documents that share at least one scored (non-`none`) cross-document
 * target-pair. The shares are normalised by `totalScored` so the field reads
 * honestly within a single country regardless of corpus size — a 2%-flagged
 * corpus settles calm, a 13%-flagged corpus visibly strains — without any
 * cross-country comparison. Same-document and `none` pairs are excluded.
 *
 * Mirrors `findDocPairDisagreement` but carries both the aligned and flagged
 * sides so the layout can use alignment as attraction and flag-rate as both
 * separation and filament weight.
 */
export function buildDocCoherenceGraph(
  alignment: AlignmentResult[],
  targets: Target[],
  countryConfig: CountryConfig | null,
): { nodes: DocCoherenceNode[]; edges: DocCoherenceEdge[] } {
  const targetMap = new Map(targets.map((t) => [t.id, t]));

  // Nodes: one per document, counted from the targets.
  const docCounts = new Map<PolicyDocumentType, number>();
  for (const t of targets) {
    docCounts.set(t.sourceDocument, (docCounts.get(t.sourceDocument) ?? 0) + 1);
  }
  const nodes: DocCoherenceNode[] = [];
  for (const [docType, targetCount] of docCounts) {
    nodes.push({
      docType,
      label: getDocMediumLabel(countryConfig, docType),
      color: getDocColor(countryConfig, docType),
      targetCount,
    });
  }

  // Edges: cross-doc pairs only, keyed lexicographically so reversed authoring
  // folds into one edge.
  const edgeMap = new Map<string, DocCoherenceEdge>();
  for (const al of alignment) {
    if (al.alignment === "none") continue;
    const tA = targetMap.get(al.targetAId);
    const tB = targetMap.get(al.targetBId);
    if (!tA || !tB) continue;
    if (tA.sourceDocument === tB.sourceDocument) continue;
    const [a, b] =
      tA.sourceDocument < tB.sourceDocument
        ? [tA.sourceDocument, tB.sourceDocument]
        : [tB.sourceDocument, tA.sourceDocument];
    const key = `${a}__${b}`;
    let edge = edgeMap.get(key);
    if (!edge) {
      edge = {
        a,
        b,
        alignedCount: 0,
        flaggedCount: 0,
        totalScored: 0,
        alignedShare: 0,
        flaggedShare: 0,
      };
      edgeMap.set(key, edge);
    }
    edge.totalScored += 1;
    if (isContradiction(al.alignment)) {
      edge.flaggedCount += 1;
    } else if (al.alignment === "high" || al.alignment === "medium") {
      edge.alignedCount += 1;
    }
  }

  const edges: DocCoherenceEdge[] = [];
  for (const edge of edgeMap.values()) {
    edge.alignedShare =
      edge.totalScored > 0 ? edge.alignedCount / edge.totalScored : 0;
    edge.flaggedShare =
      edge.totalScored > 0 ? edge.flaggedCount / edge.totalScored : 0;
    edges.push(edge);
  }
  return { nodes, edges };
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
    flagged: 99,
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

// ─── Contradiction-type breakdown (Friction-types slide) ─────────────

export type FrictionType =
  | "goal_conflict"
  | "resource_competition"
  | "delivery_friction";

export interface ContradictionTotals {
  goal_conflict: number;
  resource_competition: number;
  delivery_friction: number;
}

export interface ContradictionPerDocPair {
  docA: string;
  docB: string;
  labelA: string;
  labelB: string;
  totals: ContradictionTotals;
  total: number;
  storylineName: string | null;
}

export interface ContradictionBreakdown {
  corpusTotals: ContradictionTotals;
  perDocPair: ContradictionPerDocPair[];
  totalFlagged: number;
  /** Type with the highest corpus-wide count, or null when no flagged pairs. */
  dominantType: FrictionType | null;
}

/**
 * Rolls the per-doc-pair contradiction_types blocks up into a corpus total and
 * a sortable per-pair list. Legacy v1 keys (implementation_tension,
 * scale_scope_mismatch) fold into delivery_friction so older synthesis JSON
 * still parses correctly.
 *
 * topN caps the per-pair list; the corpus totals always cover all pairs.
 */
export function buildContradictionBreakdown(
  syntheses: DocPairSynthesis[],
  opts: { topN?: number } = {},
): ContradictionBreakdown {
  const corpusTotals: ContradictionTotals = {
    goal_conflict: 0,
    resource_competition: 0,
    delivery_friction: 0,
  };
  const perDocPair: ContradictionPerDocPair[] = [];
  for (const dp of syntheses) {
    const ct = dp.contradiction_types ?? {};
    const goal = ct.goal_conflict ?? 0;
    const resource = ct.resource_competition ?? 0;
    const delivery =
      (ct.delivery_friction ?? 0) +
      (ct.implementation_tension ?? 0) +
      (ct.scale_scope_mismatch ?? 0);
    const totals: ContradictionTotals = {
      goal_conflict: goal,
      resource_competition: resource,
      delivery_friction: delivery,
    };
    const total = goal + resource + delivery;
    corpusTotals.goal_conflict += goal;
    corpusTotals.resource_competition += resource;
    corpusTotals.delivery_friction += delivery;
    if (total > 0) {
      perDocPair.push({
        docA: dp.doc_a,
        docB: dp.doc_b,
        labelA: dp.label_a,
        labelB: dp.label_b,
        totals,
        total,
        storylineName:
          dp.synthesis_error === null ? dp.synthesis.storyline_name : null,
      });
    }
  }
  perDocPair.sort((x, y) => y.total - x.total);
  const capped =
    opts.topN !== undefined ? perDocPair.slice(0, opts.topN) : perDocPair;
  const totalFlagged =
    corpusTotals.goal_conflict +
    corpusTotals.resource_competition +
    corpusTotals.delivery_friction;
  let dominantType: FrictionType | null = null;
  if (totalFlagged > 0) {
    let max = -1;
    for (const key of [
      "goal_conflict",
      "resource_competition",
      "delivery_friction",
    ] as const) {
      if (corpusTotals[key] > max) {
        max = corpusTotals[key];
        dominantType = key;
      }
    }
  }
  return {
    corpusTotals,
    perDocPair: capped,
    totalFlagged,
    dominantType,
  };
}

// ─── Friction-type totals from raw flags (Friction-types bar) ───────

export interface FrictionTypeTotals {
  goal_conflict: number;
  resource_competition: number;
  delivery_friction: number;
  /** Sum of the three buckets (flagged pairs carrying a mechanism). */
  total: number;
  /** Bucket with the highest count, or null when none. */
  dominantType: AlignmentMechanism | null;
}

/**
 * Corpus friction-type counts derived directly from `alignment[].mechanism`
 * (the raw flagged tags), so the Friction-types bar and the friction-type
 * profile drawer share a single source of truth. Flagged pairs with no
 * mechanism are excluded from the three buckets. Verified to match the
 * synthesis-layer counts on current outputs (713 = 8 + 327 + 378 for Mongolia).
 */
export function frictionTypeTotalsFromAlignment(
  alignment: AlignmentResult[],
): FrictionTypeTotals {
  const totals = {
    goal_conflict: 0,
    resource_competition: 0,
    delivery_friction: 0,
  };
  for (const a of alignment) {
    if (a.alignment !== "flagged" || !a.mechanism) continue;
    totals[a.mechanism] += 1;
  }
  const total =
    totals.goal_conflict +
    totals.resource_competition +
    totals.delivery_friction;
  let dominantType: AlignmentMechanism | null = null;
  if (total > 0) {
    let max = -1;
    for (const key of [
      "goal_conflict",
      "resource_competition",
      "delivery_friction",
    ] as const) {
      if (totals[key] > max) {
        max = totals[key];
        dominantType = key;
      }
    }
  }
  return { ...totals, total, dominantType };
}

// ─── Per-document frictions (Doc-in-Focus) ──────────────────────────

export interface DocFocusFrictions {
  /**
   * Flagged pairs the focused doc takes part in across documents (exactly one
   * side sits in the focused doc, the other in a different doc). Matches the
   * cross-document scope of `buildAnchorHeadline`'s flagged count, so the
   * Doc-in-Focus body and this list describe the same set.
   */
  flaggedPairs: FaultLine[];
  /** goal / resource / delivery split over those flagged pairs. */
  frictionTotals: FrictionTypeTotals;
}

/**
 * Severity order for surfacing flagged pairs: goal conflicts (most
 * fundamental) before resource competition before delivery friction (most
 * operational), matching the friction-type bar. Pairs with no mechanism sort
 * last. Lets the capped Doc-in-Focus list lead with the most severe flags
 * instead of burying a rare goal conflict behind many delivery-friction ones.
 */
const MECHANISM_SEVERITY: Record<string, number> = {
  goal_conflict: 0,
  resource_competition: 1,
  delivery_friction: 2,
};

/**
 * The Doc-in-Focus analogue of the corpus friction split: which flagged pairs
 * a single document is part of, and how they break down by mechanism. Same
 * target x target subset rules as the rest of the misalignment story (both ids
 * must resolve; same-document and non-touching pairs are excluded). Sorted by
 * mechanism severity (goal > resource > delivery), then peer document, then
 * focused-side target id, so the most severe flags surface first.
 */
export function buildDocFocusFrictions(
  alignment: AlignmentResult[],
  targets: Target[],
  focusedDoc: string,
): DocFocusFrictions {
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const subset: AlignmentResult[] = [];
  const flaggedPairs: FaultLine[] = [];
  for (const a of alignment) {
    if (a.alignment !== "flagged") continue;
    const tA = targetMap.get(a.targetAId);
    const tB = targetMap.get(a.targetBId);
    if (!tA || !tB) continue;
    const aInDoc = tA.sourceDocument === focusedDoc;
    const bInDoc = tB.sourceDocument === focusedDoc;
    // Exactly one side in the focused doc → a cross-document flag.
    if (aInDoc === bInDoc) continue;
    subset.push(a);
    flaggedPairs.push({ pair: a, targetA: tA, targetB: tB });
  }
  const peerOf = (line: FaultLine): string =>
    line.targetA.sourceDocument === focusedDoc
      ? line.targetB.sourceDocument
      : line.targetA.sourceDocument;
  const severityOf = (line: FaultLine): number =>
    line.pair.mechanism ? (MECHANISM_SEVERITY[line.pair.mechanism] ?? 3) : 3;
  flaggedPairs.sort((x, y) => {
    const ds = severityOf(x) - severityOf(y);
    if (ds !== 0) return ds;
    const dp = peerOf(x).localeCompare(peerOf(y));
    if (dp !== 0) return dp;
    return x.targetA.id.localeCompare(y.targetA.id);
  });
  return {
    flaggedPairs,
    frictionTotals: frictionTypeTotalsFromAlignment(subset),
  };
}

// ─── Target-level friction ranking + concentration (Where-to-focus) ──

export interface TargetFriction {
  target: Target;
  /** Flagged pairs (both ids resolvable) this target appears in. */
  flaggedPairCount: number;
}

/**
 * Rank targets by how many flagged pairs they appear in, corpus-wide — the
 * target-level analogue of findSectorContradictionHub with the sector scope
 * removed. Counts only pairs where both ids resolve (orphans skipped, matching
 * pickFaultLines). Sorted by count desc, then id asc for stability; `n` caps.
 */
export function rankTargetsByFriction(
  alignment: AlignmentResult[],
  targets: Target[],
  n?: number,
): TargetFriction[] {
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const counts = new Map<string, number>();
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    if (!targetMap.has(a.targetAId) || !targetMap.has(a.targetBId)) continue;
    counts.set(a.targetAId, (counts.get(a.targetAId) ?? 0) + 1);
    counts.set(a.targetBId, (counts.get(a.targetBId) ?? 0) + 1);
  }
  const ranked: TargetFriction[] = [];
  for (const [tid, count] of counts) {
    const target = targetMap.get(tid);
    if (!target) continue;
    ranked.push({ target, flaggedPairCount: count });
  }
  ranked.sort((x, y) =>
    y.flaggedPairCount !== x.flaggedPairCount
      ? y.flaggedPairCount - x.flaggedPairCount
      : x.target.id.localeCompare(y.target.id),
  );
  return n !== undefined ? ranked.slice(0, n) : ranked;
}

export interface TargetConcentrationEntry {
  target: Target;
  /** Distinct flagged pairs this target touches. */
  flaggedPairCount: number;
  /**
   * Distinct flagged pairs this target adds beyond the earlier top targets
   * (greedy order). Segments of a concentration bar use this so they tile to
   * the covered share without double-counting pairs shared by two top targets.
   */
  marginalPairCount: number;
}

export interface TargetConcentration {
  /** Distinct targets appearing in ≥1 resolvable flagged pair. */
  contestedTargetCount: number;
  /** Distinct resolvable flagged pairs. */
  totalFlaggedPairs: number;
  /** Smallest greedy target set covering ≥ targetShare of flagged pairs. */
  topTargets: TargetConcentrationEntry[];
  /** topTargets.length (convenience for copy). */
  topCount: number;
  /** Share of flagged pairs the topTargets together touch, in [0,1]. */
  coveredPairShare: number;
}

/**
 * How concentrated is the friction at the target level? Greedily selects the
 * fewest targets (most-flagged first) whose flagged pairs together cover at
 * least `targetShare` of all flagged pairs, counting each pair once even when
 * both its targets are selected. Drives the "a few targets dominate" vs
 * "spread across many" verdict. Mirrors computeConcentrationStat but at target
 * granularity over distinct pairs. Only pairs with both ids resolved counted.
 */
export function computeTargetConcentration(
  alignment: AlignmentResult[],
  targets: Target[],
  targetShare = 0.5,
): TargetConcentration {
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const pairKeysByTarget = new Map<string, Set<string>>();
  const allPairKeys = new Set<string>();
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    if (!targetMap.has(a.targetAId) || !targetMap.has(a.targetBId)) continue;
    const key =
      a.targetAId < a.targetBId
        ? `${a.targetAId}__${a.targetBId}`
        : `${a.targetBId}__${a.targetAId}`;
    allPairKeys.add(key);
    for (const tid of [a.targetAId, a.targetBId]) {
      const set = pairKeysByTarget.get(tid) ?? new Set<string>();
      set.add(key);
      pairKeysByTarget.set(tid, set);
    }
  }
  const totalFlaggedPairs = allPairKeys.size;
  if (totalFlaggedPairs === 0) {
    return {
      contestedTargetCount: 0,
      totalFlaggedPairs: 0,
      topTargets: [],
      topCount: 0,
      coveredPairShare: 0,
    };
  }
  const ranked = [...pairKeysByTarget.entries()]
    .map(([tid, keys]) => ({ tid, count: keys.size }))
    .sort((x, y) =>
      y.count !== x.count ? y.count - x.count : x.tid.localeCompare(y.tid),
    );
  const covered = new Set<string>();
  const topTargets: TargetConcentrationEntry[] = [];
  for (const { tid } of ranked) {
    if (covered.size / totalFlaggedPairs >= targetShare) break;
    const keys = pairKeysByTarget.get(tid)!;
    let marginal = 0;
    for (const k of keys) if (!covered.has(k)) marginal += 1;
    for (const k of keys) covered.add(k);
    topTargets.push({
      target: targetMap.get(tid)!,
      flaggedPairCount: keys.size,
      marginalPairCount: marginal,
    });
  }
  return {
    contestedTargetCount: pairKeysByTarget.size,
    totalFlaggedPairs,
    topTargets,
    topCount: topTargets.length,
    coveredPairShare: covered.size / totalFlaggedPairs,
  };
}

// ─── Flagged-subset profile (FlagProfileDrawer) ─────────────────────

export interface FlagSubsetProfile {
  /** Subset size (pairs passed in). */
  total: number;
  /** Top document-pairs the subset falls across (count desc). */
  byDocPair: { a: string; b: string; count: number }[];
  /** Top themes touched under taxonomyType (count desc). */
  byTheme: { categoryId: string; categoryName: string; count: number }[];
  /** Targets recurring across the subset (count desc), minus any focal target. */
  recurringTargets: { target: Target; count: number }[];
  /** Manageability tally across the subset. */
  manageability: { manageable: number; fundamental: number; unknown: number };
}

/**
 * Decompose a subset of flagged pairs into "what it consists of": which
 * document-pairs, which themes (under taxonomyType), which targets recur, and
 * the manageability split. Powers the FlagProfileDrawer for both a friction
 * type (pairs filtered by mechanism) and a single target (pairs touching it).
 *
 * Pairs whose ids don't resolve are skipped in the breakdowns; `total` still
 * reflects the subset as passed. Same-document pairs count under a (doc, doc)
 * key. `excludeTargetId` drops a focal target from recurringTargets (target
 * view). `cap` limits each list (default 5).
 */
export function buildFlagSubsetProfile(args: {
  pairs: AlignmentResult[];
  targets: Target[];
  classifications: Array<{
    targetId: string;
    categoryId: string;
    taxonomyType: string;
    isPrimary?: boolean;
  }>;
  categories: { id: string; name: string }[];
  taxonomyType: string;
  excludeTargetId?: string;
  cap?: number;
}): FlagSubsetProfile {
  const {
    pairs,
    targets,
    classifications,
    categories,
    taxonomyType,
    excludeTargetId,
    cap = 5,
  } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const catNameById = new Map(categories.map((c) => [c.id, c.name]));
  const primaryByTarget = new Map<string, string>();
  for (const c of classifications) {
    if (!c.isPrimary || c.taxonomyType !== taxonomyType) continue;
    if (!targetMap.has(c.targetId)) continue;
    primaryByTarget.set(c.targetId, c.categoryId);
  }

  const docPairCounts = new Map<
    string,
    { a: string; b: string; count: number }
  >();
  const themeCounts = new Map<string, number>();
  const targetCounts = new Map<string, number>();
  const manageability = { manageable: 0, fundamental: 0, unknown: 0 };

  for (const p of pairs) {
    const tA = targetMap.get(p.targetAId);
    const tB = targetMap.get(p.targetBId);
    if (!tA || !tB) continue;

    const [da, db] =
      tA.sourceDocument <= tB.sourceDocument
        ? [tA.sourceDocument, tB.sourceDocument]
        : [tB.sourceDocument, tA.sourceDocument];
    const dkey = `${da}__${db}`;
    const dEntry = docPairCounts.get(dkey);
    if (dEntry) dEntry.count += 1;
    else docPairCounts.set(dkey, { a: da, b: db, count: 1 });

    const touched = new Set<string>();
    const cA = primaryByTarget.get(p.targetAId);
    const cB = primaryByTarget.get(p.targetBId);
    if (cA) touched.add(cA);
    if (cB) touched.add(cB);
    for (const c of touched) themeCounts.set(c, (themeCounts.get(c) ?? 0) + 1);

    for (const tid of [p.targetAId, p.targetBId]) {
      targetCounts.set(tid, (targetCounts.get(tid) ?? 0) + 1);
    }

    if (p.manageability === "manageable") manageability.manageable += 1;
    else if (p.manageability === "fundamental") manageability.fundamental += 1;
    else manageability.unknown += 1;
  }

  const byDocPair = [...docPairCounts.values()]
    .sort((x, y) =>
      y.count !== x.count
        ? y.count - x.count
        : `${x.a}__${x.b}`.localeCompare(`${y.a}__${y.b}`),
    )
    .slice(0, cap);

  const byTheme = [...themeCounts.entries()]
    .map(([categoryId, count]) => ({
      categoryId,
      categoryName: catNameById.get(categoryId) ?? categoryId,
      count,
    }))
    .sort((x, y) =>
      y.count !== x.count
        ? y.count - x.count
        : x.categoryId.localeCompare(y.categoryId),
    )
    .slice(0, cap);

  const recurringTargets = [...targetCounts.entries()]
    .filter(([tid]) => tid !== excludeTargetId)
    .map(([tid, count]) => ({ target: targetMap.get(tid)!, count }))
    .sort((x, y) =>
      y.count !== x.count ? y.count - x.count : x.target.id.localeCompare(y.target.id),
    )
    .slice(0, cap);

  return {
    total: pairs.length,
    byDocPair,
    byTheme,
    recurringTargets,
    manageability,
  };
}
