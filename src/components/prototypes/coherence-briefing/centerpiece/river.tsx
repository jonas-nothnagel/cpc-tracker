"use client";

/**
 * River braids centerpiece — each policy document gets a horizontal lane.
 * Targets are dots along the lane. Cross-document pairs draw a thin diagonal
 * between the two target dots; red for tension, green for alignment.
 *
 * Most editorial of the four variants. Reads as "where do the streams flow
 * together, where do they collide".
 *
 * Same-document pairs are intentionally hidden — the value of this view is
 * inter-document friction, and intra-doc lines would clutter each lane.
 */

import { useMemo } from "react";
import { ALIGNMENT_COLORS, getDocColor, getDocMediumLabel } from "@/lib/utils";
import { isContradiction } from "@/types";
import type {
  AlignmentResult,
  CountryConfig,
  PolicyDocumentType,
  Target,
} from "@/types";

const VB_W = 940;
const VB = 620;
const PAD_LEFT = 130;
const PAD_RIGHT = 30;
const PAD_TOP = 40;
const PAD_BOTTOM = 30;
const PLOT_W = VB_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = VB - PAD_TOP - PAD_BOTTOM;

interface DocLane {
  doc: PolicyDocumentType;
  label: string;
  color: string;
  y: number;
  targets: Target[];
}

interface NodePos {
  id: string;
  x: number;
  y: number;
}

function buildLanes(
  targets: Target[],
  countryConfig: CountryConfig | null,
): { lanes: DocLane[]; positions: Map<string, NodePos> } {
  const byDoc = new Map<PolicyDocumentType, Target[]>();
  for (const t of targets) {
    const list = byDoc.get(t.sourceDocument) ?? [];
    list.push(t);
    byDoc.set(t.sourceDocument, list);
  }
  const docs = Array.from(byDoc.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );
  const laneCount = docs.length;
  const laneStep = laneCount > 1 ? PLOT_H / (laneCount - 1) : 0;
  const lanes: DocLane[] = docs.map(([doc, ts], i) => ({
    doc,
    label: getDocMediumLabel(countryConfig, doc),
    color: getDocColor(countryConfig, doc),
    y: PAD_TOP + i * laneStep,
    targets: ts,
  }));
  const positions = new Map<string, NodePos>();
  for (const lane of lanes) {
    const n = lane.targets.length;
    if (n === 0) continue;
    const pad = PLOT_W * 0.02;
    const span = PLOT_W - 2 * pad;
    for (let i = 0; i < n; i++) {
      const x = PAD_LEFT + pad + (n > 1 ? (i / (n - 1)) * span : span / 2);
      positions.set(lane.targets[i].id, { id: lane.targets[i].id, x, y: lane.y });
    }
  }
  return { lanes, positions };
}

export interface RiverCenterpieceProps {
  targets: Target[];
  alignments: AlignmentResult[];
  countryConfig: CountryConfig | null;
  buildup?: number;
}

export function RiverCenterpiece({
  targets,
  alignments,
  countryConfig,
  buildup = 1,
}: RiverCenterpieceProps) {
  const { lanes, positions } = useMemo(
    () => buildLanes(targets, countryConfig),
    [targets, countryConfig],
  );
  const targetDocMap = useMemo(() => {
    const m = new Map<string, PolicyDocumentType>();
    for (const t of targets) m.set(t.id, t.sourceDocument);
    return m;
  }, [targets]);

  const ordered = useMemo(() => {
    const aligns: AlignmentResult[] = [];
    const tensions: AlignmentResult[] = [];
    for (const a of alignments) {
      if (a.alignment === "none") continue;
      const dA = targetDocMap.get(a.targetAId);
      const dB = targetDocMap.get(a.targetBId);
      if (!dA || !dB) continue;
      if (dA === dB) continue;
      if (!positions.has(a.targetAId) || !positions.has(a.targetBId)) continue;
      if (isContradiction(a.alignment)) tensions.push(a);
      else aligns.push(a);
    }
    return [...aligns, ...tensions];
  }, [alignments, targetDocMap, positions]);

  const clampedBuildup = Math.max(0, Math.min(1, buildup));

  return (
    <div className="w-full flex justify-center">
      <svg
        viewBox={`0 0 ${VB_W} ${VB}`}
        className="w-full"
        style={{ maxHeight: 600 }}
        role="img"
        aria-label="River braids: one horizontal lane per policy document, with cross-document alignment and tension lines"
      >
        {/* Lane backgrounds */}
        {lanes.map((lane) => (
          <g key={`lane-${lane.doc}`}>
            <line
              x1={PAD_LEFT}
              y1={lane.y}
              x2={PAD_LEFT + PLOT_W}
              y2={lane.y}
              stroke={lane.color}
              strokeOpacity={0.25}
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 14}
              y={lane.y}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={500}
              fill="var(--undp-black)"
              className="select-none"
            >
              {lane.label}
            </text>
            <text
              x={PAD_LEFT - 14}
              y={lane.y + 13}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={9}
              fill="var(--undp-gray)"
              className="select-none"
            >
              {lane.targets.length} targets
            </text>
          </g>
        ))}

        {/* Cross-doc pair lines */}
        {ordered.map((conn) => {
          const a = positions.get(conn.targetAId);
          const b = positions.get(conn.targetBId);
          if (!a || !b) return null;
          const contra = isContradiction(conn.alignment);
          const op =
            (contra
              ? conn.alignment === "likely_conflict"
                ? 0.7
                : 0.55
              : conn.alignment === "high"
                ? 0.3
                : conn.alignment === "medium"
                  ? 0.18
                  : 0.08) * clampedBuildup;
          return (
            <line
              key={`${conn.targetAId}__${conn.targetBId}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={ALIGNMENT_COLORS[conn.alignment]}
              strokeWidth={contra ? 1.4 : conn.alignment === "high" ? 0.9 : 0.55}
              strokeOpacity={op}
              strokeLinecap="round"
              strokeDasharray={contra ? "4 3" : "none"}
            />
          );
        })}

        {/* Target dots */}
        {Array.from(positions.values()).map((p) => {
          const doc = targetDocMap.get(p.id);
          return (
            <circle
              key={`dot-${p.id}`}
              cx={p.x}
              cy={p.y}
              r={2.4}
              fill={doc ? getDocColor(countryConfig, doc) : "var(--undp-gray)"}
              opacity={0.95}
            />
          );
        })}
      </svg>
    </div>
  );
}
