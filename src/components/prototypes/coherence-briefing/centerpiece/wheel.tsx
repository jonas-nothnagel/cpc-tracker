"use client";

/**
 * WheelCenterpiece — three-axis state model.
 *
 * State is described by three independent properties:
 *
 *   groupBy: "document" | "sector"
 *     What each rim arc represents. Targets are bucketed into arcs accordingly.
 *
 *   focus: null | doc | sector
 *     When set, only ribbons touching the focused arc render at full opacity;
 *     the rest ghost out. Other arcs stay clickable so the user can switch
 *     focus on the fly.
 *
 *   filter: "all" | "alignments" | "tensions"
 *     Colour overlay. Hides the alignment / flagged half of every ribbon when
 *     set to the opposite filter.
 *
 * Ribbons are always aggregated per ordered arc-pair (one ribbon per pair of
 * arcs, never per individual chord). Width = sqrt(count) * factor. Green half
 * = aligned (medium+high) count; red half = flagged (any negative-side level).
 *
 * Click an arc → onArcClick switches focus (or toggles it off when already
 * focused). Click a node → onNodeClick (currently unused but wired in for
 * future drilldowns). Hover a ribbon → small tooltip with the counts.
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

// ─── Geometry ───────────────────────────────────────────────────────

const VB = 720;
const VB_W = 760;
const OUTER_R = 220;
const INNER_R = 213;
const NODE_R = 205;
const GAP = 0.08;
const UNCLASSIFIED_BUCKET_ID = "__unclassified";

// ─── Types ──────────────────────────────────────────────────────────

export type WheelGroupBy = "document" | "sector";

export type WheelFocus =
  | { type: "doc"; id: PolicyDocumentType }
  | { type: "sector"; id: string; taxonomyType: string }
  | null;

export type WheelFilter = "all" | "alignments" | "tensions";

export interface WheelState {
  groupBy: WheelGroupBy;
  focus: WheelFocus;
  filter: WheelFilter;
  /**
   * Optional single-pair overlay drawn on top of everything else without
   * affecting the ghosting state — used to spotlight a primer pair while the
   * rest of the wheel still reads as the bigger picture.
   */
  highlightPair?: { aId: string; bId: string };
  /**
   * Optional multi-doc focus: ghost any arc/ribbon whose document is NOT in
   * this set. Layered on top of focus/highlightPair and only active when
   * groupBy === "document". Used by Section 3 theme chips to fade the wheel
   * to the documents a corpus storyline spans.
   */
  ghostExceptDocs?: string[];
}

export interface SectorCategoryRef {
  id: string;
  name: string;
  color?: string;
}

interface ArcInfo {
  id: string;
  label: string;
  color: string;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  count: number;
}

interface NodePos {
  id: string;
  target: Target;
  arcId: string;
  angle: number;
  x: number;
  y: number;
}

// ─── Layout ─────────────────────────────────────────────────────────

function curvePath(ax: number, ay: number, bx: number, by: number) {
  const cx = ((ax + bx) / 2) * 0.25;
  const cy = ((ay + by) / 2) * 0.25;
  return `M${ax},${ay} Q${cx},${cy} ${bx},${by}`;
}

interface Bucket {
  id: string;
  label: string;
  color: string;
  targets: Target[];
}

function bucketByDocument(
  targets: Target[],
  countryConfig: CountryConfig | null,
): Bucket[] {
  const byDoc = new Map<string, Target[]>();
  for (const t of targets) {
    const list = byDoc.get(t.sourceDocument) ?? [];
    list.push(t);
    byDoc.set(t.sourceDocument, list);
  }
  const out: Bucket[] = [];
  for (const [docId, ts] of byDoc) {
    out.push({
      id: docId,
      label: getDocMediumLabel(countryConfig, docId),
      color: getDocColor(countryConfig, docId),
      targets: ts,
    });
  }
  // Largest arcs first, mirroring the existing visual.
  out.sort((a, b) => b.targets.length - a.targets.length);
  return out;
}

