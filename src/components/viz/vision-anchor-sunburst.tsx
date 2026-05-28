"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { arc as d3Arc } from "d3-shape";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  ALIGNMENT_LEVEL_ORDER,
  getDocColor,
} from "@/lib/utils";
import type { AlignmentLevel, CountryConfig } from "@/types";
import type { AnchorRow, AnchorStatus } from "@/lib/vision-anchor";

const SIZE = 620;
const CX = SIZE / 2;
const CY = SIZE / 2;
const CENTER_R = 60;
const ANCHOR_INNER = 70;
const ANCHOR_OUTER = 175;
const LEVEL_INNER = 180;
const LEVEL_OUTER = 250;
const LABEL_R = LEVEL_OUTER + 14;

// Levels we render in the outer ring, ordered best→worst clockwise within a wedge.
const RENDERED_LEVELS: AlignmentLevel[] = ["high", "medium", "low", "flagged"];

const STATUS_TONE_FILL: Record<AnchorStatus["tone"], string> = {
  amber: "#fed7aa", // tension-heavy: warm orange tint
  yellow: "#fef9c3", // single-doc: soft yellow tint
  green: "#dcfce7", // diversified: soft green tint
  gray: "#f1f5f9", // sparse: cool gray tint
};
const ANCHOR_NEUTRAL_FILL = "#f8fafc";

interface VisionSunburstProps {
  rows: AnchorRow[];
  countryConfig: CountryConfig | null;
  anchorDocType: string;
  anchorDocLabel: string;
  /** Click on a sub-arc → caller decides what to do (typically open the cell-level modal). */
  onSubArcClick: (row: AnchorRow, level: AlignmentLevel) => void;
  /** "See all peripheral records" link inside the drilldown card → caller opens row modal. */
  onViewAllRecords: (row: AnchorRow) => void;
}

interface WedgeGeom {
  row: AnchorRow;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  subArcs: { level: AlignmentLevel; count: number; startAngle: number; endAngle: number }[];
}

