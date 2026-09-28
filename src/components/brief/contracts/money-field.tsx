"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  layoutField,
  type FieldLabel,
  type FieldModel,
  type Ink,
  type LayoutContext,
  type Stage,
} from "@/lib/brief/contracts/field";
import type { ContractsFile } from "@/lib/brief/contracts/model";
import type { Slice } from "@/lib/brief/contracts/units";
import { cellRect, mixInk } from "../hub/hub-canvas";

/** The field's inks: the record in ink, then deep green for money mainly for
 *  nature or climate, light green where it is a side benefit, pale for the
 *  rest. Outlines and targets stay in the brief's neutral inks. */
export const FIELD_INK = {
  record: "#232e3d",
  principal: "#2a7443",
  significant: "#9cc7a8",
  rest: "#e4e6e9",
  outline: "#cfd3d8",
  target: "#232e3d",
} as const;

/** How long the squares take to move between steps, in milliseconds. */
const MOVE_MS = 950;
const PAPER = "#ffffff";
/** A field without a measured size (tests, first paint). */
const FALLBACK = { w: 640, h: 480 };

/** What the pointer is on. */
export type FieldPoint =
  | { kind: "square"; index: number; ink: Ink; year: number; slice: Slice | null }
  | { kind: "target"; id: string; row: string }
  | { kind: "place"; code: string }
  | { kind: "row"; id: string };

