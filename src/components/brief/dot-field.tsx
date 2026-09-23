"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import type { Tone, ToneCounts } from "@/lib/brief/compute";
import { DOT_ORDER, layoutDots, type DotLayout } from "@/lib/brief/dot-layout";
import { INK, useNumbers } from "./ink";

/** Most dots drawn; above this one dot stands for several comparisons. */
export const MAX_DOTS = 16000;

const DOT_COLORS: Record<Tone, string> = {
  reinforce: INK.reinforce,
  partial: "#a9b3a4",
  apart: INK.apart,
  none: "#cfcfc9",
};

/** Small deterministic PRNG so the settling animation is the same every time. */
function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(
  canvas: HTMLCanvasElement,
  layout: DotLayout,
  w: number,
  h: number,
  progress: number,
  from: Float32Array | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.max(2, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const e = 1 - Math.pow(1 - progress, 3);
  const r = layout.radius;
  for (let t = 0; t < DOT_ORDER.length; t++) {
    ctx.fillStyle = DOT_COLORS[DOT_ORDER[t]];
    ctx.beginPath();
    for (let i = 0; i < layout.tones.length; i++) {
      if (layout.tones[i] !== t) continue;
      let x = layout.xs[i];
      let y = layout.ys[i];
      if (from && e < 1) {
        x = from[2 * i] + (x - from[2 * i]) * e;
        y = from[2 * i + 1] + (y - from[2 * i + 1]) * e;
      }
      const rr = layout.small[i] === 1 ? r * 0.45 : r;
      if (rr >= 1.1) {
        ctx.moveTo(x + rr, y);
        ctx.arc(x, y, rr, 0, Math.PI * 2);
      } else {
        ctx.rect(x - rr, y - rr, 2 * rr, 2 * rr);
      }
    }
    ctx.fill();
  }
}

/**
 * The overall picture as a halftone print: every comparison one ink dot,
 * grouped by how it reads. The dots settle into their groups the first time
 * the field is seen (not under reduced motion, never in print).
 */
export function DotField({ counts }: { counts: ToneCounts }) {
  const t = useTranslations("brief");
  const { n, pct } = useNumbers();
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settled = useRef(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ tone: Tone; x: number } | null>(null);
  const unit = Math.max(1, Math.ceil(counts.total / MAX_DOTS));
  const layout = useMemo(
    () => layoutDots(counts, unit, size.w, size.h),
    [counts, unit, size.w, size.h],
  );

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || layout.tones.length === 0) return;
    const finish = () => {
      paint(canvas, layout, size.w, size.h, 1, null);
      settled.current = true;
    };
    // The print layout can differ from the screen (a narrow window reflows the
    // sheets): repaint the settled field at the size it has on paper.
    const onPrint = () => {
      const field = fieldRef.current;
      const w = field?.clientWidth ?? 0;
      const h = field?.clientHeight ?? 0;
      settled.current = true;
      if (w > 0 && h > 0 && (w !== size.w || h !== size.h)) {
        paint(canvas, layoutDots(counts, unit, w, h), w, h, 1, null);
      } else {
        paint(canvas, layout, size.w, size.h, 1, null);
      }
    };
    const printQuery = window.matchMedia?.("print");
    const onPrintChange = (e: MediaQueryListEvent) => {
      if (e.matches) onPrint();
    };
    printQuery?.addEventListener?.("change", onPrintChange);
    window.addEventListener("beforeprint", onPrint);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const detach = () => {
      printQuery?.removeEventListener?.("change", onPrintChange);
      window.removeEventListener("beforeprint", onPrint);
    };
    if (settled.current || reduce || typeof IntersectionObserver === "undefined") {
      finish();
      return detach;
    }
    const rand = seeded(layout.tones.length * 7919 + 17);
    const from = new Float32Array(layout.tones.length * 2);
    for (let i = 0; i < layout.tones.length; i++) {
      from[2 * i] = rand() * size.w;
      from[2 * i + 1] = rand() * size.h;
    }
    paint(canvas, layout, size.w, size.h, 0, from);
    let frame = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / 1400);
      paint(canvas, layout, size.w, size.h, p, from);
      if (p < 1) frame = requestAnimationFrame(step);
      else settled.current = true;
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          frame = requestAnimationFrame(step);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(canvas);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      detach();
    };
  }, [layout, size, counts, unit]);

  const labelOf = (tone: Tone) => t(`tone.${tone}`);
  const shareOf = (tone: Tone) => (counts.total > 0 ? counts[tone] / counts.total : 0);

  const tonesShown = DOT_ORDER.filter((tone) => counts[tone] > 0);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const gap = layout.pitch * 2;
    const g = layout.groups.find((grp) => x >= grp.x0 - gap / 2 && x <= grp.x1 + gap / 2);
    setHover(g ? { tone: g.tone, x: Math.min(Math.max(x, 90), size.w - 90) } : null);
  };

  return (
    <div className="brief-dots">
      <div
        ref={fieldRef}
        className="brief-dots-field"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        {hover && (
          <div className="brief-tip" style={{ left: hover.x }} role="presentation">
            <strong>{n(counts[hover.tone])}</strong> {labelOf(hover.tone)} ({pct(shareOf(hover.tone))})
          </div>
        )}
      </div>
      <ul className="brief-dots-legend" aria-hidden="true">
        {tonesShown.map((tone) => (
          <li key={tone}>
            <span className="brief-dots-key" style={{ background: DOT_COLORS[tone] }} />
            <span className="brief-dots-pct">{pct(shareOf(tone))}</span>
            <span className="brief-dots-tone">{labelOf(tone)}</span>
          </li>
        ))}
      </ul>
      <ul className="sr-only">
        {tonesShown.map((tone) => (
          <li key={tone}>
            {t("overall.group", { count: counts[tone], pct: pct(shareOf(tone)), tone: labelOf(tone) })}
          </li>
        ))}
      </ul>
    </div>
  );
}
