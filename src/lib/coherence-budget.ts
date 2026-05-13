/**
 * Aggregates BER (Biodiversity Expenditure Review) data into per-primary-GLOBE
 * totals for the coherence wheel's budget overlay and chat context.
 *
 * BER programmes are classified to GLOBE subcategories (taxonomyType
 * "globe_sub", 48 codes in BIOFIN); the wheel groups arcs by primary GLOBE
 * category (9 ids). This module rolls subcategory totals up to their parent
 * primary using the parentId on GlobeSubcategory, then joins target counts and
 * contradiction-pair counts so a single per-category record drives both the
 * visual saturation and the chat's budget reasoning.
 */

import type {
  AlignmentResult,
  BerData,
  BerExpenditureSeries,
  GlobeCategory,
  GlobeSubcategory,
  Target,
  ThematicClassification,
} from "@/types";
import { isContradiction } from "@/types";

export interface CategoryBudgetEntry {
  /** Primary GLOBE category id, e.g. "globe_5". */
  categoryId: string;
  /** Primary GLOBE category name, e.g. "Protected areas". */
  categoryName: string;
  /** Cumulative tagged BER spend for this category, in `berData.unit`. */
  totalBudget: number;
  /** Share of the sum across all primary categories, 0..1. */
  shareOfTotalBudget: number;
  /** Number of policy targets whose primary GLOBE tag is this category, in
   *  the targets list passed in (already scoped if the caller pre-filters). */
  targetCount: number;
  /** Share of total tagged targets, 0..1. */
  shareOfTargets: number;
  /** Negative-side alignment pairs (likely/possible conflict, possible
   *  misalignment) where at least one target's primary GLOBE is this category.
   *  Counted once per pair even if both targets fall in the same category. */
  contradictionPairCount: number;
}

export interface CategoryBudgetSummary {
  entries: CategoryBudgetEntry[];
  /** Sum of all entries' totalBudget. */
  totalBudget: number;
  /** Largest single shareOfTotalBudget across entries — denominator for the
   *  saturation ramp so the most-funded category renders at full alpha. */
  maxShare: number;
  /** Unit string from berData (e.g. "billion"). Display in legend / panel. */
  unit: string;
  /** Currency code from berData (e.g. "MNT"). */
  currency: string;
  /** Reporting period from berData. */
  period: { start: number; end: number };
}

function totalExpenditure(series: BerExpenditureSeries): number {
  let sum = 0;
  for (const v of Object.values(series.values)) {
    if (typeof v === "number") sum += v;
  }
  return sum;
}

/**
 * Build the per-primary-GLOBE budget summary. Returns null when budget data
 * is missing or carries no positive expenditure — the caller can use this as
 * a single nullable signal for "should the budget overlay render at all?".
 */
