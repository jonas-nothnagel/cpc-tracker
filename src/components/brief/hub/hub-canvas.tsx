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
  type HubAxis,
  type HubGroup,
  type HubLayout,
  type HubStage,
} from "@/lib/brief/hub";

/** How long the dots take to re-form between steps, in milliseconds. */
const MOVE_MS = 950;
/** How long a change of emphasis takes when no dot moves. */
const FADE_MS = 260;
/** Opacity of the groups the reader is not pointing at. */
const DIM = 0.22;

export function stageKey(stage: HubStage): string {
  if (stage.kind === "doc") return `doc:${stage.doc}`;
  if (stage.kind === "target") return `target:${stage.id}`;
  if (stage.kind === "map") {
    const f = stage.focus;
    const focus = !f
      ? ""
      : f.kind === "theme"
        ? `:theme:${f.index}`
        : f.kind === "mechanism"
          ? `:kind:${f.mechanism}`
          : f.kind === "doc"
            ? `:doc:${f.doc}`
            : ":top";
    return `map${stage.tone ? `:${stage.tone}` : ""}${focus}`;
  }
  return stage.kind;
}

/** What is under the pointer: a group (a rating, a block of the map, a
 *  cluster around the centre), a document on the map's diagonal, or one
 *  target pair around a target in focus. */
export type HubTarget =
  | { kind: "group"; group: HubGroup }
  | { kind: "axis"; axis: HubAxis }
  | { kind: "dot"; index: number; group: HubGroup | null };

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

/** The box of a document's name on the map: right-aligned at its x. */
function axisBox(a: HubAxis) {
  return { x0: a.labelX - a.labelWidth, x1: a.labelX + 8, y0: a.labelY - a.labelHeight / 2, y1: a.labelY + a.labelHeight / 2 };
}

