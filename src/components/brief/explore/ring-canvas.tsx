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
import {
  edgeAt,
  flowerPaths,
  roadPaths,
  samplePath,
  type EdgePath,
  type EdgeSpec,
} from "@/lib/brief/explore/lines";
import type { Relation } from "@/lib/brief/explore/model";
import { layoutRing, placeLabels, seatAt, type ArcSpec, type RingLayout } from "@/lib/brief/explore/ring";

/** How long the seats take to move to their new places, in milliseconds. */
const MOVE_MS = 800;
/** How close the pointer must come to a line to take it, in pixels. */
const LINE_REACH = 6;

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

/** How each reading is drawn as a line: ink, width, opacity, dash. */
const LINE_STYLE: Partial<Record<Relation, { ink: string; width: number; alpha: number; dash: number[] }>> = {
  strong: { ink: RING_INK.green, width: 1.2, alpha: 0.6, dash: [] },
  aligned: { ink: RING_INK.green, width: 0.9, alpha: 0.26, dash: [] },
  partial: { ink: "#8f9a8a", width: 1, alpha: 0.5, dash: [1.5, 3] },
  apart: { ink: RING_INK.red, width: 1.25, alpha: 0.85, dash: [4, 3] },
};

export interface SeatStyle {
  color: string;
  /** Drawn as an outline: not compared with the target in the centre. */
  hollow?: boolean;
  /** Part of a potential misalignment band: every other seat of the band is
   *  drawn small, the brief's checker texture, so the band reads without its red. */
  texture?: boolean;
}