interface Shown {
  x: Float32Array;
  y: Float32Array;
  a: Float32Array;
  pitch: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function inkOf(ink: Ink, stage: Stage): string {
  return stage.kind === "record" ? FIELD_INK.record : FIELD_INK[ink];
}

/**
 * The overview's field: the record as squares of equal money that move from
 * one layout to the next as the steps change. Pointing at a square names the
 * contract behind it; pointing never re-lays the field. Selecting a square
 * opens its contract, a target its panel, a row or place its list.
 */
export function MoneyField({
  model,
  file,
  stage,
  ctx,
  ariaLabel,
  label,
  tip,
  onSelect,
  selected,
}: {
  model: FieldModel;
  file: ContractsFile;
  stage: Stage;
  ctx: LayoutContext;
  ariaLabel: string;
  label: (l: FieldLabel) => ReactNode;
  tip: (p: FieldPoint) => ReactNode | null;
  onSelect: (p: FieldPoint) => void;
  /** The row or place kept forward: its name is marked. */
  selected: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const shown = useRef<Shown | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const [hover, setHover] = useState<{ point: FieldPoint; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      setSize(w > 0 && h > 0 ? { w, h } : FALLBACK);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const box = size ?? FALLBACK;
  const layout = useMemo(() => layoutField(model, file, stage, box, ctx), [model, file, stage, box, ctx]);
  const paths = useMemo(
    () =>
      layout.outlines && typeof Path2D !== "undefined"
        ? layout.outlines.map((o) => ({ code: o.code, path: new Path2D(o.d) }))
        : null,
    [layout],
  );

  useEffect(() => {
    setHover(null);
    const el = canvas.current;
    const g = el?.getContext?.("2d") ?? null;
    const n = layout.squares.length;
    const to: Shown = {
      x: Float32Array.from(layout.squares, (s) => s.x),
      y: Float32Array.from(layout.squares, (s) => s.y),
      a: Float32Array.from(layout.squares, (s) => (s.visible ? 1 : 0)),
      pitch: layout.pitch,
    };
    const from = shown.current && shown.current.x.length === n ? shown.current : to;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    const draw = (cur: Shown, e: number) => {
      if (!el || !g) return;
      const w = Math.round(box.w * dpr);
      const h = Math.round(box.h * dpr);
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, box.w, box.h);
      if (paths) {
        g.globalAlpha = e;
        g.fillStyle = PAPER;
        g.strokeStyle = FIELD_INK.outline;
        g.lineWidth = 1;
        for (const p of paths) {
          g.fill(p.path, "evenodd");
          g.stroke(p.path);
        }
        g.globalAlpha = 1;
      }
      let last = "";
      for (let i = 0; i < n; i++) {
        const a = cur.a[i];
        if (a < 0.02) continue;
        const color = a >= 0.99 ? inkOf(model.inks[i], stage) : mixInk(inkOf(model.inks[i], stage), PAPER, a);
        if (color !== last) {
          g.fillStyle = color;
          last = color;
        }
        const r = cellRect(cur.x[i], cur.y[i], cur.pitch, dpr);
        g.fillRect(r.x, r.y, r.w, r.h);
      }
      if (layout.targets.length > 0) {
        g.fillStyle = mixInk(FIELD_INK.target, PAPER, e);
        for (const t of layout.targets) {
          g.beginPath();
          g.arc(t.x, t.y, t.r, 0, Math.PI * 2);
          g.fill();
        }
      }
    };

    if (reduce || from === to) {
      shown.current = to;
      draw(to, 1);
      setMoving(false);
      return;
    }
    setMoving(true);
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / MOVE_MS);
      const e = ease(t);
      const cur: Shown = {
        x: new Float32Array(n),
        y: new Float32Array(n),
        a: new Float32Array(n),
        pitch: from.pitch + (to.pitch - from.pitch) * e,
      };
      for (let i = 0; i < n; i++) {
        cur.x[i] = from.x[i] + (to.x[i] - from.x[i]) * e;
        cur.y[i] = from.y[i] + (to.y[i] - from.y[i]) * e;
        cur.a[i] = from.a[i] + (to.a[i] - from.a[i]) * e;
      }
      shown.current = cur;
      draw(cur, e);
      if (t < 1) raf = requestAnimationFrame(frame);
      else setMoving(false);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [layout, paths, model, stage, box.w, box.h]);

  const pointAt = (px: number, py: number): FieldPoint | null => {
    const s = shown.current;
    if (!s) return null;
    for (const t of layout.targets) {
      if (Math.hypot(t.x - px, t.y - py) <= Math.max(t.r + 1.5, layout.pitch * 0.55)) return { kind: "target", id: t.id, row: t.row };
    }
    const half = s.pitch / 2;
    for (let i = s.x.length - 1; i >= 0; i--) {
      if (s.a[i] < 0.5) continue;
      if (Math.abs(s.x[i] - px) <= half && Math.abs(s.y[i] - py) <= half) {
        return { kind: "square", index: i, ink: model.inks[i], year: model.years[i], slice: layout.squares[i].slice };
      }
    }
    const g = canvas.current?.getContext?.("2d");
    if (paths && g) {
      const dpr = window.devicePixelRatio || 1;
      for (const p of paths) if (g.isPointInPath(p.path, px * dpr, py * dpr, "evenodd")) return { kind: "place", code: p.code };
    }
    return null;
  };

  const local = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (moving) return;
    const { x, y } = local(e);
    const point = pointAt(x, y);
    setHover(point ? { point, x, y } : null);
  };
  const tipContent = hover ? tip(hover.point) : null;
  const lit = (l: FieldLabel) =>
    selected !== null && (l.values.id === selected || l.values.code === selected) ? "" : undefined;

  return (
    <div
      ref={wrap}
      className="ct-field"
      role="img"
      aria-label={ariaLabel}
      data-clickable={hover ? "" : undefined}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        const { x, y } = local(e as unknown as PointerEvent<HTMLElement>);
        const point = pointAt(x, y);
        if (point) onSelect(point);
      }}
    >
      <canvas ref={canvas} aria-hidden="true" />
      <div className="ct-labels" data-moving={moving || undefined}>
        {layout.labels.map((l) => {
          const content = label(l);
          if (content === null) return null;
          const style = { left: `${l.x}px`, top: `${l.y}px` };
          if (l.kind === "rowName" || l.kind === "place") {
            const point: FieldPoint =
              l.kind === "rowName" ? { kind: "row", id: String(l.values.id) } : { kind: "place", code: String(l.values.code) };
            return (
              <button
                key={l.key}
                type="button"
                className="ct-label ct-label-button"
                data-kind={l.kind}
                data-align={l.align}
                data-lit={lit(l)}
                style={style}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(point);
                }}
              >
                {content}
              </button>
            );
          }
          return (
            <span key={l.key} className="ct-label" data-kind={l.kind} data-align={l.align} data-thin={l.values.thin ? "" : undefined} style={style}>
              {content}
            </span>
          );
        })}
      </div>
      {hover && tipContent && (
        <div
          className="ct-tip"
          role="status"
          style={{
            left: `${Math.min(hover.x + 14, box.w - 260)}px`,
            top: `${hover.y + 14 > box.h - 90 ? hover.y - 90 : hover.y + 14}px`,
          }}
        >
          {tipContent}
        </div>
      )}
    </div>
  );
}
