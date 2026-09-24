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
import type { BriefData } from "@/lib/brief/data";
import {
  HUB_INK,
  hubParticles,
  layoutHub,
  type HubGroup,
  type HubLayout,
  type HubStage,
} from "@/lib/brief/hub";

/** How long the dots take to re-form between steps, in milliseconds. */
const MOVE_MS = 950;
/** Opacity of the groups the reader is not pointing at. */
const DIM = 0.22;

export function stageKey(stage: HubStage): string {
  return stage.kind === "doc" ? `doc:${stage.doc}` : stage.kind;
}

interface DotState {
  x: Float32Array;
  y: Float32Array;
  r: Float32Array;
  a: Float32Array;
}

function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scattered(n: number, w: number, h: number): DotState {
  const rand = seeded(n * 7919 + 17);
  const state = { x: new Float32Array(n), y: new Float32Array(n), r: new Float32Array(n), a: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    state.x[i] = rand() * w;
    state.y[i] = rand() * h;
    state.r[i] = 1;
  }
  return state;
}

/** The group each shown dot belongs to in a layout (-1 when hidden). */
function membership(layout: HubLayout): Int16Array {
  const member = new Int16Array(layout.x.length).fill(-1);
  for (let i = 0; i < layout.x.length; i++) {
    if (!layout.visible[i]) continue;
    member[i] = layout.groups.findIndex(
      (g) => layout.x[i] >= g.x0 - 1 && layout.x[i] <= g.x1 + 1 && layout.y[i] >= g.y0 - 1 && layout.y[i] <= g.y1 + 1,
    );
  }
  return member;
}

