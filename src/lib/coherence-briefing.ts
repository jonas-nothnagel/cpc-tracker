/**
 * Helpers for the findings-first dashboard on /dashboard.
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
  WheelAlignment,
  WheelTarget,
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
  mostly_aligned: "Policies are largely coherent with one another.",
  mixed: "Coherence is mixed across the policy set.",
  lots_of_misalignment:
    "Substantial potential misalignment across the policy set.",
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
  // The drawer header sentence is composed in the component via `t()` (see
  // sector-drawer.tsx) from these fields, so it localizes; this builder stays
  // language-free and returns data only.
  return {
    categoryId,
    categoryName,
    targetCount: sectorTargetIds.size,
    flaggedCount,
    topTensions: tensions.slice(0, cap),
    topAlignments: aligns.slice(0, cap),
    signalCount,
    recurringHub,
  };
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

export interface CoverageConcentrationStat {
  /** Sectors with at least one primary-classified target. */
  populatedSectors: number;
  /** Total primary-classified targets across populated sectors. */
  totalTargets: number;
  /** Names of the fewest sectors that together hold >= `targetShare` of all targets. */
  topNames: string[];
  /** Share of all targets concentrated in `topNames` (0..1). */
  share: number;
}

/**
 * Coverage-side sibling of {@link computeConcentrationStat}: the smallest set of
 * sectors whose primary-target counts together cover at least `targetShare` of all
 * targets. Drives the Sectors headline "ambition concentrates in N of M themes".
 * Unlike the flag-count version it ranks by `targetCount` (size-robust coverage),
 * so naming the leading themes is honest rather than a largest-sector artifact.
 */
