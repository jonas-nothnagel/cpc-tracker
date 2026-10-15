/**
 * The halftone field on /sustainability: every use is a row of dots, every
 * dot the same round amount of the chosen resource, so rows compare by length
 * and the dots can be counted. Pure, so the field's arithmetic is unit-tested.
 */

/** The smallest round amount (1, 2, 2.5 or 5 times a power of ten) that fits
 *  `max` into `capacity` dots. */
export function niceUnit(max: number, capacity: number): number {
  const raw = max / capacity;
  if (!(raw > 0)) return 1;
  const base = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * base >= raw) return step * base;
  }
  return 10 * base;
}

/** Whole dots per use: a use smaller than half a dot shows none, and its
 *  figure carries it. */
export function dotCounts(values: number[], unit: number): number[] {
  return values.map((v) => Math.round(v / unit));
}

export interface FieldGeometry {
  /** Left edge of the dots. */
  x0: number;
  /** Width a full row of `columns` takes. */
  width: number;
  rowHeight: number;
  /** Offset of the dot block from the top of its row. */
  blockTop: number;
  /** Dots stacked in one column. */
  lines: number;
  /** Columns in a full row. */
  columns: number;
}

export interface FieldLayout {
  pitch: number;
  radius: number;
  xs: Float32Array;
  ys: Float32Array;
  /** Each dot's row. */
  row: Uint16Array;
}

/** Dot centres: each row filled column by column, every row on one grid. */
export function fieldLayout(counts: number[], g: FieldGeometry): FieldLayout {
  const pitch = g.width / g.columns;
  const total = counts.reduce((sum, c) => sum + c, 0);
  const xs = new Float32Array(total);
  const ys = new Float32Array(total);
  const row = new Uint16Array(total);
  let n = 0;
  counts.forEach((count, r) => {
    const top = r * g.rowHeight + g.blockTop;
    for (let d = 0; d < count; d++, n++) {
      xs[n] = g.x0 + Math.floor(d / g.lines) * pitch + pitch / 2;
      ys[n] = top + (d % g.lines) * pitch + pitch / 2;
      row[n] = r;
    }
  });
  return { pitch, radius: Math.max(0.6, pitch * 0.34), xs, ys, row };
}
