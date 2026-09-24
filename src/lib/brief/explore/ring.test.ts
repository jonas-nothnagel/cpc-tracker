import { describe, expect, it } from "vitest";
import { layoutRing, placeLabels, seatAt, type ArcSpec, type RingLayout } from "./ring";

const TAU = Math.PI * 2;

/** Arcs of the given sizes, numbering the seats across them. */
function arcsOf(sizes: number[]): { arcs: ArcSpec[]; n: number } {
  let next = 0;
  const arcs = sizes.map((size, k) => ({
    key: `doc${k}`,
    ids: Array.from({ length: size }, () => next++),
  }));
  return { arcs, n: next };
}

function placedSeats(layout: RingLayout): number[] {
  const out: number[] = [];
  layout.placed.forEach((p, i) => {
    if (p) out.push(i);
  });
  return out;
}

function minDistance(layout: RingLayout): number {
  const seats = placedSeats(layout);
  let min = Infinity;
  for (let a = 0; a < seats.length; a++) {
    for (let b = a + 1; b < seats.length; b++) {
      const dx = layout.x[seats[a]] - layout.x[seats[b]];
      const dy = layout.y[seats[a]] - layout.y[seats[b]];
      min = Math.min(min, Math.hypot(dx, dy));
    }
  }
  return min;
}

describe("layoutRing", () => {
  it("places every seat once, on the ring and inside the stage", () => {
    const { arcs, n } = arcsOf([36, 20, 41, 15, 27, 16, 15, 8]);
    const layout = layoutRing(arcs, n, 900, 700);
    expect(placedSeats(layout)).toHaveLength(n);
    for (const i of placedSeats(layout)) {
      const r = Math.hypot(layout.x[i] - layout.cx, layout.y[i] - layout.cy);
      expect(r).toBeGreaterThan(layout.rInner - 0.5);
      expect(r).toBeLessThan(layout.rOuter + 0.5);
      expect(layout.x[i]).toBeGreaterThan(0);
      expect(layout.x[i]).toBeLessThan(900);
      expect(layout.y[i]).toBeGreaterThan(0);
      expect(layout.y[i]).toBeLessThan(700);
    }
  });

  it("never lets two seats touch", () => {
    for (const sizes of [[36, 20, 41, 15, 27, 16, 15, 8], [4, 16, 91, 4, 192, 9, 55, 33], [181, 21, 7]]) {
      const { arcs, n } = arcsOf(sizes);
      const layout = layoutRing(arcs, n, 900, 700);
      expect(minDistance(layout)).toBeGreaterThanOrEqual(2 * layout.radius + 2);
    }
  });

  it("keeps every seat big enough to point at", () => {
    const { arcs, n } = arcsOf([4, 16, 91, 4, 192, 9, 55, 33]);
    const layout = layoutRing(arcs, n, 900, 700);
    expect(layout.pitch).toBeGreaterThanOrEqual(11);
  });

  it("adds rows as the ring fills up", () => {
    const small = layoutRing(arcsOf([6, 6, 6]).arcs, 18, 900, 700);
    const large = layoutRing(arcsOf([4, 16, 91, 4, 192, 9, 55, 33]).arcs, 404, 900, 700);
    expect(large.rows).toBeGreaterThan(small.rows);
  });

  it("leaves the middle free for the item in the centre", () => {
    const { arcs, n } = arcsOf([4, 16, 91, 4, 192, 9, 55, 33]);
    const layout = layoutRing(arcs, n, 900, 700);
    expect(layout.rCentre).toBeGreaterThan(100);
    expect(layout.rCentre).toBeLessThan(layout.rInner);
  });

  it("runs the arcs clockwise from the top, closing the circle", () => {
    const { arcs, n } = arcsOf([36, 20, 41]);
    const layout = layoutRing(arcs, n, 900, 700);
    const [a, b, c] = layout.arcs;
    expect(a.start).toBeGreaterThanOrEqual(-Math.PI / 2);
    expect(a.end).toBeLessThan(b.start);
    expect(b.end).toBeLessThan(c.start);
    expect(c.end).toBeLessThanOrEqual(-Math.PI / 2 + TAU);
    const spans = layout.arcs.reduce((s, arc) => s + (arc.end - arc.start), 0);
    // The arcs take most of the circle; the rest are the gaps between them.
    expect(spans).toBeGreaterThan(TAU * 0.8);
  });

  it("fills an arc in seat order along the circle, so a sorted arc reads as bands", () => {
    const { arcs, n } = arcsOf([40]);
    const layout = layoutRing(arcs, n, 900, 700);
    for (let i = 1; i < 40; i++) expect(layout.angle[i]).toBeGreaterThanOrEqual(layout.angle[i - 1] - 1e-6);
    expect(layout.angle[0]).toBeCloseTo(layout.arcs[0].start, 5);
  });

  it("keeps seats inside their own arc", () => {
    const { arcs, n } = arcsOf([10, 30, 5]);
    const layout = layoutRing(arcs, n, 900, 700);
    arcs.forEach((arc, k) => {
      for (const i of arc.ids) {
        expect(layout.angle[i]).toBeGreaterThanOrEqual(layout.arcs[k].start - 1e-6);
        expect(layout.angle[i]).toBeLessThanOrEqual(layout.arcs[k].end + 1e-6);
      }
    });
  });

  it("widens the gap before an arc that asks for it", () => {
    const { arcs, n } = arcsOf([20, 20, 20]);
    const plain = layoutRing(arcs, n, 900, 700);
    const wide = layoutRing(
      arcs.map((a, k) => (k === 2 ? { ...a, gapBefore: 4 } : a)),
      n,
      900,
      700,
    );
    const gap = (l: RingLayout) => l.arcs[2].start - l.arcs[1].end;
    expect(gap(wide)).toBeGreaterThan(gap(plain) * 2);
  });

  it("returns an empty layout for an empty stage", () => {
    const { arcs, n } = arcsOf([5, 5]);
    const layout = layoutRing(arcs, n, 0, 0);
    expect(placedSeats(layout)).toHaveLength(0);
  });
});

