"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import {
  cloudDots,
  cutBreak,
  cutMarks,
  layoutAreaField,
  targetAt,
  type AreaFieldLayout,
  type AreaFieldRow,
} from "@/lib/brief/area-layout";
import type { AreaSide, TargetInk } from "@/lib/brief/areas";

/** The picture's inks: targets in ink or set back, clouds in the side's ink. */
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
  s: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The policy-area picture: one row per area, a dot per target on the row's
 * line and its point cloud above it. The rows come in drawing order; the
 * clouds and inks say what the reader has chosen, and every change of shape
 * moves the same dots. Pointing at a target gives its tip; selecting it
 * hands it to `onPick`. The canvas is hidden from assistive technology; the
 * rows' names and counts are read as a list, and the list beside the
 * picture carries every way in by keyboard.
 */
export function AreaField({
  rows,
  restClouds,
  clouds,
  inks,
  side,
  rowLabel,
  listLabel,
  marked,
  dimmed,
  pointed,
  tipFor,
  formatCount,
  onPick,
}: {
  rows: AreaFieldRow[];
  /** Each target's cloud at rest: the rows' heights. */
  restClouds: Map<string, number>;
  /** Each target's cloud now. */
  clouds: Map<string, number>;
  inks: Map<string, TargetInk>;
  side: AreaSide;
  rowLabel: (id: string) => ReactNode;
  /** The name the rows are read under. */
  listLabel: string;
  /** Rows whose names the reader points at, in pale yellow. */
  marked: ReadonlySet<string>;
  /** Rows set back while a pair of areas is open. */
  dimmed: ReadonlySet<string>;
  /** A target pointed at beside the picture: ringed. */
  pointed: string | null;
  tipFor: (id: string) => ReactNode;
  formatCount: (n: number) => string;
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

  const layout = useMemo(() => layoutAreaField(rows, restClouds, width), [rows, restClouds, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || width === 0) return;
    canvas.width = Math.round(layout.width * dpr);
    canvas.height = Math.round(layout.height * dpr);
    const ctx = canvas.getContext("2d");
    const from = new Map(poses.current);
    const to = new Map<string, Pose>();
    for (const [id, at] of layout.at) to.set(id, { x: at.x, y: at.y, s: clouds.get(id) ?? 0 });
    const cloudInk = side === "apart" ? FIELD_INK.apart : FIELD_INK.reinforce;
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
        const start = from.get(id) ?? { x: end.x, y: end.y, s: 0 };
        const pose = {
          x: start.x + (end.x - start.x) * k,
          y: start.y + (end.y - start.y) * k,
          s: start.s + (end.s - start.s) * k,
        };
        now.set(id, pose);
        if (!ctx) continue;
        const { dots, cut } = cloudDots(Math.round(pose.s), layout.per);
        ctx.fillStyle = cloudInk;
        for (let d = 0; d < dots; d++) {
          const col = d % layout.per;
          const line = Math.floor(d / layout.per);
          // Every other dot small: potential misalignment reads without its colour.
          const r = side === "apart" && (col + line) % 2 === 1 ? layout.cloudR * 0.6 : layout.cloudR;
          ctx.beginPath();
          ctx.arc(pose.x + (col - (layout.per - 1) / 2) * layout.sp, pose.y - layout.lift - line * layout.sp, r, 0, Math.PI * 2);
          ctx.fill();
        }
        if (cut) {
          // The break over a cloud stopped at its limit.
          ctx.fillRect(pose.x - (layout.per * layout.sp) / 2, cutBreak(layout, pose.y), layout.per * layout.sp, 1.5);
        }
        const ink = inks.get(id) ?? "base";
        ctx.fillStyle = ink === "pale" ? FIELD_INK.pale : ink === "lit" ? cloudInk : FIELD_INK.base;
        ctx.beginPath();
        ctx.arc(pose.x, pose.y, layout.targetR, 0, Math.PI * 2);
        ctx.fill();
        if (ink === "focus" || id === pointedRef.current) {
          ctx.strokeStyle = FIELD_INK.ring;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pose.x, pose.y, layout.targetR + 2.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      poses.current = now;
    };
    settle.current = () => paint(1);

    const moves = [...to].some(([id, end]) => {
      const start = from.get(id);
      return !start || Math.abs(start.x - end.x) > 0.5 || Math.abs(start.y - end.y) > 0.5 || Math.abs(start.s - end.s) > 0.01;
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
  }, [layout, clouds, inks, side, width, dpr]);

  useEffect(() => {
    pointedRef.current = pointed;
    if (!moving.current) settle.current?.();
  }, [pointed]);

  // Where the dots are now: mid-move, a selection goes to the dot under the pointer.
  const live = (): { place: AreaFieldLayout; clouds: Map<string, number> } => {
    if (!moving.current) return { place: layout, clouds };
    const at = new Map<string, { x: number; y: number }>();
    const now = new Map<string, number>();
    for (const [id, p] of poses.current) {
      at.set(id, { x: p.x, y: p.y });
      now.set(id, Math.round(p.s));
    }
    return { place: { ...layout, at }, clouds: now };
  };
  const hit = (e: { clientX: number; clientY: number; currentTarget: HTMLDivElement }) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const { place, clouds: now } = live();
    return { id: targetAt(place, now, x, y), x, y };
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

  const cuts = cutMarks(layout, clouds);
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
          <div className="brief-av-labels" aria-hidden="true">
            {cuts.map((cut) => (
              <div key={cut.id} className="brief-av-cut" data-cut={cut.id} style={{ left: cut.x, top: cut.top }}>
                {formatCount(clouds.get(cut.id) ?? 0)}
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
