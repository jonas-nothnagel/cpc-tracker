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
 * arcs, never per individual chord). Each is a green base ribbon carrying the
 * whole relationship with a terracotta core on top whose width is the linear
 * flagged share, so the red reads as a proportional thread, not a flood. On the
 * Direction slide the rim arcs are also tinted by per-document friction share.
 * See ./wheel-encoding for the width math.
 *
 * Click an arc → onArcClick switches focus (or toggles it off when already
 * focused). Click a node → onNodeClick (currently unused but wired in for
 * future drilldowns). Hover a ribbon → small tooltip with the counts.
 */

import { useMemo, useState } from "react";
import { arc as d3arc } from "d3-shape";
import { buildDocFrictionShares } from "@/lib/coherence-briefing";
import {
  ALIGNMENT_COLORS,
  getDocColor,
  getDocFullLabel,
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
import { cellColor } from "./doc-coherence-matrix";
import {
  ribbonBaseWidth,
  ribbonCoreWidth,
  ribbonWidthScale,
} from "./wheel-encoding";

// ─── Geometry ───────────────────────────────────────────────────────

const VB = 720;
// Widened from 760 to give collision-avoided rim labels and their leader lines
// horizontal room (the circle itself stays centred and only slightly smaller).
const VB_W = 820;
const OUTER_R = 220;
const INNER_R = 213;
const NODE_R = 205;
// Radius for relaxed rim labels: sits outside the arc with an elbow leader line
// bridging the gap, so a label can slide along the rim without looking detached.
const GRP_LABEL_R = 250;
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
  /**
   * When true, the per-doc balance bands still render in document-focus
   * view but the centre name+counts readout is suppressed. Used by the
   * Doc-in-Focus slide which carries that information in its left column
   * instead of inside the wheel.
   */
  suppressFocusReadout?: boolean;
  /**
   * When true (and groupBy === "document"), fill each rim arc by that
   * document's norm-anchored flagged share instead of its identity colour, so
   * the friction source is legible at a glance. Dots and labels keep identity
   * colour. Used by the Direction landing slide. Ignored under sector grouping.
   */
  frictionArcs?: boolean;
}

export interface SectorCategoryRef {
  id: string;
  name: string;
  color?: string;
}

