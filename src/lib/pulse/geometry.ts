export interface Pt {
  x: number;
  y: number;
}

/**
 * Positions for n document pages along a shallow upward arc (a desk of
 * papers facing the viewer). Symmetric, deterministic, always inside the box.
 */
export function arcPositions(n: number, width: number, height: number): Pt[] {
  const cx = width / 2;
  const cy = height * 1.95;
  const radius = height * 1.62;
  if (n === 1) return [{ x: cx, y: cy - radius }];
  const span = Math.min(1.15, 0.34 + n * 0.13);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1) - 0.5;
    const ang = t * span;
    return { x: cx + radius * Math.sin(ang), y: cy - radius * Math.cos(ang) };
  });
}

/**
 * Deterministic pseudo-noise in [-1, 1] from a string seed and an index.
 * Keeps fiber shapes organic AND stable across renders (SSR-safe: no
 * Math.random anywhere in the scene).
 */
export function hashUnit(seed: string, i: number): number {
  let h = (2166136261 ^ Math.imul(i + 1, 2654435761)) >>> 0;
  for (let k = 0; k < seed.length; k++) {
    h ^= seed.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/**
 * An organic cubic fiber between two points: control points pushed off the
 * straight line by seed-jittered normals, amplitude growing gently with the
 * relative flagged share so the worst pathways read as more agitated.
 */
export function fiberPath(
  seed: string,
  a: Pt,
  b: Pt,
  rel: number,
  sag = 0,
): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amp = Math.min(len * 0.22, 60) * (0.5 + Math.min(rel, 3) * 0.25);
  const j1 = hashUnit(seed, 0);
  const j2 = hashUnit(seed, 1);
  const c1 = {
    x: a.x + dx * 0.3 + nx * amp * j1,
    y: a.y + dy * 0.3 + ny * amp * j1 + sag,
  };
  const c2 = {
    x: a.x + dx * 0.7 + nx * amp * j2,
    y: a.y + dy * 0.7 + ny * amp * j2 + sag,
  };
  return `M ${a.x} ${a.y} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${b.x} ${b.y}`;
}

/** Stroke width for an inflamed fiber: bounded, saturating at 3x the mean. */
export function nerveWidth(rel: number): number {
  return 2 + Math.min(rel, 3);
}
