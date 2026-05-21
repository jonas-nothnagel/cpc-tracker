"use client";

/**
 * WheelCenterpiece — proper d3-chord diagram for the storytelling deck.
 *
 * In A3 the wheel used hand-rolled bezier ribbons that all started at
 * each doc-arc midpoint, so endpoint positions and widths read as
 * arbitrary. d3-chord fixes both: each doc's rim arc is subdivided into
 * segments proportional to its relationship with every other doc, and
 * the ribbon endpoints sit precisely on those segments. The visual
 * encoding becomes legible: "this slice of NDC's rim is the share of
 * NDC's signal that goes to NBSAP".
 *
 * State drives the matrix:
 *   - aggregate   → total signal (alignments + tensions). Ribbons
 *                   coloured by which side dominates the pair.
 *   - alignments  → alignment counts only. Green ribbons.
 *   - tensions    → tension counts only. Red ribbons.
 *   - idle        → rim arcs only, no ribbons.
 *   - pair        → stable per-target layout. One bezier highlights the
 *                   specific pair; rim shows all targets faintly.
 *   - sector      → stable per-target layout. Individual chords touching
 *                   the sector category, the rest dimmed.
 *
 * Chord mode hover shows the doc-pair signal breakdown. Pair / sector
 * modes use the same per-pair chord rendering as A1/A2 for full
 * inspectability.
 */

import { useMemo, useState } from "react";
import { arc as d3arc } from "d3-shape";
import { chord, ribbon } from "d3-chord";
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
const RIBBON_R = 207;
const NODE_R = 205;
const STABLE_GAP = 0.08;
const CHORD_PAD = 0.04;

// ─── State ──────────────────────────────────────────────────────────

export type WheelStateMode =
  | "idle"
  | "aggregate"
  | "alignments"
  | "tensions"
  | "pair"
  | "sector";

export interface WheelState {
  mode: WheelStateMode;
  pair?: { aId: string; bId: string };
  sectorCategoryId?: string;
  sectorTaxonomyType?: string;
}

interface NodePos {
  id: string;
  target: Target;
  groupId: PolicyDocumentType;
  angle: number;
  x: number;
  y: number;
}

interface StableGroup {
  id: PolicyDocumentType;
  label: string;
  color: string;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  count: number;
}

interface StableLayout {
  nodes: NodePos[];
  groups: StableGroup[];
  nodeMap: Map<string, NodePos>;
}

function curvePath(ax: number, ay: number, bx: number, by: number) {
  const cx = ((ax + bx) / 2) * 0.25;
  const cy = ((ay + by) / 2) * 0.25;
  return `M${ax},${ay} Q${cx},${cy} ${bx},${by}`;
}

/** Stable rim layout — one group per source document, proportional to
 *  target count. Used for pair / sector / idle modes where the rim must
 *  match individual target positions. */
