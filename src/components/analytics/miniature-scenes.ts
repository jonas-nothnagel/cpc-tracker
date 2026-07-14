/**
 * Declarative scene specs for the usage-map miniatures: a stylized sketch
 * of each coherence-dashboard section, one primitive per visual element.
 * Primitives with a `region` are heat-shaded and hoverable (the id must
 * exist in MINIATURE_REGIONS for that section — locked by
 * miniature-scenes.test.ts); primitives without one are inert furniture.
 *
 * Coordinate system: viewBox 0 0 560 300. Two-column sections put the
 * narrative in x 16-320 and the centerpiece in x 336-544, mirroring the
 * real layout. Pure data, no JSX. REMOVABLE SYSTEM: see
 * src/lib/analytics/README.md.
 */

export type MiniaturePrimitive =
  | { kind: "frame"; x: number; y: number; w: number; h: number; region?: string }
  /** Sketch text lines; widths are fractions of w. */
  | { kind: "textlines"; x: number; y: number; w: number; widths: number[]; region?: string }
  /** A row of rounded chips; widths are fractions of the total width w. */
  | { kind: "chipRow"; x: number; y: number; w: number; widths: number[]; region?: string }
  /** Stacked list rows; bars adds a small value bar on each row's right. */
  | { kind: "rowList"; x: number; y: number; w: number; rows: number; bars?: boolean; region?: string }
  /** Grid of cards (cols × rows). */
  | { kind: "cards"; x: number; y: number; w: number; cols: number; rows: number; region?: string }
  /** One horizontal bar split into segments (fractions summing to 1). */
  | { kind: "stackedBar"; x: number; y: number; w: number; segs: number[]; region?: string }
  /** n×n grid of cells with a dashed diagonal. */
  | { kind: "matrix"; x: number; y: number; size: number; n: number; region?: string }
  /** Donut wheel: rim arcs + chords across the middle. */
  | { kind: "wheel"; cx: number; cy: number; r: number; arcs: number; ribbons: number; focusArc?: boolean; region?: string }
  | { kind: "dotGrid"; x: number; y: number; cols: number; rows: number; region?: string }
  /** Left nodes → ribbons → right nodes. */
  | { kind: "sankey"; x: number; y: number; w: number; h: number; left: number; right: number; region?: string }
  | { kind: "chatBar"; x: number; y: number; w: number; region?: string }
  /** A row of pill buttons; widths are fractions of w. */
  | { kind: "pills"; x: number; y: number; w: number; widths: number[]; region?: string };

export interface MiniatureScene {
  items: MiniaturePrimitive[];
}

const LEFT_X = 16;
const LEFT_W = 292;
const WHEEL_CX = 440;
const WHEEL_CY = 150;
const WHEEL_R = 108;

/** Shared furniture: eyebrow + serif headline sketch lines. */
const headline = (widths: number[] = [0.3, 0.92, 0.7]): MiniaturePrimitive => ({
  kind: "textlines",
  x: LEFT_X,
  y: 20,
  w: LEFT_W,
  widths,
});

