"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { layoutRing, placeLabels, seatAt, type ArcSpec, type RingLayout } from "@/lib/brief/explore/ring";

/** How long the seats take to move to their new places, in milliseconds. */
const MOVE_MS = 800;

/** Inks of the ring: the brief's two inks and its neutrals. Text never takes
 *  a seat's ink; the labels and the side column stay in ink. */
export const RING_INK = {
  ink: "#232e3d",
  green: "#2a7443",
  red: "#d2432c",
  partial: "#a9b3a4",
  none: "#cfcfc9",
  rest: "#b9bfc7",
  drained: "#e6e8e4",
  hairline: "#e5e7eb",
} as const;

export interface SeatStyle {
  color: string;
  /** Drawn as an outline: not compared with the target in the centre. */
  hollow?: boolean;
  /** Part of a potential misalignment band: every other seat of the band is
   *  drawn small, the brief's checker texture, so the band reads without its red. */
  texture?: boolean;
}

export interface Spoke {
  id: number;
  tone: "strong" | "apart";
}

export interface ArcLabel {
  name: string;
  sub?: string;
  title?: string;
  dim?: boolean;
}

function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

interface SeatState {
  x: Float32Array;
  y: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  s: Float32Array;
  hollow: Uint8Array;
}

function seatState(n: number): SeatState {
  return {
    x: new Float32Array(n),
    y: new Float32Array(n),
    r: new Float32Array(n),
    g: new Float32Array(n),
    b: new Float32Array(n),
    s: new Float32Array(n),
    hollow: new Uint8Array(n),
  };
}

/** Rough height of an arc's name (up to three lines) and its counts line. */
function labelHeight(label: ArcLabel): number {
  const lines = (text: string, px: number) => Math.min(3, Math.max(1, Math.ceil((text.length * px) / 150)));
  return lines(label.name, 7.4) * 18 + (label.sub ? lines(label.sub, 6.2) * 16 + 2 : 0);
}