function buildStableLayout(
  targets: Target[],
  countryConfig: CountryConfig | null,
): StableLayout {
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
    .sort((a, b) => a.id.localeCompare(b.id));

  const totalTargets = groups.reduce((s, g) => s + g.targets.length, 0);
  const avail = 2 * Math.PI - STABLE_GAP * groups.length;
  const nodes: NodePos[] = [];
  const out: StableGroup[] = [];
  let cur = 0;
  for (const g of groups) {
    const span = (g.targets.length / totalTargets) * avail;
    const start = cur;
    const end = cur + span;
    const mid = (start + end) / 2;
    out.push({
      id: g.id,
      label: g.label,
      color: g.color,
      startAngle: start,
      endAngle: end,
      midAngle: mid,
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
    cur = end + STABLE_GAP;
  }
  return { nodes, groups: out, nodeMap: new Map(nodes.map((n) => [n.id, n])) };
}

/** Build a doc × doc matrix for d3-chord. Filter controls which pair
 *  levels count toward the matrix entries. */
function buildDocMatrix(
  docs: PolicyDocumentType[],
  alignments: AlignmentResult[],
  nodeMap: Map<string, NodePos>,
  filter: "all" | "alignments" | "tensions",
): number[][] {
  const idx = new Map(docs.map((d, i) => [d, i]));
  const m: number[][] = docs.map(() => docs.map(() => 0));
  for (const a of alignments) {
    if (a.alignment === "none") continue;
    const nA = nodeMap.get(a.targetAId);
    const nB = nodeMap.get(a.targetBId);
    if (!nA || !nB) continue;
    if (nA.groupId === nB.groupId) continue;
    if (filter === "alignments") {
      if (!(a.alignment === "high" || a.alignment === "medium")) continue;
    } else if (filter === "tensions") {
      if (!isContradiction(a.alignment)) continue;
    }
    const i = idx.get(nA.groupId)!;
    const j = idx.get(nB.groupId)!;
    m[i][j] += 1;
    m[j][i] += 1;
  }
  return m;
}

/** Per-pair alignment/tension breakdown, keyed by sorted "i__j". Used to
 *  colour aggregate ribbons by dominance. */
function buildDocPairBreakdown(
  docs: PolicyDocumentType[],
  alignments: AlignmentResult[],
  nodeMap: Map<string, NodePos>,
): Map<string, { aligned: number; tension: number }> {
  const idx = new Map(docs.map((d, i) => [d, i]));
  const out = new Map<string, { aligned: number; tension: number }>();
  for (const a of alignments) {
    if (a.alignment === "none") continue;
    const nA = nodeMap.get(a.targetAId);
    const nB = nodeMap.get(a.targetBId);
    if (!nA || !nB) continue;
    if (nA.groupId === nB.groupId) continue;
    const i = idx.get(nA.groupId)!;
    const j = idx.get(nB.groupId)!;
    const [x, y] = i < j ? [i, j] : [j, i];
    const key = `${x}__${y}`;
    const slot = out.get(key) ?? { aligned: 0, tension: 0 };
    if (isContradiction(a.alignment)) slot.tension += 1;
    else if (a.alignment === "high" || a.alignment === "medium") {
      slot.aligned += 1;
    }
    out.set(key, slot);
  }
  return out;
}

function ribbonColor(
  mode: WheelStateMode,
  breakdown: { aligned: number; tension: number } | undefined,
): { fill: string; opacity: number } {
  if (mode === "tensions") {
    return { fill: ALIGNMENT_COLORS.possible_conflict, opacity: 0.7 };
  }
  if (mode === "alignments") {
    return { fill: ALIGNMENT_COLORS.high, opacity: 0.55 };
  }
  // aggregate — color by dominance, opacity by clarity of dominance
  if (!breakdown) {
    return { fill: ALIGNMENT_COLORS.medium, opacity: 0.5 };
  }
  const total = breakdown.aligned + breakdown.tension;
  if (total === 0) {
    return { fill: ALIGNMENT_COLORS.medium, opacity: 0.4 };
  }
  const alignShare = breakdown.aligned / total;
  if (alignShare >= 0.6) {
    return { fill: ALIGNMENT_COLORS.high, opacity: 0.55 };
  }
  if (alignShare <= 0.4) {
    return { fill: ALIGNMENT_COLORS.possible_conflict, opacity: 0.65 };
  }
  // Mixed pair — neutral amber stays visible without claiming a verdict.
  return { fill: "#b45309", opacity: 0.5 };
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
  const stable = useMemo(
    () => buildStableLayout(targets, countryConfig),
    [targets, countryConfig],
  );

  // Doc list for chord layout, sorted by id for stability across modes.
  const docs = useMemo(
    () => stable.groups.map((g) => g.id),
    [stable.groups],
  );

  // Chord layout per mode (when applicable). Memoised against the mode +
  // dataset so toggling between idle/pair/sector and chord modes is cheap.
  const chordData = useMemo(() => {
    if (
      state.mode !== "aggregate" &&
      state.mode !== "alignments" &&
      state.mode !== "tensions"
    ) {
      return null;
    }
    if (docs.length < 2) return null;
    const matrix = buildDocMatrix(
      docs,
      alignments,
      stable.nodeMap,
      state.mode === "aggregate" ? "all" : state.mode,
    );
    const layout = chord().padAngle(CHORD_PAD).sortGroups((a, b) => b - a)(
      matrix,
    );
    return layout;
  }, [state.mode, docs, alignments, stable.nodeMap]);

  const docBreakdown = useMemo(
    () => buildDocPairBreakdown(docs, alignments, stable.nodeMap),
    [docs, alignments, stable.nodeMap],
  );

  const arcGenChord = useMemo(
    () =>
      d3arc<{ startAngle: number; endAngle: number }>()
        .innerRadius(INNER_R)
        .outerRadius(OUTER_R),
    [],
  );

  // Sector membership (per-target ids) for sector mode.
  const sectorTargetIds = useMemo(() => {
    if (state.mode !== "sector" || !state.sectorCategoryId) {
      return new Set<string>();
    }
    const ids = new Set<string>();
    for (const c of classifications) {
      if (!c.isPrimary) continue;
      if (c.taxonomyType !== state.sectorTaxonomyType) continue;
      if (c.categoryId !== state.sectorCategoryId) continue;
      if (!stable.nodeMap.has(c.targetId)) continue;
      ids.add(c.targetId);
    }
    return ids;
  }, [
    state.mode,
    state.sectorCategoryId,
    state.sectorTaxonomyType,
    classifications,
    stable.nodeMap,
  ]);

  // Per-pair visible chords for sector / pair modes.
  const visiblePerPair = useMemo(() => {
    if (state.mode === "sector") {
      return alignments.filter(
        (a) =>
          a.alignment !== "none" &&
          stable.nodeMap.has(a.targetAId) &&
          stable.nodeMap.has(a.targetBId) &&
          (sectorTargetIds.has(a.targetAId) ||
            sectorTargetIds.has(a.targetBId)),
      );
    }
    return [];
  }, [state.mode, alignments, stable.nodeMap, sectorTargetIds]);

  const [hoveredChord, setHoveredChord] = useState<{
    aDoc: PolicyDocumentType;
    bDoc: PolicyDocumentType;
  } | null>(null);

  const isChordMode =
    state.mode === "aggregate" ||
    state.mode === "alignments" ||
    state.mode === "tensions";

  return (
    <div className="w-full flex flex-col items-center">
      <svg
        viewBox={`${-VB_W / 2} ${-VB / 2} ${VB_W} ${VB}`}
        className="w-full"
        style={{ maxHeight: 600 }}
        role="img"
        aria-label="Policy coherence wheel"
      >
        {isChordMode && chordData ? (
          <ChordView
            chordData={chordData}
            docs={docs}
            stable={stable}
            countryConfig={countryConfig}
            arcGen={arcGenChord}
            breakdown={docBreakdown}
            mode={state.mode}
            hoveredChord={hoveredChord}
            onHover={setHoveredChord}
          />
        ) : (
          <StableView
            stable={stable}
            arcGen={arcGenChord}
            countryConfig={countryConfig}
            visiblePerPair={visiblePerPair}
            state={state}
            sectorTargetIds={sectorTargetIds}
            onPairClick={onPairClick}
          />
        )}
      </svg>

      <ChordHoverCaption
        hoveredChord={hoveredChord}
        docs={docs}
        breakdown={docBreakdown}
        countryConfig={countryConfig}
      />
    </div>
  );
}

// ─── Chord view (aggregate / alignments / tensions) ─────────────────

function ChordView({
  chordData,
  docs,
  stable,
  countryConfig,
  arcGen,
  breakdown,
  mode,
  hoveredChord,
  onHover,
}: {
  chordData: ReturnType<ReturnType<typeof chord>>;
  docs: PolicyDocumentType[];
  stable: StableLayout;
  countryConfig: CountryConfig | null;
  arcGen: ReturnType<typeof d3arc<{ startAngle: number; endAngle: number }>>;
  breakdown: Map<string, { aligned: number; tension: number }>;
  mode: WheelStateMode;
  hoveredChord: { aDoc: PolicyDocumentType; bDoc: PolicyDocumentType } | null;
  onHover: (
    h: { aDoc: PolicyDocumentType; bDoc: PolicyDocumentType } | null,
  ) => void;
}) {
  // Ribbon generator lives inside the chord-only view so its types stay
  // local. Cast at call sites because d3-chord's `ribbon()` return
  // signature doesn't carry the chord-input shape through unless we
  // declare a heavy generic chain.
  const ribbonGen = ribbon().radius(RIBBON_R);
  const renderRibbon = (c: unknown): string =>
    ribbonGen(c as never) as unknown as string;
  return (
    <g>
      {/* Group arcs */}
      {chordData.groups.map((g) => {
        const doc = docs[g.index];
        const colour = getDocColor(countryConfig, doc);
        const d = arcGen({ startAngle: g.startAngle, endAngle: g.endAngle });
        if (!d) return null;
        return (
          <g key={`g-${doc}`}>
            <path d={d} fill={colour} opacity={0.85}>
              <title>{`${getDocMediumLabel(countryConfig, doc)} · ${g.value} ${mode === "tensions" ? "flagged" : mode === "alignments" ? "aligned" : "scored"} cross-doc pairs`}</title>
            </path>
            <GroupLabel
              doc={doc}
              startAngle={g.startAngle}
              endAngle={g.endAngle}
              countryConfig={countryConfig}
            />
          </g>
        );
      })}

      {/* Ribbons */}
      {chordData.map((c, i) => {
        const aDoc = docs[c.source.index];
        const bDoc = docs[c.target.index];
        if (!aDoc || !bDoc) return null;
        const key =
          c.source.index < c.target.index
            ? `${c.source.index}__${c.target.index}`
            : `${c.target.index}__${c.source.index}`;
        const breakdownEntry = breakdown.get(key);
        const colour = ribbonColor(mode, breakdownEntry);
        const isHovered =
          hoveredChord &&
          ((hoveredChord.aDoc === aDoc && hoveredChord.bDoc === bDoc) ||
            (hoveredChord.aDoc === bDoc && hoveredChord.bDoc === aDoc));
        return (
          <path
            key={`r-${i}`}
            d={renderRibbon(c)}
            fill={colour.fill}
            fillOpacity={isHovered ? Math.min(0.95, colour.opacity + 0.2) : colour.opacity}
            stroke={colour.fill}
            strokeOpacity={isHovered ? 0.9 : 0.4}
            strokeWidth={0.6}
            style={{ transition: "fill-opacity 200ms, stroke-opacity 200ms" }}
            onMouseEnter={() => onHover({ aDoc, bDoc })}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}

      {/* Subtle guide ring inside the rim, so empty wheels read as wheels */}
      <circle
        cx={0}
        cy={0}
        r={NODE_R - 5}
        fill="none"
        stroke="#e7e5e0"
        strokeWidth={1}
        strokeDasharray="3 5"
      />

      {/* Faint per-target tick marks at stable positions so the user can
          still tell each rim arc covers many targets */}
      {stable.nodes.map((node) => {
        const docColour = getDocColor(
          countryConfig,
          node.target.sourceDocument,
        );
        return (
          <circle
            key={`t-${node.id}`}
            cx={node.x}
            cy={node.y}
            r={1.2}
            fill={docColour}
            opacity={0.18}
            pointerEvents="none"
          />
        );
      })}
    </g>
  );
}

// ─── Stable view (idle / pair / sector) ─────────────────────────────

function StableView({
  stable,
  arcGen,
  countryConfig,
  visiblePerPair,
  state,
  sectorTargetIds,
  onPairClick,
}: {
  stable: StableLayout;
  arcGen: ReturnType<typeof d3arc<{ startAngle: number; endAngle: number }>>;
  countryConfig: CountryConfig | null;
  visiblePerPair: AlignmentResult[];
  state: WheelState;
  sectorTargetIds: Set<string>;
  onPairClick?: (a: string, b: string) => void;
}) {
  const focusedNodeIds: Set<string> | null =
    state.mode === "pair" && state.pair
      ? new Set([state.pair.aId, state.pair.bId])
      : state.mode === "sector"
        ? sectorTargetIds
        : null;

  // Render alignments first, tensions on top.
  const ordered: AlignmentResult[] = [];
  if (state.mode === "sector") {
    const a: AlignmentResult[] = [];
    const t: AlignmentResult[] = [];
    for (const p of visiblePerPair) {
      if (isContradiction(p.alignment)) t.push(p);
      else a.push(p);
    }
    ordered.push(...a, ...t);
  }

  return (
    <g>
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
      {stable.groups.map((g) => {
        const d = arcGen({
          startAngle: g.startAngle,
          endAngle: g.endAngle,
        });
        if (!d) return null;
        const dim =
          focusedNodeIds &&
          !stable.nodes.some(
            (n) => n.groupId === g.id && focusedNodeIds.has(n.id),
          );
        return (
          <g key={`g-${g.id}`}>
            <path d={d} fill={g.color} opacity={dim ? 0.2 : 0.85}>
              <title>{`${g.label} · ${g.count} targets`}</title>
            </path>
            <GroupLabel
              doc={g.id}
              startAngle={g.startAngle}
              endAngle={g.endAngle}
              countryConfig={countryConfig}
            />
          </g>
        );
      })}

      {/* Sector chords */}
      {state.mode === "sector" &&
        ordered.map((conn) => {
          const nA = stable.nodeMap.get(conn.targetAId);
          const nB = stable.nodeMap.get(conn.targetBId);
          if (!nA || !nB) return null;
          const contra = isContradiction(conn.alignment);
          return (
            <path
              key={`s-${conn.targetAId}__${conn.targetBId}`}
              d={curvePath(nA.x, nA.y, nB.x, nB.y)}
              fill="none"
              stroke={ALIGNMENT_COLORS[conn.alignment]}
              strokeWidth={contra ? 1.6 : 1.2}
              strokeOpacity={contra ? 0.85 : 0.55}
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

      {/* Pair highlight */}
      {state.mode === "pair" && state.pair &&
        (() => {
          const nA = stable.nodeMap.get(state.pair.aId);
          const nB = stable.nodeMap.get(state.pair.bId);
          if (!nA || !nB) return null;
          // No alignment object available without a lookup; the parent
          // typically knows the colour. Default to a neutral darker tone
          // so the highlight reads as "important" without claiming a
          // verdict that doesn't appear in props.
          return (
            <g>
              <path
                d={curvePath(nA.x, nA.y, nB.x, nB.y)}
                fill="none"
                stroke="var(--undp-black)"
                strokeWidth={3}
                strokeOpacity={0.85}
                strokeLinecap="round"
              />
              <circle cx={nA.x} cy={nA.y} r={5.5} fill="var(--undp-black)" />
              <circle cx={nB.x} cy={nB.y} r={5.5} fill="var(--undp-black)" />
            </g>
          );
        })()}

      {/* Nodes */}
      {stable.nodes.map((node) => {
        const docColor = getDocColor(
          countryConfig,
          node.target.sourceDocument,
        );
        const inFocus = focusedNodeIds === null ? true : focusedNodeIds.has(node.id);
        return (
          <circle
            key={node.id}
            cx={node.x}
            cy={node.y}
            r={inFocus ? 2.4 : 1.6}
            fill={docColor}
            opacity={inFocus ? 0.95 : 0.3}
          />
        );
      })}
    </g>
  );
}

// ─── Shared widgets ─────────────────────────────────────────────────

function GroupLabel({
  doc,
  startAngle,
  endAngle,
  countryConfig,
}: {
  doc: PolicyDocumentType;
  startAngle: number;
  endAngle: number;
  countryConfig: CountryConfig | null;
}) {
  const mid = (startAngle + endAngle) / 2;
  const labelR = 244;
  const x = labelR * Math.sin(mid);
  const y = -labelR * Math.cos(mid);
  const deg = (mid * 180) / Math.PI;
  const anchor: "start" | "middle" | "end" =
    deg > 20 && deg < 160 ? "start" : deg > 200 && deg < 340 ? "end" : "middle";
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={500}
      fill="var(--undp-black)"
      className="select-none pointer-events-none"
    >
      {getDocMediumLabel(countryConfig, doc)}
    </text>
  );
}

function ChordHoverCaption({
  hoveredChord,
  docs,
  breakdown,
  countryConfig,
}: {
  hoveredChord: { aDoc: PolicyDocumentType; bDoc: PolicyDocumentType } | null;
  docs: PolicyDocumentType[];
  breakdown: Map<string, { aligned: number; tension: number }>;
  countryConfig: CountryConfig | null;
}) {
  if (!hoveredChord) {
    return (
      <p className="mt-1 text-[10px] text-[var(--undp-gray)]">
        Hover any ribbon to see the alignment / tension breakdown for a
        document pair.
      </p>
    );
  }
  const i = docs.indexOf(hoveredChord.aDoc);
  const j = docs.indexOf(hoveredChord.bDoc);
  if (i < 0 || j < 0) return null;
  const key = i < j ? `${i}__${j}` : `${j}__${i}`;
  const b = breakdown.get(key);
  return (
    <p className="mt-1 text-[11px] text-[var(--undp-black)] font-medium tabular-nums">
      {getDocMediumLabel(countryConfig, hoveredChord.aDoc)}
      <span className="mx-2 text-[var(--undp-gray)]">↔</span>
      {getDocMediumLabel(countryConfig, hoveredChord.bDoc)}
      <span className="mx-3 text-[var(--undp-gray)]">·</span>
      <span style={{ color: ALIGNMENT_COLORS.high }}>
        {b?.aligned ?? 0} aligned
      </span>
      <span className="mx-2 text-[var(--undp-gray)]">·</span>
      <span style={{ color: ALIGNMENT_COLORS.possible_conflict }}>
        {b?.tension ?? 0} flagged
      </span>
    </p>
  );
}