function bucketBySector(
  targets: Target[],
  classifications: ThematicClassification[],
  sectorCategories: SectorCategoryRef[],
  sectorTaxonomyType: string,
): Bucket[] {
  const primaryByTarget = new Map<string, string>();
  for (const c of classifications) {
    if (!c.isPrimary || c.taxonomyType !== sectorTaxonomyType) continue;
    primaryByTarget.set(c.targetId, c.categoryId);
  }
  const byCat = new Map<string, Target[]>();
  for (const t of targets) {
    const cid = primaryByTarget.get(t.id) ?? UNCLASSIFIED_BUCKET_ID;
    const list = byCat.get(cid) ?? [];
    list.push(t);
    byCat.set(cid, list);
  }
  const catInfo = new Map(sectorCategories.map((c) => [c.id, c]));
  const order = new Map(sectorCategories.map((c, i) => [c.id, i] as const));
  const out: Bucket[] = [];
  for (const [cid, ts] of byCat) {
    const info = catInfo.get(cid);
    out.push({
      id: cid,
      label: info?.name ?? "Unclassified",
      color: info?.color ?? "#9ca3af",
      targets: ts,
    });
  }
  out.sort((a, b) => {
    const ai = order.get(a.id) ?? 999;
    const bi = order.get(b.id) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.label.localeCompare(b.label);
  });
  return out;
}

function buildLayout(args: {
  targets: Target[];
  countryConfig: CountryConfig | null;
  classifications: ThematicClassification[];
  groupBy: WheelGroupBy;
  sectorCategories: SectorCategoryRef[];
  sectorTaxonomyType: string;
}): { nodes: NodePos[]; arcs: ArcInfo[] } {
  const {
    targets,
    countryConfig,
    classifications,
    groupBy,
    sectorCategories,
    sectorTaxonomyType,
  } = args;

  const buckets =
    groupBy === "document"
      ? bucketByDocument(targets, countryConfig)
      : bucketBySector(
          targets,
          classifications,
          sectorCategories,
          sectorTaxonomyType,
        );

  const populated = buckets.filter((b) => b.targets.length > 0);
  if (populated.length === 0) return { nodes: [], arcs: [] };

  const total = populated.reduce((s, b) => s + b.targets.length, 0);
  const avail = 2 * Math.PI - GAP * populated.length;
  const nodes: NodePos[] = [];
  const arcs: ArcInfo[] = [];
  let cur = 0;
  for (const b of populated) {
    const span = (b.targets.length / total) * avail;
    const start = cur;
    const end = cur + span;
    const mid = (start + end) / 2;
    arcs.push({
      id: b.id,
      label: b.label,
      color: b.color,
      startAngle: start,
      endAngle: end,
      midAngle: mid,
      count: b.targets.length,
    });
    const n = b.targets.length;
    const pad = span * 0.04;
    const nodeSpan = span - 2 * pad;
    for (let i = 0; i < n; i++) {
      const a =
        start + pad + (n > 1 ? (i / (n - 1)) * nodeSpan : nodeSpan / 2);
      nodes.push({
        id: b.targets[i].id,
        target: b.targets[i],
        arcId: b.id,
        angle: a,
        x: NODE_R * Math.sin(a),
        y: -NODE_R * Math.cos(a),
      });
    }
    cur = end + GAP;
  }
  return { nodes, arcs };
}

// ─── Aggregation ────────────────────────────────────────────────────

interface ArcPairAggregate {
  aId: string;
  bId: string;
  alignmentCount: number;
  tensionCount: number;
}

