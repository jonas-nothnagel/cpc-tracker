"use client";

import { useMemo, useState } from "react";

import {
  MINIATURE_REGIONS,
  regionForLabel,
} from "@/lib/analytics/miniature-regions";

import {
  SCENES,
  type MiniaturePrimitive,
} from "./miniature-scenes";

/**
 * SectionMiniature — an "augmented dashboard" sketch: the section's real
 * layout drawn in muted slate furniture, with each interactive region
 * heat-shaded (warm ramp, darker = more used within this section) and
 * hover/focus tooltips carrying the stats. Non-technical audience; all
 * numbers arrive pre-aggregated and identifier-free.
 *
 * Color: sequential warm ramp, lightness-monotone; every region shape
 * keeps a 1px slate outline so pale regions never vanish; zero-usage
 * regions are neutral with a dashed outline. Text never sits on ramp
 * colors. REMOVABLE SYSTEM: see src/lib/analytics/README.md.
 */

const HEAT = ["#fde7d2", "#f7bd94", "#ea8a52", "#d1522a", "#a02417"];
const ZERO_FILL = "#f1f5f9";
const FURNITURE_FILL = "#e2e8f0";
const REGION_STROKE = "#94a3b8";
const ACTIVE_STROKE = "#334155";

export function SectionMiniature({
  section,
  sectionName,
  regionCounts,
  elements,
}: {
  section: string;
  sectionName: string;
  /** Sparse per-region counts from summary.regionsBySection[section]. */
  regionCounts: { region: string; count: number }[];
  /** summary.elementsBySection[section] — tooltip examples. */
  elements: { label: string; count: number }[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const scene = SCENES[section];
  const regions = MINIATURE_REGIONS[section] ?? [];
  const counts = useMemo(
    () => new Map(regionCounts.map((r) => [r.region, r.count])),
    [regionCounts],
  );
  const total = regionCounts.reduce((a, r) => a + r.count, 0);
  const maxCount = Math.max(0, ...regionCounts.map((r) => r.count));

  if (!scene) return null;

  const fillFor = (region?: string): string => {
    if (!region) return FURNITURE_FILL;
    const count = counts.get(region) ?? 0;
    if (count === 0 || maxCount === 0) return ZERO_FILL;
    const rel = count / maxCount;
    return HEAT[Math.min(HEAT.length - 1, Math.floor(rel * (HEAT.length - 1) + 0.5))];
  };

  const statsFor = (region: string): string => {
    const count = counts.get(region) ?? 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const name = regions.find((r) => r.id === region)?.name ?? region;
    return count === 0
      ? `${name}: not used yet`
      : `${name}: ${count} interaction${count === 1 ? "" : "s"} · ${pct}% of this section's activity`;
  };

  const activeAnchor = active ? anchorFor(scene.items, active) : null;

  return (
    <div className="relative">
      <svg
        viewBox="0 0 560 300"
        className="w-full rounded-lg border border-slate-200 bg-white"
        role="group"
        aria-label={`Sketch of the ${sectionName} section, shaded by how much each part is used`}
      >
        {scene.items.map((item, i) => (
          <PrimitiveShape
            key={i}
            item={item}
            fill={fillFor(item.region)}
            zero={!!item.region && (counts.get(item.region) ?? 0) === 0}
            highlighted={!!item.region && item.region === active}
            ariaLabel={item.region ? statsFor(item.region) : undefined}
            onEnter={
              item.region ? () => setActive(item.region ?? null) : undefined
            }
            onLeave={item.region ? () => setActive(null) : undefined}
          />
        ))}
      </svg>

      {active && activeAnchor && (
        <RegionTooltip
          anchor={activeAnchor}
          title={regions.find((r) => r.id === active)?.name ?? active}
          stats={statsFor(active)}
          examples={topExamples(section, active, elements)}
        />
      )}

      <HeatLegend />
    </div>
  );
}

/** Top real labels belonging to a region — MUST reuse regionForLabel so
 *  first-match precedence matches the server-side rollup. */
function topExamples(
  section: string,
  region: string,
  elements: { label: string; count: number }[],
): { label: string; count: number }[] {
  return elements
    .filter((el) => regionForLabel(section, el.label) === region)
    .slice(0, 3);
}

/** Bounding box (viewBox coords) of a region's first primitive. */
function anchorFor(
  items: MiniaturePrimitive[],
  region: string,
): { x: number; y: number; w: number } | null {
  for (const item of items) {
    if (!("region" in item) || item.region !== region) continue;
    if (item.kind === "wheel") {
      return { x: item.cx - item.r, y: item.cy - item.r, w: item.r * 2 };
    }
    const w = "w" in item ? item.w : "size" in item ? item.size : 40;
    return { x: item.x, y: item.y, w };
  }
  return null;
}

function RegionTooltip({
  anchor,
  title,
  stats,
  examples,
}: {
  anchor: { x: number; y: number; w: number };
  title: string;
  stats: string;
  examples: { label: string; count: number }[];
}) {
  // Percentage positioning scales with the rendered SVG size.
  const leftPct = ((anchor.x + anchor.w / 2) / 560) * 100;
  const topThird = anchor.y < 100;
  const yPct = (anchor.y / 300) * 100;
  return (
    <div
      className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 rounded-lg border border-slate-300 bg-white p-3 shadow-lg"
      style={{
        left: `min(max(${leftPct}%, 8rem), calc(100% - 8rem))`,
        ...(topThird
          ? { top: `calc(${yPct}% + 3rem)` }
          : { bottom: `calc(${100 - yPct}% + 0.5rem)` }),
      }}
    >
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-0.5 text-xs text-slate-600">{stats.split(": ")[1]}</p>
      {examples.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-slate-100 pt-2">
          {examples.map((el) => (
            <li
              key={el.label}
              className="flex justify-between gap-2 text-xs text-slate-500"
            >
              <span className="truncate">{el.label}</span>
              <span className="tabular-nums">{el.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HeatLegend() {
  return (
    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
      <span
        className="h-3 w-5 rounded-sm border border-dashed border-slate-300"
        style={{ backgroundColor: ZERO_FILL }}
      />
      <span className="mr-1">not used</span>
      {HEAT.map((c) => (
        <span
          key={c}
          className="h-3 w-5 rounded-sm border border-slate-300/60"
          style={{ backgroundColor: c }}
        />
      ))}
      <span>barely used → heavily used</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitive rendering
// ---------------------------------------------------------------------------

interface ShapeProps {
  item: MiniaturePrimitive;
  fill: string;
  zero: boolean;
  highlighted: boolean;
  ariaLabel?: string;
  onEnter?: () => void;
  onLeave?: () => void;
}

function PrimitiveShape({
  item,
  fill,
  zero,
  highlighted,
  ariaLabel,
  onEnter,
  onLeave,
}: ShapeProps) {
  const interactive = "region" in item && !!item.region;
  const stroke = highlighted
    ? ACTIVE_STROKE
    : interactive
      ? REGION_STROKE
      : "#cbd5e1";
  const strokeWidth = highlighted ? 1.5 : 1;
  const dash = zero ? "3 3" : undefined;

  const shape = renderShape(item, fill, stroke, strokeWidth, dash);

  if (!interactive) {
    return <g aria-hidden="true">{shape}</g>;
  }
  return (
    <g
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      className="cursor-pointer focus:outline-none"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {shape}
    </g>
  );
}

function renderShape(
  item: MiniaturePrimitive,
  fill: string,
  stroke: string,
  strokeWidth: number,
  dash?: string,
) {
  const common = { stroke, strokeWidth, strokeDasharray: dash };
  switch (item.kind) {
    case "frame":
      return (
        <rect
          x={item.x}
          y={item.y}
          width={item.w}
          height={item.h}
          rx={6}
          fill="none"
          {...common}
        />
      );
    case "textlines":
      return (
        <g>
          {item.widths.map((w, i) => (
            <rect
              key={i}
              x={item.x}
              y={item.y + i * 14}
              width={item.w * w}
              height={i === 1 && item.widths.length > 2 ? 10 : 6}
              rx={3}
              fill={fill}
              {...common}
            />
          ))}
        </g>
      );
    case "chipRow":
    case "pills": {
      let cursor = item.x;
      return (
        <g>
          {item.widths.map((w, i) => {
            const chipW = item.w * w;
            const chip = (
              <rect
                key={i}
                x={cursor}
                y={item.y}
                width={chipW}
                height={item.kind === "pills" ? 16 : 14}
                rx={7}
                fill={fill}
                {...common}
              />
            );
            cursor += chipW + 6;
            return chip;
          })}
        </g>
      );
    }
    case "rowList": {
      const rowH = 18;
      const gap = 6;
      return (
        <g>
          {Array.from({ length: item.rows }, (_, i) => (
            <g key={i}>
              <rect
                x={item.x}
                y={item.y + i * (rowH + gap)}
                width={item.w}
                height={rowH}
                rx={4}
                fill={fill}
                {...common}
              />
              {item.bars && (
                <rect
                  x={item.x + item.w - 54}
                  y={item.y + i * (rowH + gap) + 5}
                  width={44 - i * 4}
                  height={8}
                  rx={2}
                  fill="#ffffff"
                  opacity={0.65}
                />
              )}
            </g>
          ))}
        </g>
      );
    }
    case "cards": {
      const gap = 8;
      const cardW = (item.w - gap * (item.cols - 1)) / item.cols;
      const cardH = 42;
      return (
        <g>
          {Array.from({ length: item.cols * item.rows }, (_, i) => {
            const col = i % item.cols;
            const row = Math.floor(i / item.cols);
            return (
              <rect
                key={i}
                x={item.x + col * (cardW + gap)}
                y={item.y + row * (cardH + gap)}
                width={cardW}
                height={cardH}
                rx={5}
                fill={fill}
                {...common}
              />
            );
          })}
        </g>
      );
    }
    case "stackedBar": {
      let cursor = item.x;
      return (
        <g>
          {item.segs.map((s, i) => {
            const segW = item.w * s - 2;
            const seg = (
              <rect
                key={i}
                x={cursor}
                y={item.y}
                width={Math.max(segW, 2)}
                height={16}
                rx={3}
                fill={fill}
                {...common}
              />
            );
            cursor += item.w * s;
            return seg;
          })}
        </g>
      );
    }
    case "matrix": {
      const label = 26;
      const cell = (item.size - label) / item.n;
      const cells = [];
      for (let r = 0; r < item.n; r++) {
        for (let c = 0; c < item.n; c++) {
          cells.push(
            r === c ? (
              <rect
                key={`${r}-${c}`}
                x={item.x + label + c * cell + 1.5}
                y={item.y + label + r * cell + 1.5}
                width={cell - 3}
                height={cell - 3}
                rx={3}
                fill="none"
                stroke="#cbd5e1"
                strokeDasharray="3 3"
              />
            ) : (
              <rect
                key={`${r}-${c}`}
                x={item.x + label + c * cell + 1.5}
                y={item.y + label + r * cell + 1.5}
                width={cell - 3}
                height={cell - 3}
                rx={3}
                fill={fill}
                {...common}
              />
            ),
          );
        }
      }
      return (
        <g>
          {/* row/column label stubs */}
          {Array.from({ length: item.n }, (_, i) => (
            <g key={i}>
              <rect
                x={item.x + label + i * cell + 4}
                y={item.y + 8}
                width={cell - 10}
                height={5}
                rx={2}
                fill="#e2e8f0"
              />
              <rect
                x={item.x}
                y={item.y + label + i * cell + cell / 2 - 3}
                width={18}
                height={5}
                rx={2}
                fill="#e2e8f0"
              />
            </g>
          ))}
          {cells}
        </g>
      );
    }
    case "wheel": {
      const arcs = [];
      const gapDeg = 6;
      const arcSpan = 360 / item.arcs - gapDeg;
      for (let i = 0; i < item.arcs; i++) {
        const start = (i * 360) / item.arcs;
        arcs.push(
          <path
            key={`arc-${i}`}
            d={annularArc(item.cx, item.cy, item.r - 14, item.r, start, start + arcSpan)}
            fill={item.focusArc && i === 0 ? "#ffffff" : fill}
            {...common}
          />,
        );
      }
      const ribbons = [];
      for (let i = 0; i < item.ribbons; i++) {
        // Deterministic pseudo-spread of chords across the circle.
        const a = ((i * 137) % 360) * (Math.PI / 180);
        const b = ((i * 137 + 150) % 360) * (Math.PI / 180);
        const r = item.r - 16;
        ribbons.push(
          <path
            key={`rib-${i}`}
            d={`M ${item.cx + r * Math.cos(a)} ${item.cy + r * Math.sin(a)} Q ${item.cx} ${item.cy} ${item.cx + r * Math.cos(b)} ${item.cy + r * Math.sin(b)}`}
            fill="none"
            stroke={fill === FURNITURE_FILL ? "#cbd5e1" : fill}
            strokeWidth={3}
            opacity={0.7}
          />,
        );
      }
      return (
        <g>
          <circle
            cx={item.cx}
            cy={item.cy}
            r={item.r + 4}
            fill="none"
            stroke="#e2e8f0"
            strokeDasharray="4 4"
          />
          {ribbons}
          {arcs}
        </g>
      );
    }
    case "dotGrid": {
      const dots = [];
      for (let r = 0; r < item.rows; r++) {
        for (let c = 0; c < item.cols; c++) {
          dots.push(
            <circle
              key={`${r}-${c}`}
              cx={item.x + 5 + c * 14}
              cy={item.y + 5 + r * 14}
              r={4.5}
              fill={fill}
              {...common}
            />,
          );
        }
      }
      return <g>{dots}</g>;
    }
    case "sankey": {
      const nodeH = (item.h - (item.left - 1) * 8) / item.left;
      const rightH = (item.h - (item.right - 1) * 8) / item.right;
      const parts = [];
      for (let i = 0; i < item.left; i++) {
        parts.push(
          <rect
            key={`l-${i}`}
            x={item.x}
            y={item.y + i * (nodeH + 8)}
            width={12}
            height={nodeH}
            rx={3}
            fill={fill}
            {...common}
          />,
        );
      }
      for (let i = 0; i < item.right; i++) {
        parts.push(
          <rect
            key={`r-${i}`}
            x={item.x + item.w - 12}
            y={item.y + i * (rightH + 8)}
            width={12}
            height={rightH}
            rx={3}
            fill={fill}
            {...common}
          />,
        );
      }
      for (let i = 0; i < Math.max(item.left, item.right); i++) {
        const fromY =
          item.y + (i % item.left) * (nodeH + 8) + nodeH / 2;
        const toY =
          item.y + ((i * 2 + 1) % item.right) * (rightH + 8) + rightH / 2;
        parts.push(
          <path
            key={`f-${i}`}
            d={`M ${item.x + 12} ${fromY} C ${item.x + item.w / 2} ${fromY}, ${item.x + item.w / 2} ${toY}, ${item.x + item.w - 12} ${toY}`}
            fill="none"
            stroke={fill === FURNITURE_FILL ? "#cbd5e1" : fill}
            strokeWidth={6}
            opacity={0.55}
          />,
        );
      }
      return <g>{parts}</g>;
    }
    case "chatBar":
      return (
        <g>
          <rect
            x={item.x}
            y={item.y}
            width={item.w}
            height={26}
            rx={13}
            fill={fill}
            {...common}
          />
          <rect
            x={item.x + item.w - 58}
            y={item.y + 5}
            width={50}
            height={16}
            rx={8}
            fill="#ffffff"
            opacity={0.75}
          />
        </g>
      );
  }
}

/** SVG path for a donut-slice (annular) arc between two angles (degrees). */
function annularArc(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const p = (r: number, d: number) => `${cx + r * Math.cos(rad(d))} ${cy + r * Math.sin(rad(d))}`;
  return [
    `M ${p(rOuter, startDeg)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p(rOuter, endDeg)}`,
    `L ${p(rInner, endDeg)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p(rInner, startDeg)}`,
    "Z",
  ].join(" ");
}