export function computeCoverageConcentration(
  sectorRows: SectorTension[],
  targetShare = 0.7,
): CoverageConcentrationStat {
  const populated = sectorRows.filter((r) => r.targetCount > 0);
  const totalTargets = populated.reduce((s, r) => s + r.targetCount, 0);
  if (totalTargets === 0) {
    return {
      populatedSectors: populated.length,
      totalTargets: 0,
      topNames: [],
      share: 0,
    };
  }
  const sorted = [...populated].sort((a, b) => b.targetCount - a.targetCount);
  const topNames: string[] = [];
  let running = 0;
  for (const row of sorted) {
    if (row.targetCount === 0) break;
    topNames.push(row.categoryName);
    running += row.targetCount;
    if (running / totalTargets >= targetShare) break;
  }
  return {
    populatedSectors: populated.length,
    totalTargets,
    topNames,
    share: running / totalTargets,
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
  alignment: WheelAlignment[],
  targets: WheelTarget[],
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

// ─── Per-document friction share (wheel rim attribution) ─────────────

export interface DocFrictionShares {
  /**
   * flagged / (aligned + flagged) for each document, summed across every
   * cross-document pair that touches it. Same basis as the headline metric
   * (Partial/`low` excluded), so a document's rim warmth and the red threads
   * on its ribbons tell one consistent story.
   */
  byDoc: Map<PolicyDocumentType, number>;
  /** Corpus-wide cross-doc flagged share on the same basis; the diverging-scale anchor. */
  mid: number;
  /** Highest single-document share; anchors full saturation so a typical doc never reads severe. */
  maxShare: number;
}

/**
 * Per-document flagged share for the landing wheel's rim attribution.
 *
 * Reuses `buildDocCoherenceGraph` edges: for each document, sums the flagged
 * and aligned cross-doc pairs across every doc-pair touching it, then
 * share = flagged / (aligned + flagged). Because it is a share (not a count), a
 * large-but-clean document stays cool while a document that participates in
 * many flagged pairs warms — so a newly uploaded policy that clashes lights up
 * its own arc without being penalised merely for being large.
 */
export function buildDocFrictionShares(
  alignment: WheelAlignment[],
  targets: WheelTarget[],
  countryConfig: CountryConfig | null,
): DocFrictionShares {
  const { edges } = buildDocCoherenceGraph(alignment, targets, countryConfig);
  const flaggedByDoc = new Map<PolicyDocumentType, number>();
  const denomByDoc = new Map<PolicyDocumentType, number>();
  let totalFlagged = 0;
  let totalDenom = 0;
  for (const e of edges) {
    const denom = e.alignedCount + e.flaggedCount;
    if (denom === 0) continue;
    for (const doc of [e.a, e.b]) {
      flaggedByDoc.set(doc, (flaggedByDoc.get(doc) ?? 0) + e.flaggedCount);
      denomByDoc.set(doc, (denomByDoc.get(doc) ?? 0) + denom);
    }
    totalFlagged += e.flaggedCount;
    totalDenom += denom;
  }
  const byDoc = new Map<PolicyDocumentType, number>();
  let maxShare = 0;
  for (const [doc, denom] of denomByDoc) {
    const share = denom > 0 ? (flaggedByDoc.get(doc) ?? 0) / denom : 0;
    byDoc.set(doc, share);
    if (share > maxShare) maxShare = share;
  }
  const mid = totalDenom > 0 ? totalFlagged / totalDenom : 0;
  return { byDoc, mid, maxShare };
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

// ─── Sector flagged share (size-robust misalignment signal) ─────────

export interface SectorCoherenceShare {
  categoryId: string;
  /** Aligned (high|medium) + flagged pairs touching this category's primary targets. */
  reviewedPairs: number;
  /** Flagged ("possible misalignment") pairs touching this category. */
  flaggedPairs: number;
  /** flaggedPairs / reviewedPairs, or null when no reviewed pair touches the category. */
  flaggedShare: number | null;
}

export interface SectorCoherenceShareSummary {
  byCategory: Map<string, SectorCoherenceShare>;
  /** Corpus flagged share over DISTINCT lens-reviewed pairs (each pair counted once). */
  mid: number;
  /** Largest flaggedShare across categories with reviewed pairs; bar-normalisation denom. */
  maxShare: number;
}

/**
 * Size-robust per-sector misalignment signal. For each category, computes
 * `flaggedShare = flagged / (alignedHighMed + flagged)` over the pairs that touch
 * one of its primary-classified targets — so a large sector is not penalised for
 * mechanically having more pairs (the failing of the raw counts from
 * buildSectorTensionDensity / buildSectorAlignmentDensity).
 *
 * The `high+medium`-only aligned basis (low/Partial excluded) matches the corpus
 * headline metric (buildDocCoherenceGraph `:877-878`, buildDocFrictionShares), so a
 * sector's flagged share, the wheel rim warmth, and the headline all speak one number.
 *
 * `flaggedShare` is null when a category has fewer than SECTOR_SHARE_MIN_REVIEWED
 * reviewed pairs, so the UI can distinguish "too few reviewed relationships to rate"
 * (row shows "—") from a genuine 0% flagged rate, and a thin sector never dominates
 * the bar scale or gets named as the corpus peak. `mid` is the corpus flag rate over
 * distinct pairs (the "average" reference tick); `maxShare` anchors bar normalisation.
 * Mirrors buildSectorTensionDensity's grouping/dedup.
 */
const SECTOR_SHARE_MIN_REVIEWED = 5;

export function buildSectorCoherenceShare(args: {
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
}): SectorCoherenceShareSummary {
  const { targets, alignment, classifications, categories, taxonomyType } = args;
  const targetIds = new Set(targets.map((t) => t.id));
  const primaryByTarget = new Map<string, string>();
  for (const c of classifications) {
    if (!c.isPrimary || c.taxonomyType !== taxonomyType) continue;
    if (!targetIds.has(c.targetId)) continue;
    primaryByTarget.set(c.targetId, c.categoryId);
  }

  const reviewedByCat = new Map<string, number>();
  const flaggedByCat = new Map<string, number>();
  for (const cat of categories) {
    reviewedByCat.set(cat.id, 0);
    flaggedByCat.set(cat.id, 0);
  }

  let corpusReviewed = 0;
  let corpusFlagged = 0;
  for (const a of alignment) {
    const flagged = isContradiction(a.alignment);
    const aligned = a.alignment === "high" || a.alignment === "medium";
    if (!flagged && !aligned) continue; // low / none are not "reviewed" pairs here
    const touched = new Set<string>();
    const catA = primaryByTarget.get(a.targetAId);
    const catB = primaryByTarget.get(a.targetBId);
    if (catA) touched.add(catA);
    if (catB) touched.add(catB);
    if (touched.size === 0) continue; // pair sits outside the active lens
    corpusReviewed += 1;
    if (flagged) corpusFlagged += 1;
    for (const c of touched) {
      reviewedByCat.set(c, (reviewedByCat.get(c) ?? 0) + 1);
      if (flagged) flaggedByCat.set(c, (flaggedByCat.get(c) ?? 0) + 1);
    }
  }

  // A sector needs a minimum of reviewed relationships before its flagged share
  // is meaningful: one flagged pair out of one reviewed reads as 100% and would
  // both dominate the bar scale (maxShare) and get named as the corpus peak. Below
  // the floor the share is left null, so the row shows "—" and the sector is
  // excluded from maxShare, the corpus range, and the peak claim.
  const byCategory = new Map<string, SectorCoherenceShare>();
  let maxShare = 0;
  for (const cat of categories) {
    const reviewedPairs = reviewedByCat.get(cat.id) ?? 0;
    const flaggedPairs = flaggedByCat.get(cat.id) ?? 0;
    const flaggedShare =
      reviewedPairs >= SECTOR_SHARE_MIN_REVIEWED
        ? flaggedPairs / reviewedPairs
        : null;
    if (flaggedShare !== null && flaggedShare > maxShare) maxShare = flaggedShare;
    byCategory.set(cat.id, {
      categoryId: cat.id,
      reviewedPairs,
      flaggedPairs,
      flaggedShare,
    });
  }

  const mid = corpusReviewed > 0 ? corpusFlagged / corpusReviewed : 0;
  return { byCategory, mid, maxShare };
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

// ─── Document-filter storyline state selection ──────────────────────
// The document toggle filters the raw targets/alignment arrays live, so every
// number recomputes in the browser. The LLM-written storyline layer can't, so
// the pipeline precomputes corpus + sector storylines per reachable toggle
// state (full corpus + each contested doc removed) and these selectors pick the
// set matching the current hidden-doc selection. Doc-pair storylines are
// pairwise and filtered live by the caller, so they need no precompute.

/** Raw corpus_themes.json payload: legacy full-corpus fields at the top level
 *  plus an optional precomputed `states` map keyed by canonical hidden-set. */
export interface CorpusThemesPayload extends CorpusThemes {
  states?: Record<string, CorpusThemes>;
}

/** Raw sector_synthesis.json payload: the full-corpus array under `synthesis`
 *  plus an optional `states` map. Older outputs are a bare array, handled by
 *  the selector's fallback. */
export interface SectorSynthesisPayload {
  synthesis: SectorSynthesis[];
  states?: Record<string, SectorSynthesis[]>;
}

/**
 * Canonical key for a hidden-doc set. Empty set -> "" (full corpus). Sorted and
 * "+"-joined. Must stay byte-identical to the Python `canonical_hidden_key` so
 * the precomputed state keys line up.
 */
export function canonicalHiddenKey(hiddenDocs: Iterable<string>): string {
  return Array.from(new Set(hiddenDocs)).sort().join("+");
}

export interface CorpusThemesSelection {
  themes: CorpusThemes | null;
  /** True when storylines exactly match the current hidden set. False means the
   *  full-corpus prose is shown as a fallback (the figures stay exact; only the
   *  prose is full-corpus) and the caller should surface a quiet caveat. */
  isExact: boolean;
}

/**
 * Select the corpus themes matching the current hidden-doc set. Falls back to
 * the full-corpus payload (with isExact=false) for any selection that has no
 * precomputed state. Legacy payloads without a `states` map are treated as the
 * full-corpus "" state, so older outputs render unchanged.
 */
export function selectCorpusThemesForState(
  payload: CorpusThemesPayload | CorpusThemes | null | undefined,
  hiddenDocs: Iterable<string>,
): CorpusThemesSelection {
  if (!payload) return { themes: null, isExact: true };
  const states = (payload as CorpusThemesPayload).states;
  const stripStates = (p: CorpusThemesPayload | CorpusThemes): CorpusThemes => {
    const rest = { ...(p as CorpusThemesPayload) };
    delete rest.states;
    return rest as CorpusThemes;
  };
  const full = states?.[""] ?? stripStates(payload);
  const key = canonicalHiddenKey(hiddenDocs);
  if (key === "") return { themes: full, isExact: true };
  const exact = states?.[key];
  if (exact) return { themes: exact, isExact: true };
  return { themes: full, isExact: false };
}

export interface SectorSynthesesSelection {
  syntheses: SectorSynthesis[];
  isExact: boolean;
}

/**
 * Select the sector syntheses matching the current hidden-doc set. Accepts the
 * new object payload or a legacy bare array (treated as the full-corpus ""
 * state). Falls back to the full-corpus array (isExact=false) for selections
 * with no precomputed state.
 */
export function selectSectorSynthesesForState(
  payload: SectorSynthesisPayload | SectorSynthesis[] | null | undefined,
  hiddenDocs: Iterable<string>,
): SectorSynthesesSelection {
  if (!payload) return { syntheses: [], isExact: true };
  const isArray = Array.isArray(payload);
  const states = isArray ? undefined : payload.states;
  const full = isArray ? payload : (payload.synthesis ?? []);
  const key = canonicalHiddenKey(hiddenDocs);
  if (key === "") return { syntheses: full, isExact: true };
  const exact = states?.[key];
  if (exact) return { syntheses: exact, isExact: true };
  return { syntheses: full, isExact: false };
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

// ─── Target friction hierarchy (high-friction-target drill-in) ──

export interface TargetFrictionCounterpart {
  /** The non-focal target of the flagged pair. */
  counterpart: Target;
  /** The flagged pair (carries mechanism, manageability, confidence, description). */
  pair: AlignmentResult;
}

export interface TargetFrictionDocGroup {
  peerDoc: PolicyDocumentType;
  count: number;
  counterparts: TargetFrictionCounterpart[];
}

export interface TargetFrictionMechanismGroup {
  /** null = the flagged pair carried no mechanism. */
  mechanism: AlignmentMechanism | null;
  count: number;
  byDoc: TargetFrictionDocGroup[];
}

export interface TargetFrictionTree {
  /** Total flagged pairs touching the focal target (both ids resolvable). */
  total: number;
  byMechanism: TargetFrictionMechanismGroup[];
}

/**
 * Decompose every flagged pair touching one focal target into a three-level
 * hierarchy: friction mechanism → peer document → counterpart target. Powers the
 * high-friction-target drill-in in the FlagProfileDrawer, so a target carrying a
 * lot of misalignment reads as a structure rather than a flat capped list.
 *
 * Only pairs where both ids resolve are counted (orphans skipped, matching the
 * rest of the misalignment story). Mechanism groups are ordered by severity
 * (goal_conflict → resource_competition → delivery_friction), with a trailing
 * group for flagged pairs lacking a mechanism. Within a mechanism, peer docs are
 * ordered by count desc then label; counterparts by their sourceLabel.
 */
export function buildTargetFrictionTree(args: {
  focalTargetId: string;
  pairs: AlignmentResult[];
  targets: Target[];
}): TargetFrictionTree {
  const { focalTargetId, pairs, targets } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  if (!targetMap.has(focalTargetId)) return { total: 0, byMechanism: [] };

  const mechGroups = new Map<
    string,
    {
      mechanism: AlignmentMechanism | null;
      docs: Map<string, TargetFrictionCounterpart[]>;
    }
  >();
  let total = 0;

  for (const p of pairs) {
    if (p.alignment !== "flagged") continue;
    if (p.targetAId !== focalTargetId && p.targetBId !== focalTargetId) continue;
    const counterpartId =
      p.targetAId === focalTargetId ? p.targetBId : p.targetAId;
    const counterpart = targetMap.get(counterpartId);
    if (!counterpart) continue;
    total += 1;
    const mechanism = p.mechanism ?? null;
    const mKey = mechanism ?? "__none__";
    let group = mechGroups.get(mKey);
    if (!group) {
      group = { mechanism, docs: new Map() };
      mechGroups.set(mKey, group);
    }
    const docKey = counterpart.sourceDocument;
    const list = group.docs.get(docKey);
    if (list) list.push({ counterpart, pair: p });
    else group.docs.set(docKey, [{ counterpart, pair: p }]);
  }

  // null mechanism sorts last (after delivery_friction = 2).
  const severityOf = (m: AlignmentMechanism | null): number =>
    m ? (MECHANISM_SEVERITY[m] ?? 3) : 4;

  const byMechanism: TargetFrictionMechanismGroup[] = [...mechGroups.values()]
    .map((g) => {
      const byDoc: TargetFrictionDocGroup[] = [...g.docs.entries()]
        .map(([peerDoc, counterparts]) => ({
          peerDoc: peerDoc as PolicyDocumentType,
          count: counterparts.length,
          counterparts: [...counterparts].sort((x, y) =>
            x.counterpart.sourceLabel.localeCompare(y.counterpart.sourceLabel),
          ),
        }))
        .sort((x, y) =>
          y.count !== x.count ? y.count - x.count : x.peerDoc.localeCompare(y.peerDoc),
        );
      const count = byDoc.reduce((s, d) => s + d.count, 0);
      return { mechanism: g.mechanism, count, byDoc };
    })
    .sort((x, y) => severityOf(x.mechanism) - severityOf(y.mechanism));

  return { total, byMechanism };
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
    // Only the lens's own themes: a derived "no clear theme" marker, or an id
    // from another sector list sharing this taxonomyType, is not a theme and
    // must never surface as a raw id.
    if (!catNameById.has(c.categoryId)) continue;
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
      categoryName: catNameById.get(categoryId)!,
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

// ─── Storyline live profiles (Direction rows + ThemeDrawer) ─────────
// Display principle: the UI never trusts a storyline's persisted `pair_count`
// for on-page counts. Everything below recomputes from the visible alignment,
// so counts stay exact under document toggling and stay honest for old-format
// payloads whose persisted counts over-counted.

const STORYLINE_CONFIDENCE_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Polarity rule shared with the ThemeDrawer: friction themes own flagged
 * pairs; reinforcement themes own medium/high aligned pairs (low is too weak
 * to read as "reinforcing"; matches the verdict computation).
 */
function storylinePolarityMatches(
  storyline: CorpusStoryline,
  level: AlignmentLevel,
): boolean {
  return storyline.type === "friction"
    ? level === "flagged"
    : level === "medium" || level === "high";
}

export interface StorylineLiveStats {
  /** Polarity-matched cross-doc pairs inside the theme's doc pairs. */
  liveCount: number;
  /** Pairs touching each document (a pair counts under both its docs). */
  docCounts: Map<string, number>;
}

/**
 * One pass over the visible alignment computing every storyline's live count
 * and per-document pair counts. Cheap enough to re-run on each document
 * toggle (|alignment| × matching storylines).
 */
export function computeStorylineLiveStats(
  storylines: CorpusStoryline[],
  alignment: AlignmentResult[],
  targets: Target[],
): Map<CorpusStoryline, StorylineLiveStats> {
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const stats = new Map<CorpusStoryline, StorylineLiveStats>();
  const byDocKey = new Map<string, CorpusStoryline[]>();
  for (const s of storylines) {
    stats.set(s, { liveCount: 0, docCounts: new Map() });
    for (const key of getStorylineDocPairKeys(s)) {
      const arr = byDocKey.get(key) ?? [];
      arr.push(s);
      byDocKey.set(key, arr);
    }
  }
  for (const r of alignment) {
    if (r.alignment === "none" || r.alignment === "low") continue;
    const tA = targetMap.get(r.targetAId);
    const tB = targetMap.get(r.targetBId);
    if (!tA || !tB) continue;
    if (tA.sourceDocument === tB.sourceDocument) continue;
    const members = byDocKey.get(
      getDocPairKey(tA.sourceDocument, tB.sourceDocument),
    );
    if (!members) continue;
    for (const s of members) {
      if (!storylinePolarityMatches(s, r.alignment)) continue;
      const st = stats.get(s)!;
      st.liveCount += 1;
      for (const d of [tA.sourceDocument, tB.sourceDocument]) {
        st.docCounts.set(d, (st.docCounts.get(d) ?? 0) + 1);
      }
    }
  }
  return stats;
}

export interface StorylineProfile {
  /** Polarity-matched cross-doc pairs inside the theme's doc pairs. */
  liveCount: number;
  /** Documents the live pairs touch; share is of liveCount (max 1 per doc). */
  byDoc: { doc: string; count: number; share: number }[];
  /** Top document pairs (from buildFlagSubsetProfile). */
  byDocPair: { a: string; b: string; count: number }[];
  /** Targets recurring most, resolvable anchors pinned first. */
  topTargets: { target: Target; count: number; isAnchor: boolean }[];
  /** Sector chips under the active taxonomy (from buildFlagSubsetProfile). */
  byTheme: { categoryId: string; categoryName: string; count: number }[];
}

/**
 * Full live drill-down for one storyline: which documents drive it, which
 * document pairs, which targets recur (the pipeline's anchor targets pinned
 * first; anchors from hidden documents or with no live pairs drop silently),
 * and which sectors it touches under the active taxonomy lens.
 */
export function buildStorylineProfile(args: {
  storyline: CorpusStoryline;
  alignment: AlignmentResult[];
  targets: Target[];
  classifications: Array<{
    targetId: string;
    categoryId: string;
    taxonomyType: string;
    isPrimary?: boolean;
  }>;
  categories: { id: string; name: string }[];
  taxonomyType: string;
  cap?: number;
}): StorylineProfile {
  const {
    storyline,
    alignment,
    targets,
    classifications,
    categories,
    taxonomyType,
    cap = 5,
  } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const memberKeys = getStorylineDocPairKeys(storyline);
  const memberPairs: AlignmentResult[] = [];
  for (const r of alignment) {
    if (!storylinePolarityMatches(storyline, r.alignment)) continue;
    const tA = targetMap.get(r.targetAId);
    const tB = targetMap.get(r.targetBId);
    if (!tA || !tB) continue;
    if (tA.sourceDocument === tB.sourceDocument) continue;
    if (!memberKeys.has(getDocPairKey(tA.sourceDocument, tB.sourceDocument))) {
      continue;
    }
    memberPairs.push(r);
  }

  const sub = buildFlagSubsetProfile({
    pairs: memberPairs,
    targets,
    classifications,
    categories,
    taxonomyType,
    cap,
  });

  const liveCount = memberPairs.length;
  const docCounts = new Map<string, number>();
  const targetCounts = new Map<string, number>();
  for (const p of memberPairs) {
    const tA = targetMap.get(p.targetAId)!;
    const tB = targetMap.get(p.targetBId)!;
    for (const d of [tA.sourceDocument, tB.sourceDocument]) {
      docCounts.set(d, (docCounts.get(d) ?? 0) + 1);
    }
    for (const tid of [p.targetAId, p.targetBId]) {
      targetCounts.set(tid, (targetCounts.get(tid) ?? 0) + 1);
    }
  }
  const byDoc = [...docCounts.entries()]
    .map(([doc, count]) => ({
      doc,
      count,
      share: liveCount > 0 ? count / liveCount : 0,
    }))
    .sort((x, y) =>
      y.count !== x.count ? y.count - x.count : x.doc.localeCompare(y.doc),
    );

  const anchorIds = (storyline.anchor_target_ids ?? []).filter(
    (id) => targetMap.has(id) && (targetCounts.get(id) ?? 0) > 0,
  );
  const anchorSet = new Set(anchorIds);
  const anchors = anchorIds
    .map((id) => ({
      target: targetMap.get(id)!,
      count: targetCounts.get(id) ?? 0,
      isAnchor: true,
    }))
    .sort((x, y) =>
      y.count !== x.count
        ? y.count - x.count
        : x.target.id.localeCompare(y.target.id),
    );
  const rest = [...targetCounts.entries()]
    .filter(([tid]) => !anchorSet.has(tid))
    .map(([tid, count]) => ({
      target: targetMap.get(tid)!,
      count,
      isAnchor: false,
    }))
    .sort((x, y) =>
      y.count !== x.count
        ? y.count - x.count
        : x.target.id.localeCompare(y.target.id),
    );
  const topTargets = [...anchors, ...rest].slice(0, cap);

  return {
    liveCount,
    byDoc,
    byDocPair: sub.byDocPair,
    topTargets,
    byTheme: sub.byTheme,
  };
}

/**
 * Storylines of one polarity, most decision-relevant first: confidence rank,
 * then live count (persisted pair_count only as fallback when no live counter
 * is supplied), then name for a stable order.
 */
export function rankStorylines(
  storylines: CorpusStoryline[],
  type: "reinforcement" | "friction",
  liveCountOf?: (s: CorpusStoryline) => number,
): CorpusStoryline[] {
  const countOf = liveCountOf ?? ((s: CorpusStoryline) => s.pair_count);
  return storylines
    .filter((s) => s.type === type)
    .sort((a, b) => {
      const dC =
        (STORYLINE_CONFIDENCE_RANK[a.confidence] ?? 3) -
        (STORYLINE_CONFIDENCE_RANK[b.confidence] ?? 3);
      if (dC !== 0) return dC;
      const dN = countOf(b) - countOf(a);
      if (dN !== 0) return dN;
      return a.name.localeCompare(b.name);
    });
}

export interface ConcentrationDocAttribution {
  doc: PolicyDocumentType;
  /** How many of the concentration set's targets sit in `doc`. */
  count: number;
  /** Size of the concentration set. */
  total: number;
}

/**
 * Dominant source document of the target-concentration set: returned when at
 * least half of the greedy top targets share one document and no other
 * document ties it. Drives the doc-attributed focus clause ("5 of them in
 * the National Mineral Policy"). Documents only, never ministries.
 */
export function concentrationDocAttribution(
  c: TargetConcentration,
): ConcentrationDocAttribution | null {
  const total = c.topTargets.length;
  if (total === 0) return null;
  const counts = new Map<string, number>();
  for (const e of c.topTargets) {
    counts.set(
      e.target.sourceDocument,
      (counts.get(e.target.sourceDocument) ?? 0) + 1,
    );
  }
  let best: { doc: string; count: number } | null = null;
  let tied = false;
  for (const [doc, count] of counts.entries()) {
    if (!best || count > best.count) {
      best = { doc, count };
      tied = false;
    } else if (count === best.count) {
      tied = true;
    }
  }
  if (!best || tied || best.count / total < 0.5) return null;
  return { doc: best.doc as PolicyDocumentType, count: best.count, total };
}
