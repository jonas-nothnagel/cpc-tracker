import type { Relation } from "./model";
import type { ArcSpec, RingLayout } from "./ring";

/**
 * The lines of the ring. From the target in the centre, one line runs to each
 * related seat; lines to the same arc and reading leave the centre together
 * as a bundle and branch out to their seats near the ring. From a seat the
 * reader points at, lines run inward to a road round the centre, along it,
 * and out to each partner, so they never cross the centre.
 */

type Pt = [number, number];

export interface EdgeSpec {
  id: number;
  relation: Relation;
}

export type Segment =
  | { kind: "cubic"; p0: Pt; p1: Pt; p2: Pt; p3: Pt }
  | { kind: "quad"; p0: Pt; c: Pt; p1: Pt }
  /** Along a circle round the centre, from angle a0 to a1 (either way). */
  | { kind: "arc"; r: number; a0: number; a1: number };

export interface EdgePath {
  id: number;
  relation: Relation;
  segments: Segment[];
  /** The centre of the ring, for arc segments. */
  cx: number;
  cy: number;
}

/** Widest angle one bundle fans out over before it splits (radians). */
const MAX_FAN = 0.5;

/** Lanes of the road round the centre, so readings do not overprint. */
const LANE: Partial<Record<Relation, number>> = { strong: 0, aligned: -1, partial: -2, apart: 1 };

function at(layout: RingLayout, angle: number, r: number): Pt {
  return [layout.cx + Math.cos(angle) * r, layout.cy + Math.sin(angle) * r];
}

/** Where a line meets a seat: just short of its dot, on the centre's side. */
function seatEnd(layout: RingLayout, id: number): Pt {
  const d = Math.hypot(layout.x[id] - layout.cx, layout.y[id] - layout.cy);
  return at(layout, layout.angle[id], d - layout.radius - 2);
}

export function flowerPaths(layout: RingLayout, arcs: ArcSpec[], edges: EdgeSpec[]): EdgePath[] {
  if (layout.rCentre <= 0) return [];
  const arcOf = new Map<number, number>();
  arcs.forEach((arc, k) => arc.ids.forEach((id) => arcOf.set(id, k)));
  const shown = edges.filter((e) => layout.placed[e.id]);
  // One bundle per arc and reading, split where it would fan wider than
  // MAX_FAN, each leaving the centre at its seats' mean angle.
  const groups = new Map<string, EdgeSpec[]>();
  for (const e of shown) {
    const key = `${arcOf.get(e.id) ?? -1}:${e.relation}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const outAngle = new Map<number, number>();
  for (const group of groups.values()) {
    const sorted = [...group].sort((x, y) => layout.angle[x.id] - layout.angle[y.id]);
    let chunk: EdgeSpec[] = [];
    const flush = () => {
      const mean = chunk.reduce((sum, e) => sum + layout.angle[e.id], 0) / chunk.length;
      for (const e of chunk) outAngle.set(e.id, mean);
      chunk = [];
    };
    for (const e of sorted) {
      if (chunk.length > 0 && layout.angle[e.id] - layout.angle[chunk[0].id] > MAX_FAN) flush();
      chunk.push(e);
    }
    if (chunk.length > 0) flush();
  }
  const r0 = layout.rCentre;
  const trunk = r0 + 0.45 * (layout.rInner - r0);
  const bend = layout.rInner - Math.max(layout.pitch * 0.9, layout.radius + 4);
  return shown.map((e) => {
    const out = outAngle.get(e.id)!;
    const angle = layout.angle[e.id];
    return {
      id: e.id,
      relation: e.relation,
      cx: layout.cx,
      cy: layout.cy,
      segments: [
        {
          kind: "cubic",
          p0: at(layout, out, r0),
          p1: at(layout, out, trunk),
          p2: at(layout, angle, bend),
          p3: seatEnd(layout, e.id),
        },
      ],
    };
  });
}

/** The shorter way round from one angle to another. */
function towards(a0: number, a1: number): number {
  let d = (a1 - a0) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a0 + d;
}

export function roadPaths(layout: RingLayout, from: number, edges: EdgeSpec[]): EdgePath[] {
  if (layout.rCentre <= 0 || !layout.placed[from]) return [];
  const road = layout.rCentre + 0.35 * (layout.rInner - layout.rCentre);
  const lane = Math.max(3, Math.min(6, layout.pitch * 0.35));
  const a = layout.angle[from];
  return edges
    .filter((e) => layout.placed[e.id] && e.id !== from)
    .map((e) => {
      const r = road + (LANE[e.relation] ?? 0) * lane;
      const b = towards(a, layout.angle[e.id]);
      // A short turn at each end, so the line leaves and joins the road smoothly.
      const turn = Math.min(0.12, Math.abs(b - a) / 3) * Math.sign(b - a || 1);
      const start = seatEnd(layout, from);
      const end = seatEnd(layout, e.id);
      return {
        id: e.id,
        relation: e.relation,
        cx: layout.cx,
        cy: layout.cy,
        segments: [
          { kind: "quad", p0: start, c: at(layout, a, r), p1: at(layout, a + turn, r) },
          { kind: "arc", r, a0: a + turn, a1: b - turn },
          { kind: "quad", p0: at(layout, b - turn, r), c: at(layout, b, r), p1: end },
        ],
      };
    });
}

/** Points along a path, for hit-testing and tests. */
export function samplePath(path: EdgePath, steps = 16): Pt[] {
  const pts: Pt[] = [];
  for (const seg of path.segments) {
    for (let i = pts.length === 0 ? 0 : 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      if (seg.kind === "cubic") {
        pts.push([
          u * u * u * seg.p0[0] + 3 * u * u * t * seg.p1[0] + 3 * u * t * t * seg.p2[0] + t * t * t * seg.p3[0],
          u * u * u * seg.p0[1] + 3 * u * u * t * seg.p1[1] + 3 * u * t * t * seg.p2[1] + t * t * t * seg.p3[1],
        ]);
      } else if (seg.kind === "quad") {
        pts.push([
          u * u * seg.p0[0] + 2 * u * t * seg.c[0] + t * t * seg.p1[0],
          u * u * seg.p0[1] + 2 * u * t * seg.c[1] + t * t * seg.p1[1],
        ]);
      } else {
        const angle = seg.a0 + (seg.a1 - seg.a0) * t;
        pts.push([path.cx + Math.cos(angle) * seg.r, path.cy + Math.sin(angle) * seg.r]);
      }
    }
  }
  return pts;
}

function segmentDistance(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** The line nearest to a point, if it is within `tolerance` of it. */
export function edgeAt(sampled: { id: number; pts: Pt[] }[], x: number, y: number, tolerance: number): number | null {
  let best: number | null = null;
  let bestD = tolerance;
  for (const { id, pts } of sampled) {
    for (let i = 1; i < pts.length; i++) {
      const d = segmentDistance(x, y, pts[i - 1], pts[i]);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
  }
  return best;
}
