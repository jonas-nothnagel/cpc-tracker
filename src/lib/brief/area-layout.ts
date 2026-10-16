/**
 * The policy-area picture's geometry: one row per area, its name and under
 * it a dot per target, wrapping onto further lines when the row is long. A
 * row's height depends only on its number of targets, so opening a pair of
 * areas or picking a target never moves a row.
 */

/** A row's name line, the room under it, and the room after the row. */
export const ROW_LABEL = 20;
const ROW_GAP = 4;
const ROW_AFTER = 14;
/** Room kept at the field's two sides. */
const FIELD_PAD = 12;
/** Spacing of the targets on a row: the widest row fits one line down to the
 *  smallest; past it, rows wrap rather than shrink their dots. */
const PITCH_MIN = 9;
const PITCH_MAX = 14;

export interface AreaFieldRow {
  id: string;
  /** In drawing order. */
  targets: string[];
}

export interface AreaFieldLayout {
  width: number;
  height: number;
  /** Between two targets on a line, and between two lines. */
  pitch: number;
  targetR: number;
  /** Each row's top, where its name sits. */
  rows: { id: string; y: number }[];
  /** Each target's dot. */
  at: Map<string, { x: number; y: number }>;
}

export function layoutAreaField(rows: AreaFieldRow[], width: number): AreaFieldLayout {
  const usable = Math.max(1, width - FIELD_PAD);
  const widest = Math.max(1, ...rows.map((r) => r.targets.length));
  const pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, usable / widest));
  const perLine = Math.max(1, Math.floor(usable / pitch + 1e-6));
  const lines = (r: AreaFieldRow) => Math.max(1, Math.ceil(r.targets.length / perLine));
  const at = new Map<string, { x: number; y: number }>();
  const tops: { id: string; y: number }[] = [];
  let y = 0;
  for (const r of rows) {
    tops.push({ id: r.id, y });
    r.targets.forEach((id, j) => {
      at.set(id, {
        x: FIELD_PAD / 2 + (j % perLine) * pitch + pitch / 2,
        y: y + ROW_LABEL + ROW_GAP + Math.floor(j / perLine) * pitch + pitch / 2,
      });
    });
    y += ROW_LABEL + ROW_GAP + lines(r) * pitch + ROW_AFTER;
  }
  return { width, height: y, pitch, targetR: pitch * 0.36, rows: tops, at };
}

/** The target whose dot is under a point. */
export function targetAt(layout: AreaFieldLayout, x: number, y: number): string | null {
  const half = layout.pitch / 2;
  let best: string | null = null;
  let bestD = Infinity;
  for (const [id, p] of layout.at) {
    const dx = Math.abs(x - p.x);
    const dy = Math.abs(y - p.y);
    if (dx > half || dy > half) continue;
    if (dx + dy < bestD) {
      bestD = dx + dy;
      best = id;
    }
  }
  return best;
}