export function VisionSunburst({
  rows,
  countryConfig,
  anchorDocType,
  anchorDocLabel,
  onSubArcClick,
  onViewAllRecords,
}: VisionSunburstProps) {
  const [hoveredAnchor, setHoveredAnchor] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    anchorId: string;
    level?: AlignmentLevel;
    x: number;
    y: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const wedgeAngle = (Math.PI * 2) / Math.max(rows.length, 1);

  const wedges: WedgeGeom[] = useMemo(() => {
    return rows.map((row, i) => {
      const startAngle = i * wedgeAngle;
      const endAngle = (i + 1) * wedgeAngle;
      const midAngle = (startAngle + endAngle) / 2;
      const subArcs: WedgeGeom["subArcs"] = [];
      const total = row.totalRecords;
      if (total > 0) {
        let cursor = startAngle;
        for (const level of RENDERED_LEVELS) {
          const count = row.totalsByLevel[level] ?? 0;
          if (count === 0) continue;
          const span = (count / total) * wedgeAngle;
          subArcs.push({ level, count, startAngle: cursor, endAngle: cursor + span });
          cursor += span;
        }
      }
      return { row, startAngle, endAngle, midAngle, subArcs };
    });
  }, [rows, wedgeAngle]);

  const anchorArc = d3Arc<{ startAngle: number; endAngle: number }>()
    .innerRadius(ANCHOR_INNER)
    .outerRadius(ANCHOR_OUTER)
    .padAngle(0.005)
    .cornerRadius(2);

  const levelArc = d3Arc<{ startAngle: number; endAngle: number }>()
    .innerRadius(LEVEL_INNER)
    .outerRadius(LEVEL_OUTER)
    .padAngle(0.002)
    .cornerRadius(1);

  const focusedAnchorArc = d3Arc<{ startAngle: number; endAngle: number }>()
    .innerRadius(ANCHOR_INNER)
    .outerRadius(ANCHOR_OUTER)
    .padAngle(0)
    .cornerRadius(0);

  const focusedLevelArc = d3Arc<{ startAngle: number; endAngle: number }>()
    .innerRadius(LEVEL_INNER)
    .outerRadius(LEVEL_OUTER)
    .padAngle(0.005)
    .cornerRadius(3);

  const focused = focusedId ? wedges.find((w) => w.row.anchor.id === focusedId) ?? null : null;

  const focusedSubArcs = useMemo(() => {
    if (!focused) return [];
    const total = focused.row.totalRecords;
    if (total === 0) return [];
    let cursor = 0;
    const arcs: WedgeGeom["subArcs"] = [];
    for (const level of RENDERED_LEVELS) {
      const count = focused.row.totalsByLevel[level] ?? 0;
      if (count === 0) continue;
      const span = (count / total) * Math.PI * 2;
      arcs.push({ level, count, startAngle: cursor, endAngle: cursor + span });
      cursor += span;
    }
    return arcs;
  }, [focused]);

  // Escape key dismisses drilldown
  useEffect(() => {
    if (!focusedId) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFocusedId(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [focusedId]);

  // Coordinates relative to the chart center (which lives inside a translated <g>).
  // d3 angles: 0 = north (12 o'clock), increasing clockwise.
  function pointForAngle(angle: number, radius: number) {
    const std = angle - Math.PI / 2;
    return {
      x: Math.cos(std) * radius,
      y: Math.sin(std) * radius,
    };
  }

  function tooltipScreenPos(angle: number, radius: number) {
    const local = pointForAngle(angle, radius);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    // Convert from chart-centered coords (origin at CX,CY) to viewBox coords, then to screen.
    return {
      x: rect.left + ((CX + local.x) / SIZE) * rect.width,
      y: rect.top + ((CY + local.y) / SIZE) * rect.height,
    };
  }

  const anchorColor = getDocColor(countryConfig, anchorDocType) || "#4f7942";

  // Levels actually present in this dataset (avoids legend swatches the chart never shows).
  const visibleLevels = useMemo<AlignmentLevel[]>(() => {
    const present = new Set<AlignmentLevel>();
    for (const row of rows) {
      for (const lvl of Object.keys(row.totalsByLevel) as AlignmentLevel[]) {
        if ((row.totalsByLevel[lvl] ?? 0) > 0) present.add(lvl);
      }
    }
    return [...ALIGNMENT_LEVEL_ORDER].reverse().filter((l) => l !== "none" && present.has(l));
  }, [rows]);

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-3 text-xs items-center justify-center mb-2">
        {visibleLevels.map((level) => (
          <div key={level} className="flex items-center gap-1">
            <span
              className="w-3.5 h-3.5 rounded-sm inline-block"
              style={{ backgroundColor: ALIGNMENT_COLORS[level] }}
            />
            <span className="text-[var(--undp-gray)]">{ALIGNMENT_LABELS[level]}</span>
          </div>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[680px] mx-auto block"
        style={{ aspectRatio: "1 / 1" }}
        role="img"
        aria-label={`Sunburst chart of ${rows.length} ${anchorDocLabel} ambitions and their alignment relationships`}
      >
        <defs>
          <style>{`
            @keyframes wedgeEnter {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .wedge-enter {
              animation: wedgeEnter 320ms ease-out backwards;
            }
            @keyframes focusedEnter {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .focused-enter {
              animation: focusedEnter 220ms ease-out;
            }
          `}</style>
        </defs>

        {/* Overview state — single translate centers the entire chart so d3-arc
            paths (which are drawn around origin) land in the right place. */}
        <g
          transform={`translate(${CX},${CY})`}
          style={{
            opacity: focused ? 0 : 1,
            transition: "opacity 220ms ease-in-out",
            pointerEvents: focused ? "none" : "auto",
          }}
        >
          {wedges.map((w, i) => {
            const isHovered = hoveredAnchor === w.row.anchor.id;
            const isDimmed = hoveredAnchor != null && !isHovered;
            const fill = w.row.status
              ? STATUS_TONE_FILL[w.row.status.tone]
              : ANCHOR_NEUTRAL_FILL;
            return (
              <g
                key={w.row.anchor.id}
                className="wedge-enter"
                style={{
                  animationDelay: `${i * 22}ms`,
                  opacity: isDimmed ? 0.18 : 1,
                  transition: "opacity 200ms ease-out",
                }}
                onMouseEnter={() => {
                  setHoveredAnchor(w.row.anchor.id);
                  setHoverInfo({
                    anchorId: w.row.anchor.id,
                    ...tooltipScreenPos(w.midAngle, ANCHOR_OUTER + 30),
                  });
                }}
                onMouseLeave={() => {
                  setHoveredAnchor(null);
                  setHoverInfo(null);
                }}
                onClick={() => setFocusedId(w.row.anchor.id)}
              >
                <path
                  d={anchorArc({ startAngle: w.startAngle, endAngle: w.endAngle }) ?? ""}
                  fill={fill}
                  stroke="#ffffff"
                  strokeWidth={1}
                  style={{ cursor: "pointer" }}
                />
                {/* Sub-arcs */}
                {w.subArcs.map((sub) => (
                  <path
                    key={`${w.row.anchor.id}-${sub.level}`}
                    d={levelArc(sub) ?? ""}
                    fill={ALIGNMENT_COLORS[sub.level]}
                    stroke="#ffffff"
                    strokeWidth={1}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSubArcClick(w.row, sub.level);
                    }}
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      const subMid = (sub.startAngle + sub.endAngle) / 2;
                      setHoverInfo({
                        anchorId: w.row.anchor.id,
                        level: sub.level,
                        ...tooltipScreenPos(subMid, LEVEL_OUTER + 16),
                      });
                    }}
                  />
                ))}
                <AnchorLabel
                  text={w.row.anchor.sourceLabel || w.row.anchor.id}
                  midAngle={w.midAngle}
                />
              </g>
            );
          })}

          {/* Center label (inside the translated group so coords are 0,0-relative) */}
          <g style={{ pointerEvents: "none" }}>
            <circle cx={0} cy={0} r={CENTER_R} fill={anchorColor} opacity={0.95} />
            <text
              x={0}
              y={-6}
              textAnchor="middle"
              fill="#ffffff"
              style={{ fontSize: "15px", fontWeight: 700 }}
            >
              {anchorDocLabel}
            </text>
            <text
              x={0}
              y={12}
              textAnchor="middle"
              fill="#ffffff"
              opacity={0.85}
              style={{ fontSize: "10px" }}
            >
              {rows.length} ambitions
            </text>
            <text
              x={0}
              y={26}
              textAnchor="middle"
              fill="#ffffff"
              opacity={0.7}
              style={{ fontSize: "9px" }}
            >
              click a wedge to drill in
            </text>
          </g>
        </g>

        {/* Drilldown state */}
        {focused && (
          <g
            key={focused.row.anchor.id}
            className="focused-enter"
            transform={`translate(${CX},${CY})`}
            style={{
              opacity: focused ? 1 : 0,
              transition: "opacity 220ms ease-in-out",
            }}
          >
            <path
              d={focusedAnchorArc({ startAngle: 0, endAngle: Math.PI * 2 }) ?? ""}
              fill={
                focused.row.status
                  ? STATUS_TONE_FILL[focused.row.status.tone]
                  : ANCHOR_NEUTRAL_FILL
              }
              stroke="#ffffff"
              strokeWidth={2}
            />
            {focusedSubArcs.map((sub) => {
              const subMid = (sub.startAngle + sub.endAngle) / 2;
              const labelPos = pointForAngle(subMid, (LEVEL_INNER + LEVEL_OUTER) / 2);
              const labelDark = sub.level === "flagged" || sub.level === "low";
              const span = sub.endAngle - sub.startAngle;
              const showInlineLabel = span > 0.18; // skip text in tiny slices
              return (
                <g key={`focused-${sub.level}`}>
                  <path
                    d={focusedLevelArc(sub) ?? ""}
                    fill={ALIGNMENT_COLORS[sub.level]}
                    stroke="#ffffff"
                    strokeWidth={2}
                    style={{ cursor: "pointer" }}
                    onClick={() => onSubArcClick(focused.row, sub.level)}
                  >
                    <title>
                      {ALIGNMENT_LABELS[sub.level]}: {sub.count} record
                      {sub.count === 1 ? "" : "s"}. Click for details.
                    </title>
                  </path>
                  {showInlineLabel && (
                    <text
                      x={labelPos.x}
                      y={labelPos.y - 5}
                      textAnchor="middle"
                      fill={labelDark ? "#1f2937" : "#ffffff"}
                      style={{ fontSize: "12px", fontWeight: 600, pointerEvents: "none" }}
                    >
                      {ALIGNMENT_LABELS[sub.level]}
                    </text>
                  )}
                  {showInlineLabel && (
                    <text
                      x={labelPos.x}
                      y={labelPos.y + 11}
                      textAnchor="middle"
                      fill={labelDark ? "#1f2937" : "#ffffff"}
                      opacity={0.95}
                      style={{ fontSize: "11px", fontWeight: 500, pointerEvents: "none" }}
                    >
                      {sub.count}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Center: focused ambition info */}
            <g style={{ pointerEvents: "none" }}>
              <circle cx={0} cy={0} r={CENTER_R + 35} fill="#ffffff" opacity={0.97} stroke="#e5e7eb" strokeWidth={1} />
              <text
                x={0}
                y={-22}
                textAnchor="middle"
                fill={anchorColor}
                style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}
              >
                {focused.row.anchor.sourceLabel || focused.row.anchor.id}
              </text>
              {wrapText(focused.row.anchor.text, 26).slice(0, 4).map((line, idx) => (
                <text
                  key={idx}
                  x={0}
                  y={-6 + idx * 13}
                  textAnchor="middle"
                  fill="#1f2937"
                  style={{ fontSize: "10px" }}
                >
                  {line}
                </text>
              ))}
            </g>
          </g>
        )}
      </svg>

      {/* Drilldown header — back button + status + see-all link */}
      {focused && (
        <div className="absolute top-2 right-2 left-2 flex items-start justify-between gap-3 z-10 pointer-events-none">
          <button
            type="button"
            onClick={() => setFocusedId(null)}
            className="text-xs px-3 py-1.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 text-[var(--undp-gray)] shadow-sm pointer-events-auto"
          >
            ← Back to overview
          </button>
          <div className="flex flex-col items-end gap-1.5 pointer-events-auto">
            {focused.row.status && (
              <span
                className="text-[11px] font-medium rounded border px-2 py-1 bg-white shadow-sm"
                style={{ borderColor: "#e5e7eb" }}
                title={focused.row.status.description}
              >
                {focused.row.status.label}
              </span>
            )}
            <button
              type="button"
              onClick={() => onViewAllRecords(focused.row)}
              className="text-[11px] text-[var(--undp-blue)] hover:underline bg-white px-2 py-1 rounded border border-gray-200 shadow-sm"
            >
              See all {focused.row.totalRecords} peripheral records →
            </button>
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {hoverInfo && !focused && (() => {
        const row = rows.find((r) => r.anchor.id === hoverInfo.anchorId);
        if (!row) return null;
        return (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 max-w-xs pointer-events-none text-xs"
            style={{ left: hoverInfo.x, top: hoverInfo.y, transform: "translate(-50%, -100%)" }}
          >
            <p className="font-semibold text-[var(--undp-black)] mb-0.5">
              {row.anchor.sourceLabel || row.anchor.id}
            </p>
            {hoverInfo.level ? (
              <p className="leading-tight">
                <span style={{ color: ALIGNMENT_COLORS[hoverInfo.level], fontWeight: 600 }}>
                  {ALIGNMENT_LABELS[hoverInfo.level]}
                </span>
                : {row.totalsByLevel[hoverInfo.level] ?? 0} record
                {(row.totalsByLevel[hoverInfo.level] ?? 0) === 1 ? "" : "s"}
                <br />
                <span className="text-[var(--undp-gray)] text-[11px] italic">click for details</span>
              </p>
            ) : (
              <p className="leading-tight text-[var(--undp-gray)]">
                {row.totalRecords} relationship{row.totalRecords === 1 ? "" : "s"}
                {row.status && (
                  <>
                    <br />
                    <span className="text-[var(--undp-black)] font-medium">{row.status.label}</span>
                  </>
                )}
                <br />
                <span className="italic text-[11px]">click to drill in</span>
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/** Position labels just outside the outer ring. Horizontal text.
    Coords are 0,0-relative because this lives inside the translated chart group. */
function AnchorLabel({ text, midAngle }: { text: string; midAngle: number }) {
  const std = midAngle - Math.PI / 2;
  const lx = Math.cos(std) * LABEL_R;
  const ly = Math.sin(std) * LABEL_R;

  // Choose textAnchor based on which side of the chart we're on so labels
  // grow away from the chart, not into it.
  const isTop = midAngle < 0.18 || midAngle > Math.PI * 2 - 0.18;
  const isBottom = Math.abs(midAngle - Math.PI) < 0.18;
  const isRight = midAngle > 0 && midAngle < Math.PI;
  const textAnchor: "start" | "middle" | "end" = isTop || isBottom ? "middle" : isRight ? "start" : "end";

  const truncated = text.length > 18 ? `${text.slice(0, 16)}…` : text;
  return (
    <text
      x={lx}
      y={ly}
      textAnchor={textAnchor}
      dominantBaseline="middle"
      fill="#374151"
      style={{ fontSize: "10px", fontWeight: 500, pointerEvents: "none" }}
    >
      {truncated}
    </text>
  );
}

/** Word-wrap helper for the focused-state center label. */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
