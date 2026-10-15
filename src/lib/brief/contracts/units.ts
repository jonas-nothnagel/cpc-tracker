/**
 * Money as squares: every square on the field is the same sum (₮5 billion),
 * so the share of squares is the share of money. A group's money is cut into
 * equal squares; each square belongs to the cell (a year, an area, a place)
 * and the contract holding most of it, which is what pointing at it names.
 */

/** Tugrik per square. */
export const UNIT = 5e9;

/** Squares for a sum: rounded to the unit, at least one for any money. */
export function squaresFor(value: number, unit: number = UNIT): number {
  if (!(value > 0)) return 0;
  return Math.max(1, Math.round(value / unit));
}

/** Whole parts of `values` summing to `total`, each as near its share as the
 *  total allows (largest remainder; ties go to the earlier value). */
export function largestRemainder(values: number[], total: number): number[] {
  const clean = values.map((v) => (v > 0 ? v : 0));
  const sum = clean.reduce((s, v) => s + v, 0);
  if (sum <= 0 || total <= 0) return clean.map(() => 0);
  const exact = clean.map((v) => (v / sum) * total);
  const parts = exact.map((e) => Math.floor(e));
  let left = total - parts.reduce((s, v) => s + v, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

export interface Slice {
  /** The cell the square belongs to. */
  cell: string;
  /** The contract holding the largest part of the square, within its cell. */
  main: string | null;
  /** How many contracts share the square. */
  parts: number;
}

export interface SliceItem {
  id: string;
  value: number;
  cell: string;
}

/**
 * Cuts a group's money into `count` equal squares. Items go in cell order
 * (unknown cells last), then largest first, so each cell's squares sit
 * together; a square belongs to the cell holding most of it, and names that
 * cell's largest share as its contract. Every square is accounted for.
 */
export function sliceSquares(items: SliceItem[], count: number, cellOrder: readonly string[]): Slice[] {
  if (count <= 0) return [];
  const rank = new Map(cellOrder.map((c, i) => [c, i]));
  const rankOf = (cell: string) => rank.get(cell) ?? cellOrder.length;
  const sorted = items
    .filter((it) => it.value > 0)
    .sort((a, b) => rankOf(a.cell) - rankOf(b.cell) || b.value - a.value || a.id.localeCompare(b.id));
  const total = sorted.reduce((s, it) => s + it.value, 0);
  if (total <= 0) return Array.from({ length: count }, () => ({ cell: cellOrder[0] ?? "", main: null, parts: 0 }));

  const size = total / count;
  const out: Slice[] = [];
  let k = 0;
  let used = 0;
  for (let s = 0; s < count; s++) {
    let need = s === count - 1 ? Infinity : size;
    const share = new Map<number, number>();
    while (need > 1e-9 && k < sorted.length) {
      const take = Math.min(sorted[k].value - used, need);
      share.set(k, (share.get(k) ?? 0) + take);
      need -= take;
      used += take;
      if (sorted[k].value - used <= 1e-9 * sorted[k].value) {
        k += 1;
        used = 0;
      }
    }
    const byCell = new Map<string, number>();
    for (const [i, v] of share) byCell.set(sorted[i].cell, (byCell.get(sorted[i].cell) ?? 0) + v);
    let cell = cellOrder[0] ?? "";
    let cellValue = -1;
    for (const [c, v] of byCell) {
      if (v > cellValue) {
        cell = c;
        cellValue = v;
      }
    }
    let main: string | null = null;
    let mainValue = -1;
    for (const [i, v] of share) {
      if (sorted[i].cell === cell && v > mainValue) {
        main = sorted[i].id;
        mainValue = v;
      }
    }
    out.push({ cell, main, parts: share.size });
  }
  return out;
}
