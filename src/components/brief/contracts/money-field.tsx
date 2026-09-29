"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  layoutField,
  type FieldLabel,
  type FieldLayout,
  type FieldModel,
  type Ink,
  type LayoutContext,
  type Mark,
  type MarkInk,
  type Stage,
} from "@/lib/brief/contracts/field";
import type { ContractsFile } from "@/lib/brief/contracts/model";
import type { Slice } from "@/lib/brief/contracts/units";
import { cellRect, mixInk } from "../hub/hub-canvas";

/** The field's inks. Money is UNDP blue (the UNDP data viz library's main
 *  graph colour): deep where it is mainly for nature or climate, light where
 *  it is a side benefit, pale for the rest, ink for the whole record. Green
 *  and red keep the brief's meaning: strongly matching, potentially
 *  misaligned. Target dots and outlines stay in the neutral inks. */
export const FIELD_INK = {
  record: "#232e3d",
  principal: "#0468b1",
  significant: "#b5d5f5",
  rest: "#e4e6e9",
  outline: "#cfd3d8",
  target: "#6b7684",
  targetNone: "#d5d9df",
  match: "#2a7443",
  mis: "#d2432c",
  leader: "#c9ced6",
  anchor: "#55606e",
} as const;

/** How long the squares take to move between steps, in milliseconds. */
const MOVE_MS = 950;
const PAPER = "#ffffff";
/** A field without a measured size (tests, first paint). */
const FALLBACK = { w: 640, h: 480 };

/** What the pointer is on. */
export type FieldPoint =
  | { kind: "square"; index: number; ink: Ink; year: number; slice: Slice | null }
  | { kind: "mark"; cell: string; ink: MarkInk }
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

/** The whole record is drawn in ink; every other step in the money's inks. */
function inkOf(ink: Ink, stage: Stage): string {
  if (stage.kind === "record" || (stage.kind === "places" && stage.layer === "all")) return FIELD_INK.record;
  return FIELD_INK[ink];
}

const markInk = (m: Mark) => (m.ink === "principal" ? FIELD_INK.principal : FIELD_INK[m.ink]);

/** The place or row a point names, for marking its label. */
const pointId = (p: FieldPoint | null) =>
  p === null ? null : p.kind === "place" ? p.code : p.kind === "row" ? p.id : p.kind === "mark" ? p.cell : null;

