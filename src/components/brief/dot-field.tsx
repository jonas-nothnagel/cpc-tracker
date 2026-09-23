"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import type { Tone, ToneCounts } from "@/lib/brief/compute";
import { DOT_ORDER, layoutGroups, type GroupLayout } from "@/lib/brief/dot-layout";
import { INK, useNumbers } from "./ink";

/** Most dots drawn; above this one dot stands for several target pairs. */
export const MAX_DOTS = 16000;

export const DOT_COLORS: Record<Tone, string> = {
  reinforce: INK.reinforce,
  partial: "#a9b3a4",
  apart: INK.apart,
  none: "#cfcfc9",
};

/** One group of dots on a canvas. */
export interface CanvasGroup {
  key: string;
  count: number;
  color: string;
  /** Draw every other dot small (the checker texture for potential misalignment). */
  texture?: boolean;
  /** Short label set above the group, e.g. a theme's number. */
  label?: string;
  /** What the pointer shows over the group. */
  tip: ReactNode;
  /** The group can be selected with the pointer. */
  selectable?: boolean;
}

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
  layout: GroupLayout,
  colors: string[],
  w: number,
  h: number,
  progress: number,
  from: Float32Array | null,
  dimExcept: number | null,
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
  for (const g of layout.groups) {
    ctx.globalAlpha = dimExcept !== null && g.index !== dimExcept ? 0.25 : 1;
    ctx.fillStyle = colors[g.index] ?? INK.muted;
    ctx.beginPath();
    for (let i = 0; i < layout.group.length; i++) {
      if (layout.group[i] !== g.index) continue;
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
  ctx.globalAlpha = 1;
}

/**
 * A halftone field of target pairs, one ink dot each (or one per `unit`),
 * in groups side by side. The dots settle into their groups the first time
 * the field is seen and again whenever `replay` changes; `still` draws them
 * settled at once (the printed brief), and so does reduced motion.
 */
export function DotCanvas({
  groups,
  unit,
  still = false,
  replay = 0,
  hovered = null,
  onHover,
  onSelect,
  labelled = false,
  className = "",
}: {
  groups: CanvasGroup[];
  unit: number;
  still?: boolean;
  replay?: number;
  /** Key of a group to bring forward (the others are dimmed). */
  hovered?: string | null;
  onHover?: (key: string | null) => void;
  onSelect?: (key: string) => void;
  labelled?: boolean;
  className?: string;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settled = useRef(false);
  const lastReplay = useRef(replay);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tip, setTip] = useState<{ index: number; x: number } | null>(null);
  const shape = groups.map((g) => `${g.count}:${g.texture ? 1 : 0}`).join(",");
  const layout = useMemo(
    () =>
      layoutGroups(
        shape
          ? shape.split(",").map((s) => {
              const [count, texture] = s.split(":");
              return { count: Number(count), texture: texture === "1" };
            })
          : [],
        unit,
        size.w,
        size.h,
      ),
    [shape, unit, size.w, size.h],
  );
  const colors = groups.map((g) => g.color).join(",");
  const hoveredIndex = hovered === null ? -1 : groups.findIndex((g) => g.key === hovered);
  const dimExcept = hoveredIndex >= 0 ? hoveredIndex : null;
  // Hover dims the other groups of a settled field; it never restarts a build.
  const dimRef = useRef<number | null>(null);

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const measure = () =>
      setSize((prev) =>
        prev.w === el.clientWidth && prev.h === el.clientHeight
          ? prev
          : { w: el.clientWidth, h: el.clientHeight },
      );
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || layout.group.length === 0) return;
    const palette = colors.split(",");
    if (replay !== lastReplay.current) {
      lastReplay.current = replay;
      settled.current = false;
    }
    const finish = () => {
      paint(canvas, layout, palette, size.w, size.h, 1, null, dimRef.current);
      settled.current = true;
    };
    // The print layout can differ from the screen: repaint the settled
    // field at the size it has on paper.
    const onPrint = () => {
      const field = fieldRef.current;
      const w = field?.clientWidth ?? 0;
      const h = field?.clientHeight ?? 0;
      settled.current = true;
      if (w > 0 && h > 0 && (w !== size.w || h !== size.h)) {
        const specs = shape.split(",").map((s) => {
          const [count, texture] = s.split(":");
          return { count: Number(count), texture: texture === "1" };
        });
        paint(canvas, layoutGroups(specs, unit, w, h), palette, w, h, 1, null, null);
      } else {
        paint(canvas, layout, palette, size.w, size.h, 1, null, null);
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
    if (still || settled.current || reduce || typeof IntersectionObserver === "undefined") {
      finish();
      return detach;
    }
    const rand = seeded(layout.group.length * 7919 + 17 + replay);
    const from = new Float32Array(layout.group.length * 2);
    for (let i = 0; i < layout.group.length; i++) {
      from[2 * i] = rand() * size.w;
      from[2 * i + 1] = rand() * size.h;
    }
    paint(canvas, layout, palette, size.w, size.h, 0, from, null);
    let frame = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / 1400);
      paint(canvas, layout, palette, size.w, size.h, p, from, null);
      if (p < 1) frame = requestAnimationFrame(step);
      else {
        settled.current = true;
        if (dimRef.current !== null) paint(canvas, layout, palette, size.w, size.h, 1, null, dimRef.current);
      }
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
  }, [layout, size, colors, still, replay, shape, unit]);

  useEffect(() => {
    dimRef.current = dimExcept;
    const canvas = canvasRef.current;
    if (!canvas || !settled.current || size.w === 0 || layout.group.length === 0) return;
    paint(canvas, layout, colors.split(","), size.w, size.h, 1, null, dimExcept);
  }, [dimExcept, layout, size, colors]);

  const groupAt = (x: number) => {
    const gap = layout.pitch * 2;
    return layout.groups.find((g) => x >= g.x0 - gap / 2 && x <= g.x1 + gap / 2) ?? null;
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const g = groupAt(x);
    setTip(g ? { index: g.index, x: Math.min(Math.max(x, 110), size.w - 110) } : null);
    onHover?.(g ? groups[g.index].key : null);
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const g = groupAt(e.clientX - box.left);
    if (g && groups[g.index].selectable) onSelect?.(groups[g.index].key);
  };
  const tipGroup = tip ? groups[tip.index] : null;

  return (
    <div className={`brief-dots ${className}`}>
      {labelled && (
        <div className="brief-dots-labels" aria-hidden="true">
          {layout.groups.map((g) => (
            <span
              key={groups[g.index].key}
              className="brief-dots-label"
              data-active={groups[g.index].key === hovered ? "true" : undefined}
              style={{ left: g.x0 }}
            >
              {groups[g.index].label}
            </span>
          ))}
        </div>
      )}
      <div
        ref={fieldRef}
        className="brief-dots-field"
        data-selectable={tipGroup?.selectable ? "true" : undefined}
        onPointerMove={onMove}
        onPointerLeave={() => {
          setTip(null);
          onHover?.(null);
        }}
        onClick={onClick}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        {tip && tipGroup && (
          <div className="brief-tip" style={{ left: tip.x }} role="presentation">
            {tipGroup.tip}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The overall picture: every target pair by how it reads. On screen the
 * aligned and potential-misalignment groups lead to the sections behind
 * them; in print the field is drawn settled.
 */
export function DotField({
  counts,
  still = false,
  onFocusTone,
  focusTones = ["reinforce", "apart"],
}: {
  counts: ToneCounts;
  still?: boolean;
  onFocusTone?: (tone: "reinforce" | "apart") => void;
  focusTones?: ("reinforce" | "apart")[];
}) {
  const t = useTranslations("brief");
  const { n, pct } = useNumbers();
  const share = (tone: Tone) => (counts.total > 0 ? counts[tone] / counts.total : 0);
  const focusable = (tone: Tone): tone is "reinforce" | "apart" =>
    Boolean(onFocusTone) &&
    (tone === "reinforce" || tone === "apart") &&
    focusTones.includes(tone);
  const groups: CanvasGroup[] = DOT_ORDER.map((tone) => ({
    key: tone,
    count: counts[tone],
    color: DOT_COLORS[tone],
    texture: tone === "apart",
    selectable: focusable(tone),
    tip: (
      <>
        <strong>{n(counts[tone])}</strong> {t(`tone.${tone}`)} ({pct(share(tone))})
      </>
    ),
  }));
  const tonesShown = DOT_ORDER.filter((tone) => counts[tone] > 0);
  return (
    <>
      <DotCanvas
        groups={groups}
        unit={Math.max(1, Math.ceil(counts.total / MAX_DOTS))}
        still={still}
        onSelect={(key) => {
          if (focusable(key as Tone)) onFocusTone?.(key as "reinforce" | "apart");
        }}
      />
      <ul className="brief-dots-legend">
        {tonesShown.map((tone) => {
          const label = (
            <>
              <span className="brief-dots-key" style={{ background: DOT_COLORS[tone] }} aria-hidden="true" />
              <span className="brief-dots-pct">{pct(share(tone))}</span>{" "}
              <span className="brief-dots-tone">{t(`tone.${tone}`)}</span>
            </>
          );
          return (
            <li key={tone}>
              {focusable(tone) ? (
                <button type="button" className="brief-dots-link" onClick={() => onFocusTone?.(tone)}>
                  {label}
                  <span className="brief-dots-arrow" aria-hidden="true">
                    ↓
                  </span>
                </button>
              ) : (
                label
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
