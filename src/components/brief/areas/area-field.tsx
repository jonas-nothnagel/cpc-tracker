"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { layoutAreaField, targetAt, type AreaFieldLayout, type AreaFieldRow } from "@/lib/brief/area-layout";
import type { AreaSide, TargetInk } from "@/lib/brief/areas";

/** The picture's inks: targets in ink or set back, a picked target's partners in the side's ink. */
const FIELD_INK = {
  base: "#55606e",
  pale: "#dcdfdb",
  apart: "#d2432c",
  reinforce: "#2a7443",
  ring: "#232e3d",
} as const;

/** How long a change of shape takes. */
const MOVE_MS = 850;

interface Pose {
  x: number;
  y: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The policy-area picture: one row per area, a square per target under its
 * name. The rows come in drawing order; the inks say what the reader has
 * chosen, and a new order moves the same dots. Pointing at a target gives its tip; selecting it
 * hands it to `onPick`. The canvas is hidden from assistive technology; the
 * rows' names and counts are read as a list, each name (from `rowLabel`) a
 * way to its area, and the list beside the picture carries every other way
 * in by keyboard.
 */
export function AreaField({
  rows,
  inks,
  side,
  rowLabel,
  listLabel,
  marked,
  dimmed,
  pointed,
  tipFor,
  onPick,
}: {
  rows: AreaFieldRow[];
  inks: Map<string, TargetInk>;
  side: AreaSide;
  rowLabel: (id: string) => ReactNode;
  /** The name the rows are read under. */
  listLabel: string;
  /** Rows whose names are in pale yellow: pointed at, or what the picture shows. */
  marked: ReadonlySet<string>;
  /** Rows set back while an area or a pair of areas is picked. */
  dimmed: ReadonlySet<string>;
  /** A target pointed at beside the picture: ringed. */
  pointed: string | null;
  tipFor: (id: string) => ReactNode;
  onPick: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poses = useRef(new Map<string, Pose>());
  // The target pointed at beside the picture, read by every frame: pointing
  // repaints a settled picture and never restarts a move.
  const pointedRef = useRef(pointed);
  const moving = useRef(false);
  const settle = useRef<(() => void) | null>(null);
  const [width, setWidth] = useState(0);
  const [dpr, setDpr] = useState(() => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth((prev) => (prev === el.clientWidth ? prev : el.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The screen's pixel density, followed when the window moves to another screen.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    let query: MediaQueryList | null = null;
    const follow = () => {
      const ratio = window.devicePixelRatio || 1;
      setDpr(ratio);
      query?.removeEventListener("change", follow);
      query = window.matchMedia(`(resolution: ${ratio}dppx)`);
      query.addEventListener("change", follow);
    };
    follow();
    return () => query?.removeEventListener("change", follow);
  }, []);

  const layout = useMemo(() => layoutAreaField(rows, width), [rows, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || width === 0) return;
    canvas.width = Math.round(layout.width * dpr);
    canvas.height = Math.round(layout.height * dpr);
    const ctx = canvas.getContext("2d");
    const from = new Map(poses.current);
    const to = new Map<string, Pose>();
    for (const [id, at] of layout.at) to.set(id, { x: at.x, y: at.y });
    const sideInk = side === "apart" ? FIELD_INK.apart : FIELD_INK.reinforce;
    // Squares on the pixel grid: a pale one as sharp as a full one.
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const size = Math.max(1, snap(layout.targetR * 2));
    // Tips and cut counts wait while the dots travel.
    const setMoving = (on: boolean) => {
      moving.current = on;
      if (on) wrap.dataset.moving = "true";
      else delete wrap.dataset.moving;
    };

    const paint = (k: number) => {
      const now = new Map<string, Pose>();
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, layout.width, layout.height);
      }
      for (const [id, end] of to) {
        const start = from.get(id) ?? end;
        const pose = { x: start.x + (end.x - start.x) * k, y: start.y + (end.y - start.y) * k };
        now.set(id, pose);
        if (!ctx) continue;
        const ink = inks.get(id) ?? "base";
        ctx.fillStyle = ink === "pale" ? FIELD_INK.pale : ink === "lit" ? sideInk : FIELD_INK.base;
        const x0 = snap(pose.x - size / 2);
        const y0 = snap(pose.y - size / 2);
        ctx.fillRect(x0, y0, size, size);
        if (ink === "focus" || id === pointedRef.current) {
          ctx.strokeStyle = FIELD_INK.ring;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x0 - 2.5, y0 - 2.5, size + 5, size + 5);
        }
      }
      poses.current = now;
    };
    settle.current = () => paint(1);

    const moves = [...to].some(([id, end]) => {
      const start = from.get(id);
      return !start || Math.abs(start.x - end.x) > 0.5 || Math.abs(start.y - end.y) > 0.5;
    });
    const still =
      from.size === 0 ||
      !moves ||
      typeof requestAnimationFrame === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      setMoving(false);
      paint(1);
      return;
    }
    setMoving(true);
    let frame = 0;
    const begin = performance.now();
    const tick = (time: number) => {
      // A first frame may be stamped before the move began.
      const k = Math.min(1, Math.max(0, (time - begin) / MOVE_MS));
      paint(ease(k));
      if (k < 1) frame = requestAnimationFrame(tick);
      else setMoving(false);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      setMoving(false);
    };
  }, [layout, inks, side, width, dpr]);

  useEffect(() => {
    pointedRef.current = pointed;
    if (!moving.current) settle.current?.();
  }, [pointed]);

  // Where the dots are now: mid-move, a selection goes to the dot under the pointer.
  const live = (): AreaFieldLayout => {
    if (!moving.current) return layout;
    const at = new Map<string, { x: number; y: number }>();
    for (const [id, p] of poses.current) at.set(id, { x: p.x, y: p.y });
    return { ...layout, at };
  };
  const hit = (e: { clientX: number; clientY: number; currentTarget: HTMLDivElement }) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    return { id: targetAt(live(), x, y), x, y };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (moving.current) {
      if (tip) setTip(null);
      return;
    }
    const { id, x, y } = hit(e);
    setTip(id ? { id, x: Math.min(Math.max(x, 140), Math.max(140, layout.width - 140)), y } : null);
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const { id } = hit(e);
    setTip(null);
    if (id) onPick(id);
  };

  const measured = width > 0;

  return (
    <div
      ref={wrapRef}
      className="brief-av-field"
      data-clickable={tip ? "true" : undefined}
      style={{ height: measured ? layout.height : undefined }}
      onPointerMove={onMove}
      onPointerLeave={() => setTip(null)}
      onClick={onClick}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ width: measured ? layout.width : 0, height: measured ? layout.height : 0 }}
      />
      {measured && (
        <>
          <div className="brief-av-labels" role="list" aria-label={listLabel}>
            {layout.rows.map((row) => (
              <div
                key={row.id}
                role="listitem"
                className="brief-av-row"
                data-row={row.id}
                data-marked={marked.has(row.id) ? "true" : undefined}
                data-dim={dimmed.has(row.id) ? "true" : undefined}
                style={{ transform: `translateY(${row.y}px)` }}
              >
                {rowLabel(row.id)}
              </div>
            ))}
          </div>
        </>
      )}
      {tip && (
        <div className="brief-tip brief-av-tip" role="presentation" style={{ left: tip.x, top: Math.max(4, tip.y - 64) }}>
          {tipFor(tip.id)}
        </div>
      )}
    </div>
  );
}