function draw(
  canvas: HTMLCanvasElement,
  state: DotState,
  layout: HubLayout,
  w: number,
  h: number,
  progress: number,
  member: Int16Array,
  bright: number,
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
  // A document in focus: a curved spoke from its name to each cluster.
  if (layout.center && progress > 0) {
    const { x: cx, y: cy, half } = layout.center;
    ctx.globalAlpha = Math.min(1, progress * 1.4);
    ctx.strokeStyle = "#b9bfc7";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    layout.groups.forEach((g, k) => {
      if (bright >= 0 && k !== bright) return;
      const left = g.side === "left";
      const x0 = left ? cx - half + 10 : cx + half - 10;
      const x1 = left ? g.x1 + 4 : g.x0 - 4;
      const y1 = (g.y0 + g.y1) / 2;
      const bend = (x1 - x0) * 0.55;
      ctx.moveTo(x0, cy);
      ctx.bezierCurveTo(x0 + bend, cy, x1 - bend, y1, x1, y1);
    });
    ctx.stroke();
  }
  // One path per ink and tenth of opacity keeps 13,000+ dots cheap.
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < state.x.length; i++) {
    let a = state.a[i];
    if (bright >= 0 && member[i] !== bright) a *= DIM;
    if (a < 0.03) continue;
    const key = `${layout.ink[i]}:${Math.round(a * 10)}`;
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  }
  for (const [key, ids] of buckets) {
    const [ink, alpha] = key.split(":").map(Number);
    ctx.fillStyle = HUB_INK[ink] ?? HUB_INK[1];
    ctx.globalAlpha = alpha / 10;
    ctx.beginPath();
    for (const i of ids) {
      const r = layout.small[i] ? state.r[i] * 0.45 : state.r[i];
      if (r >= 1.1) {
        ctx.moveTo(state.x[i] + r, state.y[i]);
        ctx.arc(state.x[i], state.y[i], r, 0, Math.PI * 2);
      } else {
        ctx.rect(state.x[i] - r, state.y[i] - r, 2 * r, 2 * r);
      }
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * The overview's field: one dot per target pair (plus a copy where two
 * themes cover the same pair), re-forming for each step. Dots that belong to
 * the new step fly to their place; the others fade where they are. Labels
 * sit beside the groups; pointing at a group names it and brings it
 * forward, selecting it opens it.
 */
export function HubCanvas({
  data,
  stage,
  labelFor,
  tipFor,
  clickable,
  onGroup,
  highlight = null,
  onHover,
  center,
}: {
  data: BriefData;
  stage: HubStage;
  labelFor: (group: HubGroup) => ReactNode;
  tipFor?: (group: HubGroup) => ReactNode;
  clickable?: (group: HubGroup) => boolean;
  onGroup?: (group: HubGroup) => void;
  /** Key of the group to bring forward. */
  highlight?: string | null;
  onHover?: (key: string | null) => void;
  /** Shown at the centre of the document wheel. */
  center?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const state = useRef<DotState | null>(null);
  const seen = useRef(false);
  const settled = useRef(false);
  const brightRef = useRef(-1);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tip, setTip] = useState<{ group: HubGroup; x: number; y: number } | null>(null);
  const particles = useMemo(() => hubParticles(data), [data]);
  const layout = useMemo(
    () => layoutHub(stage, particles, data, size.w, size.h),
    [stage, particles, data, size.w, size.h],
  );
  const member = useMemo(() => membership(layout), [layout]);
  const bright = highlight === null ? -1 : layout.groups.findIndex((g) => g.key === highlight);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    const n = particles.length;
    if (!state.current || state.current.x.length !== n) state.current = scattered(n, size.w, size.h);
    const cur = state.current;
    const from = { x: cur.x.slice(), y: cur.y.slice(), r: cur.r.slice(), a: cur.a.slice() };
    // Where each dot goes: shown dots to their place; hidden ones fade where
    // they are; a theme's extra copy of a pair splits off from that pair.
    const to = { x: new Float32Array(n), y: new Float32Array(n), r: new Float32Array(n), a: new Float32Array(n) };
    for (let i = 0; i < n; i++) {
      if (layout.visible[i]) {
        to.x[i] = layout.x[i];
        to.y[i] = layout.y[i];
        to.r[i] = layout.r[i];
        to.a[i] = 1;
        const p = particles[i];
        if (p.ghost && from.a[i] < 0.05) {
          from.x[i] = cur.x[p.base];
          from.y[i] = cur.y[p.base];
          from.r[i] = cur.r[p.base];
        }
      } else {
        to.x[i] = from.x[i];
        to.y[i] = from.y[i];
        to.r[i] = from.r[i];
        to.a[i] = 0;
      }
    }
    const showLabels = (p: number) => {
      if (labelsRef.current) labelsRef.current.style.opacity = String(Math.max(0, Math.min(1, (p - 0.55) / 0.45)));
    };
    const settle = (p: number) => {
      const e = 1 - Math.pow(1 - p, 3);
      for (let i = 0; i < n; i++) {
        cur.x[i] = from.x[i] + (to.x[i] - from.x[i]) * e;
        cur.y[i] = from.y[i] + (to.y[i] - from.y[i]) * e;
        cur.r[i] = from.r[i] + (to.r[i] - from.r[i]) * e;
        cur.a[i] = from.a[i] + (to.a[i] - from.a[i]) * e;
      }
      draw(canvas, cur, layout, size.w, size.h, e, member, p < 1 ? -1 : brightRef.current);
      showLabels(p);
      settled.current = p >= 1;
    };
    settled.current = false;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof requestAnimationFrame === "undefined") {
      seen.current = true;
      settle(1);
      return;
    }
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / MOVE_MS);
      settle(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    // The first build waits until the field is in view.
    if (!seen.current && typeof IntersectionObserver !== "undefined") {
      showLabels(0);
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io.disconnect();
          seen.current = true;
          frame = requestAnimationFrame(tick);
        },
        { threshold: 0.3 },
      );
      io.observe(canvas);
      return () => {
        io.disconnect();
        cancelAnimationFrame(frame);
      };
    }
    seen.current = true;
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [layout, size, particles, member]);

  // Bringing a group forward redraws a settled field; it never restarts a move.
  useEffect(() => {
    brightRef.current = bright;
    const canvas = canvasRef.current;
    if (!canvas || !settled.current || !state.current || size.w === 0) return;
    draw(canvas, state.current, layout, size.w, size.h, 1, member, bright);
  }, [bright, layout, member, size]);

  const groupAt = (x: number, y: number) =>
    layout.groups.find((g) => x >= g.x0 - 6 && x <= g.x1 + 6 && y >= g.y0 - 6 && y <= g.y1 + 6) ?? null;
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const group = groupAt(x, y);
    setTip(group && tipFor ? { group, x: Math.min(Math.max(x, 130), size.w - 130), y } : null);
    onHover?.(group?.key ?? null);
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const group = groupAt(e.clientX - box.left, e.clientY - box.top);
    if (group && (clickable?.(group) ?? true)) onGroup?.(group);
  };
  const focus = stage.kind === "doc";

  return (
    <div
      ref={wrapRef}
      className="brief-hub-canvas"
      data-hub-stage={stageKey(stage)}
      data-clickable={tip && onGroup && (clickable?.(tip.group) ?? true) ? "true" : undefined}
      onPointerMove={onMove}
      onPointerLeave={() => {
        setTip(null);
        onHover?.(null);
      }}
      onClick={onClick}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div ref={labelsRef} className="brief-hub-labels" aria-hidden="true">
        {layout.groups.map((g, k) => {
          const dim = bright >= 0 && k !== bright ? "true" : undefined;
          if (focus && layout.center) {
            const left = g.side === "left";
            return (
              <div
                key={g.key}
                className="brief-hub-label brief-hub-label-partner"
                data-side={left ? "left" : "right"}
                data-dim={dim}
                style={{
                  left: left ? g.x1 : g.x0,
                  top: g.y0 - 6,
                  // A name keeps to its own side of the field.
                  maxWidth: Math.max(64, left ? g.x1 - 4 : size.w - g.x0 - 4),
                }}
              >
                {labelFor(g)}
              </div>
            );
          }
          return (
            <div
              key={g.key}
              className="brief-hub-label"
              data-dim={dim}
              style={{ left: g.x0, top: g.y0 - 8, maxWidth: Math.max(40, g.x1 - g.x0 + 24) }}
            >
              {labelFor(g)}
            </div>
          );
        })}
        {focus && layout.center && center && (
          <div
            className="brief-hub-center"
            style={{ left: layout.center.x, top: layout.center.y, maxWidth: layout.center.half * 2 - 8 }}
          >
            {center}
          </div>
        )}
      </div>
      {tip && tipFor && (
        <div className="brief-tip brief-hub-tip" style={{ left: tip.x, top: Math.max(4, tip.y - 56) }} role="presentation">
          {tipFor(tip.group)}
        </div>
      )}
    </div>
  );
}
