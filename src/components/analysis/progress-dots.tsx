"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { INK } from "@/components/brief/ink";
import { MAX_DOTS } from "@/components/brief/dot-field";
import { layoutGroups } from "@/lib/brief/dot-layout";

/** Each dot's ink: the pairs compared so far in the brief's muted ink, the
 *  rest pale. One dot per `unit` pairs. */
export function progressColors(done: number, total: number, unit: number): string[] {
  const dots = Math.ceil(total / unit);
  const inked = Math.min(dots, Math.floor(done / unit));
  return Array.from({ length: dots }, (_, i) => (i < inked ? INK.muted : INK.none));
}

/**
 * One dot per target pair, laid out as the brief lays out its overall
 * picture (src/lib/brief/dot-layout.ts), filling column by column as pairs
 * are compared. Repainted on every look, without motion.
 */
export function ProgressDots({ done, total, label }: { done: number; total: number; label: string }) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const unit = Math.max(1, Math.ceil(total / MAX_DOTS));
  const layout = useMemo(() => layoutGroups([{ count: total }], unit, size.w, size.h), [total, unit, size.w, size.h]);

  useEffect(() => {
    const el = fieldRef.current;
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.("2d");
    if (!canvas || !ctx || size.w === 0 || layout.xs.length === 0) return;
    const dpr = Math.max(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const colors = progressColors(done, total, unit);
    const r = layout.radius;
    for (const color of [INK.none, INK.muted]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < layout.xs.length; i++) {
        if (colors[i] !== color) continue;
        if (r >= 1.1) {
          ctx.moveTo(layout.xs[i] + r, layout.ys[i]);
          ctx.arc(layout.xs[i], layout.ys[i], r, 0, Math.PI * 2);
        } else {
          ctx.rect(layout.xs[i] - r, layout.ys[i] - r, 2 * r, 2 * r);
        }
      }
      ctx.fill();
    }
  }, [done, total, unit, layout, size]);

  return (
    <div ref={fieldRef} className="up-dots" role="img" aria-label={label}>
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
