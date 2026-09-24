/**
 * The explorer's ring: every target a seat, the seats of one document (or
 * policy area) side by side as an arc, arcs clockwise from the top. Seats
 * fill an arc column by column along the circle, inner row first, so an arc
 * sorted by how its seats read against the centre shows as bands. The middle
 * stays free for the target in the centre.
 */

const TAU = Math.PI * 2;
const TOP = -Math.PI / 2;
const MAX_ROWS = 8;

export interface ArcSpec {
  key: string;
  /** Seat ids in the order they sit. */
  ids: number[];
  /** Width of the gap before this arc, in ordinary gaps. */
  gapBefore?: number;
}

export interface RingOptions {
  /** Room kept left and right of the ring for the arc names. */
  labelWidth?: number;
  /** Room kept above and below the ring. */
  labelHeight?: number;
  minPitch?: number;
  maxPitch?: number;
  /** Smallest inner radius, as a share of the outer radius. */
  minInnerShare?: number;
  /** An ordinary gap between arcs, in seat pitches. */
  gap?: number;
}

export interface RingArcLayout {
  key: string;
  count: number;
  /** Angles of the first and last column of seats (radians, clockwise from +x). */
  start: number;
  end: number;
  mid: number;
}

export interface RingLayout {
  cx: number;
  cy: number;
  rows: number;
  /** Distance between neighbouring seats on the inner row, and between rows. */
  pitch: number;
  /** Radius of a seat's dot. */
  radius: number;
  /** Radii of the inner and outer rows of seats. */
  rInner: number;
  rOuter: number;
  /** Radius of the free middle. */
  rCentre: number;
  /** Angle between two columns of seats. */
  step: number;
  x: Float32Array;
  y: Float32Array;
  angle: Float32Array;
  row: Uint8Array;
  placed: Uint8Array;
  arcs: RingArcLayout[];
}

function emptyRing(n: number, width: number, height: number): RingLayout {
  return {
    cx: width / 2,
    cy: height / 2,
    rows: 0,
    pitch: 0,
    radius: 0,
    rInner: 0,
    rOuter: 0,
    rCentre: 0,
    step: 0,
    x: new Float32Array(n),
    y: new Float32Array(n),
    angle: new Float32Array(n),
    row: new Uint8Array(n),
    placed: new Uint8Array(n),
    arcs: [],
  };
}

export function layoutRing(arcs: ArcSpec[], n: number, width: number, height: number, options: RingOptions = {}): RingLayout {
  const {
    labelWidth = 150,
    labelHeight = 56,
    minPitch = 6,
    maxPitch = 19,
    minInnerShare = 0.6,
    gap = 2.2,
  } = options;
  const present = arcs.filter((a) => a.ids.length > 0);
  if (width <= 0 || height <= 0 || present.length === 0) return emptyRing(n, width, height);

  let rOuter = Math.min(width / 2 - labelWidth, height / 2 - labelHeight);
  if (rOuter < 60) rOuter = Math.max(8, Math.min(width, height) / 2 - 8);
  const gapUnits = present.reduce((s, a) => s + (a.gapBefore ?? 1) * gap, 0);

  // The most rows that still make the seats noticeably larger; fewer rows keep
  // the middle roomy, so a row must buy at least 5% more pitch.
  let rows = 1;
  let pitch = 0;
  for (let k = 1; k <= MAX_ROWS; k++) {
    const cols = present.reduce((s, a) => s + Math.ceil(a.ids.length / k), 0);
    let p = (TAU * rOuter) / (cols + gapUnits + TAU * (k - 1));
    if (k > 1) p = Math.min(p, ((1 - minInnerShare) * rOuter) / (k - 1));
    p = Math.min(p, maxPitch);
    if (k === 1 || p > pitch * 1.05) {
      rows = k;
      pitch = p;
    }
  }
  pitch = Math.max(pitch, minPitch);

  const rInner = rOuter - (rows - 1) * pitch;
  const cols = present.map((a) => Math.ceil(a.ids.length / rows));
  const totalCols = cols.reduce((s, c) => s + c, 0);
  // Columns and gaps at the inner row's pitch, stretched to close the circle.
  const base = pitch / rInner;
  const need = totalCols * base + gapUnits * base;
  const stretch = need < TAU ? TAU / need : 1;
  const step = base * stretch;

  const layout = emptyRing(n, width, height);
  layout.rows = rows;
  layout.pitch = pitch;
  layout.radius = Math.max(0.8, pitch * 0.36);
  layout.rInner = rInner;
  layout.rOuter = rOuter;
  layout.step = step;
  layout.rCentre = Math.max(0, rInner - pitch / 2 - Math.max(24, rInner * 0.18));

  let theta = TOP;
  present.forEach((arc, k) => {
    theta += (arc.gapBefore ?? 1) * gap * base * stretch;
    const start = theta + step / 2;
    arc.ids.forEach((id, j) => {
      const col = Math.floor(j / rows);
      const row = j % rows;
      const angle = start + col * step;
      const r = rInner + row * pitch;
      layout.x[id] = layout.cx + Math.cos(angle) * r;
      layout.y[id] = layout.cy + Math.sin(angle) * r;
      layout.angle[id] = angle;
      layout.row[id] = row;
      layout.placed[id] = 1;
    });
    const end = start + (cols[k] - 1) * step;
    layout.arcs.push({ key: arc.key, count: arc.ids.length, start, end, mid: (start + end) / 2 });
    theta += cols[k] * step;
  });
  return layout;
}