function aggregateByArcPair(
  alignment: AlignmentResult[],
  nodeMap: Map<string, NodePos>,
): Map<string, ArcPairAggregate> {
  const out = new Map<string, ArcPairAggregate>();
  for (const a of alignment) {
    if (a.alignment === "none") continue;
    const nA = nodeMap.get(a.targetAId);
    const nB = nodeMap.get(a.targetBId);
    if (!nA || !nB) continue;
    if (nA.arcId === nB.arcId) continue;
    const [x, y] =
      nA.arcId < nB.arcId ? [nA.arcId, nB.arcId] : [nB.arcId, nA.arcId];
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
  state: WheelState;
  /** Category list driving the arcs when `groupBy === "sector"`. */
  sectorCategories?: SectorCategoryRef[];
  /** Taxonomy type for sector grouping (e.g. "sector", "globe", "nbs"). */
  sectorTaxonomyType?: string;
  /** Click an aggregated ribbon (handler is responsible for resolving a pair). */
  onPairClick?: (a: string, b: string) => void;
  /** Click a rim arc → host switches focus. Pass null to support "unset focus" via re-clicking. */
  onArcClick?: (focus: WheelFocus) => void;
}

export function WheelCenterpiece({
  targets,
  alignments,
  classifications = [],
  countryConfig,
  state,
  sectorCategories = [],
  sectorTaxonomyType = "sector",
  onPairClick,
  onArcClick,
}: WheelCenterpieceProps) {
  const { nodes, arcs } = useMemo(
    () =>
      buildLayout({
        targets,
        countryConfig,
        classifications,
        groupBy: state.groupBy,
        sectorCategories,
        sectorTaxonomyType,
      }),
    [
      targets,
      countryConfig,
      classifications,
      state.groupBy,
      sectorCategories,
      sectorTaxonomyType,
    ],
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
    () => aggregateByArcPair(alignments, nodeMap),
    [alignments, nodeMap],
  );

  /**
   * The currently focused arc id, validated against the active grouping. We
   * deliberately ignore a focus whose type doesn't match the current groupBy
   * (e.g. a leftover "doc" focus when the user just switched to sector view)
   * so the wheel never paints in a half-state.
   */
  const focusArcId = useMemo(() => {
    if (!state.focus) return null;
    if (state.focus.type === "doc" && state.groupBy === "document") {
      return state.focus.id;
    }
    if (state.focus.type === "sector" && state.groupBy === "sector") {
      return state.focus.id;
    }
    return null;
  }, [state.focus, state.groupBy]);

  /**
   * Multi-doc ghost set: only meaningful when grouping by document. When non-
   * empty, any arc whose id is NOT in the set is ghosted and any ribbon with
   * at least one endpoint outside the set is dimmed.
   */
  const ghostExceptDocs = useMemo(() => {
    if (state.groupBy !== "document") return null;
    if (!state.ghostExceptDocs?.length) return null;
    return new Set(state.ghostExceptDocs);
  }, [state.groupBy, state.ghostExceptDocs]);

  const arcMid = (a: ArcInfo) => ({
    x: NODE_R * Math.sin(a.midAngle),
    y: -NODE_R * Math.cos(a.midAngle),
  });

  const arcsById = useMemo(
    () => new Map(arcs.map((a) => [a.id, a])),
    [arcs],
  );

  const [hovered, setHovered] = useState<string | null>(null);

  const handleArcClick = (arc: ArcInfo) => {
    if (!onArcClick) return;
    if (arc.id === UNCLASSIFIED_BUCKET_ID) return;
    if (focusArcId === arc.id) {
      onArcClick(null);
      return;
    }
    if (state.groupBy === "document") {
      onArcClick({ type: "doc", id: arc.id });
    } else {
      onArcClick({
        type: "sector",
        id: arc.id,
        taxonomyType: sectorTaxonomyType,
      });
    }
  };

  const handleAggregateClick = (agg: ArcPairAggregate) => {
    if (!onPairClick) return;
    // Pick the first alignment record matching this arc-pair. The host can
    // refine the resolution to "most severe" or "highest aligned" later.
    for (const a of alignments) {
      if (a.alignment === "none") continue;
      const nA = nodeMap.get(a.targetAId);
      const nB = nodeMap.get(a.targetBId);
      if (!nA || !nB) continue;
      if (
        (nA.arcId === agg.aId && nB.arcId === agg.bId) ||
        (nA.arcId === agg.bId && nB.arcId === agg.aId)
      ) {
        onPairClick(a.targetAId, a.targetBId);
        return;
      }
    }
  };

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
          const isFocus = focusArcId === arc.id;
          // When highlighting a single pair, keep every rim arc visible so the
          // user can still place the highlighted endpoints in context.
          const isGhost =
            (focusArcId !== null && !isFocus && !state.highlightPair) ||
            (ghostExceptDocs !== null && !ghostExceptDocs.has(arc.id));
          const clickable =
            !!onArcClick && arc.id !== UNCLASSIFIED_BUCKET_ID;
          return (
            <g key={arc.id}>
              <path
                d={d}
                fill={arc.color}
                opacity={isGhost ? 0.25 : isFocus ? 1 : 0.85}
                onClick={clickable ? () => handleArcClick(arc) : undefined}
                className={clickable ? "cursor-pointer" : undefined}
                style={{ transition: "opacity 220ms" }}
              >
                <title>
                  {arc.label} · {arc.count} targets
                  {clickable
                    ? isFocus
                      ? " · click to clear focus"
                      : " · click to focus"
                    : ""}
                </title>
              </path>
            </g>
          );
        })}

        {/* Aggregate ribbons (always per arc-pair) */}
        {Array.from(aggregates.values()).map((agg) => {
          const aArc = arcsById.get(agg.aId);
          const bArc = arcsById.get(agg.bId);
          if (!aArc || !bArc) return null;
          const a = arcMid(aArc);
          const b = arcMid(bArc);
          const total = agg.alignmentCount + agg.tensionCount;
          if (total === 0) return null;
          const showAlign =
            state.filter !== "tensions" && agg.alignmentCount > 0;
          const showTension =
            state.filter !== "alignments" && agg.tensionCount > 0;
          const touchesFocus =
            focusArcId === null ||
            agg.aId === focusArcId ||
            agg.bId === focusArcId;
          // Multi-doc ghost: a ribbon stays at full opacity only if BOTH
          // endpoints are in the allow-list. Crossover ribbons (one in / one
          // out) ghost as well — the user asked to see this storyline's docs
          // and the relationships among them.
          const insideGhostExcept =
            ghostExceptDocs === null ||
            (ghostExceptDocs.has(agg.aId) && ghostExceptDocs.has(agg.bId));
          // When a single pair is being highlighted, dim every aggregated
          // ribbon so the highlight overlay reads as the clear centrepiece.
          const ghosted =
            !!state.highlightPair ||
            (focusArcId !== null && !touchesFocus) ||
            !insideGhostExcept;
          const key = `${agg.aId}__${agg.bId}`;
          const isHover = hovered === key;
          const clickable = !!onPairClick && !ghosted;
          return (
            <g
              key={`agg-${key}`}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              onClick={clickable ? () => handleAggregateClick(agg) : undefined}
              className={clickable ? "cursor-pointer" : undefined}
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
                  strokeOpacity={
                    ghosted ? 0.06 : isHover ? 0.9 : 0.55
                  }
                  strokeLinecap="round"
                  style={{ transition: "stroke-opacity 220ms" }}
                />
              )}
              {showTension && (
                <path
                  d={curvePath(a.x, a.y, b.x, b.y)}
                  fill="none"
                  stroke={ALIGNMENT_COLORS.flagged}
                  strokeWidth={Math.max(
                    1,
                    Math.sqrt(agg.tensionCount) * 1.8,
                  )}
                  strokeOpacity={
                    ghosted ? 0.08 : isHover ? 0.9 : 0.7
                  }
                  strokeDasharray="5 3"
                  strokeLinecap="round"
                  style={{ transition: "stroke-opacity 220ms" }}
                />
              )}
            </g>
          );
        })}

        {/* Hover tooltip for the active ribbon */}
        {hovered &&
          (() => {
            const agg = aggregates.get(hovered);
            if (!agg) return null;
            const aArc = arcsById.get(agg.aId);
            const bArc = arcsById.get(agg.bId);
            if (!aArc || !bArc) return null;
            const a = arcMid(aArc);
            const b = arcMid(bArc);
            const mx = ((a.x + b.x) / 2) * 0.25;
            const my = ((a.y + b.y) / 2) * 0.25;
            return (
              <g pointerEvents="none">
                <rect
                  x={mx - 96}
                  y={my - 26}
                  width={192}
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

        {/* Optional non-ghosting highlight pair */}
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
          const isHighlight =
            state.highlightPair &&
            (node.id === state.highlightPair.aId ||
              node.id === state.highlightPair.bId);
          // While highlighting a pair, hide non-highlight nodes entirely so
          // only the two marker dots stay readable on the rim (Image 9).
          const dimmedByHighlight =
            !!state.highlightPair && !isHighlight;
          const isGhost =
            !dimmedByHighlight &&
            focusArcId !== null &&
            node.arcId !== focusArcId;
          // Always colour by source document — when grouping by sector, this
          // gives the dot a second dimension on top of the arc it sits on
          // (which sector it serves). When grouping by document, the arc and
          // dot agree, which is also what we want.
          const fill = getDocColor(countryConfig, node.target.sourceDocument);
          const opacity = dimmedByHighlight
            ? 0.08
            : isGhost
              ? 0.2
              : isHighlight
                ? 1
                : 0.9;
          return (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={isHighlight ? 4 : 1.8}
              fill={fill}
              opacity={opacity}
              style={{ transition: "opacity 220ms" }}
            />
          );
        })}

        {/* Group labels */}
        {arcs.map((arc) => {
          if (arc.id === UNCLASSIFIED_BUCKET_ID && arc.count < 3) {
            // Suppress label noise from tiny unclassified buckets.
            return null;
          }
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
          const isGhost =
            focusArcId !== null &&
            focusArcId !== arc.id &&
            !state.highlightPair;
          return (
            <text
              key={`label-${arc.id}`}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="central"
              fontSize={11}
              fontWeight={focusArcId === arc.id ? 600 : 500}
              fill="var(--undp-black)"
              opacity={isGhost ? 0.4 : 1}
              className="select-none pointer-events-none"
              style={{ transition: "opacity 220ms" }}
            >
              {arc.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