function paint(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  layout: RingLayout,
  cur: SeatState,
  spokes: Spoke[],
  spokeAlpha: number,
  focus: number | null,
  marked: number | null,
  cursor: number | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.max(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const { cx, cy, radius } = layout;

  // The middle: a hairline circle where the target in the centre sits.
  if (layout.rCentre > 0) {
    ctx.strokeStyle = RING_INK.hairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, layout.rCentre, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Lines from the centre to strong alignments (solid) and potential
  // misalignments (dashed), overprinting where they cross.
  if (spokeAlpha > 0 && spokes.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.lineCap = "round";
    for (const tone of ["strong", "apart"] as const) {
      ctx.strokeStyle = tone === "strong" ? RING_INK.green : RING_INK.red;
      ctx.setLineDash(tone === "apart" ? [4, 3] : []);
      ctx.lineWidth = 1.1;
      ctx.globalAlpha = spokeAlpha * (tone === "strong" ? 0.45 : 0.75);
      ctx.beginPath();
      for (const s of spokes) {
        if (s.tone !== tone || s.id === marked) continue;
        const dx = cur.x[s.id] - cx;
        const dy = cur.y[s.id] - cy;
        const d = Math.hypot(dx, dy);
        if (d <= layout.rCentre + 8) continue;
        const ux = dx / d;
        const uy = dy / d;
        ctx.moveTo(cx + ux * (layout.rCentre + 4), cy + uy * (layout.rCentre + 4));
        ctx.lineTo(cx + ux * (d - radius - 2.5), cy + uy * (d - radius - 2.5));
      }
      ctx.stroke();
    }
    // The line of the seat in hand, on top and heavier.
    const hot = marked === null ? undefined : spokes.find((s) => s.id === marked);
    if (hot) {
      const dx = cur.x[hot.id] - cx;
      const dy = cur.y[hot.id] - cy;
      const d = Math.hypot(dx, dy);
      ctx.globalAlpha = spokeAlpha;
      ctx.strokeStyle = hot.tone === "strong" ? RING_INK.green : RING_INK.red;
      ctx.setLineDash(hot.tone === "apart" ? [5, 3] : []);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx + (dx / d) * (layout.rCentre + 4), cy + (dy / d) * (layout.rCentre + 4));
      ctx.lineTo(cx + (dx / d) * (d - radius - 2.5), cy + (dy / d) * (d - radius - 2.5));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Seats.
  for (let i = 0; i < cur.x.length; i++) {
    if (!layout.placed[i]) continue;
    const rr = radius * cur.s[i];
    ctx.beginPath();
    ctx.arc(cur.x[i], cur.y[i], rr, 0, Math.PI * 2);
    const color = `rgb(${cur.r[i] | 0},${cur.g[i] | 0},${cur.b[i] | 0})`;
    if (cur.hollow[i]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  // The centre's own place on the ring, and the seat in hand.
  const ringAt = (i: number, extra: number, width: number) => {
    ctx.strokeStyle = RING_INK.ink;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cur.x[i], cur.y[i], radius + extra, 0, Math.PI * 2);
    ctx.stroke();
  };
  if (focus !== null && layout.placed[focus]) ringAt(focus, 1.5, 1.6);
  if (marked !== null && layout.placed[marked]) ringAt(marked, 3, 2);
  if (cursor !== null && cursor !== marked && layout.placed[cursor]) ringAt(cursor, 3, 1.5);
}

/**
 * The ring: one seat per target, arcs by document or policy area, the target
 * in the centre in the middle. Seats glide to their places when the centre or
 * the grouping changes. Names sit outside their arcs; pointing at a seat names
 * it; the keyboard moves from seat to seat.
 */
export function RingCanvas({
  arcs,
  n,
  styles,
  spokes,
  focus,
  highlight,
  labels,
  centre,
  tipFor,
  describe,
  onSelect,
  onCentre,
  onEscape,
  ariaLabel,
}: {
  arcs: ArcSpec[];
  n: number;
  styles: SeatStyle[];
  spokes: Spoke[];
  focus: number | null;
  /** A seat to mark, e.g. the partner shown beside the ring. */
  highlight: number | null;
  labels: ArcLabel[];
  centre: ReactNode;
  tipFor: (id: number) => ReactNode;
  describe: (id: number) => string;
  onSelect: (id: number) => void;
  onCentre: (id: number) => void;
  onEscape?: () => void;
  ariaLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef<SeatState | null>(null);
  const settled = useRef(false);
  const drawRef = useRef<(spokeAlpha?: number) => void>(() => {});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [live, setLive] = useState("");

  const layout = useMemo(() => layoutRing(arcs, n, size.w, size.h), [arcs, n, size.w, size.h]);
  const placed = useMemo(
    () => placeLabels(layout, labels.map(labelHeight)),
    [layout, labels],
  );
  const order = useMemo(() => arcs.flatMap((a) => a.ids), [arcs]);
  // The checker: within a textured band, seats whose column and row add up
  // to an odd number are drawn small.
  const small = useMemo(() => {
    const out = new Uint8Array(n);
    const rows = Math.max(1, layout.rows);
    for (const arc of arcs) {
      arc.ids.forEach((id, j) => {
        if (styles[id]?.texture && (Math.floor(j / rows) + (j % rows)) % 2 === 1) out[id] = 1;
      });
    }
    return out;
  }, [arcs, styles, layout.rows, n]);
  const marked = hover ?? highlight;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () =>
      setSize((prev) =>
        prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight },
      );
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Move the seats to their new places and inks.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    const first = !state.current || state.current.x.length !== n;
    if (first) {
      state.current = seatState(n);
      // The first build gathers the seats from the middle.
      for (let i = 0; i < n; i++) {
        state.current.x[i] = layout.cx;
        state.current.y[i] = layout.cy;
        state.current.s[i] = 0.2;
        const [r, g, b] = rgb(styles[i]?.color ?? RING_INK.rest);
        state.current.r[i] = r;
        state.current.g[i] = g;
        state.current.b[i] = b;
      }
    }
    const cur = state.current!;
    const from = {
      x: cur.x.slice(),
      y: cur.y.slice(),
      r: cur.r.slice(),
      g: cur.g.slice(),
      b: cur.b.slice(),
      s: cur.s.slice(),
    };
    const to = seatState(n);
    for (let i = 0; i < n; i++) {
      to.x[i] = layout.placed[i] ? layout.x[i] : from.x[i];
      to.y[i] = layout.placed[i] ? layout.y[i] : from.y[i];
      const style = styles[i];
      const [r, g, b] = rgb(style?.color ?? RING_INK.rest);
      to.r[i] = r;
      to.g[i] = g;
      to.b[i] = b;
      to.s[i] = small[i] ? 0.55 : 1;
      to.hollow[i] = style?.hollow ? 1 : 0;
    }
    const frame = (p: number) => {
      const e = 1 - Math.pow(1 - p, 3);
      for (let i = 0; i < n; i++) {
        cur.x[i] = from.x[i] + (to.x[i] - from.x[i]) * e;
        cur.y[i] = from.y[i] + (to.y[i] - from.y[i]) * e;
        cur.r[i] = from.r[i] + (to.r[i] - from.r[i]) * e;
        cur.g[i] = from.g[i] + (to.g[i] - from.g[i]) * e;
        cur.b[i] = from.b[i] + (to.b[i] - from.b[i]) * e;
        cur.s[i] = from.s[i] + (to.s[i] - from.s[i]) * e;
        if (p >= 0.5) cur.hollow[i] = to.hollow[i];
      }
      settled.current = p >= 1;
      // Lines appear once the seats have arrived.
      drawRef.current(p < 0.7 ? 0 : (p - 0.7) / 0.3);
    };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof requestAnimationFrame === "undefined") {
      frame(1);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / (first ? MOVE_MS * 1.4 : MOVE_MS));
      frame(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `styles` and `layout` change together with what the ring shows.
  }, [layout, styles, small, n, size.w, size.h]);

  // Redraw with the latest marks; the move effect calls this every frame.
  useEffect(() => {
    drawRef.current = (spokeAlpha = 1) => {
      const canvas = canvasRef.current;
      if (!canvas || !state.current) return;
      paint(canvas, size.w, size.h, layout, state.current, spokes, spokeAlpha, focus, marked, cursor);
    };
    if (settled.current) drawRef.current(1);
  }, [layout, spokes, focus, marked, cursor, size.w, size.h]);

  const at = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    return seatAt(layout, e.clientX - box.left, e.clientY - box.top);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => setHover(at(e, e.currentTarget));
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const seat = at(e, e.currentTarget);
    if (seat !== null) onSelect(seat);
  };
  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const seat = at(e, e.currentTarget);
    if (seat !== null) onCentre(seat);
  };

  const moveCursor = (next: number | null) => {
    setCursor(next);
    if (next !== null) setLive(describe(next));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (order.length === 0) return;
    const pos = cursor === null ? -1 : order.indexOf(cursor);
    const arcOf = (id: number) => arcs.findIndex((a) => a.ids.includes(id));
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        moveCursor(order[(pos + 1) % order.length]);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        moveCursor(order[(pos - 1 + order.length) % order.length]);
        break;
      case "PageDown":
      case "PageUp": {
        const k = cursor === null ? -1 : arcOf(cursor);
        const next = e.key === "PageDown" ? (k + 1) % arcs.length : (k - 1 + arcs.length) % arcs.length;
        moveCursor(arcs[next]?.ids[0] ?? null);
        break;
      }
      case "Home":
        moveCursor(order[0]);
        break;
      case "End":
        moveCursor(order[order.length - 1]);
        break;
      case "Enter":
        if (cursor !== null) onSelect(cursor);
        break;
      case " ":
        if (cursor !== null) onCentre(cursor);
        break;
      case "Escape":
        onEscape?.();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const tipSeat = hover ?? cursor;
  const tipBelow = tipSeat !== null && layout.y[tipSeat] < 110;
  const centreSize = Math.max(0, layout.rCentre * 1.5);

  return (
    <div
      ref={wrapRef}
      className="ex-ring"
      role="application"
      aria-roledescription="ring"
      aria-label={ariaLabel}
      tabIndex={0}
      data-pointer={hover !== null ? "seat" : undefined}
      data-testid="explore-ring"
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onBlur={() => setCursor(null)}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="ex-labels" aria-hidden="true">
        {placed.map((l, k) => {
          const label = labels[k];
          if (!label) return null;
          return (
            <div
              key={l.key}
              className="ex-label"
              data-align={l.align}
              data-dim={label.dim ? "true" : undefined}
              style={{ left: l.x, top: l.y }}
              title={label.title}
            >
              <span className="ex-label-name">{label.name}</span>
              {label.sub && <span className="ex-label-sub">{label.sub}</span>}
            </div>
          );
        })}
      </div>
      {layout.rCentre > 0 && (
        <div
          className="ex-centre"
          style={{ left: layout.cx, top: layout.cy, width: centreSize, maxHeight: centreSize }}
        >
          {centre}
        </div>
      )}
      {tipSeat !== null && layout.placed[tipSeat] === 1 && (
        <div
          className="ex-tip"
          data-below={tipBelow ? "true" : undefined}
          style={{
            left: Math.min(Math.max(layout.x[tipSeat], 150), size.w - 150),
            top: layout.y[tipSeat] + (tipBelow ? layout.radius + 10 : -(layout.radius + 10)),
          }}
          role="presentation"
        >
          {tipFor(tipSeat)}
        </div>
      )}
      <p className="ex-live" aria-live="polite">
        {live}
      </p>
    </div>
  );
}