export const SCENES: Record<string, MiniatureScene> = {
  direction: {
    items: [
      headline([0.3, 0.9, 0.82]),
      { kind: "pills", x: LEFT_X, y: 88, w: LEFT_W, widths: [0.3, 0.36], region: "term-buttons" },
      { kind: "cards", x: LEFT_X, y: 112, w: LEFT_W, cols: 2, rows: 3, region: "theme-cards" },
      { kind: "textlines", x: LEFT_X, y: 272, w: LEFT_W, widths: [0.55], region: "pipeline-note" },
      { kind: "wheel", cx: WHEEL_CX, cy: WHEEL_CY, r: WHEEL_R, arcs: 8, ribbons: 6, region: "wheel" },
    ],
  },

  "doc-focus": {
    items: [
      { kind: "chipRow", x: LEFT_X, y: 20, w: LEFT_W, widths: [0.16, 0.14, 0.18, 0.14, 0.16], region: "doc-pills" },
      { kind: "stackedBar", x: LEFT_X, y: 56, w: LEFT_W, segs: [0.5, 0.3, 0.2], region: "friction-segments" },
      { kind: "rowList", x: LEFT_X, y: 92, w: LEFT_W, rows: 4, bars: true, region: "pair-rows" },
      { kind: "textlines", x: LEFT_X, y: 268, w: LEFT_W, widths: [0.6] },
      { kind: "wheel", cx: WHEEL_CX, cy: WHEEL_CY, r: WHEEL_R, arcs: 8, ribbons: 3, focusArc: true, region: "wheel" },
    ],
  },

  "doc-pairs": {
    items: [
      headline([0.3, 0.85]),
      { kind: "rowList", x: LEFT_X, y: 70, w: LEFT_W, rows: 6, bars: true, region: "pair-rows" },
      { kind: "matrix", x: 350, y: 58, size: 184, n: 5, region: "matrix" },
    ],
  },

  "friction-types": {
    items: [
      headline([0.3, 0.88, 0.6]),
      { kind: "stackedBar", x: LEFT_X, y: 104, w: LEFT_W, segs: [0.45, 0.35, 0.2], region: "segments" },
      { kind: "chipRow", x: LEFT_X, y: 136, w: LEFT_W, widths: [0.3, 0.3, 0.3], region: "segments" },
      { kind: "textlines", x: LEFT_X, y: 176, w: LEFT_W, widths: [0.8, 0.7, 0.75] },
      { kind: "wheel", cx: WHEEL_CX, cy: WHEEL_CY, r: WHEEL_R, arcs: 8, ribbons: 6, region: "wheel" },
    ],
  },

  "where-to-focus": {
    items: [
      headline([0.3, 0.85]),
      { kind: "stackedBar", x: LEFT_X, y: 70, w: LEFT_W, segs: [0.3, 0.22, 0.18, 0.14, 0.1, 0.06], region: "concentration-bar" },
      { kind: "rowList", x: LEFT_X, y: 104, w: LEFT_W, rows: 5, bars: true, region: "hotspot-rows" },
      { kind: "wheel", cx: WHEEL_CX, cy: WHEEL_CY, r: WHEEL_R, arcs: 8, ribbons: 5, region: "wheel" },
    ],
  },

  sectors: {
    items: [
      { kind: "chipRow", x: LEFT_X, y: 18, w: LEFT_W, widths: [0.14, 0.22, 0.24, 0.28], region: "lens-chips" },
      { kind: "chipRow", x: LEFT_X, y: 44, w: LEFT_W, widths: [0.18, 0.15, 0.12, 0.16, 0.26], region: "filter-sort" },
      { kind: "rowList", x: LEFT_X, y: 74, w: LEFT_W, rows: 8, bars: true, region: "sector-rows" },
      { kind: "pills", x: LEFT_X, y: 274, w: LEFT_W, widths: [0.34], region: "expander" },
      { kind: "wheel", cx: WHEEL_CX, cy: WHEEL_CY, r: WHEEL_R, arcs: 10, ribbons: 5, region: "wheel" },
    ],
  },

  financing: {
    items: [
      headline([0.3, 0.85]),
      { kind: "rowList", x: LEFT_X, y: 68, w: LEFT_W, rows: 4, bars: true, region: "coverage-rows" },
      { kind: "dotGrid", x: LEFT_X, y: 210, cols: 14, rows: 4, region: "target-grid" },
      // Centerpiece: BER header + ranked outcome bars + execution bar (no
      // stable labels → inert furniture).
      { kind: "frame", x: 336, y: 20, w: 208, h: 260 },
      { kind: "textlines", x: 348, y: 34, w: 184, widths: [0.6, 0.4] },
      { kind: "rowList", x: 348, y: 88, w: 184, rows: 5, bars: true },
      { kind: "stackedBar", x: 348, y: 252, w: 184, segs: [0.7, 0.3] },
    ],
  },

  implementation: {
    items: [
      { kind: "pills", x: LEFT_X, y: 18, w: LEFT_W, widths: [0.3, 0.32], region: "view-toggle" },
      { kind: "rowList", x: LEFT_X, y: 50, w: LEFT_W, rows: 4, bars: true, region: "coverage-rows" },
      // Target/review roster rows drain to "other" (no stable fragment) —
      // drawn as inert furniture so the sketch still resembles the section.
      { kind: "rowList", x: LEFT_X, y: 192, w: LEFT_W, rows: 3 },
      { kind: "sankey", x: 336, y: 32, w: 208, h: 236, left: 4, right: 5, region: "flow-diagram" },
    ],
  },

  explore: {
    items: [
      { kind: "frame", x: 16, y: 16, w: 122, h: 222 },
      { kind: "pills", x: 26, y: 28, w: 102, widths: [0.9] , region: "controls" },
      { kind: "pills", x: 26, y: 56, w: 102, widths: [0.75], region: "controls" },
      { kind: "pills", x: 26, y: 84, w: 102, widths: [0.85], region: "controls" },
      { kind: "pills", x: 26, y: 112, w: 102, widths: [0.7], region: "controls" },
      { kind: "textlines", x: 26, y: 148, w: 102, widths: [0.8, 0.6, 0.7] },
      { kind: "wheel", cx: 288, cy: 126, r: 100, arcs: 10, ribbons: 7, region: "wheel" },
      { kind: "frame", x: 422, y: 16, w: 122, h: 222 },
      { kind: "textlines", x: 432, y: 30, w: 102, widths: [0.8, 0.6, 0.75, 0.5, 0.65], region: "answers" },
      { kind: "chatBar", x: 16, y: 254, w: 528, region: "chat" },
    ],
  },
};
