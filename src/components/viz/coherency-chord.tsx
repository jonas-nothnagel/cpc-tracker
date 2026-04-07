"use client";

import { useState, useMemo } from "react";
import { chord as d3Chord, ribbon as d3Ribbon } from "d3-chord";
import { arc as d3Arc } from "d3-shape";
import { DOC_COLORS, DOC_LABELS, ALIGNMENT_COLORS } from "@/lib/utils";
import { InfoBox } from "@/components/ui/info-box";
import { isContradiction } from "@/types";
import type { AlignmentResult, AlignmentLevel, Target, PolicyDocumentType } from "@/types";

interface CoherencyChordProps {
  alignmentData: AlignmentResult[];
  targets: Target[];
  onPairClick?: (docA: PolicyDocumentType, docB: PolicyDocumentType) => void;
}

type DetailBreakdown = {
  high: number;
  medium: number;
  low: number;
  none: number;
  low_tension: number;
  moderate_contradiction: number;
  high_contradiction: number;
};

const EMPTY_DETAIL: DetailBreakdown = {
  high: 0, medium: 0, low: 0, none: 0,
  low_tension: 0, moderate_contradiction: 0, high_contradiction: 0,
};

/**
 * Aggregate alignment data into a document-type-level matrix and
 * render as an interactive chord diagram with contradiction support.
 */
