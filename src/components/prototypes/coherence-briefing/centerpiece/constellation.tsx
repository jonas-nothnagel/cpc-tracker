"use client";

/**
 * Constellation centerpiece — every target a node in calm space, every pair
 * a thin line. Aligned pairs in green, tensions in red. The layout uses a
 * one-shot d3-force run (no live animation) clustered by source document so
 * the visual reads as policy-document "constellations" with bridges
 * between them.
 *
 * Static once mounted; deterministic for a given input.
 */

import { useMemo } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { ALIGNMENT_COLORS, getDocColor } from "@/lib/utils";
import { isContradiction } from "@/types";
import type {
  AlignmentResult,
  CountryConfig,
  PolicyDocumentType,
  Target,
} from "@/types";

const VB_W = 940;
const VB = 620;
const RADIUS = 2.2;

interface NodeDatum extends SimulationNodeDatum {
  id: string;
  doc: PolicyDocumentType;
}

interface LinkDatum extends SimulationLinkDatum<NodeDatum> {
  source: string | NodeDatum;
  target: string | NodeDatum;
}

interface LayoutResult {
  nodes: Map<string, { x: number; y: number; doc: PolicyDocumentType }>;
  docCenters: Map<PolicyDocumentType, { x: number; y: number }>;
}

function buildLayout(
  targets: Target[],
  alignment: AlignmentResult[],
  width: number,
  height: number,
): LayoutResult {
  const nodes: NodeDatum[] = targets.map((t) => ({
    id: t.id,
    doc: t.sourceDocument,
  }));

  // Anchor each document to a position around a circle so the constellation
  // has clear "regions" but the simulation can still let nodes breathe.
  const docs = Array.from(new Set(targets.map((t) => t.sourceDocument)));
  const docCenters = new Map<PolicyDocumentType, { x: number; y: number }>();
  const r = Math.min(width, height) * 0.32;
  docs.forEach((d, i) => {
    const angle = (i / docs.length) * Math.PI * 2;
    docCenters.set(d, {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    });
  });

  // Only use strong+medium alignments as link forces; tensions are visual
  // only, not gravitational (so the constellation doesn't get pulled apart
  // by tensions, which would muddle the metaphor).
  //
  // The alignment payload includes BTR/BER pseudo-target pairs which the
  // orchestrator filters out before render. forceLink throws if a link
  // endpoint can't resolve, so drop any pair whose ids aren't on the rim.
  const nodeIds = new Set(nodes.map((n) => n.id));
  const linkPairs = alignment.filter(
    (a) =>
      (a.alignment === "high" || a.alignment === "medium") &&
      nodeIds.has(a.targetAId) &&
      nodeIds.has(a.targetBId),
  );
  const links: LinkDatum[] = linkPairs.map((a) => ({
    source: a.targetAId,
    target: a.targetBId,
  }));

  const sim = forceSimulation<NodeDatum>(nodes)
    .force("center", forceCenter(0, 0))
    .force("charge", forceManyBody<NodeDatum>().strength(-9))
    .force("collide", forceCollide<NodeDatum>().radius(RADIUS + 1.5))
    .force(
      "doc",
      // Pull each node toward its document center for the cluster effect.
      (alpha: number) => {
        for (const n of nodes) {
          const c = docCenters.get(n.doc);
          if (!c) continue;
          n.vx = (n.vx ?? 0) + (c.x - (n.x ?? 0)) * 0.05 * alpha;
          n.vy = (n.vy ?? 0) + (c.y - (n.y ?? 0)) * 0.05 * alpha;
        }
      },
    )
    .force(
      "link",
      forceLink<NodeDatum, LinkDatum>(links)
        .id((d) => d.id)
        .distance(28)
        .strength(0.04),
    )
    .stop();

  // Run a fixed number of ticks synchronously so the layout is
  // deterministic and we can render the SVG immediately.
  for (let i = 0; i < 220; i++) sim.tick();

  const positions = new Map<
    string,
    { x: number; y: number; doc: PolicyDocumentType }
  >();
  for (const n of nodes) {
    positions.set(n.id, {
      x: n.x ?? 0,
      y: n.y ?? 0,
      doc: n.doc,
    });
  }
  return { nodes: positions, docCenters };
}

export interface ConstellationCenterpieceProps {
  targets: Target[];
  alignments: AlignmentResult[];
  countryConfig: CountryConfig | null;
  buildup?: number;
}

export function ConstellationCenterpiece({
  targets,
  alignments,
  countryConfig,
  buildup = 1,
}: ConstellationCenterpieceProps) {
  const { nodes, docCenters } = useMemo(
    () => buildLayout(targets, alignments, VB_W, VB),
    [targets, alignments],
  );

  // Same render order as the wheel: alignments first, tensions over.
  const orderedAlignments = useMemo(() => {
    const aligns: AlignmentResult[] = [];
    const tensions: AlignmentResult[] = [];
    for (const a of alignments) {
      if (a.alignment === "none") continue;
      if (!nodes.has(a.targetAId) || !nodes.has(a.targetBId)) continue;
      if (isContradiction(a.alignment)) tensions.push(a);
      else aligns.push(a);
    }
    return [...aligns, ...tensions];
  }, [alignments, nodes]);

  const clampedBuildup = Math.max(0, Math.min(1, buildup));

  return (
    <div className="w-full flex justify-center">
      <svg
        viewBox={`${-VB_W / 2} ${-VB / 2} ${VB_W} ${VB}`}
        className="w-full"
        style={{ maxHeight: 600 }}
        role="img"
        aria-label="Policy coherence constellation: targets as nodes clustered by source document, with arcs for alignments and tensions"
      >
        {/* Document labels at each cluster anchor */}
        {Array.from(docCenters.entries()).map(([doc, c]) => (
          <g key={`doc-${doc}`} pointerEvents="none">
            <circle
              cx={c.x}
              cy={c.y}
              r={50}
              fill={getDocColor(countryConfig, doc)}
              opacity={0.04}
            />
          </g>
        ))}

        {/* Chords */}
        {orderedAlignments.map((conn) => {
          const a = nodes.get(conn.targetAId);
          const b = nodes.get(conn.targetBId);
          if (!a || !b) return null;
          const contra = isContradiction(conn.alignment);
          const op =
            (contra
              ? conn.alignment === "likely_conflict"
                ? 0.7
                : 0.55
              : conn.alignment === "high"
                ? 0.35
                : conn.alignment === "medium"
                  ? 0.2
                  : 0.1) * clampedBuildup;
          return (
            <line
              key={`${conn.targetAId}__${conn.targetBId}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={ALIGNMENT_COLORS[conn.alignment]}
              strokeWidth={contra ? 1.4 : conn.alignment === "high" ? 0.9 : 0.6}
              strokeOpacity={op}
              strokeLinecap="round"
              strokeDasharray={contra ? "4 3" : "none"}
            />
          );
        })}

        {/* Nodes */}
        {Array.from(nodes.entries()).map(([id, pos]) => (
          <circle
            key={`n-${id}`}
            cx={pos.x}
            cy={pos.y}
            r={RADIUS}
            fill={getDocColor(countryConfig, pos.doc)}
            opacity={0.95}
          />
        ))}

        {/* Document labels — small, near each cluster */}
        {Array.from(docCenters.entries()).map(([doc, c]) => (
          <text
            key={`lbl-${doc}`}
            x={c.x}
            y={c.y - 58}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={500}
            fill="var(--undp-black)"
            className="select-none pointer-events-none"
          >
            {doc}
          </text>
        ))}
      </svg>
    </div>
  );
}
