import type { Tone, ToneCounts } from "./compute";

/** Left-to-right order of the groups in the overall picture. */
export const DOT_ORDER: Tone[] = ["reinforce", "partial", "apart", "none"];

/** One group of dots: how many target pairs, and whether to draw it with
 *  the checker texture (every other dot small), the second channel that
 *  tells potential misalignment apart without relying on red and green. */
export interface GroupSpec {
  count: number;
  texture?: boolean;
}

export interface LaidGroup {
  /** Index of the group in the specs. */
  index: number;
  count: number;
  dots: number;
  /** Horizontal extent of the group's dots, in field pixels. */
  x0: number;
  x1: number;
}

export interface GroupLayout {
  pitch: number;
  radius: number;
  rows: number;
  groups: LaidGroup[];
  /** Dot centres and the index of each dot's group in the specs. */
  xs: Float32Array;
  ys: Float32Array;
  group: Uint8Array;
  /** 1 where a dot is drawn small (the checker texture). */
  small: Uint8Array;
}

/**
 * Every target pair as one dot (or one dot per `unit` pairs), in a halftone
 * field: groups side by side, left to right, each filled column by column
 * from the top. The pitch is the largest that fits the field with a gap of
 * two pitches between groups, so the groups' widths read as shares.
 */
export function layoutGroups(
  specs: GroupSpec[],
  unit: number,
  width: number,
  height: number,
): GroupLayout {
  const present = specs
    .map((spec, index) => ({
      index,
      count: spec.count,
      texture: spec.texture === true,
      dots: Math.ceil(spec.count / Math.max(1, unit)),
    }))
    .filter((g) => g.dots > 0);
  const total = present.reduce((s, g) => s + g.dots, 0);
  const empty: GroupLayout = {
    pitch: 0,
    radius: 0,
    rows: 0,
    groups: [],
    xs: new Float32Array(0),
    ys: new Float32Array(0),
    group: new Uint8Array(0),
    small: new Uint8Array(0),
  };
  if (total === 0 || width <= 0 || height <= 0) return empty;

  const gapPitches = 2;
  const fits = (pitch: number) => {
    const rows = Math.max(1, Math.floor(height / pitch));
    const cols = present.reduce((s, g) => s + Math.ceil(g.dots / rows), 0);
    return cols * pitch + (present.length - 1) * gapPitches * pitch <= width;
  };
  let pitch = Math.sqrt((width * height) / total);
  for (let i = 0; i < 600 && !fits(pitch); i++) pitch *= 0.985;
  const rows = Math.max(1, Math.floor(height / pitch));
  const yOffset = (height - rows * pitch) / 2;

  const xs = new Float32Array(total);
  const ys = new Float32Array(total);
  const group = new Uint8Array(total);
  const small = new Uint8Array(total);
  const groups: LaidGroup[] = [];
  let x = 0;
  let n = 0;
  for (const g of present) {
    const x0 = x;
    for (let d = 0; d < g.dots; d++, n++) {
      const col = Math.floor(d / rows);
      const row = d % rows;
      xs[n] = x + col * pitch + pitch / 2;
      ys[n] = yOffset + row * pitch + pitch / 2;
      group[n] = g.index;
      if (g.texture && (col + row) % 2 === 1) small[n] = 1;
    }
    x += Math.ceil(g.dots / rows) * pitch;
    groups.push({ index: g.index, count: g.count, dots: g.dots, x0, x1: x });
    x += gapPitches * pitch;
  }
  return { pitch, radius: Math.max(0.55, pitch * 0.34), rows, groups, xs, ys, group, small };
}

export interface DotGroup extends LaidGroup {
  tone: Tone;
}

export interface DotLayout extends Omit<GroupLayout, "groups"> {
  groups: DotGroup[];
  /** Each dot's tone, as an index into DOT_ORDER. */
  tones: Uint8Array;
}

/** The overall picture: the four tones in DOT_ORDER, potential misalignment
 *  textured. */
export function layoutDots(
  counts: ToneCounts,
  unit: number,
  width: number,
  height: number,
): DotLayout {
  const layout = layoutGroups(
    DOT_ORDER.map((tone) => ({ count: counts[tone], texture: tone === "apart" })),
    unit,
    width,
    height,
  );
  return {
    ...layout,
    groups: layout.groups.map((g) => ({ ...g, tone: DOT_ORDER[g.index] })),
    tones: layout.group,
  };
}
