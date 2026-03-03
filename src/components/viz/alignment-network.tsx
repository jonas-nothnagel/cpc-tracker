"use client";

import { useState, useMemo } from "react";
import { isContradiction } from "@/types";
import type { AlignmentResult, AlignmentLevel, Target, PolicyDocumentType } from "@/types";
import { DOC_COLORS, ALIGNMENT_COLORS, ALIGNMENT_LABELS } from "@/lib/utils";
import { TargetTextWithHighlights } from "./target-text";

interface AlignmentNetworkProps {
  alignmentData: AlignmentResult[];
  targets: Target[];
  title: string;
  subtitle?: string;
  /** Max number of nodes to display (most connected first) */
  maxNodes?: number;
}

const ALIGNMENT_EDGE_COLORS: Record<AlignmentLevel, string> = {
  high_contradiction: ALIGNMENT_COLORS.high_contradiction,
  moderate_contradiction: ALIGNMENT_COLORS.moderate_contradiction,
  low_tension: ALIGNMENT_COLORS.low_tension,
  none: "transparent",
  low: "#c6e48b",
  medium: "#7bc96f",
  high: "#196127",
};

const ALIGNMENT_EDGE_WIDTH: Record<AlignmentLevel, number> = {
  high_contradiction: 2.5,
  moderate_contradiction: 2,
  low_tension: 2,
  none: 0,
  low: 2,
  medium: 2,
  high: 2.5,
};

const ALIGNMENT_EDGE_DASH: Record<AlignmentLevel, string> = {
  high_contradiction: "6 3",
  moderate_contradiction: "6 3",
  low_tension: "4 4",
  none: "none",
  low: "4 4",
  medium: "8 4",
  high: "none",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  NBSAP: "NBTs",
  NDC: "NDC targets",
  NAP: "NAP targets",
};

/**
 * Circular network graph showing target alignment relationships.
 * Nodes = targets, edges = alignment connections.
 * Node color = document type, edge color = alignment level.
 * Most connected targets are displayed.
 */
