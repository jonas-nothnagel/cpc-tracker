/**
 * Each policy area's readings over all of its target pairs, the basis of
 * every other share in the brief (as areaRows rates potential misalignment
 * for print), so the screen can order the areas by any share: most first,
 * then least first.
 */

import { placing, type LensAreas } from "./areas";
import { MIN_AREA_COMPARISONS, emptyCounts, toneOf, type Scope, type ToneCounts } from "./compute";

export type AreaShareKey = "reinforce" | "partial" | "apart";
export type AreaSortKey = AreaShareKey | "targets";

export interface AreaSort {
  key: AreaSortKey;
  /** `desc`: most first. */
  dir: "desc" | "asc";
}

/** The picture opens with the most aligned areas first. */
export const DEFAULT_AREA_SORT: AreaSort = { key: "reinforce", dir: "desc" };

/** Areas with fewer targets are marked: a share drawn from one or two
 *  targets says more about those targets than about the area. */
export const AREA_FEW_TARGETS = 3;

/** Each area's target pairs by reading; a target pair between two areas
 *  counts for both. */
export function areaTones(lens: LensAreas, scope: Scope): Map<string, ToneCounts> {
  const { areaOf } = placing(lens);
  const out = new Map(lens.areas.map((area) => [area.id, emptyCounts()]));
  for (const c of scope.comparisons) {
    const tone = toneOf(c.level);
    for (const id of new Set([areaOf.get(c.a.id), areaOf.get(c.b.id)])) {
      const counts = id ? out.get(id) : undefined;
      if (!counts) continue;
      counts[tone] += 1;
      counts.total += 1;
    }
  }
  return out;
}

/** A reading's share of the area's target pairs; null below the brief's
 *  floor for rating an area. */
export function areaShare(counts: ToneCounts, key: AreaShareKey): number | null {
  return counts.total >= MIN_AREA_COMPARISONS ? counts[key] / counts.total : null;
}

/** A first click on a column sorts it most first; a second click on the
 *  same column turns it to least first, and back. */
export function nextAreaSort(current: AreaSort, key: AreaSortKey): AreaSort {
  if (current.key !== key) return { key, dir: "desc" };
  return { key, dir: current.dir === "desc" ? "asc" : "desc" };
}

/** The areas' ids in the order of a sort. Unrated areas go last whichever
 *  the direction; ties fall to the larger area, then to the taxonomy's
 *  order, in both directions. */
export function sortAreas(lens: LensAreas, tones: Map<string, ToneCounts>, sort: AreaSort): string[] {
  const sign = sort.dir === "desc" ? -1 : 1;
  const rows = lens.areas.map((area) => ({
    id: area.id,
    order: area.order,
    targets: area.targets.length,
    counts: tones.get(area.id) ?? emptyCounts(),
  }));
  rows.sort((x, y) => {
    if (sort.key === "targets") return sign * (x.targets - y.targets) || x.order - y.order;
    const sx = areaShare(x.counts, sort.key);
    const sy = areaShare(y.counts, sort.key);
    if (sx === null || sy === null) {
      if (sx !== sy) return sx === null ? 1 : -1;
    } else if (sx !== sy) {
      return sign * (sx - sy);
    }
    return y.targets - x.targets || x.order - y.order;
  });
  return rows.map((row) => row.id);
}

/** The picture's rows in an order of area ids (from sortAreas). */
export function orderRows<T extends { id: string }>(rows: T[], order: string[]): T[] {
  const at = new Map(order.map((id, i) => [id, i]));
  return [...rows].sort((x, y) => (at.get(x.id) ?? 0) - (at.get(y.id) ?? 0));
}
