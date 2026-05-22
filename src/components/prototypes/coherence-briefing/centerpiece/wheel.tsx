"use client";

/**
 * WheelCenterpiece — scene-aware wheel for the slide deck.
 *
 * Two rendering modes:
 *
 *   AGGREGATE (the default for storytelling)
 *     Instead of thousands of individual chords, draw one ribbon per
 *     ordered pair of documents. Width scales with the number of scored
 *     pairs between the two docs; colour blends alignment-green and
 *     tension-red by dominance. Much calmer than the all-pairs view.
 *
 *   PAIRS (drill-down)
 *     Render individual chords. Used by the "pair" highlight state to
 *     spotlight a single pair against a faint rest, and by the explore
 *     mode when the user opts into the dense view.
 *
 * The active "state" prop drives both what's rendered and how:
 *   - idle          → rim only, no chords
 *   - aggregate     → doc-pair ribbons
 *   - pair          → one named pair, rest faded to ghosts
 *   - alignments    → aggregate ribbons but tension portion suppressed
 *   - tensions      → aggregate ribbons but alignment portion suppressed
 *   - sector        → individual chords touching the named sector
 */

import { useMemo, useState } from "react";
import { arc as d3arc } from "d3-shape";
import {
  ALIGNMENT_COLORS,
  getDocColor,
  getDocMediumLabel,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import type {
  AlignmentResult,
  CountryConfig,
  PolicyDocumentType,
  Target,
  ThematicClassification,
} from "@/types";

// ─── Geometry (kept in sync with the source explorer) ───────────────

const VB = 720;
const VB_W = 760;
const OUTER_R = 220;
const INNER_R = 213;
const NODE_R = 205;
const GAP = 0.08;

// ─── Types ──────────────────────────────────────────────────────────

export type WheelStateMode =
  | "idle"
  | "aggregate"
  | "pair"
  | "alignments"
  | "tensions"
  | "sector";

export interface WheelState {
  mode: WheelStateMode;
  /** For mode === "pair". */
  pair?: { aId: string; bId: string };
  /** For mode === "sector". */
  sectorCategoryId?: string;
  sectorTaxonomyType?: string;
  /**
   * Optional single-pair highlight overlaid on top of aggregate/tensions/
   * alignments/sector modes without ghosting the rest. Used by the
   * storytelling scenes to point at one primer pair while the rest of the
   * wheel still reads as the bigger picture.
   */
  highlightPair?: { aId: string; bId: string };
}

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

function buildLayout(
  targets: Target[],
  countryConfig: CountryConfig | null,
): { nodes: NodePos[]; arcs: GroupArc[] } {
  const byDoc = new Map<PolicyDocumentType, Target[]>();
  for (const t of targets) {
    const list = byDoc.get(t.sourceDocument) ?? [];
    list.push(t);
    byDoc.set(t.sourceDocument, list);
  }
  const groups = Array.from(byDoc.entries())
    .map(([d, ts]) => ({
      id: d,
      label: getDocMediumLabel(countryConfig, d),
      color: getDocColor(countryConfig, d),
      targets: ts,
    }))
    .sort((a, b) => b.targets.length - a.targets.length);
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

// ─── Aggregate ribbons ──────────────────────────────────────────────

interface DocPairAggregate {
  aId: PolicyDocumentType;
  bId: PolicyDocumentType;
  alignmentCount: number;
  tensionCount: number;
}

function aggregateByDocPair(
  alignment: AlignmentResult[],
  nodeMap: Map<string, NodePos>,
): Map<string, DocPairAggregate> {
  const out = new Map<string, DocPairAggregate>();
  for (const a of alignment) {
    if (a.alignment === "none") continue;
    const nA = nodeMap.get(a.targetAId);
    const nB = nodeMap.get(a.targetBId);
    if (!nA || !nB) continue;
    if (nA.groupId === nB.groupId) continue;
    const [x, y] =
      nA.groupId < nB.groupId
        ? [nA.groupId, nB.groupId]
        : [nB.groupId, nA.groupId];
    const key = `${x}__${y}`;
    const slot = out.get(key) ?? {
      aId: x,
      bId: y,
      alignmentCount: 0,
      tensionCount: 0,
    };
    if (isContradiction(a.alignment)) slot.tensionCount += 1;
    else if (a.alignment === "high" || a.alignment === "medium") {
      slot.alignmentCount += 1;
    }
    out.set(key, slot);
  }
  return out;
}

// ─── Component ──────────────────────────────────────────────────────

export interface WheelCenterpieceProps {
  targets: Target[];
  alignments: AlignmentResult[];
  classifications?: ThematicClassification[];
  countryConfig: CountryConfig | null;
  state?: WheelState;
  onPairClick?: (a: string, b: string) => void;
}

export function WheelCenterpiece({
  targets,
  alignments,
  classifications = [],
  countryConfig,
  state = { mode: "aggregate" },
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
    () =>
      d3arc<{ startAngle: number; endAngle: number }>()
        .innerRadius(INNER_R)
        .outerRadius(OUTER_R),
    [],
  );
  const aggregates = useMemo(
    () => aggregateByDocPair(alignments, nodeMap),
    [alignments, nodeMap],
  );

  // Sector mode needs to know which targets belong to the highlighted sector.
  const sectorTargetIds = useMemo(() => {
    if (state.mode !== "sector" || !state.sectorCategoryId) {
      return new Set<string>();
    }
    const ids = new Set<string>();
    for (const c of classifications) {
      if (!c.isPrimary) continue;
      if (c.taxonomyType !== state.sectorTaxonomyType) continue;
      if (c.categoryId !== state.sectorCategoryId) continue;
      if (!nodeMap.has(c.targetId)) continue;
      ids.add(c.targetId);
    }
    return ids;
  }, [
    state.mode,
    state.sectorCategoryId,
    state.sectorTaxonomyType,
    classifications,
    nodeMap,
  ]);

  // Per-pair chords used by "pair" and "sector" modes.
  const visiblePairs = useMemo(() => {
    return alignments.filter(
      (a) =>
        a.alignment !== "none" &&
        nodeMap.has(a.targetAId) &&
        nodeMap.has(a.targetBId),
    );
  }, [alignments, nodeMap]);

  const arcMid = (a: GroupArc) => ({
    x: NODE_R * Math.sin(a.midAngle),
    y: -NODE_R * Math.cos(a.midAngle),
  });

  const arcsById = useMemo(
    () => new Map(arcs.map((a) => [a.id, a])),
    [arcs],
  );

  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="w-full flex justify-center">
      <svg
        viewBox={`${-VB_W / 2} ${-VB / 2} ${VB_W} ${VB}`}
        className="w-full"
        style={{ maxHeight: 620 }}
        role="img"
        aria-label="Policy coherence wheel"
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

        {/* Rim arcs */}
        {arcs.map((arc) => {
          const d = arcGen({
            startAngle: arc.startAngle,
            endAngle: arc.endAngle,
          });
          if (!d) return null;
          const isInSector =
            state.mode === "sector" &&
            Array.from(sectorTargetIds).some(
              (tid) => nodeMap.get(tid)?.groupId === arc.id,
            );
          return (
            <g key={arc.id}>
              <path
                d={d}
                fill={arc.color}
                opacity={
                  state.mode === "sector" && !isInSector ? 0.25 : 0.85
                }
              >
                <title>{`${arc.label} · ${arc.count} targets`}</title>
              </path>
            </g>
          );
        })}

        {/* Aggregate ribbons (modes that show an overview) */}
        {(state.mode === "aggregate" ||
          state.mode === "alignments" ||
          state.mode === "tensions" ||
          state.mode === "pair") &&
          Array.from(aggregates.values()).map((agg) => {
            const aArc = arcsById.get(agg.aId);
            const bArc = arcsById.get(agg.bId);
            if (!aArc || !bArc) return null;
            const a = arcMid(aArc);
            const b = arcMid(bArc);
            const total = agg.alignmentCount + agg.tensionCount;
            if (total === 0) return null;
            const showAlign =
              state.mode !== "tensions" && agg.alignmentCount > 0;
            const showTension =
              state.mode !== "alignments" && agg.tensionCount > 0;
            // In "pair" mode, the aggregate ribbons fade to ghosts so the
            // highlighted pair pops.
            const ghosted = state.mode === "pair";
            const key = `${agg.aId}__${agg.bId}`;
            const isHover = hovered === key;
            return (
              <g
                key={`agg-${key}`}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
              >
                {showAlign && (
                  <path
                    d={curvePath(a.x, a.y, b.x, b.y)}
                    fill="none"
                    stroke={ALIGNMENT_COLORS.high}
                    strokeWidth={Math.max(
                      1,
                      Math.sqrt(agg.alignmentCount) * 1.6,
                    )}
                    strokeOpacity={ghosted ? 0.06 : isHover ? 0.85 : 0.55}
                    strokeLinecap="round"
                    style={{ transition: "stroke-opacity 220ms" }}
                  />
                )}
                {showTension && (
                  <path
                    d={curvePath(a.x, a.y, b.x, b.y)}
                    fill="none"
                    stroke={ALIGNMENT_COLORS.possible_conflict}
                    strokeWidth={Math.max(
                      1,
                      Math.sqrt(agg.tensionCount) * 1.8,
                    )}
                    strokeOpacity={ghosted ? 0.08 : isHover ? 0.9 : 0.7}
                    strokeDasharray="5 3"
                    strokeLinecap="round"
                    style={{ transition: "stroke-opacity 220ms" }}
                  />
                )}
              </g>
            );
          })}

        {/* Hover tooltip for aggregate ribbons */}
        {hovered &&
          (() => {
            const agg = aggregates.get(hovered);
            if (!agg) return null;
            const aArc = arcsById.get(agg.aId);
            const bArc = arcsById.get(agg.bId);
            if (!aArc || !bArc) return null;
            const a = arcMid(aArc);
            const b = arcMid(bArc);
            const mx = (a.x + b.x) / 2 * 0.25;
            const my = (a.y + b.y) / 2 * 0.25;
            return (
              <g pointerEvents="none">
                <rect
                  x={mx - 90}
                  y={my - 26}
                  width={180}
                  height={52}
                  rx={4}
                  fill="white"
                  stroke="#d4d4d4"
                />
                <text
                  x={mx}
                  y={my - 10}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--undp-black)"
                >
                  {aArc.label} ↔ {bArc.label}
                </text>
                <text
                  x={mx}
                  y={my + 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--undp-gray)"
                >
                  {agg.alignmentCount} aligned · {agg.tensionCount} flagged
                </text>
              </g>
            );
          })()}

        {/* Single highlighted pair (mode "pair") */}
        {state.mode === "pair" &&
          state.pair &&
          (() => {
            const nA = nodeMap.get(state.pair.aId);
            const nB = nodeMap.get(state.pair.bId);
            if (!nA || !nB) return null;
            const conn = alignments.find(
              (a) =>
                (a.targetAId === state.pair!.aId &&
                  a.targetBId === state.pair!.bId) ||
                (a.targetAId === state.pair!.bId &&
                  a.targetBId === state.pair!.aId),
            );
            const color = conn
              ? ALIGNMENT_COLORS[conn.alignment]
              : ALIGNMENT_COLORS.high;
            const contra = conn ? isContradiction(conn.alignment) : false;
            return (
              <g>
                <path
                  d={curvePath(nA.x, nA.y, nB.x, nB.y)}
                  fill="none"
                  stroke={color}
                  strokeWidth={3.2}
                  strokeDasharray={contra ? "6 3" : "none"}
                  strokeLinecap="round"
                  strokeOpacity={0.95}
                />
                <circle cx={nA.x} cy={nA.y} r={5.5} fill={color} />
                <circle cx={nB.x} cy={nB.y} r={5.5} fill={color} />
              </g>
            );
          })()}

        {/* Sector mode — individual chords touching the sector */}
        {state.mode === "sector" &&
          visiblePairs.map((conn) => {
            const touches =
              sectorTargetIds.has(conn.targetAId) ||
              sectorTargetIds.has(conn.targetBId);
            if (!touches) return null;
            const nA = nodeMap.get(conn.targetAId);
            const nB = nodeMap.get(conn.targetBId);
            if (!nA || !nB) return null;
            const contra = isContradiction(conn.alignment);
            return (
              <path
                key={`s-${conn.targetAId}__${conn.targetBId}`}
                d={curvePath(nA.x, nA.y, nB.x, nB.y)}
                fill="none"
                stroke={ALIGNMENT_COLORS[conn.alignment]}
                strokeWidth={contra ? 1.6 : 1.2}
                strokeOpacity={contra ? 0.85 : 0.5}
                strokeDasharray={contra ? "5 3" : "none"}
                strokeLinecap="round"
                className={onPairClick ? "cursor-pointer" : undefined}
                onClick={
                  onPairClick
                    ? () => onPairClick(conn.targetAId, conn.targetBId)
                    : undefined
                }
              />
            );
          })}

        {/* Optional non-ghosting highlight pair (storytelling overlay) */}
        {state.highlightPair &&
          (() => {
            const nA = nodeMap.get(state.highlightPair.aId);
            const nB = nodeMap.get(state.highlightPair.bId);
            if (!nA || !nB) return null;
            const conn = alignments.find(
              (a) =>
                (a.targetAId === state.highlightPair!.aId &&
                  a.targetBId === state.highlightPair!.bId) ||
                (a.targetAId === state.highlightPair!.bId &&
                  a.targetBId === state.highlightPair!.aId),
            );
            const contra = conn ? isContradiction(conn.alignment) : false;
            const color = conn
              ? ALIGNMENT_COLORS[conn.alignment]
              : ALIGNMENT_COLORS.high;
            return (
              <g pointerEvents="none">
                <path
                  d={curvePath(nA.x, nA.y, nB.x, nB.y)}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  strokeDasharray={contra ? "5 3" : "none"}
                  strokeLinecap="round"
                  strokeOpacity={0.95}
                />
                <circle cx={nA.x} cy={nA.y} r={4.5} fill={color} />
                <circle cx={nB.x} cy={nB.y} r={4.5} fill={color} />
              </g>
            );
          })()}

        {/* Nodes on rim */}
        {nodes.map((node) => {
          const docColor = getDocColor(
            countryConfig,
            node.target.sourceDocument,
          );
          const isSectorNode =
            state.mode === "sector" && sectorTargetIds.has(node.id);
          const isPairNode =
            state.mode === "pair" &&
            state.pair &&
            (node.id === state.pair.aId || node.id === state.pair.bId);
          return (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={isPairNode ? 4 : isSectorNode ? 3 : 1.8}
              fill={docColor}
              opacity={
                state.mode === "sector"
                  ? isSectorNode
                    ? 1
                    : 0.25
                  : state.mode === "pair"
                    ? isPairNode
                      ? 1
                      : 0.5
                    : 0.9
              }
            />
          );
        })}

        {/* Group labels */}
        {arcs.map((arc) => {
          const labelR = 244;
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

      {/* Hidden hover read-out for assistive tech */}
      <div className="sr-only" aria-live="polite">
        {hovered ?? ""}
      </div>
    </div>
  );
}