export interface RingLabel {
  key: string;
  /** Anchor point: the label's left edge (align left), right edge (align
   *  right) or centre (align center). */
  x: number;
  /** The label's vertical centre. */
  y: number;
  align: "left" | "right" | "center";
  height: number;
}

/**
 * Each arc's name outside the ring, on the side the arc faces: to the right
 * of arcs on the right, to the left of arcs on the left, above or below the
 * arcs at the top and bottom. Names on one side are spread so they never
 * overlap.
 */
export function placeLabels(layout: RingLayout, heights: number[], gap = 6): RingLabel[] {
  const reach = layout.rOuter + Math.max(10, layout.pitch * 0.6) + 4;
  const labels: RingLabel[] = layout.arcs.map((arc, k) => {
    const cos = Math.cos(arc.mid);
    const sin = Math.sin(arc.mid);
    const h = heights[k] ?? 20;
    const x = layout.cx + cos * reach;
    const y = layout.cy + sin * reach;
    if (cos > 0.35) return { key: arc.key, x, y, align: "left", height: h };
    if (cos < -0.35) return { key: arc.key, x, y, align: "right", height: h };
    return { key: arc.key, x, y: sin < 0 ? y - h / 2 : y + h / 2, align: "center", height: h };
  });
  const bottom = layout.cy * 2 - 4;
  for (const side of ["left", "right"] as const) {
    const list = labels.filter((l) => l.align === side).sort((a, b) => a.y - b.y);
    for (let i = 1; i < list.length; i++) {
      const min = list[i - 1].y + (list[i - 1].height + list[i].height) / 2 + gap;
      if (list[i].y < min) list[i].y = min;
    }
    const last = list[list.length - 1];
    if (last && last.y + last.height / 2 > bottom) {
      last.y = bottom - last.height / 2;
      for (let i = list.length - 2; i >= 0; i--) {
        const max = list[i + 1].y - (list[i + 1].height + list[i].height) / 2 - gap;
        if (list[i].y > max) list[i].y = max;
      }
    }
  }
  return labels;
}

/** The seat nearest to a point, if it is within reach of it. */
export function seatAt(layout: RingLayout, x: number, y: number): number | null {
  const reach = Math.max(layout.pitch * 0.75, layout.radius + 6);
  let best: number | null = null;
  let bestD = reach;
  for (let i = 0; i < layout.placed.length; i++) {
    if (!layout.placed[i]) continue;
    const d = Math.hypot(layout.x[i] - x, layout.y[i] - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
