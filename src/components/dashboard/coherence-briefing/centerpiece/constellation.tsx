"use client";

/**
 * Constellation centerpiece — clusters per document with sparse arcs
 * showing cross-document signal.
 *
 * v2 fix: in v1 every node piled up at the center because the link force
 * dominated the doc-center pull. The new approach pre-positions each
 * node at its document's anchor with jitter, then runs a short simulation
 * with strong forceX/forceY toward the anchor, collision spacing, and NO
 * link force. Aligned pairs render as faint arcs (visual only, not
 * gravitational). Tensions render as short, contrasting arcs.
 *
 * Like the wheel, supports a small state prop so the storytelling deck
 * can ask for tensions-only or alignments-only renderings.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  forceCenter,
  forceCollide,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
import { ALIGNMENT_COLORS, getDocColor } from "@/lib/utils";
import { isContradiction } from "@/types";
import type {
  AlignmentResult,
  CountryConfig,
  PolicyDocumentType,
  Target,
} from "@/types";
import type { WheelState } from "./wheel";

const VB_W = 760;
const VB = 620;
const NODE_R = 2.4;
const CLUSTER_R = 70;  // approx radius of each doc cluster blob

interface NodeDatum extends SimulationNodeDatum {
  id: string;
  doc: PolicyDocumentType;
  anchorX: number;
  anchorY: number;
}

interface LayoutResult {
  positions: Map<string, { x: number; y: number; doc: PolicyDocumentType }>;
  clusterCenters: Map<PolicyDocumentType, { x: number; y: number }>;
}

function buildLayout(targets: Target[]): LayoutResult {
  // 1. Group by document.
  const byDoc = new Map<PolicyDocumentType, Target[]>();
  for (const t of targets) {
    const list = byDoc.get(t.sourceDocument) ?? [];
    list.push(t);
    byDoc.set(t.sourceDocument, list);
  }
  const docs = Array.from(byDoc.keys()).sort();

  // 2. Place document anchors on a circle.
  const baseR = Math.min(VB_W, VB) * 0.32;
  const clusterCenters = new Map<PolicyDocumentType, { x: number; y: number }>();
  docs.forEach((d, i) => {
    const angle = (i / docs.length) * Math.PI * 2 - Math.PI / 2;
    clusterCenters.set(d, {
      x: Math.cos(angle) * baseR,
      y: Math.sin(angle) * baseR,
    });
  });

  // 3. Pre-position nodes around their cluster center with jitter, so the
  //    starting state is already clustered. Simulation only refines.
  const nodes: NodeDatum[] = [];
  for (const [doc, ts] of byDoc) {
    const c = clusterCenters.get(doc)!;
    for (let i = 0; i < ts.length; i++) {
      const a = (i / Math.max(1, ts.length)) * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (CLUSTER_R - 6);
      nodes.push({
        id: ts[i].id,
        doc,
        anchorX: c.x,
        anchorY: c.y,
        x: c.x + Math.cos(a) * r,
        y: c.y + Math.sin(a) * r,
      });
    }
  }

  // 4. Simulation: strong attraction to anchor + collide spacing + light
  //    repulsion. No link force on purpose.
  const sim = forceSimulation<NodeDatum>(nodes)
    .force("center", forceCenter(0, 0))
    .force("x", forceX<NodeDatum>().x((d) => d.anchorX).strength(0.28))
    .force("y", forceY<NodeDatum>().y((d) => d.anchorY).strength(0.28))
    .force("collide", forceCollide<NodeDatum>().radius(NODE_R + 1.2).strength(0.85))
    .force("charge", forceManyBody<NodeDatum>().strength(-2))
    .alpha(0.9)
    .alphaDecay(0.05)
    .stop();

  for (let i = 0; i < 160; i++) sim.tick();

  const positions = new Map<
    string,
    { x: number; y: number; doc: PolicyDocumentType }
  >();
  for (const n of nodes) {
    positions.set(n.id, {
      x: n.x ?? n.anchorX,
      y: n.y ?? n.anchorY,
      doc: n.doc,
    });
  }
  return { positions, clusterCenters };
}

export interface ConstellationCenterpieceProps {
  targets: Target[];
  alignments: AlignmentResult[];
  countryConfig: CountryConfig | null;
  state?: WheelState;
}

export function ConstellationCenterpiece({
  targets,
  alignments,
  countryConfig,
  state = { groupBy: "document", focus: null, filter: "all" },
}: ConstellationCenterpieceProps) {
  const t = useTranslations("briefing.centerpiece");
  const { positions, clusterCenters } = useMemo(
    () => buildLayout(targets),
    [targets],
  );

  const ordered = useMemo(() => {
    const aligns: AlignmentResult[] = [];
    const tensions: AlignmentResult[] = [];
    for (const a of alignments) {
      if (a.alignment === "none") continue;
      if (!positions.has(a.targetAId) || !positions.has(a.targetBId)) continue;
      // Skip same-cluster pairs — internal lines clutter without adding
      // cross-document signal (which is the constellation's whole point).
      const pA = positions.get(a.targetAId)!;
      const pB = positions.get(a.targetBId)!;
      if (pA.doc === pB.doc) continue;
      if (isContradiction(a.alignment)) tensions.push(a);
      else aligns.push(a);
    }
    return [...aligns, ...tensions];
  }, [alignments, positions]);

  const showAlignments = state.filter !== "tensions";
  const showTensions = state.filter !== "alignments";

  return (
    <div className="w-full flex justify-center">
      <svg
        viewBox={`${-VB_W / 2} ${-VB / 2} ${VB_W} ${VB}`}
        className="w-full"
        style={{ maxHeight: 600 }}
        role="img"
        aria-label={t("constellationAria")}
      >
        {/* Faint cluster halos */}
        {Array.from(clusterCenters.entries()).map(([doc, c]) => (
          <circle
            key={`halo-${doc}`}
            cx={c.x}
            cy={c.y}
            r={CLUSTER_R + 4}
            fill={getDocColor(countryConfig, doc)}
            opacity={0.06}
            pointerEvents="none"
          />
        ))}

        {/* Cross-cluster arcs */}
        {ordered.map((conn) => {
          if (!showAlignments && !isContradiction(conn.alignment)) return null;
          if (!showTensions && isContradiction(conn.alignment)) return null;
          const a = positions.get(conn.targetAId)!;
          const b = positions.get(conn.targetBId)!;
          const contra = isContradiction(conn.alignment);
          const op = contra
            ? conn.alignment === "flagged" && conn.manageability === "fundamental"
              ? 0.6
              : 0.4
            : conn.alignment === "high"
              ? 0.18
              : conn.alignment === "medium"
                ? 0.1
                : 0.05;
          return (
            <line
              key={`${conn.targetAId}__${conn.targetBId}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={ALIGNMENT_COLORS[conn.alignment]}
              strokeWidth={contra ? 0.9 : 0.55}
              strokeOpacity={op}
              strokeLinecap="round"
              strokeDasharray={contra ? "3 3" : "none"}
            />
          );
        })}

        {/* Nodes */}
        {Array.from(positions.entries()).map(([id, pos]) => (
          <circle
            key={`n-${id}`}
            cx={pos.x}
            cy={pos.y}
            r={NODE_R}
            fill={getDocColor(countryConfig, pos.doc)}
            opacity={0.95}
          />
        ))}

        {/* Cluster labels */}
        {Array.from(clusterCenters.entries()).map(([doc, c]) => {
          const dy =
            c.y < 0 ? -(CLUSTER_R + 18) : c.y > 0 ? CLUSTER_R + 22 : 0;
          const dx = c.y === 0 ? (c.x < 0 ? -(CLUSTER_R + 14) : CLUSTER_R + 14) : 0;
          return (
            <text
              key={`lbl-${doc}`}
              x={c.x + dx}
              y={c.y + dy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={12}
              fontWeight={500}
              fill="var(--undp-black)"
              className="select-none pointer-events-none"
            >
              {doc}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
