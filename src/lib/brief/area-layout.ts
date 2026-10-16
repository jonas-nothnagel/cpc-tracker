/**
 * The policy-area picture's geometry: one row per area, its name and under
 * it a dot per target on one line, inside the name's column so the figures
 * beside it stay clear. The largest area fills that column; only a column
 * too narrow for the smallest spacing wraps. A row's height depends only on
 * its number of targets, so opening a pair of areas or picking a target
 * never moves a row.
 */

/** A row's name line, the room under it, and the room after the row. */
export const ROW_LABEL = 20;
const ROW_GAP = 2;
const ROW_AFTER = 14;
/** Spacing of the targets on a row, and the height a line of them takes. */
const PITCH_MIN = 3;
const PITCH_MAX = 10;
const LINE_MIN = 8;
/** A dot's radius: about a third of the spacing, as in the brief's dot field. */
const R_SHARE = 0.36;
const R_MAX = 3.2;

export interface AreaFieldRow {
  id: string;
  /** In drawing order. */
  targets: string[];
}

export interface AreaFieldLayout {
  width: number;
  height: number;
  /** Between two targets on a line. */
  pitch: number;
  /** Between two lines, where a row wraps. */
  line: number;
  targetR: number;
  /** Each row's top, where its name sits. */
  rows: { id: string; y: number }[];
  /** Each target's dot. */
  at: Map<string, { x: number; y: number }>;
}

/** `strip`: the width the dots keep to, the name's column (the whole field by default). */
export function layoutAreaField(rows: AreaFieldRow[], width: number, strip = width): AreaFieldLayout {
  const usable = Math.max(1, Math.min(width, strip));
  const widest = Math.max(1, ...rows.map((r) => r.targets.length));
  const pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, usable / widest));
  const r = Math.min(R_MAX, pitch * R_SHARE);
  const line = Math.max(pitch, LINE_MIN);
  const perLine = Math.max(1, Math.floor((usable - 2 * r) / pitch + 1e-6) + 1);
  const lines = (row: AreaFieldRow) => Math.max(1, Math.ceil(row.targets.length / perLine));
  const at = new Map<string, { x: number; y: number }>();
  const tops: { id: string; y: number }[] = [];
  let y = 0;
  for (const row of rows) {
    tops.push({ id: row.id, y });
    row.targets.forEach((id, j) => {
      at.set(id, {
        // The first dot's left edge where the name starts.
        x: r + (j % perLine) * pitch,
        y: y + ROW_LABEL + ROW_GAP + Math.floor(j / perLine) * line + line / 2,
      });
    });
    y += ROW_LABEL + ROW_GAP + lines(row) * line + ROW_AFTER;
  }
  return { width, height: y, pitch, line, targetR: r, rows: tops, at };
}

/** The target whose dot is under a point. */
export function targetAt(layout: AreaFieldLayout, x: number, y: number): string | null {
  const halfX = layout.pitch / 2;
  const halfY = layout.line / 2;
  let best: string | null = null;
  let bestD = Infinity;
  for (const [id, p] of layout.at) {
    const dx = Math.abs(x - p.x);
    const dy = Math.abs(y - p.y);
    if (dx > halfX || dy > halfY) continue;
    if (dx + dy < bestD) {
      bestD = dx + dy;
      best = id;
    }
  }
  return best;
}