/**
 * The overview's field: the record as squares of equal money that move from
 * one layout to the next as the steps change, and an overlay (a focus's finer
 * squares, or the tenders' dots) that crossfades in while the squares step
 * aside. Pointing names what is under the pointer and marks its label;
 * pointing never re-lays the field. Selecting opens a contract or a target,
 * or puts a place or a policy area in focus.
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
  onPoint,
  selected,
  pointed = null,
}: {
  model: FieldModel;
  file: ContractsFile;
  stage: Stage;
  ctx: LayoutContext;
  ariaLabel: string;
  label: (l: FieldLabel) => ReactNode;
  tip: (p: FieldPoint) => ReactNode | null;
  onSelect: (p: FieldPoint) => void;
  /** What the pointer is on, for the page to mark its line in a list. */
  onPoint?: (p: FieldPoint | null) => void;
  /** The place or area in focus: its name is marked and its outline inked. */
  selected: string | null;
  /** A place or area pointed at from elsewhere (a list row). */
  pointed?: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const shown = useRef<Shown | null>(null);
  const shownOverlay = useRef<FieldLayout["overlay"]>(null);
  const labels = useRef<HTMLDivElement>(null);
  const moving = useRef(false);
  const lastStage = useRef<Stage | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // What the pointer is on, for the layout it was found in (a new layout
  // leaves it behind without a state reset).
  const [hover, setHover] = useState<{ point: FieldPoint; x: number; y: number; layout: unknown } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      const next = w > 0 && h > 0 ? { w, h } : FALLBACK;
      setSize((cur) => (cur && cur.w === next.w && cur.h === next.h ? cur : next));
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

  const current = hover && hover.layout === layout ? hover : null;
  const litId = pointId(current?.point ?? null) ?? pointed;
  const outlined = useMemo(() => [...new Set([litId, selected].filter((x): x is string => x !== null))], [litId, selected]);

  const measured = size !== null;
  useEffect(() => {
    // Nothing is drawn before the field knows its size, so the first picture
    // appears in place instead of gliding from a guess.
    if (!measured) return;
    const el = canvas.current;
    const g = el?.getContext?.("2d") ?? null;
    const n = layout.squares.length;
    const to: Shown = {
      x: Float32Array.from(layout.squares, (s) => s.x),
      y: Float32Array.from(layout.squares, (s) => s.y),
      a: Float32Array.from(layout.squares, (s) => (s.visible ? 1 : 0)),
      pitch: layout.pitch,
    };
    // Squares move between steps (and between a step's layers or foci); a new
    // size or a new pointer only redraws them in place.
    const stepped = lastStage.current !== null && lastStage.current !== stage;
    lastStage.current = stage;
    const from = stepped && shown.current && shown.current.x.length === n ? shown.current : to;
    const fromOverlay = stepped ? shownOverlay.current : layout.overlay;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const inkFor = (i: number) => inkOf(layout.squares[i]?.ink ?? model.inks[i], stage);

    const drawOverlay = (o: FieldLayout["overlay"], alpha: number) => {
      if (!g || !o || alpha < 0.02) return;
      for (const m of o.marks) {
        const color = alpha >= 0.99 ? markInk(m) : mixInk(markInk(m), PAPER, alpha);
        g.fillStyle = color;
        if (m.shape === "dot") {
          g.beginPath();
          g.arc(m.x, m.y, Math.max(1, o.pitch * 0.38), 0, Math.PI * 2);
          g.fill();
        } else {
          const r = cellRect(m.x, m.y, o.pitch, dpr);
          g.fillRect(r.x, r.y, r.w, r.h);
        }
      }
    };

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
        g.strokeStyle = FIELD_INK.record;
        g.lineWidth = 1.6;
        for (const p of paths) if (outlined.includes(p.code)) g.stroke(p.path);
        g.lineWidth = 1;
        g.strokeStyle = FIELD_INK.leader;
        for (const l of layout.leaders) {
          g.beginPath();
          g.moveTo(l.x1, l.y1);
          g.lineTo(l.x2, l.y2);
          g.stroke();
          g.fillStyle = FIELD_INK.anchor;
          g.beginPath();
          g.arc(l.x1, l.y1, 1.6, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      }
      let last = "";
      for (let i = 0; i < n; i++) {
        const a = cur.a[i];
        if (a < 0.02) continue;
        const color = a >= 0.99 ? inkFor(i) : mixInk(inkFor(i), PAPER, a);
        if (color !== last) {
          g.fillStyle = color;
          last = color;
        }
        const r = cellRect(cur.x[i], cur.y[i], cur.pitch, dpr);
        g.fillRect(r.x, r.y, r.w, r.h);
      }
      if (fromOverlay !== layout.overlay) drawOverlay(fromOverlay, 1 - e);
      drawOverlay(layout.overlay, e);
      if (layout.targets.length > 0) {
        for (const t of layout.targets) {
          g.fillStyle = mixInk(FIELD_INK[t.ink], PAPER, e);
          g.beginPath();
          g.arc(t.x, t.y, t.r, 0, Math.PI * 2);
          g.fill();
        }
      }
    };

    // Names hide while the squares move, and come back once they settle.
    const settle = (on: boolean) => {
      moving.current = on;
      if (labels.current) labels.current.toggleAttribute("data-moving", on);
    };
    if (reduce || (from === to && fromOverlay === layout.overlay)) {
      shown.current = to;
      shownOverlay.current = layout.overlay;
      draw(to, 1);
      settle(false);
      return;
    }
    settle(true);
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
      else {
        shownOverlay.current = layout.overlay;
        settle(false);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [measured, layout, paths, model, stage, box.w, box.h, outlined]);

  const pointAt = (px: number, py: number): FieldPoint | null => {
    const s = shown.current;
    for (const t of layout.targets) {
      if (Math.hypot(t.x - px, t.y - py) <= Math.max(t.r + 1.5, 3)) return { kind: "target", id: t.id, row: t.row };
    }
    if (layout.overlay) {
      const half = layout.overlay.pitch / 2 + 0.5;
      for (const m of layout.overlay.marks) {
        if (Math.abs(m.x - px) <= half && Math.abs(m.y - py) <= half) {
          return layout.map ? { kind: "place", code: m.cell } : { kind: "mark", cell: m.cell, ink: m.ink };
        }
      }
    }
    if (s) {
      const half = s.pitch / 2;
      for (let i = s.x.length - 1; i >= 0; i--) {
        if (s.a[i] < 0.5) continue;
        if (Math.abs(s.x[i] - px) <= half && Math.abs(s.y[i] - py) <= half) {
          return { kind: "square", index: i, ink: model.inks[i], year: model.years[i], slice: layout.squares[i].slice };
        }
      }
    }
    for (const b of layout.blocks) {
      if (b.n > 0 && px >= b.x - 1 && px <= b.x + b.w + 1 && py >= b.y - 1 && py <= b.y + b.h + 1) return { kind: "place", code: b.code };
    }
    const g = canvas.current?.getContext?.("2d");
    if (paths && g) {
      const dpr = window.devicePixelRatio || 1;
      for (const p of paths) if (g.isPointInPath(p.path, px * dpr, py * dpr, "evenodd")) return { kind: "place", code: p.code };
    }
    for (const b of layout.bands) if (py >= b.y && py <= b.y + b.h) return { kind: "row", id: b.id };
    return null;
  };

  const local = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const point = (next: FieldPoint | null, x = 0, y = 0) => {
    const before = pointId(hover?.layout === layout ? (hover?.point ?? null) : null);
    setHover(next ? { point: next, x, y, layout } : null);
    if (pointId(next) !== before) onPoint?.(next);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (moving.current) return;
    const { x, y } = local(e);
    point(pointAt(x, y), x, y);
  };
  const tipContent = current ? tip(current.point) : null;
  const lit = (l: FieldLabel) => {
    const id = l.values.id ?? l.values.code;
    return id !== undefined && (id === selected || id === litId) ? "" : undefined;
  };

  return (
    <div
      ref={wrap}
      className="ct-field"
      data-clickable={current ? "" : undefined}
      onPointerMove={onMove}
      onPointerLeave={() => point(null)}
      onClick={(e) => {
        const { x, y } = local(e as unknown as PointerEvent<HTMLElement>);
        const p = pointAt(x, y);
        if (p) onSelect(p);
      }}
    >
      <canvas ref={canvas} role="img" aria-label={ariaLabel} />
      <div ref={labels} className="ct-labels" role="group" aria-label={ariaLabel}>
        {layout.labels.map((l) => {
          const content = label(l);
          if (content === null) return null;
          const style = { left: `${l.x}px`, top: `${l.y}px` };
          if (l.kind === "rowName" || l.kind === "place" || l.kind === "band") {
            const target: FieldPoint =
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
                  onSelect(target);
                }}
                onPointerEnter={() => onPoint?.(target)}
                onPointerLeave={() => onPoint?.(null)}
              >
                {content}
              </button>
            );
          }
          return (
            <span
              key={l.key}
              className="ct-label"
              data-kind={l.kind}
              data-align={l.align}
              data-thin={l.values.thin ? "" : undefined}
              style={style}
            >
              {content}
            </span>
          );
        })}
      </div>
      {current && tipContent && (
        <div
          className="ct-tip"
          style={{
            left: `${Math.min(current.x + 14, box.w - 260)}px`,
            top: `${current.y + 14 > box.h - 90 ? current.y - 90 : current.y + 14}px`,
          }}
        >
          {tipContent}
        </div>
      )}
    </div>
  );
}
