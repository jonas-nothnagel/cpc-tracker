/**
 * Target Atlas signals.
 *
 * Each policy target gets placed on a quadrant scatter by two derived
 * signals. A "lens" taxonomy is the bridge between targets, BER programmes,
 * and BTR actions: two items are linked if they share at least one relevant
 * category in the selected taxonomy.
 *
 *   X (coherence) = # of cross-doc policy targets sharing a category with this target
 *   Y (backing)   = # of BER programmes + # of BTR actions sharing a category
 *
 * The taxonomy is parameterised so the same calculation runs against GLOBE
 * (biodiversity lens), IPCC sector (mitigation lens), NBS, or any other
 * classification with multi-label `isRelevant` data.
 *
 * LLM alignment data (measure/budget/policy alignments) is not used to
 * compute axis positions, but is preserved on the side panel as drill-down
 * context and is the sole source for tension detection (contradictions).
 *
 * Pure. Safe to call on the client at render time.
 */

import type {
  Target,
  ThematicClassification,
  AlignmentResult,
  AlignmentLevel,
} from "@/types";
import { isContradiction } from "@/types";

/** Weight per alignment level — used for tension severity ordering. */
export const ALIGNMENT_WEIGHTS: Record<AlignmentLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  low_tension: 1,
  moderate_contradiction: 2,
  high_contradiction: 3,
  none: 0,
};

/**
 * Taxonomies usable as the lens. Any taxonomy with classifications
 * emitted by the pipeline is a valid value; the component advertises only
 * those with both policy-target and at least one BER/BTR classification.
 */
export type AtlasTaxonomy = "nbs" | "sector" | "globe" | "globe_sub" | "adaptation_goal";

export interface NeighborLink {
  targetId: string;
  alignment: AlignmentLevel;
  description: string;
}

export interface BudgetLink {
  pseudoTargetId: string;
  label: string;
  alignment: AlignmentLevel;
  description: string;
}

export interface ActionLink {
  pseudoTargetId: string;
  label: string;
  alignment: AlignmentLevel;
  description: string;
}

/** A bridge link rationale: which shared categories connect two items. */
export interface BridgeLink {
  pseudoTargetId: string;
  label: string;
  sharedCategories: string[];
}

export interface AtlasSignal {
  targetId: string;
  /** X. # cross-doc policy targets sharing a relevant category with this target, in the active lens. */
  coherenceCount: number;
  /** # BTR actions sharing a relevant category. */
  implementationCount: number;
  /** # BER programmes sharing a relevant category. */
  budgetCount: number;
  /** implementationCount + budgetCount. Y axis. */
  backingCount: number;
  /** # relevant lens categories this target has. Zero = lens-orphan (sits at origin by construction). */
  lensCategoryCount: number;
  /** Primary lens category id, or null if target has none in this lens. */
  lensPrimary: string | null;
  /** # contradictions this target is in (from LLM alignment data). */
  tensionCount: number;
  /** Weight-sum severity of tensions, for top-item ranking. */
  tensionSeverity: number;
  /** Primary category id per color-visible taxonomy, null if not classified. */
  primaryByTaxonomy: Record<string, string | null>;
  /** All policy-policy alignment pairs from LLM (low included), for panel. */
  alignmentNeighbors: NeighborLink[];
  /** BER programme alignments from LLM (low included). */
  budgetLinks: BudgetLink[];
  /** BTR action alignments from LLM (low included). */
  actionLinks: ActionLink[];
  /** BER programmes bridged via shared lens categories. */
  budgetBridgeLinks: BridgeLink[];
  /** BTR actions bridged via shared lens categories. */
  actionBridgeLinks: BridgeLink[];
  /** Cross-doc policy targets bridged via shared lens categories. */
  coherenceBridgeLinks: BridgeLink[];
}

export interface BuildAtlasInput {
  policyTargets: Target[];
  classifications: ThematicClassification[];
  alignments: AlignmentResult[];
  budgetAlignments?: AlignmentResult[] | null;
  targetsById: Map<string, Target>;
  /** Bridge taxonomy (default: globe). */
  bridgeTaxonomy: AtlasTaxonomy;
}

const COLOR_TAXONOMIES: readonly string[] = ["nbs", "sector", "globe"];