describe("placeLabels", () => {
  it("puts each arc's name outside the ring, on the side it faces", () => {
    const { arcs, n } = arcsOf([20, 20, 20, 20]);
    const layout = layoutRing(arcs, n, 900, 700);
    const labels = placeLabels(layout, [20, 20, 20, 20]);
    labels.forEach((label, k) => {
      const mid = layout.arcs[k].mid;
      const r = Math.hypot(label.x - layout.cx, label.y - layout.cy);
      expect(r).toBeGreaterThan(layout.rOuter);
      if (Math.cos(mid) > 0.35) expect(label.align).toBe("left");
      if (Math.cos(mid) < -0.35) expect(label.align).toBe("right");
    });
  });

  it("stacks crowded names on one side without overlap", () => {
    const { arcs, n } = arcsOf([3, 3, 3, 3, 3, 3, 3, 3, 100]);
    const layout = layoutRing(arcs, n, 900, 700);
    const heights = arcs.map(() => 34);
    const labels = placeLabels(layout, heights);
    for (const side of ["left", "right"] as const) {
      const list = labels
        .map((l, k) => ({ l, h: heights[k] }))
        .filter(({ l }) => l.align === side)
        .sort((a, b) => a.l.y - b.l.y);
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const cur = list[i];
        expect(cur.l.y - prev.l.y).toBeGreaterThanOrEqual((prev.h + cur.h) / 2 - 0.5);
      }
    }
  });
});

describe("seatAt", () => {
  const { arcs, n } = arcsOf([36, 20, 41, 15, 27, 16, 15, 8]);
  const layout = layoutRing(arcs, n, 900, 700);

  it("finds the seat under the pointer, and near it", () => {
    expect(seatAt(layout, layout.x[17], layout.y[17])).toBe(17);
    expect(seatAt(layout, layout.x[17] + layout.radius, layout.y[17])).toBe(17);
  });

  it("finds nothing in the middle of the ring", () => {
    expect(seatAt(layout, layout.cx, layout.cy)).toBeNull();
  });
});

describe("placeLabels clear of the ring", () => {
  function boxOf(l: { x: number; y: number; align: string; height: number }, width: number) {
    const x0 = l.align === "left" ? l.x : l.align === "right" ? l.x - width : l.x - width / 2;
    return { x0, x1: x0 + width, y0: l.y - l.height / 2, y1: l.y + l.height / 2 };
  }

  it("keeps every name box off the seats, whatever the arcs", () => {
    for (const sizes of [[36, 20, 41, 15, 27, 16, 15, 8], [4, 16, 91, 4, 192, 9, 55, 33], [181, 21, 7], [3, 3, 3, 3, 3, 3, 3, 3, 100]]) {
      const { arcs, n } = arcsOf(sizes);
      const layout = layoutRing(arcs, n, 900, 700);
      const sizesOf = arcs.map(() => ({ width: 140, height: 38 }));
      const labels = placeLabels(layout, sizesOf);
      const clear = layout.rOuter + layout.radius + 2;
      labels.forEach((l) => {
        const b = boxOf(l, 140);
        const nx = Math.max(b.x0, Math.min(layout.cx, b.x1));
        const ny = Math.max(b.y0, Math.min(layout.cy, b.y1));
        expect(Math.hypot(nx - layout.cx, ny - layout.cy)).toBeGreaterThanOrEqual(clear - 0.5);
      });
    }
  });
});