export interface ArcLabel {
  name: string;
  sub?: string;
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

function tracePath(ctx: CanvasRenderingContext2D, path: EdgePath) {
  path.segments.forEach((seg, k) => {
    if (seg.kind === "arc") {
      ctx.arc(path.cx, path.cy, seg.r, seg.a0, seg.a1, seg.a1 < seg.a0);
    } else if (seg.kind === "quad") {
      if (k === 0) ctx.moveTo(seg.p0[0], seg.p0[1]);
      ctx.quadraticCurveTo(seg.c[0], seg.c[1], seg.p1[0], seg.p1[1]);
    } else {
      if (k === 0) ctx.moveTo(seg.p0[0], seg.p0[1]);
      ctx.bezierCurveTo(seg.p1[0], seg.p1[1], seg.p2[0], seg.p2[1], seg.p3[0], seg.p3[1]);
    }
  });
}

/** Lines of one kind in one pass, overprinting where they cross. */
function strokeLines(ctx: CanvasRenderingContext2D, paths: EdgePath[], alpha: number, drained = false) {
  for (const relation of ["aligned", "partial", "strong", "apart"] as Relation[]) {
    const style = LINE_STYLE[relation];
    const list = paths.filter((p) => p.relation === relation);
    if (!style || list.length === 0) continue;
    ctx.strokeStyle = drained ? "#cfd3cc" : style.ink;
    ctx.globalAlpha = alpha * (drained ? 0.45 : style.alpha);
    ctx.lineWidth = style.width;
    ctx.setLineDash(style.dash);
    ctx.beginPath();
    for (const p of list) tracePath(ctx, p);
    ctx.stroke();
  }
}

interface Frame {
  layout: RingLayout;
  cur: SeatState;
  flower: EdgePath[];
  road: EdgePath[];
  lineAlpha: number;
  focus: number | null;
  /** The seat under the pointer or the keyboard. */
  hot: number | null;
  /** The line of the comparison beside the ring, or under the pointer. */
  hotLine: number | null;
  w: number;
  h: number;
}

function paint(canvas: HTMLCanvasElement, f: Frame) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.max(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(f.w * dpr) || canvas.height !== Math.round(f.h * dpr)) {
    canvas.width = Math.round(f.w * dpr);
    canvas.height = Math.round(f.h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, f.w, f.h);
  const { layout, cur } = f;
  const { cx, cy, radius } = layout;

  // The middle: the target in the centre is a node the lines leave from.
  if (layout.rCentre > 0) {
    ctx.strokeStyle = f.focus === null ? RING_INK.hairline : RING_INK.ink;
    ctx.lineWidth = f.focus === null ? 1 : 1.25;
    ctx.beginPath();
    ctx.arc(cx, cy, layout.rCentre, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (f.lineAlpha > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.lineCap = "round";
    // A seat in hand shows its own lines; the centre's step back.
    const peek = f.road.length > 0;
    strokeLines(ctx, f.flower, f.lineAlpha, peek);
    if (peek) strokeLines(ctx, f.road, f.lineAlpha);
    const hot = f.hotLine === null ? undefined : f.flower.find((p) => p.id === f.hotLine);
    if (hot) {
      const style = LINE_STYLE[hot.relation];
      ctx.globalAlpha = f.lineAlpha;
      ctx.strokeStyle = style?.ink ?? RING_INK.ink;
      ctx.lineWidth = 2.6;
      ctx.setLineDash(hot.relation === "apart" ? [6, 4] : []);
      ctx.beginPath();
      tracePath(ctx, hot);
      ctx.stroke();
    }
    ctx.restore();
  }

  for (let i = 0; i < cur.x.length; i++) {
    if (!layout.placed[i]) continue;
    ctx.beginPath();
    ctx.arc(cur.x[i], cur.y[i], radius * cur.s[i], 0, Math.PI * 2);
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

  const ringAt = (i: number, extra: number, width: number) => {
    ctx.strokeStyle = RING_INK.ink;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cur.x[i], cur.y[i], radius + extra, 0, Math.PI * 2);
    ctx.stroke();
  };
  if (f.focus !== null && layout.placed[f.focus]) ringAt(f.focus, 1.5, 1.6);
  if (f.hotLine !== null && layout.placed[f.hotLine]) ringAt(f.hotLine, 3, 2);
  if (f.hot !== null && f.hot !== f.hotLine && layout.placed[f.hot]) ringAt(f.hot, 3, 1.6);
}

/**
 * The ring: one seat per target, arcs by document or policy area, the target
 * in the centre in the middle with a line to each target it relates to.
 * Seats glide to their places when the centre or the grouping changes; the
 * lines draw once they have arrived. A seat under the pointer shows its own
 * lines round the centre. Selecting a seat puts it in the centre; selecting
 * a line opens that comparison.
 */
export function RingCanvas({
  arcs,
  n,
  styles,
  edges,
  neighbours,
  focus,
  highlight,
  selectedLine,
  labels,
  centre,
  tipFor,
  lineTipFor,
  describe,
  onSeat,
  onLine,
  onBackground,
  onEscape,
  ariaLabel,
}: {
  arcs: ArcSpec[];
  n: number;
  styles: SeatStyle[];
  /** Lines from the target in the centre. */
  edges: EdgeSpec[];
  /** A seat's own lines, shown while it is in hand. */
  neighbours: (id: number) => EdgeSpec[];
  focus: number | null;
  /** A seat to mark from outside the ring, e.g. a row under the pointer. */
  highlight: number | null;
  /** The partner of the comparison shown beside the ring. */
  selectedLine: number | null;
  labels: ArcLabel[];
  centre: ReactNode;
  tipFor: (id: number) => ReactNode;
  lineTipFor: (id: number) => ReactNode;
  describe: (id: number) => string;
  onSeat: (id: number) => void;
  onLine: (id: number) => void;
  onBackground?: () => void;
  onEscape?: () => void;
  ariaLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef<SeatState | null>(null);
  const settled = useRef(false);
  const drawRef = useRef<(lineAlpha?: number) => void>(() => {});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<number | null>(null);
  const [hoverLine, setHoverLine] = useState<{ id: number; x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [live, setLive] = useState("");

  const layout = useMemo(() => layoutRing(arcs, n, size.w, size.h), [arcs, n, size.w, size.h]);
  const placed = useMemo(() => placeLabels(layout, labels.map(labelHeight)), [layout, labels]);
  const order = useMemo(() => arcs.flatMap((a) => a.ids), [arcs]);
  const flower = useMemo(() => flowerPaths(layout, arcs, edges), [layout, arcs, edges]);
  const sampled = useMemo(() => flower.map((p) => ({ id: p.id, pts: samplePath(p, 14) })), [flower]);
  const hot = hover ?? cursor ?? highlight;
  // At rest, a seat in hand shows its own lines round the centre. With a
  // target in the centre, it lights its line to the centre instead.
  const road = useMemo(
    () => (focus !== null || hot === null ? [] : roadPaths(layout, hot, neighbours(hot))),
    [hot, focus, layout, neighbours],
  );
  const hotLine =
    hoverLine?.id ?? (hot !== null && flower.some((p) => p.id === hot) ? hot : null) ?? selectedLine;

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
    const from = { x: cur.x.slice(), y: cur.y.slice(), r: cur.r.slice(), g: cur.g.slice(), b: cur.b.slice(), s: cur.s.slice() };
    const to = seatState(n);
    let moves = false;
    for (let i = 0; i < n; i++) {
      to.x[i] = layout.placed[i] ? layout.x[i] : from.x[i];
      to.y[i] = layout.placed[i] ? layout.y[i] : from.y[i];
      const [r, g, b] = rgb(styles[i]?.color ?? RING_INK.rest);
      to.r[i] = r;
      to.g[i] = g;
      to.b[i] = b;
      to.s[i] = small[i] ? 0.55 : 1;
      to.hollow[i] = styles[i]?.hollow ? 1 : 0;
      if (Math.abs(to.x[i] - from.x[i]) > 0.5 || Math.abs(to.y[i] - from.y[i]) > 0.5) moves = true;
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
      // Lines follow once the seats have arrived.
      drawRef.current(moves ? (p < 0.7 ? 0 : (p - 0.7) / 0.3) : 1);
    };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof requestAnimationFrame === "undefined") {
      frame(1);
      return;
    }
    let raf = 0;
    let start = 0;
    const duration = first ? MOVE_MS * 1.4 : moves ? MOVE_MS : 260;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / duration);
      frame(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [layout, styles, small, n, size.w, size.h]);

  // Redraw with the latest lines and marks; the move effect calls this every frame.
  useEffect(() => {
    drawRef.current = (lineAlpha = 1) => {
      const canvas = canvasRef.current;
      if (!canvas || !state.current) return;
      paint(canvas, { layout, cur: state.current, flower, road, lineAlpha, focus, hot, hotLine, w: size.w, h: size.h });
    };
    if (settled.current) drawRef.current(1);
  }, [layout, flower, road, focus, hot, hotLine, size.w, size.h]);

  const point = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const { x, y } = point(e, e.currentTarget);
    const seat = seatAt(layout, x, y);
    setHover(seat);
    const line = seat === null && settled.current ? edgeAt(sampled, x, y, LINE_REACH) : null;
    setHoverLine(line === null ? null : { id: line, x, y });
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const { x, y } = point(e, e.currentTarget);
    const seat = seatAt(layout, x, y);
    if (seat !== null) {
      onSeat(seat);
      return;
    }
    const line = edgeAt(sampled, x, y, LINE_REACH);
    if (line !== null) onLine(line);
    else onBackground?.();
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
        if (cursor !== null) onSeat(cursor);
        break;
      case " ":
        if (cursor !== null) onLine(cursor);
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
  const centreSize = Math.max(0, layout.rCentre * 1.52);

  return (
    <div
      ref={wrapRef}
      className="ex-ring"
      role="application"
      aria-roledescription="ring"
      aria-label={ariaLabel}
      tabIndex={0}
      data-pointer={hover !== null || hoverLine !== null ? "seat" : undefined}
      data-testid="explore-ring"
      onPointerMove={onMove}
      onPointerLeave={() => {
        setHover(null);
        setHoverLine(null);
      }}
      onClick={onClick}
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
            >
              <span className="ex-label-name">{label.name}</span>
              {label.sub && <span className="ex-label-sub">{label.sub}</span>}
            </div>
          );
        })}
      </div>
      {layout.rCentre > 0 && (
        <div className="ex-centre" style={{ left: layout.cx, top: layout.cy, width: centreSize, height: centreSize }}>
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
      {tipSeat === null && hoverLine !== null && (
        <div
          className="ex-tip"
          style={{ left: Math.min(Math.max(hoverLine.x, 150), size.w - 150), top: hoverLine.y - 12 }}
          role="presentation"
        >
          {lineTipFor(hoverLine.id)}
        </div>
      )}
      <p className="ex-live" aria-live="polite">
        {live}
      </p>
    </div>
  );
}
