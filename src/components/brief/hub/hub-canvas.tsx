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
  type HubPart,
  type HubStage,
} from "@/lib/brief/hub";

/** How long the dots take to re-form between steps, in milliseconds. */
const MOVE_MS = 950;
/** Opacity of the groups the reader is not pointing at. */
const DIM = 0.22;

export function stageKey(stage: HubStage): string {
  return stage.kind === "doc" ? `doc:${stage.doc}` : stage.kind;
}

/** A group under the pointer, and the part of it (a band or a segment). */
export interface HubTarget {
  group: HubGroup;
  part: HubPart | null;
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

/** Before the first build the dots wait just above the field, so they flow
 *  down into it from the landing's moving text. */
function waiting(n: number, w: number, h: number): DotState {
  const rand = seeded(n * 7919 + 17);
  const state = { x: new Float32Array(n), y: new Float32Array(n), r: new Float32Array(n), a: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    state.x[i] = rand() * w;
    state.y[i] = -rand() * h * 0.35;
    state.r[i] = 1;
  }
  return state;
}

function inside(x: number, y: number, b: { x0: number; y0: number; x1: number; y1: number }, pad = 0) {
  return x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad;
}

/** The group and part each shown dot belongs to in a layout (-1 when none). */
function membership(layout: HubLayout): { group: Int16Array; part: Int16Array } {
  const group = new Int16Array(layout.x.length).fill(-1);
  const part = new Int16Array(layout.x.length).fill(-1);
  for (let i = 0; i < layout.x.length; i++) {
    if (!layout.visible[i]) continue;
    const g = layout.groups.findIndex((gg) => inside(layout.x[i], layout.y[i], gg, 1));
    group[i] = g;
    const parts = g >= 0 ? layout.groups[g].parts : undefined;
    if (parts) part[i] = parts.findIndex((pp) => inside(layout.x[i], layout.y[i], pp, 1));
  }
  return { group, part };
}

function draw(
  canvas: HTMLCanvasElement,
  state: DotState,
  layout: HubLayout,
  w: number,
  h: number,
  progress: number,
  member: { group: Int16Array; part: Int16Array },
  bright: { group: number; part: number },
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
      if (bright.group >= 0 && k !== bright.group) return;
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
    if (bright.group >= 0) {
      const off = member.group[i] !== bright.group || (bright.part >= 0 && member.part[i] !== bright.part);
      if (off) a *= DIM;
    }
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
 * themes or two top targets share a pair), re-forming for each step. Dots
 * that belong to the new step fly to their place; the others fade where
 * they are. Labels sit beside the groups; pointing at a group or one of its
 * parts names it and brings it forward, selecting it opens it.
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
  tipFor?: (target: HubTarget) => ReactNode;
  clickable?: (target: HubTarget) => boolean;
  onGroup?: (target: HubTarget) => void;
  /** Key of the group to bring forward. */
  highlight?: string | null;
  onHover?: (key: string | null) => void;
  /** Shown at the centre of the document hub. */
  center?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const state = useRef<DotState | null>(null);
  const seen = useRef(false);
  const settled = useRef(false);
  const brightRef = useRef({ group: -1, part: -1 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tip, setTip] = useState<(HubTarget & { x: number; y: number }) | null>(null);
  const particles = useMemo(() => hubParticles(data), [data]);
  const layout = useMemo(
    () => layoutHub(stage, particles, data, size.w, size.h),
    [stage, particles, data, size.w, size.h],
  );
  const member = useMemo(() => membership(layout), [layout]);
  // The pointer's part wins over a list row's group.
  const tipGroup = tip ? layout.groups.indexOf(tip.group) : -1;
  const tipPart = tip && tip.part && tip.group.parts ? tip.group.parts.indexOf(tip.part) : -1;
  const listed = highlight === null ? -1 : layout.groups.findIndex((g) => g.key === highlight);
  const brightGroup = tipGroup >= 0 ? tipGroup : listed;
  const brightPart = tipGroup >= 0 ? tipPart : -1;

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
    if (!state.current || state.current.x.length !== n) state.current = waiting(n, size.w, size.h);
    const cur = state.current;
    const from = { x: cur.x.slice(), y: cur.y.slice(), r: cur.r.slice(), a: cur.a.slice() };
    // Where each dot goes: shown dots to their place; hidden ones fade where
    // they are; a copy splits off from the pair it copies.
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
      draw(canvas, cur, layout, size.w, size.h, e, member, p < 1 ? { group: -1, part: -1 } : brightRef.current);
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
    brightRef.current = { group: brightGroup, part: brightPart };
    const canvas = canvasRef.current;
    if (!canvas || !settled.current || !state.current || size.w === 0) return;
    draw(canvas, state.current, layout, size.w, size.h, 1, member, brightRef.current);
  }, [brightGroup, brightPart, layout, member, size]);

  const targetAt = (x: number, y: number): HubTarget | null => {
    const group = layout.groups.find((g) => inside(x, y, g, 6));
    if (!group) return null;
    const part = group.parts?.find((p) => inside(x, y, p, 2)) ?? null;
    return { group, part };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const hit = targetAt(x, y);
    setTip(hit && tipFor ? { ...hit, x: Math.min(Math.max(x, 140), size.w - 140), y } : null);
    onHover?.(hit?.group.key ?? null);
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const hit = targetAt(e.clientX - box.left, e.clientY - box.top);
    if (hit && (clickable?.(hit) ?? true)) onGroup?.(hit);
  };
  const focus = stage.kind === "doc";

  return (
    <div
      ref={wrapRef}
      className="brief-hub-canvas"
      data-hub-stage={stageKey(stage)}
      data-clickable={tip && onGroup && (clickable?.(tip) ?? true) ? "true" : undefined}
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
          const dim = brightGroup >= 0 && k !== brightGroup ? "true" : undefined;
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
          if (g.labelAt === "left") {
            return (
              <div
                key={g.key}
                className="brief-hub-label brief-hub-label-left"
                data-dim={dim}
                style={{ left: 0, top: (g.y0 + g.y1) / 2, width: layout.labelWidth }}
              >
                {labelFor(g)}
              </div>
            );
          }
          // A column's name may use the column and the gap to the next one.
          const next = layout.groups[k + 1]?.x0 ?? size.w;
          return (
            <div
              key={g.key}
              className="brief-hub-label"
              data-dim={dim}
              style={{ left: g.x0, top: g.y0 - 8, maxWidth: Math.max(40, Math.min(260, next - g.x0 - 10)) }}
            >
              {labelFor(g)}
            </div>
          );
        })}
        {focus && layout.center && center && (
          <div
            className="brief-hub-center"
            style={{ left: layout.center.x, top: layout.center.y, width: layout.center.half * 2 - 8 }}
          >
            {center}
          </div>
        )}
      </div>
      {tip && tipFor && (
        <div className="brief-tip brief-hub-tip" style={{ left: tip.x, top: Math.max(4, tip.y - 64) }} role="presentation">
          {tipFor(tip)}
        </div>
      )}
    </div>
  );
}