/** The group each shown dot belongs to in a layout (-1 when none). */
function membership(layout: HubLayout): Int16Array {
  const group = new Int16Array(layout.x.length).fill(-1);
  for (let i = 0; i < layout.x.length; i++) {
    if (!layout.visible[i]) continue;
    group[i] = layout.groups.findIndex((gg) => inside(layout.x[i], layout.y[i], gg, 1));
  }
  return group;
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
  extras: { colors: Map<string, string>; outlined: string[]; axisFocus: string | null },
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
  const settledIn = Math.min(1, progress * 1.4);
  // A target or document in focus: a curved spoke from its name to each cluster.
  if (layout.center && progress > 0) {
    const { x: cx, y: cy, half } = layout.center;
    ctx.globalAlpha = settledIn;
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
  // The map's diagonal: each document's own stretch in its colour, with a
  // thin lead from a name that had to move away from it.
  if (layout.axis.length > 0 && progress > 0) {
    for (const a of layout.axis) {
      const dim = extras.axisFocus !== null && extras.axisFocus !== a.key;
      ctx.globalAlpha = settledIn * (dim ? 0.3 : 1);
      ctx.strokeStyle = extras.colors.get(a.key) ?? "#94a3b8";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(a.square.x0, a.square.y0);
      ctx.lineTo(a.square.x1, a.square.y1);
      ctx.stroke();
      const mid = (a.square.y0 + a.square.y1) / 2;
      if (Math.abs(a.labelY - mid) > 6) {
        ctx.strokeStyle = "#c3c8cf";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.labelX + 3, a.labelY);
        ctx.lineTo((a.square.x0 + a.square.x1) / 2 - 3, mid);
        ctx.stroke();
      }
    }
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
  // Blocks a finding names, outlined.
  if (extras.outlined.length > 0 && progress >= 1) {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#232e3d";
    ctx.lineWidth = 1.25;
    for (const g of layout.groups) {
      if (!extras.outlined.includes(g.key)) continue;
      ctx.strokeRect(g.x0 - 2.5, g.y0 - 2.5, g.x1 - g.x0 + 5, g.y1 - g.y0 + 5);
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * The overview's field: one dot per target pair, re-forming for each step.
 * Dots that belong to the new step fly to their place (or only change how
 * far forward they are, on the map); the others fade where they are.
 * Labels sit beside the groups and along the map's diagonal; pointing at a
 * group, a document or (around a target) one pair names it, selecting it
 * opens it, and the name at the centre opens what is in focus.
 */
export function HubCanvas({
  data,
  stage,
  labelFor,
  tipFor,
  clickable,
  onSelect,
  onCenter,
  highlight = null,
  outlined = [],
  onHover,
  center,
}: {
  data: BriefData;
  stage: HubStage;
  labelFor: (group: HubGroup) => ReactNode;
  tipFor?: (target: HubTarget) => ReactNode;
  clickable?: (target: HubTarget) => boolean;
  onSelect?: (target: HubTarget) => void;
  /** Selecting the name at the centre. */
  onCenter?: () => void;
  /** Key of the group to bring forward. */
  highlight?: string | null;
  /** Keys of groups to outline (blocks a finding names). */
  outlined?: string[];
  /** A group's key, or `axis:<document>`, under the pointer (null when none). */
  onHover?: (key: string | null) => void;
  /** Shown at the centre of a target or document in focus. */
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
  // The tip belongs to the arrangement it was pointed at in: when the dots
  // re-form under a still pointer, an old name must not be read against new
  // groups. On the map only the emphasis changes, so a name stays.
  const key = stageKey(stage);
  const placeKey = stage.kind === "map" ? "map" : key;
  const [pointed, setTip] = useState<{ target: HubTarget; x: number; y: number; stage: string } | null>(null);
  const [overCenter, setOverCenter] = useState(false);
  const tip = pointed && pointed.stage === placeKey ? pointed : null;
  const particles = useMemo(() => hubParticles(data), [data]);
  const layout = useMemo(
    () => layoutHub(stage, particles, data, size.w, size.h),
    [stage, particles, data, size.w, size.h],
  );
  const member = useMemo(() => membership(layout), [layout]);
  const colors = useMemo(() => new Map(data.scope.docs.map((d) => [d.id, d.color])), [data]);
  const axisFocus = stage.kind === "map" && stage.focus?.kind === "doc" ? stage.focus.doc : null;
  const outlineKey = outlined.join("|");
  const extras = useMemo(
    () => ({ colors, outlined: outlineKey ? outlineKey.split("|") : [], axisFocus }),
    [colors, outlineKey, axisFocus],
  );
  // The pointer's group wins over a list row's.
  const tipKey =
    tip?.target.kind === "group" ? tip.target.group.key : tip?.target.kind === "dot" ? tip.target.group?.key : undefined;
  const tipGroup = tipKey === undefined ? -1 : layout.groups.findIndex((g) => g.key === tipKey);
  const listed = highlight === null ? -1 : layout.groups.findIndex((g) => g.key === highlight);
  const bright = tipGroup >= 0 ? tipGroup : listed;

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
    // Where each dot goes: shown dots to their place and emphasis; hidden
    // ones fade where they are.
    const to = { x: new Float32Array(n), y: new Float32Array(n), r: new Float32Array(n), a: new Float32Array(n) };
    let moved = false;
    for (let i = 0; i < n; i++) {
      if (layout.visible[i]) {
        to.x[i] = layout.x[i];
        to.y[i] = layout.y[i];
        to.r[i] = layout.r[i];
        to.a[i] = layout.alpha[i];
        if (Math.abs(to.x[i] - from.x[i]) > 0.5 || Math.abs(to.y[i] - from.y[i]) > 0.5) moved = true;
      } else {
        to.x[i] = from.x[i];
        to.y[i] = from.y[i];
        to.r[i] = from.r[i];
        to.a[i] = 0;
      }
    }
    const duration = moved ? MOVE_MS : FADE_MS;
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
      draw(canvas, cur, layout, size.w, size.h, moved ? e : 1, member, p < 1 ? -1 : brightRef.current, extras);
      if (moved) showLabels(p);
      settled.current = p >= 1;
    };
    settled.current = false;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof requestAnimationFrame === "undefined") {
      seen.current = true;
      settle(1);
      showLabels(1);
      return;
    }
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / duration);
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
  }, [layout, size, particles, member, extras]);

  // Bringing a group forward redraws a settled field; it never restarts a move.
  useEffect(() => {
    brightRef.current = bright;
    const canvas = canvasRef.current;
    if (!canvas || !settled.current || !state.current || size.w === 0) return;
    draw(canvas, state.current, layout, size.w, size.h, 1, member, bright, extras);
  }, [bright, layout, member, size, extras]);

  const inCenter = (x: number, y: number) =>
    layout.center !== null &&
    center !== undefined &&
    Math.abs(x - layout.center.x) <= layout.center.half &&
    Math.abs(y - layout.center.y) <= layout.center.half * 0.75;

  const targetAt = (x: number, y: number): HubTarget | null => {
    // Around a target, each pair is its own way in.
    if (stage.kind === "target") {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < layout.x.length; i++) {
        if (!layout.visible[i]) continue;
        const d = Math.hypot(layout.x[i] - x, layout.y[i] - y);
        if (d <= Math.max(layout.r[i] + 2, 4) && d < bestD) {
          best = i;
          bestD = d;
        }
      }
      if (best >= 0) {
        const g = member[best];
        return { kind: "dot", index: best, group: g >= 0 ? layout.groups[g] : null };
      }
    }
    const axis = layout.axis.find((a) => inside(x, y, a.square, 2) || inside(x, y, axisBox(a)));
    if (axis) return { kind: "axis", axis };
    const group = layout.groups.find((g) => inside(x, y, g, layout.axis.length > 0 ? 0 : 6));
    return group ? { kind: "group", group } : null;
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const centre = inCenter(x, y);
    if (centre !== overCenter) setOverCenter(centre);
    const hit = centre ? null : targetAt(x, y);
    setTip(hit && tipFor ? { target: hit, x: Math.min(Math.max(x, 140), size.w - 140), y, stage: placeKey } : null);
    onHover?.(
      !hit
        ? null
        : hit.kind === "axis"
          ? `axis:${hit.axis.key}`
          : hit.kind === "group"
            ? hit.group.key
            : (hit.group?.key ?? null),
    );
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    if (inCenter(x, y)) {
      onCenter?.();
      return;
    }
    const hit = targetAt(x, y);
    if (hit && (clickable?.(hit) ?? true)) onSelect?.(hit);
  };
  const focus = stage.kind === "doc" || stage.kind === "target";
  const pointable = tip && onSelect && (clickable?.(tip.target) ?? true);
  const docName = (id: string) => data.scope.docs.find((d) => d.id === id)?.name ?? id;

  return (
    <div
      ref={wrapRef}
      className="brief-hub-canvas"
      data-hub-stage={key}
      data-clickable={pointable ? "true" : undefined}
      data-center={overCenter && onCenter ? "true" : undefined}
      onPointerMove={onMove}
      onPointerLeave={() => {
        setTip(null);
        setOverCenter(false);
        onHover?.(null);
      }}
      onClick={onClick}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div ref={labelsRef} className="brief-hub-labels" aria-hidden="true">
        {layout.axis.map((a) => (
          <div
            key={a.key}
            className="brief-hub-axis"
            data-axis={a.key}
            data-dim={axisFocus !== null && axisFocus !== a.key ? "true" : undefined}
            data-compact={size.w < 480 ? "true" : undefined}
            style={{ left: a.labelX, top: a.labelY, width: a.labelWidth, maxHeight: a.labelHeight }}
          >
            {docName(a.key)}
          </div>
        ))}
        {layout.groups.map((g, k) => {
          if (g.labelAt === "none") return null;
          const dim = bright >= 0 && k !== bright ? "true" : undefined;
          if (focus && layout.center) {
            const left = g.side === "left";
            return (
              <div
                key={g.key}
                className="brief-hub-label brief-hub-label-partner"
                data-side={left ? "left" : "right"}
                data-dim={dim}
                data-compact={layout.focusLabel < 50 ? "true" : layout.focusLabel < 72 ? "two" : undefined}
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
            data-clickable={onCenter ? "true" : undefined}
            style={{ left: layout.center.x, top: layout.center.y, width: layout.center.half * 2 - 8 }}
          >
            {center}
          </div>
        )}
      </div>
      {tip && tipFor && (
        <div className="brief-tip brief-hub-tip" style={{ left: tip.x, top: Math.max(4, tip.y - 64) }} role="presentation">
          {tipFor(tip.target)}
        </div>
      )}
    </div>
  );
}