export function AlignmentNetwork({
  alignmentData,
  targets,
  title,
  subtitle,
  maxNodes = 12,
}: AlignmentNetworkProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{
    targetA: string;
    targetB: string;
    alignment: AlignmentLevel;
    description: string;
    x: number;
    y: number;
  } | null>(null);

  const targetMap = useMemo(
    () => new Map(targets.map((t) => [t.id, t])),
    [targets]
  );

  // Compute connectivity counts per target
  const { selectedTargets, adjacencyMap } = useMemo(() => {
    const counts = new Map<string, number>();
    const adj = new Map<string, AlignmentResult[]>();

    for (const a of alignmentData) {
      counts.set(a.targetAId, (counts.get(a.targetAId) ?? 0) + 1);
      counts.set(a.targetBId, (counts.get(a.targetBId) ?? 0) + 1);

      if (!adj.has(a.targetAId)) adj.set(a.targetAId, []);
      if (!adj.has(a.targetBId)) adj.set(a.targetBId, []);
      adj.get(a.targetAId)!.push(a);
      adj.get(a.targetBId)!.push(a);
    }

    // Sort by connection count, take top N
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxNodes)
      .map(([id]) => id);

    const selectedSet = new Set(sorted);
    const selected = sorted
      .map((id) => targetMap.get(id))
      .filter((t): t is Target => !!t);

    // Filter edges to only those between selected nodes
    const filteredAdj = new Map<string, AlignmentResult[]>();
    for (const id of sorted) {
      const edges = (adj.get(id) ?? []).filter(
        (a) => selectedSet.has(a.targetAId) && selectedSet.has(a.targetBId)
      );
      filteredAdj.set(id, edges);
    }

    return { selectedTargets: selected, adjacencyMap: filteredAdj };
  }, [alignmentData, targetMap, maxNodes]);

  // Edges between selected targets (deduplicated)
  const edges = useMemo(() => {
    const seen = new Set<string>();
    const result: AlignmentResult[] = [];
    const selectedIds = new Set(selectedTargets.map((t) => t.id));

    for (const a of alignmentData) {
      if (!selectedIds.has(a.targetAId) || !selectedIds.has(a.targetBId))
        continue;
      const key = [a.targetAId, a.targetBId].sort().join("__");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(a);
    }
    return result;
  }, [alignmentData, selectedTargets]);

  // Layout constants
  const width = 600;
  const height = 600;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 220;
  const labelRadius = 260;

  // Node positions (circular layout)
  const nodePositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; angle: number }>();
    const n = selectedTargets.length;

    // Start at top (-π/2) and go clockwise
    selectedTargets.forEach((t, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      positions.set(t.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        angle,
      });
    });
    return positions;
  }, [selectedTargets, cx, cy, radius]);

  // Node sizes based on connectivity
  const nodeSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const t of selectedTargets) {
      const count = (adjacencyMap.get(t.id) ?? []).length;
      // Scale between 8 and 20
      const size = Math.max(8, Math.min(20, 6 + count * 1.5));
      sizes.set(t.id, size);
    }
    return sizes;
  }, [selectedTargets, adjacencyMap]);

  // Determine which edges to highlight
  const highlightedEdges = useMemo(() => {
    if (!hoveredNode) return null;
    return new Set(
      edges
        .filter((e) => e.targetAId === hoveredNode || e.targetBId === hoveredNode)
        .map((e) => [e.targetAId, e.targetBId].sort().join("__"))
    );
  }, [hoveredNode, edges]);

  // Determine connected nodes for highlighting
  const connectedNodes = useMemo(() => {
    if (!hoveredNode) return null;
    const connected = new Set<string>();
    connected.add(hoveredNode);
    for (const e of edges) {
      if (e.targetAId === hoveredNode) connected.add(e.targetBId);
      if (e.targetBId === hoveredNode) connected.add(e.targetAId);
    }
    return connected;
  }, [hoveredNode, edges]);

  // Unique document types in selected targets for legend
  const docTypes = useMemo(() => {
    const types = new Set(selectedTargets.map((t) => t.sourceDocument));
    return [...types];
  }, [selectedTargets]);

  return (
    <div>
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-[var(--undp-black)]">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-[var(--undp-gray)]">{subtitle}</p>
        )}
      </div>

      {/* Legends */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs mb-4">
        {/* Document type legend */}
        <div className="flex flex-wrap gap-3 items-center">
          {docTypes.map((dt) => (
            <div key={dt} className="flex items-center gap-1.5">
              <span
                className="w-3.5 h-3.5 rounded-full inline-block"
                style={{ backgroundColor: DOC_COLORS[dt] }}
              />
              <span className="text-[var(--undp-gray)]">
                {DOC_TYPE_LABELS[dt] ?? dt}
              </span>
            </div>
          ))}
        </div>
        {/* Alignment legend */}
        <div className="flex flex-wrap gap-3 items-center">
          {(["high", "medium", "low"] as AlignmentLevel[]).map((level) => (
            <div key={level} className="flex items-center gap-1.5">
              <svg width={28} height={8} className="shrink-0">
                <line
                  x1={0}
                  y1={4}
                  x2={28}
                  y2={4}
                  stroke={ALIGNMENT_EDGE_COLORS[level]}
                  strokeWidth={ALIGNMENT_EDGE_WIDTH[level]}
                  strokeDasharray={ALIGNMENT_EDGE_DASH[level]}
                />
              </svg>
              <span className="text-[var(--undp-gray)] capitalize">{level} alignment</span>
            </div>
          ))}
          {(["low_tension", "high_contradiction"] as AlignmentLevel[]).map((level) => (
            <div key={level} className="flex items-center gap-1.5">
              <svg width={28} height={8} className="shrink-0">
                <line
                  x1={0}
                  y1={4}
                  x2={28}
                  y2={4}
                  stroke={ALIGNMENT_EDGE_COLORS[level]}
                  strokeWidth={ALIGNMENT_EDGE_WIDTH[level]}
                  strokeDasharray={ALIGNMENT_EDGE_DASH[level]}
                />
              </svg>
              <span className="text-[var(--undp-gray)]">{ALIGNMENT_LABELS[level]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SVG Network */}
      <div className="flex justify-center overflow-hidden">
        <svg
          viewBox={`-40 0 ${width + 80} ${height}`}
          className="w-full max-w-[600px]"
        >
          {/* Dashed circle boundary */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={1}
            strokeDasharray="6 4"
          />

          {/* Edges */}
          {edges.map((e) => {
            const posA = nodePositions.get(e.targetAId);
            const posB = nodePositions.get(e.targetBId);
            if (!posA || !posB) return null;

            const key = [e.targetAId, e.targetBId].sort().join("__");
            const isHighlighted = highlightedEdges?.has(key) ?? false;
            const isDimmed = hoveredNode && !isHighlighted;

            // Curved edges — compute control point offset from center
            const midX = (posA.x + posB.x) / 2;
            const midY = (posA.y + posB.y) / 2;
            const dx = midX - cx;
            const dy = midY - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // Pull curves slightly inward for aesthetics
            const curveFactor = 0.25;
            const ctrlX = midX - dx * curveFactor;
            const ctrlY = midY - dy * curveFactor;

            return (
              <path
                key={key}
                d={`M ${posA.x} ${posA.y} Q ${ctrlX} ${ctrlY} ${posB.x} ${posB.y}`}
                fill="none"
                stroke={ALIGNMENT_EDGE_COLORS[e.alignment]}
                strokeWidth={
                  isHighlighted
                    ? ALIGNMENT_EDGE_WIDTH[e.alignment] + 1
                    : ALIGNMENT_EDGE_WIDTH[e.alignment]
                }
                strokeDasharray={ALIGNMENT_EDGE_DASH[e.alignment]}
                opacity={isDimmed ? 0.12 : isHighlighted ? 1 : 0.65}
                className="transition-all duration-200"
                style={{ cursor: "pointer" }}
                onMouseEnter={(evt) => {
                  const svg = evt.currentTarget.closest("svg");
                  if (!svg) return;
                  const pt = svg.createSVGPoint();
                  pt.x = evt.clientX;
                  pt.y = evt.clientY;
                  setHoveredEdge({
                    targetA: e.targetAId,
                    targetB: e.targetBId,
                    alignment: e.alignment,
                    description: e.description,
                    x: evt.clientX,
                    y: evt.clientY,
                  });
                }}
                onMouseLeave={() => setHoveredEdge(null)}
              />
            );
          })}

          {/* Nodes */}
          {selectedTargets.map((t) => {
            const pos = nodePositions.get(t.id);
            if (!pos) return null;
            const size = nodeSizes.get(t.id) ?? 10;
            const isConnected = connectedNodes?.has(t.id) ?? false;
            const isDimmed = hoveredNode && !isConnected;

            return (
              <g key={t.id}>
                {/* Hover ring */}
                {hoveredNode === t.id && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={size + 4}
                    fill="none"
                    stroke={DOC_COLORS[t.sourceDocument]}
                    strokeWidth={2}
                    opacity={0.4}
                  />
                )}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={size}
                  fill={DOC_COLORS[t.sourceDocument]}
                  stroke="white"
                  strokeWidth={2}
                  opacity={isDimmed ? 0.2 : 1}
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredNode(t.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                />
              </g>
            );
          })}

          {/* Labels */}
          {selectedTargets.map((t) => {
            const pos = nodePositions.get(t.id);
            if (!pos) return null;

            // Position label outside the circle
            const labelX = cx + labelRadius * Math.cos(pos.angle);
            const labelY = cy + labelRadius * Math.sin(pos.angle);

            // Determine text anchor based on position
            const angleDeg = (pos.angle * 180) / Math.PI;
            let anchor: "start" | "middle" | "end" = "middle";
            if (angleDeg > -80 && angleDeg < 80) anchor = "start";
            else if (angleDeg > 100 || angleDeg < -100) anchor = "end";

            const isConnected = connectedNodes?.has(t.id) ?? false;
            const isDimmed = hoveredNode && !isConnected;

            return (
              <text
                key={`label-${t.id}`}
                x={labelX}
                y={labelY}
                textAnchor={anchor}
                dominantBaseline="middle"
                className="text-[11px] transition-all duration-200 cursor-pointer select-none"
                fill={isDimmed ? "#cbd5e1" : "#64748b"}
                fontWeight={hoveredNode === t.id ? 600 : 400}
                onMouseEnter={() => setHoveredNode(t.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {t.sourceDocument === "NBSAP"
                  ? `NBSAP ${t.sourceLabel}`
                  : t.sourceDocument === "NDC"
                  ? `NDC ${t.sourceLabel}`
                  : `NAP ${t.sourceLabel}`}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Edge tooltip */}
      {hoveredEdge && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs pointer-events-none"
          style={{
            left: hoveredEdge.x,
            top: hoveredEdge.y - 10,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-5 h-1 rounded inline-block"
              style={{
                backgroundColor: ALIGNMENT_EDGE_COLORS[hoveredEdge.alignment],
              }}
            />
            <span
              className="text-xs font-semibold"
              style={{
                color: ALIGNMENT_EDGE_COLORS[hoveredEdge.alignment],
              }}
            >
              {ALIGNMENT_LABELS[hoveredEdge.alignment]}
            </span>
          </div>
          <p className="text-xs text-[var(--undp-black)] font-medium">
            {targetMap.get(hoveredEdge.targetA)?.sourceLabel ?? hoveredEdge.targetA}
            {" ↔ "}
            {targetMap.get(hoveredEdge.targetB)?.sourceLabel ?? hoveredEdge.targetB}
          </p>
          {hoveredEdge.description && (
            <p className="text-xs text-[var(--undp-gray)] mt-1 leading-relaxed">
              {hoveredEdge.description}
            </p>
          )}
        </div>
      )}

      {/* Node tooltip */}
      {hoveredNode && !hoveredEdge && (() => {
        const t = targetMap.get(hoveredNode);
        const pos = nodePositions.get(hoveredNode);
        if (!t || !pos) return null;
        const connections = (adjacencyMap.get(hoveredNode) ?? []).length;

        return (
          <div className="mt-4 bg-[var(--undp-light)] border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: DOC_COLORS[t.sourceDocument] }}
              />
              <span className="text-xs font-semibold text-[var(--undp-black)]">
                {t.sourceDocument === "NBSAP" ? "NBSAP" : t.sourceDocument}{" "}
                {t.sourceLabel}
              </span>
              <span className="text-xs text-[var(--undp-gray)]">
                · {connections} connection{connections !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="text-xs text-[var(--undp-gray)] leading-relaxed">
              <TargetTextWithHighlights target={t} />
            </p>
          </div>
        );
      })()}
    </div>
  );
}