/**
 * Pseudo-target fields that exist on BER / BTR entries in the JSON served
 * by /api/dashboard, but that the Target type does not yet declare. Read
 * them via a narrow local assertion rather than widening Target so the
 * change stays contained to this file.
 */
type PseudoTargetExtras = {
  expenditure?: Record<string, number | null>;
  measureStatus?: string;
};

/** Sum of yearly expenditure values; null/non-numeric entries skipped. */
function totalExpenditure(e: Record<string, number | null> | undefined): number {
  if (!e) return 0;
  let sum = 0;
  for (const v of Object.values(e)) {
    if (typeof v === "number" && Number.isFinite(v)) sum += v;
  }
  return sum;
}

/**
 * BTR action status weights — uniform ordinal increments tied to stages
 * of policy execution. Every reported stage carries positive weight;
 * only CTF notation keys (NA/UA/…) and empty strings map to zero.
 */
const STATUS_WEIGHTS: Record<string, number> = {
  implemented: 1.0,
  completed: 1.0,
  ongoing: 0.75,
  adopted: 0.5,
  planned: 0.25,
};

function statusWeight(raw: string | undefined | null): number {
  if (!raw) return 0;
  const s = raw.toLowerCase().trim();
  if (!s) return 0;
  for (const [key, w] of Object.entries(STATUS_WEIGHTS)) {
    if (s.includes(key)) return w;
  }
  return 0;
}