export function computeBudgetByGlobeCategory(args: {
  berData: BerData | null;
  globeCategories: GlobeCategory[];
  globeSubcategories: GlobeSubcategory[];
  classifications: ThematicClassification[];
  targets: Target[];
  alignment: AlignmentResult[];
}): CategoryBudgetSummary | null {
  const {
    berData,
    globeCategories,
    globeSubcategories,
    classifications,
    targets,
    alignment,
  } = args;

  if (!berData || globeCategories.length === 0) return null;

  // 1. Cumulative expenditure per BER pseudo-target id (across all years).
  //    Matches financing-coherence.tsx's `expByBerId` shape so the two views
  //    always reference the same money totals.
  const expByBerId = new Map<string, number>();
  for (const e of berData.expenditure) {
    const t = totalExpenditure(e);
    if (t > 0) expByBerId.set(`BER_${e.code}`, t);
  }
  if (expByBerId.size === 0) return null;

  // 2. Subcategory → parent primary id lookup. Subcategory taxonomy carries
  //    the parent relationship; if a country defines no subcategories, the
  //    budget overlay has nothing to roll up (handled below).
  const subToParent = new Map<string, string>();
  for (const s of globeSubcategories) subToParent.set(s.id, s.parentId);

  // 3. Per-primary budget total: sum BER expenditure via globe_sub → parent.
  //    Single-label (isPrimary === true) so each programme contributes its
  //    full expenditure to exactly one primary, matching the Financing
  //    Coherence rollup convention.
  const budgetByPrimary = new Map<string, number>();
  for (const c of classifications) {
    if (c.taxonomyType !== "globe_sub") continue;
    if (c.isPrimary !== true) continue;
    if (!c.targetId.startsWith("BER_")) continue;
    const parentId = subToParent.get(c.categoryId);
    if (!parentId) continue;
    const exp = expByBerId.get(c.targetId) ?? 0;
    budgetByPrimary.set(parentId, (budgetByPrimary.get(parentId) ?? 0) + exp);
  }
  const totalBudget = Array.from(budgetByPrimary.values()).reduce(
    (a, b) => a + b,
    0,
  );
  if (totalBudget <= 0) return null;

  // 4. Per-primary target count: policy targets classified to primary GLOBE
  //    (taxonomyType "globe", isPrimary true), scoped to the targets list
  //    passed in so the caller controls visibility (visible-doc filtering).
  const targetIds = new Set(targets.map((t) => t.id));
  const targetsByPrimary = new Map<string, Set<string>>();
  for (const c of classifications) {
    if (c.taxonomyType !== "globe") continue;
    if (c.isPrimary !== true) continue;
    if (!targetIds.has(c.targetId)) continue;
    const set = targetsByPrimary.get(c.categoryId) ?? new Set<string>();
    set.add(c.targetId);
    targetsByPrimary.set(c.categoryId, set);
  }
  const totalTargets = Array.from(targetsByPrimary.values()).reduce(
    (a, b) => a + b.size,
    0,
  );

  // 5. Target id → primary GLOBE id reverse map for pair-count joins.
  const primaryByTarget = new Map<string, string>();
  for (const [primary, ids] of targetsByPrimary.entries()) {
    for (const id of ids) primaryByTarget.set(id, primary);
  }

  // 6. Contradiction pair count per primary: walk the alignment list, count a
  //    pair once for each distinct primary one of its targets belongs to.
  //    Using a Set per pair prevents double-counting when both targets share
  //    the same primary.
  const contraByPrimary = new Map<string, number>();
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    const primaries = new Set<string>();
    const pA = primaryByTarget.get(a.targetAId);
    const pB = primaryByTarget.get(a.targetBId);
    if (pA) primaries.add(pA);
    if (pB) primaries.add(pB);
    for (const p of primaries) {
      contraByPrimary.set(p, (contraByPrimary.get(p) ?? 0) + 1);
    }
  }

  // 7. Assemble one entry per primary GLOBE category. Categories with zero
  //    budget AND zero targets are included so the legend reads consistently;
  //    they just render at the floor alpha when the overlay is on.
  const entries: CategoryBudgetEntry[] = globeCategories.map((g) => {
    const budget = budgetByPrimary.get(g.id) ?? 0;
    const tCount = targetsByPrimary.get(g.id)?.size ?? 0;
    return {
      categoryId: g.id,
      categoryName: g.name,
      totalBudget: budget,
      shareOfTotalBudget: totalBudget > 0 ? budget / totalBudget : 0,
      targetCount: tCount,
      shareOfTargets: totalTargets > 0 ? tCount / totalTargets : 0,
      contradictionPairCount: contraByPrimary.get(g.id) ?? 0,
    };
  });

  const maxShare = entries.reduce(
    (m, e) => Math.max(m, e.shareOfTotalBudget),
    0,
  );

  return {
    entries,
    totalBudget,
    maxShare,
    unit: berData.unit,
    currency: berData.currency,
    period: berData.period,
  };
}

/**
 * Map a category's share-of-total-budget into the wedge-fill alpha for the
 * Biodiversity Budget overlay. Non-linear ramp on `ratio = share / maxShare`:
 *   alpha = floor + (1 - floor) * ratio^1.5
 *
 * The exponent > 1 widens the gap between the top-funded category (alpha 1.0)
 * and everything below it, so the dominant category is unmistakably bolder
 * rather than just "a bit more saturated" than mid-range categories. The
 * floor sits at 0.04 — zero-budget categories fade almost to nothing, present
 * enough to keep the wedge shape readable but not enough to compete with
 * the funded ones. Both knobs were raised in iteration 3 after the user
 * reported the previous linear 0.12..1.0 band still looked too uniform on
 * Mongolia data where one category carries the majority of tagged spend.
 */
export function alphaForBudgetShare(share: number, maxShare: number): number {
  if (maxShare <= 0) return 1;
  const ratio = Math.max(0, Math.min(1, share / maxShare));
  const floor = 0.04;
  return floor + (1 - floor) * Math.pow(ratio, 1.5);
}

/**
 * Format a budget value (in berData.unit, typically billions) for compact
 * display. Mirrors financing-coherence's formatter so the two views speak the
 * same money language. Currency is appended once; callers don't supply a
 * unit-word because the scale suffix already carries it (avoids strings like
 * "100M billion MNT").
 */
export function formatBudgetValue(
  valueInUnit: number,
  currency: string,
): string {
  const cur = currency.trim();
  const suffix = cur ? ` ${cur}` : "";
  if (valueInUnit >= 1000) return `${(valueInUnit / 1000).toFixed(1)}T${suffix}`;
  if (valueInUnit >= 1) return `${valueInUnit.toFixed(1)}B${suffix}`;
  if (valueInUnit >= 0.001) return `${(valueInUnit * 1000).toFixed(0)}M${suffix}`;
  if (valueInUnit > 0) return `< 1M${suffix}`;
  return `0${suffix}`;
}