interface ArcInfo {
  id: string;
  /** Rim-display label (full title, parenthetical metadata stripped). */
  label: string;
  /** Compact label (mediumLabel) for the centre overlay where space is tight. */
  shortLabel: string;
  /** Full untouched label including parentheticals — used in tooltips/aria. */
  fullLabel: string;
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

/**
 * Greedy line-wrap for arc labels so multi-word names ("Vision 2050",
 * "National Biodiversity Strategy & Action Plan") stack vertically
 * instead of overflowing into neighbouring arcs.
 */
function wrapLabel(label: string, maxCharsPerLine = 20): string[] {
  const words = label.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 1) return [label];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface Bucket {
  id: string;
  label: string;
  /** Short code (e.g. "NDC") kept around for the centre overlay where space is tight. */
  shortLabel: string;
  /** Full label including any trailing parenthetical, used as the SVG aria title. */
  fullLabel: string;
  color: string;
  targets: Target[];
}

/**
 * Wheel-display label: full human title minus a trailing parenthetical
 * (e.g. drops "(Parliament Resolution 36, June 2022)") so the rim stays
 * readable. The full string remains available via tooltips and aria.
 */
function prettyDocLabel(
  countryConfig: CountryConfig | null,
  docId: string,
): string {
  return getDocFullLabel(countryConfig, docId)
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
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
      label: prettyDocLabel(countryConfig, docId),
      shortLabel: getDocMediumLabel(countryConfig, docId),
      fullLabel: getDocFullLabel(countryConfig, docId),
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
    const name = info?.name ?? "Unclassified";
    out.push({
      id: cid,
      label: name,
      shortLabel: name,
      fullLabel: name,
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
      shortLabel: b.shortLabel,
      fullLabel: b.fullLabel,
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
  /** alignmentCount + tensionCount (Partial/`low`, `none` and same-arc pairs excluded). */
  total: number;
  /** tensionCount / total; drives the proportional terracotta core width. */
  flaggedShare: number;
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
      total: 0,
      flaggedShare: 0,
    };
    if (isContradiction(a.alignment)) slot.tensionCount += 1;
    else if (a.alignment === "high" || a.alignment === "medium") {
      slot.alignmentCount += 1;
    }
    out.set(key, slot);
  }
  for (const slot of out.values()) {
    slot.total = slot.alignmentCount + slot.tensionCount;
    slot.flaggedShare = slot.total > 0 ? slot.tensionCount / slot.total : 0;
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
  /**
   * Click an aggregated ribbon and route the doc-pair up to the host as
   * a navigation request instead of opening a single target-pair drawer.
   * When set, this fires instead of `onPairClick` — used by the Direction
   * slide to scroll to Doc Pairs with the matching pair surfaced.
   */
  onRibbonNavigate?: (arcAId: string, arcBId: string) => void;
  /** Click a rim arc → host switches focus. Pass null to support "unset focus" via re-clicking. */
  onArcClick?: (focus: WheelFocus) => void;
  /** Hover a rim arc or its label → host can set ephemeral focus. Pass null on leave. */
  onArcHover?: (focus: WheelFocus | null) => void;
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
  onRibbonNavigate,
  onArcClick,
  onArcHover,
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
  // Thin band just outside each arc, used in the document-focus view to show
  // that doc's aligned/flagged balance with the focused doc.
  const bandArc = useMemo(
    () =>
      d3arc<{ startAngle: number; endAngle: number }>()
        .innerRadius(OUTER_R + 4)
        .outerRadius(OUTER_R + 9),
    [],
  );
  const aggregates = useMemo(
    () => aggregateByArcPair(alignments, nodeMap),
    [alignments, nodeMap],
  );

  /**
   * Ribbon-width scale, normalised per corpus. Width is a gentle volume cue:
   * the busiest document-pair (by total scored pairs) tops out at RIBBON_MAX_PX
   * and everything else scales down, so a 5-document corpus and a 44k-pair
   * corpus both fit the wheel without hand-tuned constants. The alignment vs
   * friction signal is carried by colour (green base + proportional terracotta
   * core), not by width. See ./wheel-encoding.
   */
  const widthScale = useMemo(() => {
    let maxTotal = 0;
    for (const agg of aggregates.values()) {
      if (agg.total > maxTotal) maxTotal = agg.total;
    }
    return ribbonWidthScale(maxTotal);
  }, [aggregates]);

  /**
   * Per-document friction share for the rim attribution tint. A document's arc
   * warms toward terracotta in proportion to how much of its cross-document
   * relationships are flagged, anchored to the corpus norm, so the friction
   * source is legible at a glance. Document grouping only.
   */
  const docFriction = useMemo(
    () =>
      state.groupBy === "document"
        ? buildDocFrictionShares(alignments, targets, countryConfig)
        : null,
    [state.groupBy, alignments, targets, countryConfig],
  );
  /**
   * "Busy wheel" = many doc arcs around the rim. With ≥6 docs, even
   * normalized ribbons stack and read as opaque; we lower the default
   * stroke opacity so the underlying rim arcs and labels stay legible.
   * Hover, focus, and primer-highlight modes still pop up to full opacity.
   */
  const busyWheel = arcs.length > 5;

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

  // Document-focus view: when a single document arc is focused, summarise how
  // it relates to every other document (for the per-doc balance bands + the
  // centre readout). Doc-to-doc only; sector focus keeps plain ghosting.
  const docFocusActive =
    state.groupBy === "document" && focusArcId !== null;
  // Rim arcs encode per-document friction (Direction slide) only when the slide
  // opts in, we are grouping by document, and the shares are available.
  const showFrictionArcs =
    state.frictionArcs === true &&
    state.groupBy === "document" &&
    docFriction !== null;
  // Centre readout sums the focused doc's actual target-pairs across every visible
  // partner: the flagged total (never diluted to 0 by a per-doc majority vote) plus a
  // share that normalises away document size. The per-arc balance bands still carry the
  // aligned/flagged split for each individual partner.
  const focusInfo = useMemo(() => {
    if (!docFocusActive || !focusArcId) return null;
    const focusArc = arcsById.get(focusArcId);
    if (!focusArc) return null;
    let flagged = 0;
    let totalScored = 0;
    const bands: { arc: ArcInfo; alignedShare: number }[] = [];
    for (const arc of arcs) {
      if (arc.id === focusArcId || arc.id === UNCLASSIFIED_BUCKET_ID) continue;
      const [lo, hi] =
        focusArcId < arc.id ? [focusArcId, arc.id] : [arc.id, focusArcId];
      const agg = aggregates.get(`${lo}__${hi}`);
      if (!agg) continue;
      const signal = agg.alignmentCount + agg.tensionCount;
      if (signal === 0) continue;
      flagged += agg.tensionCount;
      totalScored += signal;
      bands.push({ arc, alignedShare: agg.alignmentCount / signal });
    }
    const share = totalScored > 0 ? flagged / totalScored : 0;
    return { focusArc, flagged, totalScored, share, bands };
  }, [docFocusActive, focusArcId, arcs, arcsById, aggregates]);

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

  const handleArcHover = (arc: ArcInfo | null) => {
    if (!onArcHover) return;
    if (!arc || arc.id === UNCLASSIFIED_BUCKET_ID) {
      onArcHover(null);
      return;
    }
    if (state.groupBy === "document") {
      onArcHover({ type: "doc", id: arc.id });
    } else {
      onArcHover({
        type: "sector",
        id: arc.id,
        taxonomyType: sectorTaxonomyType,
      });
    }
  };

  const handleAggregateClick = (agg: ArcPairAggregate) => {
    // Navigation-style routing wins when configured: the host decides
    // what to do with the doc-pair (e.g. scroll to the Doc Pairs slide).
    if (onRibbonNavigate) {
      onRibbonNavigate(agg.aId, agg.bId);
      return;
    }
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
          const hoverable = !!onArcHover && arc.id !== UNCLASSIFIED_BUCKET_ID;
          const frictionShare =
            showFrictionArcs && docFriction
              ? (docFriction.byDoc.get(arc.id as PolicyDocumentType) ?? 0)
              : null;
          const arcFill =
            frictionShare !== null && docFriction
              ? cellColor(frictionShare, docFriction.mid, docFriction.maxShare)
              : arc.color;
          return (
            <g key={arc.id}>
              <path
                d={d}
                fill={arcFill}
                opacity={isGhost ? 0.25 : isFocus ? 1 : 0.85}
                onClick={clickable ? () => handleArcClick(arc) : undefined}
                onMouseEnter={hoverable ? () => handleArcHover(arc) : undefined}
                onMouseLeave={hoverable ? () => handleArcHover(null) : undefined}
                className={clickable ? "cursor-pointer" : undefined}
                style={{ transition: "opacity 220ms" }}
              >
                <title>
                  {arc.fullLabel} · {arc.count} targets
                  {frictionShare !== null
                    ? ` · ${Math.round(frictionShare * 100)}% of cross-document links potentially misaligned`
                    : ""}
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
          if (agg.total === 0) return null;
          const baseWidth = ribbonBaseWidth(agg.total, widthScale);
          const coreWidth = ribbonCoreWidth(baseWidth, agg.flaggedShare);
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
          const clickable = (!!onPairClick || !!onRibbonNavigate) && !ghosted;
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
                  strokeWidth={baseWidth}
                  strokeOpacity={
                    ghosted
                      ? docFocusActive
                        ? 0
                        : 0.06
                      : isHover
                        ? 0.9
                        : docFocusActive
                          ? 0.7
                          : busyWheel
                            ? 0.4
                            : 0.55
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
                  strokeWidth={coreWidth}
                  strokeOpacity={
                    ghosted
                      ? docFocusActive
                        ? 0
                        : 0.08
                      : isHover
                        ? 0.9
                        : docFocusActive
                          ? 0.85
                          : busyWheel
                            ? 0.55
                            : 0.7
                  }
                  strokeDasharray="5 3"
                  strokeLinecap="round"
                  style={{ transition: "stroke-opacity 220ms" }}
                />
              )}
            </g>
          );
        })}

        {/* Hover readout for the active ribbon. Pinned to the top of the
            viewBox (clear of the ribbon mass and the centre focus readout) and
            auto-sized to its content, so a long document pair stays readable
            instead of overflowing a fixed box over the wheel centre. */}
        {hovered &&
          (() => {
            const agg = aggregates.get(hovered);
            if (!agg) return null;
            const aArc = arcsById.get(agg.aId);
            const bArc = arcsById.get(agg.bId);
            if (!aArc || !bArc) return null;
            const line1 = `${aArc.shortLabel} ↔ ${bArc.shortLabel}`;
            const pct = Math.round(agg.flaggedShare * 100);
            const line2 = `${agg.alignmentCount} aligned · ${agg.tensionCount} misaligned (${pct}%)`;
            const widest = Math.max(line1.length, line2.length);
            const boxW = Math.min(VB_W - 24, Math.max(150, widest * 7 + 28));
            const top = -VB / 2 + 6;
            return (
              <g pointerEvents="none">
                <rect
                  x={-boxW / 2}
                  y={top}
                  width={boxW}
                  height={46}
                  rx={4}
                  fill="white"
                  stroke="#d4d4d4"
                />
                <text
                  x={0}
                  y={top + 19}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--undp-black)"
                >
                  {line1}
                </text>
                <text
                  x={0}
                  y={top + 36}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--undp-gray)"
                >
                  {line2}
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

        {/* Group labels with collision avoidance. A spring relaxation pulls
            each label toward its arc midpoint and pushes overlapping
            neighbours apart, then an elbow leader line bridges the rim to the
            relaxed label position. Ported from the dashboard explorer so
            labels never stack on dense corpora (e.g. the sector lenses). */}
        {(() => {
          const LABEL_H = 14;
          const CHAR_W = 6.5;
          const MAX_CHARS_PER_LINE = 22;
          const entries = arcs
            .filter(
              (arc) => !(arc.id === UNCLASSIFIED_BUCKET_ID && arc.count < 3),
            )
            .map((arc) => {
              const lines = wrapLabel(arc.label, MAX_CHARS_PER_LINE);
              const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
              return {
                arc,
                lines,
                angle: arc.midAngle,
                // Angular footprint uses the longest wrapped line so the
                // push-apart stays correct for multi-line labels.
                angularSpan: (longest * CHAR_W) / GRP_LABEL_R,
              };
            });
          const sorted = [...entries].sort(
            (a, b) => a.arc.midAngle - b.arc.midAngle,
          );
          const PADDING = LABEL_H / GRP_LABEL_R;
          const HOME_PULL = 0.18;
          for (let iter = 0; iter < 60; iter++) {
            for (const e of sorted) {
              e.angle += HOME_PULL * (e.arc.midAngle - e.angle);
            }
            for (let i = 0; i < sorted.length - 1; i++) {
              const needed =
                (sorted[i].angularSpan + sorted[i + 1].angularSpan) / 2 +
                PADDING;
              const gap = sorted[i + 1].angle - sorted[i].angle;
              if (gap < needed) {
                const half = (needed - gap) / 2;
                sorted[i].angle -= half;
                sorted[i + 1].angle += half;
              }
            }
          }
          return sorted.map(({ arc, angle, lines }) => {
            // Leader line: rim (at the arc's true midAngle) to an elbow just
            // outside the rim, then out to the relaxed label position.
            const arcX = (OUTER_R + 3) * Math.sin(arc.midAngle);
            const arcY = -(OUTER_R + 3) * Math.cos(arc.midAngle);
            const elbowR = OUTER_R + 14;
            const elbowX = elbowR * Math.sin(angle);
            const elbowY = -elbowR * Math.cos(angle);
            const lx = GRP_LABEL_R * Math.sin(angle);
            const ly = -GRP_LABEL_R * Math.cos(angle);
            const deg = (((angle * 180) / Math.PI) % 360 + 360) % 360;
            const anchor: "start" | "middle" | "end" =
              deg > 20 && deg < 160
                ? "start"
                : deg > 200 && deg < 340
                  ? "end"
                  : "middle";
            const nudge = anchor === "start" ? 3 : anchor === "end" ? -3 : 0;
            const isFocus = focusArcId === arc.id;
            const isGhost =
              focusArcId !== null && !isFocus && !state.highlightPair;
            // First tspan rises by half the block so the label stays centred
            // on its radial position (dominantBaseline handles the rest).
            const firstDy = -((lines.length - 1) * 0.55);
            // Labels share the arc's hit target: if the arc accepts clicks, so
            // does its label (otherwise long titles read as broken).
            const labelClickable =
              !!onArcClick && arc.id !== UNCLASSIFIED_BUCKET_ID;
            return (
              <g key={`label-${arc.id}`}>
                <path
                  d={`M${arcX},${arcY} L${elbowX},${elbowY} L${lx},${ly}`}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={1}
                  opacity={
                    focusArcId !== null ? (isFocus ? 0.55 : 0.12) : 0.3
                  }
                  className="pointer-events-none"
                  style={{ transition: "opacity 220ms" }}
                />
                <text
                  x={lx + nudge}
                  y={ly}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize={11}
                  fontWeight={isFocus ? 700 : 500}
                  fill="var(--undp-black)"
                  opacity={isGhost ? 0.4 : 1}
                  onClick={
                    labelClickable ? () => handleArcClick(arc) : undefined
                  }
                  className={
                    labelClickable
                      ? "select-none cursor-pointer"
                      : "select-none pointer-events-none"
                  }
                  style={{ transition: "opacity 220ms" }}
                >
                  <title>{arc.fullLabel}</title>
                  {lines.map((line, i) => (
                    <tspan
                      key={i}
                      x={lx + nudge}
                      dy={i === 0 ? `${firstDy}em` : "1.1em"}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          });
        })()}

        {/* Document-focus overlay: per-doc balance bands + centre readout. */}
        {focusInfo && (
          <g key={`focus-${focusArcId}`}>
            <defs>
              <style>{`
                @keyframes wbBand { from { opacity: 0; } to { opacity: 1; } }
                @keyframes wbReadout { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
              `}</style>
            </defs>
            {focusInfo.bands.map((band, i) => {
              const span = band.arc.endAngle - band.arc.startAngle;
              const greenEnd = band.arc.startAngle + span * band.alignedShare;
              const greenD =
                band.alignedShare > 0
                  ? bandArc({
                      startAngle: band.arc.startAngle,
                      endAngle: greenEnd,
                    })
                  : null;
              const redD =
                band.alignedShare < 1
                  ? bandArc({ startAngle: greenEnd, endAngle: band.arc.endAngle })
                  : null;
              return (
                <g
                  key={`band-${band.arc.id}`}
                  style={{ animation: `wbBand 340ms ease-out ${i * 40}ms both` }}
                >
                  {greenD && <path d={greenD} fill={ALIGNMENT_COLORS.high} />}
                  {redD && <path d={redD} fill={ALIGNMENT_COLORS.flagged} />}
                </g>
              );
            })}
            {!state.suppressFocusReadout && (
              <g
                onClick={onArcClick ? () => onArcClick(null) : undefined}
                className={onArcClick ? "cursor-pointer" : undefined}
                style={{ animation: "wbReadout 300ms ease-out both" }}
              >
                <text
                  x={0}
                  y={-10}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight={700}
                  fill="var(--undp-black)"
                  stroke="#fbfaf7"
                  strokeWidth={3.5}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  {focusInfo.focusArc.shortLabel}
                </text>
                <text
                  x={0}
                  y={11}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={600}
                  stroke="#fbfaf7"
                  strokeWidth={3}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  <tspan fill={ALIGNMENT_COLORS.flagged}>
                    {focusInfo.flagged === 0
                      ? "No potential misalignments"
                      : focusInfo.flagged === 1
                        ? "1 potential misalignment"
                        : `${focusInfo.flagged.toLocaleString()} potential misalignments`}
                  </tspan>
                </text>
                <text
                  x={0}
                  y={28}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--undp-gray)"
                  stroke="#fbfaf7"
                  strokeWidth={2.5}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  {focusInfo.flagged === 0
                    ? `across ${focusInfo.totalScored.toLocaleString()} pairs`
                    : focusInfo.share * 100 < 1
                      ? `<1% of ${focusInfo.totalScored.toLocaleString()} pairs`
                      : `${Math.round(focusInfo.share * 100)}% of ${focusInfo.totalScored.toLocaleString()} pairs`}
                </text>
                <text
                  x={0}
                  y={42}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--undp-gray)"
                  stroke="#fbfaf7"
                  strokeWidth={2.5}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  click to clear focus
                </text>
              </g>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
