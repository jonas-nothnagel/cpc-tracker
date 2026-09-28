/**
 * The policy-area picture's geometry: one row per area, its targets on a
 * line (wrapping onto further lines when the row is long), each target's
 * point cloud above it in lines of two or three dots. Row heights come from
 * the clouds at rest, so opening a pair of areas or picking a target never
 * moves a row.
 */

/** A cloud stops here; a taller one is cut, with its exact count on top. */
export const CLOUD_MAX_LINES = 40;
/** A row's name line, the room under it, and the room after the row. */
export const ROW_LABEL = 20;
const ROW_GAP = 8;
const ROW_AFTER = 16;
/** Room kept at the field's two sides. */
const FIELD_PAD = 12;
/** Past this height at two dots a line, clouds take three. */
const FIELD_BUDGET = 720;
/** Spacing of the targets on a row. */
const PITCH_MIN = 6.5;
const PITCH_MAX = 12;
/** Room a row keeps above its clouds for a cut cloud's count, and that
 *  count's line height. */
const CUT_ROOM = 16;
const CUT_LINE = 14;

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
  /** Cloud dots a line. */
  per: number;
  /** Between two cloud dots. */
  sp: number;
  /** Between a target's dot and the first line of its cloud. */
  lift: number;
  targetR: number;
  cloudR: number;
  /** Each row's top, where its name sits. */
  rows: { id: string; y: number }[];
  /** Each target's dot. */
  at: Map<string, { x: number; y: number }>;
}

export function cloudLines(count: number, per: number): number {
  return Math.min(CLOUD_MAX_LINES, Math.ceil(count / per));
}

/** How many dots a cloud draws, and whether it is cut. */
export function cloudDots(count: number, per: number): { dots: number; cut: boolean } {
  const max = CLOUD_MAX_LINES * per;
  return count > max ? { dots: max, cut: true } : { dots: count, cut: false };
}

/** Where the break over a cut cloud runs, for a target whose dot is at `y`. */
export function cutBreak(layout: Pick<AreaFieldLayout, "lift" | "sp">, y: number): number {
  return y - layout.lift - CLOUD_MAX_LINES * layout.sp - layout.sp;
}

export function layoutAreaField(rows: AreaFieldRow[], restClouds: Map<string, number>, width: number): AreaFieldLayout {
  const usable = Math.max(1, width - FIELD_PAD);
  const widest = Math.max(1, ...rows.map((r) => r.targets.length));
  const pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, usable / widest));
  const perLine = Math.max(1, Math.floor(usable / pitch + 1e-6));
  const lift = Math.max(2, pitch * 0.4);
  const tallest = rows.map((r) => Math.max(0, ...r.targets.map((id) => restClouds.get(id) ?? 0)));
  const lines = (r: AreaFieldRow) => Math.max(1, Math.ceil(r.targets.length / perLine));
  // The room each line of targets keeps above it for their clouds, and for a
  // cut cloud's count when the row's tallest cloud at rest is cut.
  const bandOf = (i: number, per: number, sp: number) =>
    (cloudDots(tallest[i], per).cut ? CUT_ROOM : 0) + cloudLines(tallest[i], per) * sp + lift;
  const heightWith = (per: number, sp: number) =>
    rows.reduce((h, r, i) => h + ROW_LABEL + ROW_GAP + lines(r) * (bandOf(i, per, sp) + pitch) + ROW_AFTER, 0);
  let per = 2;
  let sp = Math.min(4.6, pitch / 2);
  if (heightWith(per, sp) > FIELD_BUDGET) {
    per = 3;
    sp = Math.min(3.6, pitch / 3);
  }
  const at = new Map<string, { x: number; y: number }>();
  const tops: { id: string; y: number }[] = [];
  let y = 0;
  rows.forEach((r, i) => {
    tops.push({ id: r.id, y });
    const band = bandOf(i, per, sp);
    r.targets.forEach((id, j) => {
      const line = Math.floor(j / perLine);
      at.set(id, {
        x: FIELD_PAD / 2 + (j % perLine) * pitch + pitch / 2,
        y: y + ROW_LABEL + ROW_GAP + band + line * (band + pitch),
      });
    });
    y += ROW_LABEL + ROW_GAP + lines(r) * (band + pitch) + ROW_AFTER;
  });
  return {
    width,
    height: y,
    pitch,
    per,
    sp,
    lift,
    targetR: Math.max(2, pitch * 0.26),
    cloudR: Math.max(0.8, sp * 0.36),
    rows: tops,
    at,
  };
}

/** The target whose column is under a point: from the top of its cloud to
 *  just below its dot. */
export function targetAt(layout: AreaFieldLayout, clouds: Map<string, number>, x: number, y: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const [id, p] of layout.at) {
    const d = Math.abs(x - p.x);
    if (d > layout.pitch / 2) continue;
    const top = p.y - layout.lift - cloudLines(clouds.get(id) ?? 0, layout.per) * layout.sp - 4;
    if (y < top || y > p.y + layout.pitch / 2) continue;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/** The counts over the clouds cut in the current state: centred on the
 *  target, their top edge in the room the row keeps above its clouds. */
export function cutMarks(layout: AreaFieldLayout, clouds: Map<string, number>): { id: string; x: number; top: number }[] {
  const marks: { id: string; x: number; top: number }[] = [];
  for (const [id, at] of layout.at) {
    if (!cloudDots(clouds.get(id) ?? 0, layout.per).cut) continue;
    marks.push({ id, x: at.x, top: cutBreak(layout, at.y) - 2 - CUT_LINE });
  }
  return marks;
}
