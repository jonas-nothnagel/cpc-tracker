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
 * overlap, then pushed out until no name box touches the seats.
 */
export function placeLabels(
  layout: RingLayout,
  sizes: (number | { width: number; height: number })[],
  gap = 6,
): RingLabel[] {
  const sizeOf = (k: number) => {
    const s = sizes[k];
    return typeof s === "number" ? { width: 150, height: s } : (s ?? { width: 150, height: 20 });
  };
  const reach = layout.rOuter + Math.max(10, layout.pitch * 0.6) + 4;
  const labels: RingLabel[] = layout.arcs.map((arc, k) => {
    const cos = Math.cos(arc.mid);
    const sin = Math.sin(arc.mid);
    const h = sizeOf(k).height;
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
  // Off the seats: a name box may not come nearer the centre than the seats'
  // outer edge. Side names move outward, top and bottom names away.
  const widths = labels.map((_, k) => sizeOf(k).width);
  labels.forEach((l, k) => clearOfRing(l, widths[k], layout));
  separateTopAndBottom(labels, widths, layout, gap);
  return labels;
}

/** Move a name box off the seats: side names outward, top and bottom names
 *  further up or down. */
function clearOfRing(l: RingLabel, width: number, layout: RingLayout) {
  const clear = layout.rOuter + layout.radius + 2;
  const top = l.y - l.height / 2;
  const bot = l.y + l.height / 2;
  if (l.align === "left" || l.align === "right") {
    const ny = Math.max(top, Math.min(layout.cy, bot));
    const dy = ny - layout.cy;
    if (Math.abs(dy) >= clear) return;
    const dx = Math.sqrt(clear * clear - dy * dy);
    if (l.align === "left") l.x = Math.max(l.x, layout.cx + dx);
    else l.x = Math.min(l.x, layout.cx - dx);
    return;
  }
  const x0 = l.x - width / 2;
  const nx = Math.max(x0, Math.min(layout.cx, x0 + width));
  const dx = nx - layout.cx;
  if (Math.abs(dx) >= clear) return;
  const dy = Math.sqrt(clear * clear - dx * dx);
  if (l.y < layout.cy) l.y = Math.min(l.y, layout.cy - dy - l.height / 2);
  else l.y = Math.max(l.y, layout.cy + dy + l.height / 2);
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function boxOf(l: RingLabel, width: number): Box {
  const x0 = l.align === "left" ? l.x : l.align === "right" ? l.x - width : l.x - width / 2;
  return { x0, x1: x0 + width, y0: l.y - l.height / 2, y1: l.y + l.height / 2 };
}

function overlapping(a: Box, b: Box, gap: number): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
}

/**
 * Names above and below the ring sit side by side, so they can meet where
 * two arcs meet at the top or bottom (a lens's first area and its "Other
 * targets"). Spread each row sideways; where a row runs out of room, lift
 * every other name a row further out; and keep them clear of the side names
 * by moving them further out, never onto the ring.
 */
function separateTopAndBottom(labels: RingLabel[], widths: number[], layout: RingLayout, gap: number) {
  const width = layout.cx * 2;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const top of [true, false]) {
      const row = labels
        .map((l, k) => ({ l, w: widths[k] }))
        .filter(({ l }) => l.align === "center" && (l.y < layout.cy) === top)
        .sort((a, b) => a.l.x - b.l.x);
      // Sideways first: each name starts after the one before it.
      for (let i = 1; i < row.length; i++) {
        const prev = boxOf(row[i - 1].l, row[i - 1].w);
        const cur = boxOf(row[i].l, row[i].w);
        if (overlapping(prev, cur, gap)) {
          row[i].l.x += prev.x1 + gap - cur.x0;
          moved = true;
        }
      }
      // Back inside the stage if the row ran off its right edge.
      const last = row[row.length - 1];
      if (last) {
        const spill = boxOf(last.l, last.w).x1 - (width - 4);
        if (spill > 0) for (const item of row) item.l.x -= spill;
      }
      // Still crowded: every other name a row further out.
      for (let i = 1; i < row.length; i++) {
        const prev = boxOf(row[i - 1].l, row[i - 1].w);
        const cur = boxOf(row[i].l, row[i].w);
        if (overlapping(prev, cur, gap)) {
          const lift = cur.y1 - cur.y0 + gap;
          row[i].l.y += top ? -lift : lift;
          moved = true;
        }
      }
    }
    // Clear of the names at the sides: move a top or bottom name further out.
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      if (l.align !== "center") continue;
      for (let j = 0; j < labels.length; j++) {
        if (labels[j].align === "center") continue;
        const a = boxOf(l, widths[i]);
        const b = boxOf(labels[j], widths[j]);
        if (!overlapping(a, b, gap)) continue;
        l.y = l.y < layout.cy ? l.y - (a.y1 - b.y0 + gap) : l.y + (b.y1 - a.y0 + gap);
        moved = true;
      }
    }
    // A name moved sideways may have come over the ring's shoulder.
    labels.forEach((l, k) => {
      if (l.align === "center") clearOfRing(l, widths[k], layout);
    });
    if (!moved) break;
  }
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
