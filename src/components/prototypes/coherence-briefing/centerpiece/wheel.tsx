"use client";

/**
 * WheelCenterpiece — re-extracted from `policy-coherence-explorer.tsx`,
 * stripped to the bare visual. No filters, no mode toggles, no chat. The
 * scrollytell text around it does the explaining.
 *
 * Phase A renders document-grouped targets with chords coloured by
 * alignment. Phase B will add the build-up animation driven by `buildup`,
 * plus optional click-to-drill-into-pair.
 */

import { useMemo, useState } from "react";
import { arc as d3arc } from "d3-shape";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  getDocColor,
  getDocMediumLabel,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import type {
  AlignmentResult,
  CountryConfig,
  PolicyDocumentType,
  Target,
} from "@/types";

// ─── Geometry constants (kept in sync with the source explorer) ─────

const VB = 720;
const VB_W = 940;
const OUTER_R = 225;
const INNER_R = 218;
const NODE_R = 210;
const GAP = 0.08;

interface NodePos {
  id: string;
  target: Target;
  groupId: PolicyDocumentType;
  angle: number;
  x: number;
  y: number;
}

interface GroupArc {
  id: PolicyDocumentType;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  label: string;
  color: string;
  count: number;
}

function curvePath(ax: number, ay: number, bx: number, by: number) {
  const cx = ((ax + bx) / 2) * 0.25;
  const cy = ((ay + by) / 2) * 0.25;
  return `M${ax},${ay} Q${cx},${cy} ${bx},${by}`;
}

interface BuildLayoutResult {
  nodes: NodePos[];
  arcs: GroupArc[];
}

function buildLayout(
  targets: Target[],
  countryConfig: CountryConfig | null,
): BuildLayoutResult {
  // Group by source document so the rim reads as "policy A vs policy B".
  const byDoc = new Map<PolicyDocumentType, Target[]>();
  for (const t of targets) {
    const list = byDoc.get(t.sourceDocument) ?? [];
    list.push(t);
    byDoc.set(t.sourceDocument, list);
  }
  const groups = Array.from(byDoc.entries()).map(([d, ts]) => ({
    id: d,
    label: getDocMediumLabel(countryConfig, d),
    color: getDocColor(countryConfig, d),
    targets: ts,
  }));
  if (groups.length === 0) return { nodes: [], arcs: [] };

  const total = groups.reduce((s, g) => s + g.targets.length, 0);
  const avail = 2 * Math.PI - GAP * groups.length;
  const nodes: NodePos[] = [];
  const arcs: GroupArc[] = [];
  let cur = 0;
  for (const g of groups) {
    const span = (g.targets.length / total) * avail;
    const start = cur;
    const end = cur + span;
    const mid = (start + end) / 2;
    arcs.push({
      id: g.id,
      startAngle: start,
      endAngle: end,
      midAngle: mid,
      label: g.label,
      color: g.color,
      count: g.targets.length,
    });
    const n = g.targets.length;
    const pad = span * 0.04;
    const nodeSpan = span - 2 * pad;
    for (let i = 0; i < n; i++) {
      const a =
        start + pad + (n > 1 ? (i / (n - 1)) * nodeSpan : nodeSpan / 2);
      nodes.push({
        id: g.targets[i].id,
        target: g.targets[i],
        groupId: g.id,
        angle: a,
        x: NODE_R * Math.sin(a),
        y: -NODE_R * Math.cos(a),
      });
    }
    cur = end + GAP;
  }
  return { nodes, arcs };
}

export interface WheelCenterpieceProps {
  targets: Target[];
  alignments: AlignmentResult[];
  countryConfig: CountryConfig | null;
  /** 0 → 1, drives chord opacity for the Scene 3 build-up. */
  buildup?: number;
  onPairClick?: (a: string, b: string) => void;
}

