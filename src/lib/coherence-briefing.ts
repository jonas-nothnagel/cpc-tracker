/**
 * Helpers for the findings-first prototype on /prototypes.
 *
 * Phase A only computes what the front of the page needs:
 *   - a headline verdict ("are policies pulling the same direction?")
 *   - the top-N fault lines (worst contradictions across the dataset)
 *   - one aligned + one tension primer pair for Scene 2
 *
 * Deeper per-sector briefings ship in Phase C and live in their own helpers.
 *
 * Discipline matches `coherence-insights.ts`: every number quoted in the UI
 * must trace back to the dataset passed in; no LLM calls, no fabrication.
 */

import { isContradiction } from "@/types";
import type {
  AlignmentLevel,
  AlignmentResult,
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
export type VerdictBucket = "mostly_aligned" | "mixed" | "lots_of_tension";

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
  lots_of_tension: "Substantial tension across the policy set.",
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
        : "lots_of_tension";
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
  /** Top tension pairs (any side touches this sector), severity-sorted. */
  topTensions: FaultLine[];
  /** Top strong alignments (any side touches this sector), high first. */
  topAlignments: FaultLine[];
  /** Total pairs of any positive or negative level that touch the sector. */
  signalCount: number;
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
  return {
    categoryId,
    categoryName,
    targetCount: sectorTargetIds.size,
    topTensions: tensions.slice(0, cap),
    topAlignments: aligns.slice(0, cap),
    signalCount,
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
