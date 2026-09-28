import { isGreen, type Contract, type LensKey, type TierTotals } from "./model";

/**
 * Toward each policy area: under one lens, each area's targets (their own
 * primary area) beside the money contracted for nature or climate in it (the
 * contract's own primary area under the same lens).
 */

/** Targets and money no area of the lens claims. */
export const NO_AREA = "none";

export interface AreaRow {
  id: string;
  /** The lens's own name for the area ("" for NO_AREA). */
  name: string;
  targets: string[];
  principal: TierTotals;
  significant: TierTotals;
}

const empty = (): TierTotals => ({ contracts: 0, value: 0 });

/** One row per area with targets or money: most targets first, then most
 *  money mainly for nature or climate; what no area claims comes last. */
export function areaRows(
  contracts: Contract[],
  lens: LensKey,
  categories: { id: string; name: string }[],
  primary: Record<string, string>,
  targetIds: string[],
): AreaRow[] {
  const known = new Set(categories.map((c) => c.id));
  const rows = new Map<string, AreaRow>();
  const row = (id: string): AreaRow => {
    let r = rows.get(id);
    if (!r) {
      r = { id, name: categories.find((c) => c.id === id)?.name ?? "", targets: [], principal: empty(), significant: empty() };
      rows.set(id, r);
    }
    return r;
  };
  for (const id of targetIds) {
    const area = primary[id];
    row(area && known.has(area) ? area : NO_AREA).targets.push(id);
  }
  for (const c of contracts) {
    if (!isGreen(c)) continue;
    const area = c.areas[lens];
    const r = row(area && known.has(area) ? area : NO_AREA);
    const t = c.tier === "principal" ? r.principal : r.significant;
    t.contracts += 1;
    t.value += c.value;
  }
  const areas = [...rows.values()].filter((r) => r.id !== NO_AREA);
  areas.sort((a, b) => b.targets.length - a.targets.length || b.principal.value - a.principal.value || a.id.localeCompare(b.id));
  const rest = rows.get(NO_AREA);
  return rest ? [...areas, rest] : areas;
}

/** An area needs this share of all targets before its gap can lead. */
export const MIN_TARGET_SHARE = 0.1;
/** The smallest gap (share of targets minus share of money) worth a finding. */
export const MIN_GAP = 0.05;

export interface AreaFinding {
  /** The area whose share of the targets most exceeds its share of the money. */
  gap: { row: AreaRow; targetShare: number; moneyShare: number } | null;
  /** The area drawing the largest share of the money. */
  top: { row: AreaRow; moneyShare: number; targetShare: number } | null;
}

/** Shares are of all targets and of all money mainly for nature or climate. */
export function areaFinding(rows: AreaRow[], totalTargets: number, principalTotal: number): AreaFinding {
  const areas = rows.filter((r) => r.id !== NO_AREA);
  const share = (r: AreaRow) => ({
    targetShare: totalTargets > 0 ? r.targets.length / totalTargets : 0,
    moneyShare: principalTotal > 0 ? r.principal.value / principalTotal : 0,
  });
  let gap: AreaFinding["gap"] = null;
  let top: AreaFinding["top"] = null;
  for (const row of areas) {
    const s = share(row);
    const g = s.targetShare - s.moneyShare;
    if (s.targetShare >= MIN_TARGET_SHARE && g >= MIN_GAP && (!gap || g > gap.targetShare - gap.moneyShare)) {
      gap = { row, ...s };
    }
    if (row.principal.value > 0 && (!top || s.moneyShare > top.moneyShare)) top = { row, ...s };
  }
  return { gap, top };
}