export function WheelCenterpiece({
  targets,
  alignments,
  countryConfig,
  buildup = 1,
  onPairClick,
}: WheelCenterpieceProps) {
  const { nodes, arcs } = useMemo(
    () => buildLayout(targets, countryConfig),
    [targets, countryConfig],
  );
  const nodeMap = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );
  const arcGen = useMemo(
    () => d3arc<{ startAngle: number; endAngle: number }>().innerRadius(INNER_R).outerRadius(OUTER_R),
    [],
  );

  const [hovered, setHovered] = useState<AlignmentResult | null>(null);

  // Split alignments into ambient (everything non-"none") and skip those
  // whose endpoints aren't on the rim (defensive — measure_align rows can
  // reference ids the wheel doesn't show).
  const visibleAlignments = useMemo(
    () =>
      alignments.filter(
        (a) =>
          a.alignment !== "none" &&
          nodeMap.has(a.targetAId) &&
          nodeMap.has(a.targetBId),
      ),
    [alignments, nodeMap],
  );

  // Render contradictions over alignments so the red signal isn't buried under
  // green volume. Sort once per alignment list.
  const orderedAlignments = useMemo(() => {
    const aligns: AlignmentResult[] = [];
    const tensions: AlignmentResult[] = [];
    for (const a of visibleAlignments) {
      if (isContradiction(a.alignment)) tensions.push(a);
      else aligns.push(a);
    }
    return [...aligns, ...tensions];
  }, [visibleAlignments]);

  const clampedBuildup = Math.max(0, Math.min(1, buildup));

  return (
    <div className="w-full flex justify-center">
      <svg
        viewBox={`${-VB_W / 2} ${-VB / 2} ${VB_W} ${VB}`}
        className="w-full"
        style={{ maxHeight: 640 }}
        role="img"
        aria-label="Policy coherence wheel: targets on the rim, chords showing alignments and tensions between them"
      >
        {/* Subtle guide ring */}
        <circle
          cx={0}
          cy={0}
          r={NODE_R}
          fill="none"
          stroke="#e7e5e0"
          strokeWidth={1}
          strokeDasharray="3 5"
        />

        {/* Rim arcs grouped by source document */}
        {arcs.map((arc) => {
          const d = arcGen({
            startAngle: arc.startAngle,
            endAngle: arc.endAngle,
          });
          if (!d) return null;
          return (
            <g key={arc.id}>
              <path d={d} fill={arc.color} opacity={0.85} />
              <title>{`${arc.label} · ${arc.count} targets`}</title>
            </g>
          );
        })}

        {/* Chords */}
        {orderedAlignments.map((conn) => {
          const nA = nodeMap.get(conn.targetAId);
          const nB = nodeMap.get(conn.targetBId);
          if (!nA || !nB) return null;
          const contra = isContradiction(conn.alignment);
          const key = `${conn.targetAId}__${conn.targetBId}`;
          const baseOpacity = contra
            ? conn.alignment === "likely_conflict"
              ? 0.85
              : 0.7
            : conn.alignment === "high"
              ? 0.55
              : conn.alignment === "medium"
                ? 0.35
                : 0.18;
          const isHovered =
            hovered &&
            hovered.targetAId === conn.targetAId &&
            hovered.targetBId === conn.targetBId;
          return (
            <path
              key={key}
              d={curvePath(nA.x, nA.y, nB.x, nB.y)}
              fill="none"
              stroke={ALIGNMENT_COLORS[conn.alignment]}
              strokeWidth={
                isHovered
                  ? 3
                  : contra
                    ? 1.8
                    : conn.alignment === "high"
                      ? 1.4
                      : 1
              }
              strokeDasharray={contra ? "5 3" : "none"}
              opacity={baseOpacity * clampedBuildup}
              strokeLinecap="round"
              className={onPairClick ? "cursor-pointer" : undefined}
              onMouseEnter={() => setHovered(conn)}
              onMouseLeave={() => setHovered(null)}
              onClick={
                onPairClick
                  ? () => onPairClick(conn.targetAId, conn.targetBId)
                  : undefined
              }
            />
          );
        })}

        {/* Nodes on the rim. Small static circles — no variable sizes,
            per feedback. */}
        {nodes.map((node) => {
          const docColor = getDocColor(
            countryConfig,
            node.target.sourceDocument,
          );
          return (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={2.4}
              fill={docColor}
              opacity={0.9}
            />
          );
        })}

        {/* Group labels around the rim */}
        {arcs.map((arc) => {
          const labelR = 248;
          const x = labelR * Math.sin(arc.midAngle);
          const y = -labelR * Math.cos(arc.midAngle);
          const deg = (arc.midAngle * 180) / Math.PI;
          const anchor: "start" | "middle" | "end" =
            deg > 20 && deg < 160
              ? "start"
              : deg > 200 && deg < 340
                ? "end"
                : "middle";
          return (
            <text
              key={`label-${arc.id}`}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="central"
              fontSize={11}
              fontWeight={500}
              fill="var(--undp-black)"
              className="select-none pointer-events-none"
            >
              {arc.label}
            </text>
          );
        })}
      </svg>

      {/* Hover read-out — tiny label below the SVG so it doesn't overlay */}
      <div
        className="sr-only"
        aria-live="polite"
      >
        {hovered
          ? `${ALIGNMENT_LABELS[hovered.alignment]}: ${hovered.targetAId} and ${hovered.targetBId}`
          : ""}
      </div>
    </div>
  );
}