export function CoherencyChord({ alignmentData, targets, onPairClick }: CoherencyChordProps) {
  const [hoveredArc, setHoveredArc] = useState<number | null>(null);
  const [hoveredChord, setHoveredChord] = useState<{
    source: number;
    target: number;
    x: number;
    y: number;
  } | null>(null);

  const targetMap = useMemo(
    () => new Map(targets.map((t) => [t.id, t])),
    [targets]
  );

  // Build ordered list of document types, NxN matrix, and coherency scores
  const { docTypes, matrix, detailMatrix, targetCounts, pairScores } = useMemo(() => {
    const typesSet = new Set<PolicyDocumentType>();
    for (const t of targets) typesSet.add(t.sourceDocument);
    const types = Array.from(typesSet);

    const typeIndex = new Map(types.map((t, i) => [t, i]));
    const n = types.length;

    const counts = new Array(n).fill(0);
    for (const t of targets) {
      const idx = typeIndex.get(t.sourceDocument);
      if (idx !== undefined) counts[idx]++;
    }

    const mat: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const detail: Record<string, DetailBreakdown>[] = Array.from(
      { length: n },
      () => ({})
    );

    for (const a of alignmentData) {
      if (a.alignment === "none") continue;

      const tA = targetMap.get(a.targetAId);
      const tB = targetMap.get(a.targetBId);
      if (!tA || !tB) continue;

      const iA = typeIndex.get(tA.sourceDocument);
      const iB = typeIndex.get(tB.sourceDocument);
      if (iA === undefined || iB === undefined) continue;

      mat[iA][iB]++;
      mat[iB][iA]++;

      const keyAB = `${iA}-${iB}`;
      const keyBA = `${iB}-${iA}`;
      if (!detail[iA][keyAB]) detail[iA][keyAB] = { ...EMPTY_DETAIL };
      if (!detail[iB][keyBA]) detail[iB][keyBA] = { ...EMPTY_DETAIL };
      detail[iA][keyAB][a.alignment]++;
      detail[iB][keyBA][a.alignment]++;
    }

    const scores: {
      iA: number;
      iB: number;
      score: number;
      coverage: number;
      contradictions: number;
    }[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const key = `${i}-${j}`;
        const d = detail[i][key] ?? { ...EMPTY_DETAIL };
        const weighted = 3 * d.high + 2 * d.medium + 1 * d.low;
        const possible = counts[i] * counts[j];
        const score = possible > 0 ? Math.round((weighted / (3 * possible)) * 100) : 0;
        const aligned = d.high + d.medium + d.low;
        const coverage = possible > 0 ? Math.round((aligned / possible) * 100) : 0;
        const contradictions = d.high_contradiction + d.moderate_contradiction + d.low_tension;
        scores.push({ iA: i, iB: j, score, coverage, contradictions });
      }
    }
    scores.sort((a, b) => b.score - a.score);

    return { docTypes: types, matrix: mat, detailMatrix: detail, targetCounts: counts, pairScores: scores };
  }, [alignmentData, targets, targetMap]);

  // Compute chord layout
  const chordLayout = useMemo(() => {
    const layout = d3Chord().padAngle(0.05).sortSubgroups((a, b) => b - a);
    return layout(matrix);
  }, [matrix]);

  // No data guard
  if (docTypes.length < 2) {
    return (
      <div className="text-center py-12 text-sm text-[var(--undp-gray)]">
        At least two document types are needed for a coherency overview.
      </div>
    );
  }

  const totalAligned = alignmentData.filter((a) => a.alignment !== "none").length;
  if (totalAligned === 0) {
    return (
      <div className="text-center py-12 text-sm text-[var(--undp-gray)]">
        No alignment or contradiction relationships found between documents.
      </div>
    );
  }

  const totalContradictions = alignmentData.filter((a) => isContradiction(a.alignment)).length;

  const size = 460;
  const outerRadius = size / 2 - 40;
  const innerRadius = outerRadius - 20;

  const arcGen = d3Arc<{ startAngle: number; endAngle: number }>()
    .innerRadius(innerRadius)
    .outerRadius(outerRadius);

  const ribbonGen = d3Ribbon<
    { source: { startAngle: number; endAngle: number }; target: { startAngle: number; endAngle: number } },
    { startAngle: number; endAngle: number }
  >().radius(innerRadius);

  function getChordDetail(sourceIdx: number, targetIdx: number): DetailBreakdown {
    const key = `${sourceIdx}-${targetIdx}`;
    return detailMatrix[sourceIdx]?.[key] ?? { ...EMPTY_DETAIL };
  }

  function chordColor(sourceIdx: number, targetIdx: number): string {
    const d = getChordDetail(sourceIdx, targetIdx);
    const contraTotal = d.high_contradiction + d.moderate_contradiction + d.low_tension;
    const alignTotal = d.high + d.medium + d.low;

    if (contraTotal > alignTotal) {
      if (d.high_contradiction > 0) return ALIGNMENT_COLORS.high_contradiction;
      if (d.moderate_contradiction > 0) return ALIGNMENT_COLORS.moderate_contradiction;
      return ALIGNMENT_COLORS.low_tension;
    }
    if (d.high > 0 && d.high >= d.medium && d.high >= d.low) return ALIGNMENT_COLORS.high;
    if (d.medium > 0 && d.medium >= d.low) return ALIGNMENT_COLORS.medium;
    if (d.low > 0) return ALIGNMENT_COLORS.low;
    if (contraTotal > 0) return ALIGNMENT_COLORS.low_tension;
    return "#e5e7eb";
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[var(--undp-black)]">
          Document Coherency Overview
          <InfoBox>
            This shows the overall alignment between document types.
            <br /><br />
            <strong>Coherency %:</strong> quality-weighted score (high = 3pts, medium = 2, low = 1), normalized against maximum possible pairs.<br />
            <strong>Coverage %:</strong> share of possible cross-document target pairs that show any alignment.<br />
            <strong>Conflicts:</strong> pairs where targets work against each other.
          </InfoBox>
        </h3>
        <p className="text-sm text-[var(--undp-gray)] mt-1">
          Across {docTypes.length} document types, {totalAligned} target
          pair{totalAligned !== 1 ? "s" : ""} show relationships
          {totalContradictions > 0 && (
            <>
              {" "}(
              <a href="#contradictions" className="text-red-600 hover:underline">
                {totalContradictions} contradiction{totalContradictions !== 1 ? "s" : ""}
              </a>
              )
            </>
          )}
          . Click a ribbon or table row to jump to the detailed pairwise heatmap.
        </p>
      </div>

      {/* Legends */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          {docTypes.map((dt) => (
            <div key={dt} className="flex items-center gap-1.5">
              <span
                className="w-3.5 h-3.5 rounded-sm inline-block"
                style={{ backgroundColor: DOC_COLORS[dt] }}
              />
              <span className="text-[var(--undp-gray)]">
                {DOC_LABELS[dt]} ({targetCounts[docTypes.indexOf(dt)]})
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {(["high", "medium", "low"] as AlignmentLevel[]).map((level) => (
            <div key={level} className="flex items-center gap-1.5">
              <span
                className="w-3.5 h-3.5 rounded-sm inline-block"
                style={{ backgroundColor: ALIGNMENT_COLORS[level] }}
              />
              <span className="text-[var(--undp-gray)] capitalize">{level}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span
              className="w-3.5 h-3.5 rounded-sm inline-block"
              style={{ backgroundColor: ALIGNMENT_COLORS.low_tension }}
            />
            <span className="text-[var(--undp-gray)]">Tension</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-3.5 h-3.5 rounded-sm inline-block"
              style={{ backgroundColor: ALIGNMENT_COLORS.high_contradiction }}
            />
            <span className="text-[var(--undp-gray)]">Contradiction</span>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full max-w-[460px]"
          style={{ overflow: "visible" }}
        >
          <g transform={`translate(${size / 2}, ${size / 2})`}>
            {/* Ribbons (chords) */}
            {chordLayout.map((ch, i) => {
              const isActive =
                hoveredArc === null ||
                hoveredArc === ch.source.index ||
                hoveredArc === ch.target.index;
              const isChordHovered =
                hoveredChord &&
                ((hoveredChord.source === ch.source.index &&
                  hoveredChord.target === ch.target.index) ||
                  (hoveredChord.source === ch.target.index &&
                    hoveredChord.target === ch.source.index));

              const d = ribbonGen({
                source: { startAngle: ch.source.startAngle, endAngle: ch.source.endAngle },
                target: { startAngle: ch.target.startAngle, endAngle: ch.target.endAngle },
              });

              return (
                <path
                  key={`ribbon-${i}`}
                  d={d ?? ""}
                  fill={chordColor(ch.source.index, ch.target.index)}
                  opacity={
                    isChordHovered ? 0.9 : isActive ? (hoveredArc !== null ? 0.7 : 0.5) : 0.08
                  }
                  stroke={isChordHovered ? "#333" : "none"}
                  strokeWidth={isChordHovered ? 1 : 0}
                  className="transition-opacity duration-200 cursor-pointer"
                  onClick={() =>
                    onPairClick?.(docTypes[ch.source.index], docTypes[ch.target.index])
                  }
                  onMouseEnter={(e) =>
                    setHoveredChord({
                      source: ch.source.index,
                      target: ch.target.index,
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }
                  onMouseMove={(e) =>
                    setHoveredChord((prev) =>
                      prev ? { ...prev, x: e.clientX, y: e.clientY } : null
                    )
                  }
                  onMouseLeave={() => setHoveredChord(null)}
                />
              );
            })}

            {/* Arcs (document type segments) */}
            {chordLayout.groups.map((g) => {
              const docType = docTypes[g.index];
              const isActive = hoveredArc === null || hoveredArc === g.index;

              const d = arcGen({
                startAngle: g.startAngle,
                endAngle: g.endAngle,
              });

              // Label position at midpoint of arc
              const midAngle = (g.startAngle + g.endAngle) / 2;
              const labelRadius = outerRadius + 28;
              const lx = labelRadius * Math.sin(midAngle);
              const ly = -labelRadius * Math.cos(midAngle);
              const textAnchor =
                midAngle > Math.PI ? "end" : midAngle < 0.1 ? "middle" : "start";

              return (
                <g key={`arc-${g.index}`}>
                  <path
                    d={d ?? ""}
                    fill={DOC_COLORS[docType]}
                    opacity={isActive ? 1 : 0.25}
                    className="transition-opacity duration-200 cursor-pointer"
                    onMouseEnter={() => setHoveredArc(g.index)}
                    onMouseLeave={() => setHoveredArc(null)}
                  />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor={textAnchor}
                    dominantBaseline="middle"
                    className="text-[11px] font-medium select-none pointer-events-none"
                    fill={isActive ? "#1e293b" : "#94a3b8"}
                  >
                    {DOC_LABELS[docType]}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Coherency scores table */}
      <div className="mt-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--undp-gray)] border-b border-gray-100">
              <th className="text-left py-1.5 font-medium">Document Pair</th>
              <th className="text-right py-1.5 font-medium">Coherency</th>
              <th className="text-right py-1.5 font-medium">Coverage</th>
              <th className="text-right py-1.5 font-medium">Aligned</th>
              <th className="text-right py-1.5 font-medium text-red-600">Conflicts</th>
            </tr>
          </thead>
          <tbody>
            {pairScores.map((ps) => {
              const d = getChordDetail(ps.iA, ps.iB);
              const totalAlignPairs = d.high + d.medium + d.low;
              return (
                <tr
                  key={`${ps.iA}-${ps.iB}`}
                  className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                  onClick={() => onPairClick?.(docTypes[ps.iA], docTypes[ps.iB])}
                >
                  <td className="py-1.5 text-[var(--undp-black)]">
                    <span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ backgroundColor: DOC_COLORS[docTypes[ps.iA]] }} />
                    {DOC_LABELS[docTypes[ps.iA]]}
                    <span className="text-[var(--undp-gray)] mx-1">↔</span>
                    <span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ backgroundColor: DOC_COLORS[docTypes[ps.iB]] }} />
                    {DOC_LABELS[docTypes[ps.iB]]}
                  </td>
                  <td className="py-1.5 text-right font-medium tabular-nums" style={{
                    color: ps.score >= 20 ? ALIGNMENT_COLORS.high : ps.score >= 10 ? ALIGNMENT_COLORS.medium : ps.score > 0 ? "#7c8a3e" : "#94a3b8",
                  }}>
                    {ps.score}%
                  </td>
                  <td className="py-1.5 text-right text-[var(--undp-gray)] tabular-nums">
                    {ps.coverage}%
                  </td>
                  <td className="py-1.5 text-right text-[var(--undp-gray)] tabular-nums">
                    {totalAlignPairs}
                  </td>
                  <td className="py-1.5 text-right tabular-nums" style={{
                    color: ps.contradictions > 0 ? ALIGNMENT_COLORS.high_contradiction : "#94a3b8",
                    fontWeight: ps.contradictions > 0 ? 600 : 400,
                  }}>
                    {ps.contradictions}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-[11px] text-[var(--undp-gray)]/70 mt-2 leading-relaxed">
          <strong>Coherency</strong> = quality-weighted alignment score (high=3, medium=2, low=1 per pair, normalized to max possible).
          <strong> Coverage</strong> = % of possible cross-document target pairs that show alignment.
          <strong> Conflicts</strong> = number of target pairs showing contradiction or tension.
        </p>
      </div>

      {/* Chord tooltip */}
      {hoveredChord && (() => {
        const d = getChordDetail(hoveredChord.source, hoveredChord.target);
        const totalAlign = d.high + d.medium + d.low;
        const totalContra = d.high_contradiction + d.moderate_contradiction + d.low_tension;
        const srcType = docTypes[hoveredChord.source];
        const tgtType = docTypes[hoveredChord.target];
        const ps = pairScores.find(
          (p) =>
            (p.iA === hoveredChord.source && p.iB === hoveredChord.target) ||
            (p.iA === hoveredChord.target && p.iB === hoveredChord.source)
        );

        return (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs pointer-events-none"
            style={{
              left: hoveredChord.x,
              top: hoveredChord.y - 10,
              transform: "translate(-50%, -100%)",
            }}
          >
            <p className="text-xs font-semibold text-[var(--undp-black)] mb-1">
              {DOC_LABELS[srcType]} ↔ {DOC_LABELS[tgtType]}
            </p>
            {ps && (
              <p className="text-sm font-semibold tabular-nums mb-1" style={{
                color: ps.score >= 20 ? ALIGNMENT_COLORS.high : ps.score >= 10 ? ALIGNMENT_COLORS.medium : "#7c8a3e",
              }}>
                {ps.score}% coherency
              </p>
            )}
            <p className="text-xs text-[var(--undp-gray)]">
              {totalAlign} aligned pair{totalAlign !== 1 ? "s" : ""}
              {ps ? ` · ${ps.coverage}% coverage` : ""}
            </p>
            <div className="flex gap-3 mt-1.5 text-xs">
              {d.high > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: ALIGNMENT_COLORS.high }} />
                  {d.high} high
                </span>
              )}
              {d.medium > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: ALIGNMENT_COLORS.medium }} />
                  {d.medium} med
                </span>
              )}
              {d.low > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: ALIGNMENT_COLORS.low }} />
                  {d.low} low
                </span>
              )}
            </div>
            {totalContra > 0 && (
              <div className="flex gap-3 mt-1 text-xs">
                {d.high_contradiction > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: ALIGNMENT_COLORS.high_contradiction }} />
                    {d.high_contradiction} high contr.
                  </span>
                )}
                {d.moderate_contradiction > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: ALIGNMENT_COLORS.moderate_contradiction }} />
                    {d.moderate_contradiction} mod. contr.
                  </span>
                )}
                {d.low_tension > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: ALIGNMENT_COLORS.low_tension }} />
                    {d.low_tension} tension
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Arc hover detail */}
      {hoveredArc !== null && !hoveredChord && (() => {
        const docType = docTypes[hoveredArc];
        const count = targetCounts[hoveredArc];
        const totalConnections = matrix[hoveredArc].reduce((s, v) => s + v, 0) / 2;
        return (
          <div className="mt-3 bg-[var(--undp-light)] rounded-lg px-4 py-3 text-sm text-[var(--undp-gray)]">
            <strong className="text-[var(--undp-black)]">{DOC_LABELS[docType]}</strong>
            {" · "}
            {count} target{count !== 1 ? "s" : ""}
            {" · "}
            {Math.round(totalConnections)} connection{totalConnections !== 1 ? "s" : ""} with other documents
          </div>
        );
      })()}
    </div>
  );
}