export function buildAtlasSignals(input: BuildAtlasInput): AtlasSignal[] {
  const {
    policyTargets,
    classifications,
    alignments,
    budgetAlignments,
    targetsById,
    bridgeTaxonomy,
  } = input;
  const policyIds = new Set(policyTargets.map((t) => t.id));

  // Primary category per (target, taxonomy) — used for color.
  const primaryMap = new Map<string, Map<string, string>>();
  // Relevant category set per (target, taxonomy) — used for multi-label bridge.
  const relevantByTax = new Map<string, Map<string, Set<string>>>();
  for (const c of classifications) {
    if (c.isPrimary) {
      let byTax = primaryMap.get(c.targetId);
      if (!byTax) {
        byTax = new Map();
        primaryMap.set(c.targetId, byTax);
      }
      byTax.set(c.taxonomyType, c.categoryId);
    }
    if (c.isRelevant) {
      let byTax = relevantByTax.get(c.targetId);
      if (!byTax) {
        byTax = new Map();
        relevantByTax.set(c.targetId, byTax);
      }
      let set = byTax.get(c.taxonomyType);
      if (!set) {
        set = new Set();
        byTax.set(c.taxonomyType, set);
      }
      set.add(c.categoryId);
    }
  }

  const relevantFor = (id: string): Set<string> =>
    relevantByTax.get(id)?.get(bridgeTaxonomy) ?? new Set();

  // Enumerate BER and BTR pseudo-targets for backing calculation.
  const berIds: string[] = [];
  const btrIds: string[] = [];
  for (const t of targetsById.values()) {
    if (t.sourceDocument === "BER") berIds.push(t.id);
    else if (t.sourceDocument === "BTR") btrIds.push(t.id);
  }

  // Mean spend across funded BER programmes — the reference used to scale
  // each budget bridge. A programme at 5× the mean spend contributes 5×
  // the backing of a mean-sized one; a 10% programme contributes 0.1×.
  // Using the mean (rather than an arbitrary constant) keeps the scoring
  // data-driven: the reference shifts automatically per country.
  let fundedSpendSum = 0;
  let fundedProgrammeCount = 0;
  const spendById = new Map<string, number>();
  for (const bid of berIds) {
    const ber = targetsById.get(bid) as
      | (Target & PseudoTargetExtras)
      | undefined;
    const s = totalExpenditure(ber?.expenditure);
    spendById.set(bid, s);
    if (s > 0) {
      fundedSpendSum += s;
      fundedProgrammeCount += 1;
    }
  }
  const meanFundedSpend =
    fundedProgrammeCount > 0 ? fundedSpendSum / fundedProgrammeCount : 0;

  // Index LLM alignment neighbors per target for side-panel lookup.
  const llmNeighbors = new Map<
    string,
    { policy: NeighborLink[]; btr: ActionLink[] }
  >();
  for (const a of alignments) {
    const registerForTarget = (selfId: string, otherId: string) => {
      const other = targetsById.get(otherId);
      if (!other) return;
      let bucket = llmNeighbors.get(selfId);
      if (!bucket) {
        bucket = { policy: [], btr: [] };
        llmNeighbors.set(selfId, bucket);
      }
      if (other.sourceDocument === "BTR") {
        bucket.btr.push({
          pseudoTargetId: otherId,
          label: other.sourceLabel ?? otherId,
          alignment: a.alignment,
          description: a.description,
        });
      } else if (
        policyIds.has(otherId) &&
        other.sourceDocument !== "BER"
      ) {
        bucket.policy.push({
          targetId: otherId,
          alignment: a.alignment,
          description: a.description,
        });
      }
    };
    if (policyIds.has(a.targetAId)) registerForTarget(a.targetAId, a.targetBId);
    if (policyIds.has(a.targetBId)) registerForTarget(a.targetBId, a.targetAId);
  }

  const llmBudgetLinks = new Map<string, BudgetLink[]>();
  for (const a of budgetAlignments ?? []) {
    const resolve = (selfId: string, otherId: string) => {
      const other = targetsById.get(otherId);
      if (!other || other.sourceDocument !== "BER") return;
      let arr = llmBudgetLinks.get(selfId);
      if (!arr) {
        arr = [];
        llmBudgetLinks.set(selfId, arr);
      }
      arr.push({
        pseudoTargetId: otherId,
        label: other.sourceLabel ?? otherId,
        alignment: a.alignment,
        description: a.description,
      });
    };
    if (policyIds.has(a.targetAId)) resolve(a.targetAId, a.targetBId);
    if (policyIds.has(a.targetBId)) resolve(a.targetBId, a.targetAId);
  }

  const signals: AtlasSignal[] = [];
  for (const target of policyTargets) {
    const tSet = relevantFor(target.id);

    // Bridge-based coherence — cross-doc policy targets sharing ≥1 category.
    const coherenceBridgeLinks: BridgeLink[] = [];
    for (const other of policyTargets) {
      if (other.id === target.id) continue;
      if (other.sourceDocument === target.sourceDocument) continue;
      const oSet = relevantFor(other.id);
      const shared: string[] = [];
      for (const c of tSet) if (oSet.has(c)) shared.push(c);
      if (shared.length > 0) {
        coherenceBridgeLinks.push({
          pseudoTargetId: other.id,
          label: other.sourceLabel ?? other.id,
          sharedCategories: shared,
        });
      }
    }

    // Bridge-based budget — BER programmes sharing ≥1 category.
    // Each bridge contributes `programme_spend / meanFundedSpend`, so
    // larger programmes lift the score proportionally more. Unfunded
    // programmes still appear in `budgetBridgeLinks` for drill-down but
    // contribute zero, matching the user's intent that paper
    // commitments without money shouldn't raise the score.
    const budgetBridgeLinks: BridgeLink[] = [];
    let weightedBudget = 0;
    for (const bid of berIds) {
      const bSet = relevantFor(bid);
      const shared: string[] = [];
      for (const c of tSet) if (bSet.has(c)) shared.push(c);
      if (shared.length > 0) {
        const ber = targetsById.get(bid);
        budgetBridgeLinks.push({
          pseudoTargetId: bid,
          label: ber?.sourceLabel ?? bid,
          sharedCategories: shared,
        });
        const spend = spendById.get(bid) ?? 0;
        if (spend > 0 && meanFundedSpend > 0) {
          weightedBudget += spend / meanFundedSpend;
        }
      }
    }

    // Bridge-based implementation — BTR actions sharing ≥1 category.
    // Each bridge contributes its status weight (Implemented=1.0,
    // Ongoing=0.75, Adopted=0.5, Planned=0.25, NA/null=0) so that
    // advanced stages lift the backing score more than early ones.
    const actionBridgeLinks: BridgeLink[] = [];
    let weightedImplementation = 0;
    for (const aid of btrIds) {
      const aSet = relevantFor(aid);
      const shared: string[] = [];
      for (const c of tSet) if (aSet.has(c)) shared.push(c);
      if (shared.length > 0) {
        const act = targetsById.get(aid);
        actionBridgeLinks.push({
          pseudoTargetId: aid,
          label: act?.sourceLabel ?? aid,
          sharedCategories: shared,
        });
        weightedImplementation += statusWeight(
          (act as (Target & PseudoTargetExtras) | undefined)?.measureStatus,
        );
      }
    }

    // Tensions — from LLM alignment data only (taxonomy can't detect them).
    let tensionCount = 0;
    let tensionSeverity = 0;
    const bucket = llmNeighbors.get(target.id);
    if (bucket) {
      for (const n of bucket.policy) {
        if (isContradiction(n.alignment)) {
          tensionCount += 1;
          tensionSeverity += ALIGNMENT_WEIGHTS[n.alignment] ?? 0;
        }
      }
    }

    const primaryByTaxonomyMap = primaryMap.get(target.id);
    const primaryByTaxonomy: Record<string, string | null> = {};
    for (const tax of COLOR_TAXONOMIES) {
      primaryByTaxonomy[tax] = primaryByTaxonomyMap?.get(tax) ?? null;
    }

    const coherenceCount = coherenceBridgeLinks.length;
    const budgetCount = budgetBridgeLinks.length;
    const implementationCount = actionBridgeLinks.length;
    // Backing is quality-weighted: each BER bridge contributes
    // `programme_spend / meanFundedSpend`, each BTR bridge contributes
    // its status weight. `budgetCount` and `implementationCount` stay as
    // raw bridge counts so the side panel still reads
    // "N BER programmes" / "N BTR actions".
    const backingCount = weightedBudget + weightedImplementation;
    const lensCategoryCount = tSet.size;
    const lensPrimary = primaryByTaxonomyMap?.get(bridgeTaxonomy) ?? null;

    signals.push({
      targetId: target.id,
      coherenceCount,
      implementationCount,
      budgetCount,
      backingCount,
      lensCategoryCount,
      lensPrimary,
      tensionCount,
      tensionSeverity,
      primaryByTaxonomy,
      alignmentNeighbors: bucket?.policy ?? [],
      budgetLinks: llmBudgetLinks.get(target.id) ?? [],
      actionLinks: bucket?.btr ?? [],
      budgetBridgeLinks,
      actionBridgeLinks,
      coherenceBridgeLinks,
    });
  }

  // Diagnostic — confirms the quality-weighted backing logic is actually
  // running in the browser. Safe to leave in; negligible cost. Remove
  // once the reader is satisfied.
  if (typeof window !== "undefined" && signals.length > 0) {
    const max = signals.reduce((m, s) => (s.backingCount > m ? s.backingCount : m), 0);
    console.log(
      `[atlas-signals] ${signals.length} signals · backingCount max ${max.toFixed(2)} (quality-weighted)`,
    );
  }

  return signals;
}

