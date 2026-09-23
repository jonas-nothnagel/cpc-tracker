import type { Tone, ToneCounts } from "./compute";

/** Left-to-right order of the groups in the overall picture. */
export const DOT_ORDER: Tone[] = ["reinforce", "partial", "apart", "none"];

export interface DotGroup {
  tone: Tone;
  count: number;
  dots: number;
  /** Horizontal extent of the group's dots, in field pixels. */
  x0: number;
  x1: number;
}

export interface DotLayout {
  pitch: number;
  radius: number;
  rows: number;
  groups: DotGroup[];
  /** Dot centres and their tone index into DOT_ORDER. */
  xs: Float32Array;
  ys: Float32Array;
  tones: Uint8Array;
  /** 1 where a dot is drawn small: every other dot of the potential-
   *  misalignment group, a checker texture that tells it apart from the
   *  aligned group without relying on red and green. */
  small: Uint8Array;
}

/**
 * Every comparison as one dot (or one dot per `unit` comparisons), in a
 * halftone field: groups side by side, left to right, each filled column by
 * column from the top. The pitch is the largest that fits the field with a
 * gap of two pitches between groups, so the groups' widths read as shares.
 */
export function layoutDots(
  counts: ToneCounts,
  unit: number,
  width: number,
  height: number,
): DotLayout {
  const present = DOT_ORDER.map((tone, index) => ({
    tone,
    index,
    count: counts[tone],
    dots: Math.ceil(counts[tone] / Math.max(1, unit)),
  })).filter((g) => g.dots > 0);
  const total = present.reduce((s, g) => s + g.dots, 0);
  const empty: DotLayout = {
    pitch: 0,
    radius: 0,
    rows: 0,
    groups: [],
    xs: new Float32Array(0),
    ys: new Float32Array(0),
    tones: new Uint8Array(0),
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
  const tones = new Uint8Array(total);
  const small = new Uint8Array(total);
  const apartIndex = DOT_ORDER.indexOf("apart");
  const groups: DotGroup[] = [];
  let x = 0;
  let n = 0;
  for (const g of present) {
    const x0 = x;
    for (let d = 0; d < g.dots; d++, n++) {
      const col = Math.floor(d / rows);
      const row = d % rows;
      xs[n] = x + col * pitch + pitch / 2;
      ys[n] = yOffset + row * pitch + pitch / 2;
      tones[n] = g.index;
      if (g.index === apartIndex && (col + row) % 2 === 1) small[n] = 1;
    }
    x += Math.ceil(g.dots / rows) * pitch;
    groups.push({ tone: g.tone, count: g.count, dots: g.dots, x0, x1: x });
    x += gapPitches * pitch;
  }
  return { pitch, radius: Math.max(0.55, pitch * 0.34), rows, groups, xs, ys, tones, small };
}
