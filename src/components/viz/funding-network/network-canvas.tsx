"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { NetworkNode, NetworkLink, ClusterMeta } from "./use-cluster-network-data";
import { ALIGNMENT_COLORS, getDocColor } from "@/lib/utils";
import type { CountryConfig } from "@/types";

interface NetworkCanvasProps {
  nodes: NetworkNode[];
  adjacency: Map<string, NetworkLink[]>;
  clusterTargets: Map<string, NetworkNode[]>;
  clusterMeta: ClusterMeta[];
  countryConfig: CountryConfig | null;
  width: number;
  height: number;
  tick: number;
  onNodeClick?: (node: NetworkNode) => void;
}

export function NetworkCanvas({
  nodes,
  adjacency,
  clusterTargets,
  clusterMeta,
  countryConfig,
  width,
  height,
  tick,
  onNodeClick,
}: NetworkCanvasProps) {
  const t = useTranslations("viz.fundingNetwork");
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);

  const nodeById = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  // Strong-alignment edges from the hovered node — these light up on hover
  // to surface coherence relationships across funding clusters.
  const hoverEdges = useMemo(() => {
    if (!hoveredNode) return [];
    const all = adjacency.get(hoveredNode.id) ?? [];
    return all.filter((l) => l.level === "high");
  }, [hoveredNode, adjacency]);

  const hoverNeighborIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of hoverEdges) {
      ids.add(l.source);
      ids.add(l.target);
    }
    return ids;
  }, [hoverEdges]);

  // Cluster labels: pushed outward from each cluster's centroid in the
  // direction away from the graph center, so they don't overlap nodes.
  const clusterLabels = useMemo(() => {
    const graphCx = width / 2;
    const graphCy = height / 2;
    const labels: {
      id: string;
      meta: ClusterMeta;
      lx: number;
      ly: number;
      anchor: "start" | "middle" | "end";
    }[] = [];
    for (const meta of clusterMeta) {
      const group = clusterTargets.get(meta.id);
      if (!group || group.length === 0) continue;

      let cx = 0,
        cy = 0;
      for (const n of group) {
        cx += n.x;
        cy += n.y;
      }
      cx /= group.length;
      cy /= group.length;

      const dx = cx - graphCx;
      const dy = cy - graphCy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;

      let maxProj = -Infinity;
      let outerX = cx,
        outerY = cy;
      for (const n of group) {
        const proj = (n.x - cx) * dirX + (n.y - cy) * dirY;
        if (proj > maxProj) {
          maxProj = proj;
          outerX = n.x;
          outerY = n.y;
        }
      }

      const labelOffset = 22;
      const lx = outerX + dirX * labelOffset;
      const ly = outerY + dirY * labelOffset;

      const anchor =
        dx > 30 ? ("start" as const) : dx < -30 ? ("end" as const) : ("middle" as const);

      labels.push({ id: meta.id, meta, lx, ly, anchor });
    }
    return labels;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterMeta, clusterTargets, width, height, tick]);

  const handleNodeEnter = useCallback((n: NetworkNode) => {
    setHoveredNode(n);
  }, []);
  const handleNodeLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  if (width === 0 || height === 0) return null;

  return (
    <svg width={width} height={height} className="block" style={{ userSelect: "none" }}>
      {/* Cluster labels */}
      <g>
        {clusterLabels.map((cl) => (
          <text
            key={cl.id}
            x={cl.lx}
            y={cl.ly}
            textAnchor={cl.anchor}
            dominantBaseline="central"
            className="pointer-events-none select-none"
            fill={cl.meta.color}
            fontSize={9}
            fontWeight={600}
            opacity={0.75}
          >
            {cl.meta.label.length > 28 ? cl.meta.label.slice(0, 25) + "…" : cl.meta.label}
          </text>
        ))}
      </g>

      {/* Hover edges — strong alignment connections for the hovered node */}
      {hoveredNode && (
        <g>
          {hoverEdges.map((l, i) => {
            const src = nodeById.get(l.source);
            const tgt = nodeById.get(l.target);
            if (!src || !tgt) return null;
            return (
              <line
                key={`hover-${i}`}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={ALIGNMENT_COLORS.high}
                strokeOpacity={0.4}
                strokeWidth={1.2}
                className="pointer-events-none"
              />
            );
          })}
        </g>
      )}

      {/* Nodes */}
      <g>
        {nodes.map((n) => {
          const isHovered = hoveredNode?.id === n.id;
          const isConnected = hoveredNode != null && hoverNeighborIds.has(n.id);
          const dimmed = hoveredNode !== null && !isHovered && !isConnected;
          const docColor = getDocColor(countryConfig, n.target.sourceDocument);

          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              onMouseEnter={() => handleNodeEnter(n)}
              onMouseLeave={handleNodeLeave}
              onClick={() => onNodeClick?.(n)}
              className="cursor-pointer"
              role="button"
              aria-label={`${n.target.sourceLabel}: ${n.target.text.slice(0, 80)}`}
            >
              <circle
                r={isHovered ? n.radius + 2 : n.radius}
                fill={n.color}
                fillOpacity={dimmed ? 0.1 : n.fundingIntensity}
                stroke={isHovered ? "#1e293b" : docColor}
                strokeWidth={isHovered ? 2 : 1.5}
                className="transition-all duration-150"
              />
              <circle r={2.5} fill={docColor} opacity={dimmed ? 0.15 : 0.9} />
            </g>
          );
        })}
      </g>

      {/* Hover tooltip */}
      {hoveredNode && (
        <g
          transform={`translate(${Math.min(hoveredNode.x + 15, width - 210)},${Math.max(hoveredNode.y - 10, 20)})`}
          className="pointer-events-none"
        >
          <rect
            x={0}
            y={-14}
            width={200}
            height={66}
            rx={6}
            fill="white"
            stroke="#e2e8f0"
            strokeWidth={1}
            filter="drop-shadow(0 1px 3px rgba(0,0,0,0.1))"
          />
          <text x={6} y={0} fontSize={10} fontWeight={600} fill="#1e293b">
            {hoveredNode.target.sourceLabel}
          </text>
          <text x={6} y={14} fontSize={9} fill="#64748b">
            {hoveredNode.target.text.slice(0, 55)}
            {hoveredNode.target.text.length > 55 ? "…" : ""}
          </text>
          <text x={6} y={28} fontSize={9} fill={hoveredNode.color} fontWeight={600}>
            {(() => {
              const n = hoveredNode.programScores.length;
              if (n === 0) return t("tooltip.noBudgetBacking");
              return hoveredNode.isFunded
                ? t("tooltip.budgetProgrammes", { count: n })
                : t("tooltip.weaklyAlignedProgrammes", { count: n });
            })()}
          </text>
          <text x={6} y={42} fontSize={9} fill="#64748b">
            {hoverEdges.length > 0
              ? t("tooltip.stronglyAlignedTargets", { count: hoverEdges.length })
              : t("tooltip.noStrongAlignments")}
          </text>
        </g>
      )}
    </svg>
  );
}