/** Median of a numeric array; returns 0 for empty input. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Adaptive threshold: median by default, falling back to mean of non-zero
 * values when the median collapses to zero (common for sparse BER/BTR).
 */
export function quadrantThreshold(values: number[]): number {
  const m = median(values);
  if (m > 0) return m;
  const nonzero = values.filter((v) => v > 0);
  if (nonzero.length === 0) return 0;
  return nonzero.reduce((s, v) => s + v, 0) / nonzero.length;
}

export type Quadrant =
  | "well_supported"
  | "backed_isolated"
  | "ambition_gap"
  | "limited_uptake";

export function classifyQuadrant(
  coherenceCount: number,
  backingCount: number,
  xThreshold: number,
  yThreshold: number,
): Quadrant {
  const highX = coherenceCount >= xThreshold;
  const highY = backingCount >= yThreshold;
  if (highX && highY) return "well_supported";
  if (!highX && highY) return "backed_isolated";
  if (highX && !highY) return "ambition_gap";
  return "limited_uptake";
}

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  well_supported: "Well-supported",
  backed_isolated: "Backed but isolated",
  ambition_gap: "Ambition gap",
  limited_uptake: "Limited uptake",
};

/**
 * Tension ring width by count. Only high-tension targets (5+) get flagged,
 * so reviewers can scan straight to the hotspots without the chart
 * looking like measles. Null = no ring.
 */
export const HIGH_TENSION_THRESHOLD = 5;

export function tensionRingWidth(tensionCount: number): number | null {
  return tensionCount >= HIGH_TENSION_THRESHOLD ? 3 : null;
}

export function budgetBackingLabel(budgetCount: number): string {
  if (budgetCount <= 0) return "Not in budget";
  if (budgetCount <= 2) return "Partly budget-backed";
  return "Well budget-backed";
}
