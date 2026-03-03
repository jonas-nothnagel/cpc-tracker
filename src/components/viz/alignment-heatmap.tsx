"use client";

import { useState, useMemo } from "react";
import type { AlignmentResult, AlignmentLevel, Target } from "@/types";

interface AlignmentHeatmapProps {
  /** Alignment results for a specific document pair comparison */
  alignmentData: AlignmentResult[];
  /** Row targets (e.g. NBTs) */
  rowTargets: Target[];
  /** Column targets (e.g. NDCs) */
  colTargets: Target[];
  title: string;
  rowLabel: string;
  colLabel: string;
}

const ALIGNMENT_COLORS: Record<AlignmentLevel, string> = {
  none: "#f7f7f7",
  low: "#c6e48b",
  medium: "#7bc96f",
  high: "#196127",
};

const ALIGNMENT_LABELS: Record<AlignmentLevel, string> = {
  none: "No alignment",
  low: "Low",
  medium: "Medium",
  high: "High",
};

/**
 * Interactive heatmap for pairwise target alignment.
 * Rows = targets from document A, Columns = targets from document B.
 * Cell color encodes alignment level. Hovering shows full details.
 */
export function AlignmentHeatmap({
  alignmentData,
  rowTargets,
  colTargets,
  title,
  rowLabel,
  colLabel,
}: AlignmentHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{
    row: string;
    col: string;
    alignment: AlignmentLevel;
    description: string;
    rowLabel: string;
    colLabel: string;
    x: number;
    y: number;
  } | null>(null);

  const [selectedCell, setSelectedCell] = useState<{
    rowTarget: Target;
    colTarget: Target;
    alignment: AlignmentLevel;
    description: string;
  } | null>(null);

  // Build lookup map
  const alignmentMap = useMemo(() => {
    const map = new Map<string, AlignmentResult>();
    for (const a of alignmentData) {
      map.set(`${a.targetAId}__${a.targetBId}`, a);
      map.set(`${a.targetBId}__${a.targetAId}`, a);
    }
    return map;
  }, [alignmentData]);

  // Summary stats
  const highCount = alignmentData.filter((a) => a.alignment === "high").length;
  const mediumCount = alignmentData.filter(
    (a) => a.alignment === "medium"
  ).length;
  const lowCount = alignmentData.filter((a) => a.alignment === "low").length;

  const cellSize = Math.min(
    40,
    Math.max(24, Math.floor(700 / Math.max(colTargets.length, 1)))
  );

  return (
    <div>
      {/* Title + summary */}
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-[var(--undp-black)]">
          {title}
        </h3>
        <p className="text-sm text-[var(--undp-gray)]">
          {highCount} high · {mediumCount} medium · {lowCount} low alignment
          opportunities
        </p>
      </div>
      {/* Legend — separate row to avoid overlap */}
      <div className="flex flex-wrap gap-3 text-xs items-center mb-4">
        {(["high", "medium", "low", "none"] as AlignmentLevel[]).map(
          (level) => (
            <div key={level} className="flex items-center gap-1">
              <span
                className="w-4 h-4 rounded-sm inline-block border border-gray-200/80"
                style={{ backgroundColor: ALIGNMENT_COLORS[level] }}
              />
              <span className="text-[var(--undp-gray)]">
                {ALIGNMENT_LABELS[level]}
              </span>
            </div>
          )
        )}
      </div>

      {/* Heatmap grid */}
      <div className="overflow-x-auto relative">
        <div className="inline-block">
          {/* Column headers */}
          <div className="flex" style={{ marginLeft: "140px" }}>
            {colTargets.map((t) => (
              <div
                key={t.id}
                style={{ width: cellSize, height: 120, minWidth: cellSize }}
                className="flex items-end justify-center"
              >
                <span
                  className="text-[10px] text-[var(--undp-gray)] origin-bottom-left whitespace-nowrap"
                  style={{
                    transform: "rotate(-60deg)",
                    transformOrigin: "bottom left",
                  }}
                  title={`${t.sourceLabel}: ${t.text}`}
                >
                  {t.sourceLabel}
                </span>
              </div>
            ))}
          </div>
          <div
            className="text-[10px] text-[var(--undp-gray)] text-center mb-1 font-medium"
            style={{ marginLeft: "140px" }}
          >
            {colLabel}
          </div>

          {/* Rows */}
          {rowTargets.map((rowT) => (
            <div key={rowT.id} className="flex items-center">
              {/* Row label */}
              <div
                className="w-[140px] pr-2 text-right text-[11px] text-[var(--undp-gray)] shrink-0 truncate"
                title={`${rowT.sourceLabel}: ${rowT.text}`}
              >
                {rowT.sourceLabel}
              </div>
              {/* Cells */}
              {colTargets.map((colT) => {
                const result = alignmentMap.get(
                  `${rowT.id}__${colT.id}`
                );
                const level: AlignmentLevel = result?.alignment ?? "none";
                return (
                  <div
                    key={colT.id}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: ALIGNMENT_COLORS[level],
                    }}
                    className={`cursor-pointer hover:ring-2 hover:ring-[var(--undp-blue)] hover:z-10 relative transition-shadow ${
                      level === "high"
                        ? "border-2 border-[#0d3d1a]"
                        : "border border-white/50"
                    }`}
                    onClick={() => {
                      setHoveredCell(null);
                      setSelectedCell({
                        rowTarget: rowT,
                        colTarget: colT,
                        alignment: level,
                        description: result?.description ?? "",
                      });
                    }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredCell({
                        row: rowT.id,
                        col: colT.id,
                        alignment: level,
                        description: result?.description ?? "",
                        rowLabel: `${rowT.sourceLabel}`,
                        colLabel: `${colT.sourceLabel}`,
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      });
                    }}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                );
              })}
            </div>
          ))}

          {/* Row axis label */}
          <div className="text-[10px] text-[var(--undp-gray)] text-right pr-2 font-medium w-[140px] mt-1">
            {rowLabel}
          </div>
        </div>

        {/* Click-to-detail modal */}
        {selectedCell && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setSelectedCell(null)}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-xl w-full flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: ALIGNMENT_COLORS[selectedCell.alignment], border: selectedCell.alignment === "none" ? "1px solid #e2e8f0" : "none" }}
                  />
                  <span className="text-sm font-semibold text-[var(--undp-black)]">
                    {ALIGNMENT_LABELS[selectedCell.alignment]} alignment
                  </span>
                  <span className="text-xs text-[var(--undp-gray)] ml-1">
                    {selectedCell.rowTarget.sourceLabel} ↔ {selectedCell.colTarget.sourceLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCell(null)}
                  className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Target texts */}
              <div className="px-5 py-4 grid grid-cols-2 gap-4 border-b border-gray-100">
                {[
                  { target: selectedCell.rowTarget, axis: rowLabel },
                  { target: selectedCell.colTarget, axis: colLabel },
                ].map(({ target, axis }) => (
                  <div key={target.id}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
                      {axis.replace(" ↓", "").replace(" →", "")} — {target.sourceLabel}
                    </p>
                    <p className="text-xs text-[var(--undp-black)] leading-relaxed bg-gray-50 rounded p-2.5 border border-gray-100">
                      {target.text}
                    </p>
                  </div>
                ))}
              </div>

              {/* Rationale */}
              {selectedCell.description && (
                <div className="px-5 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
                    AI rationale
                  </p>
                  <p className="text-xs text-[var(--undp-black)] leading-relaxed">
                    {selectedCell.description}
                  </p>
                </div>
              )}
              {!selectedCell.description && (
                <div className="px-5 py-4">
                  <p className="text-xs text-[var(--undp-gray)] italic">No alignment rationale recorded for this pair.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hover tooltip */}
        {hoveredCell && (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs pointer-events-none"
            style={{
              left: hoveredCell.x,
              top: hoveredCell.y - 10,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="w-3 h-3 rounded-sm inline-block"
                style={{
                  backgroundColor: ALIGNMENT_COLORS[hoveredCell.alignment],
                  border:
                    hoveredCell.alignment === "none"
                      ? "1px solid #e2e8f0"
                      : "none",
                }}
              />
              <span
                className="text-xs font-semibold"
                style={{
                  color:
                    hoveredCell.alignment === "none"
                      ? "#94a3b8"
                      : ALIGNMENT_COLORS[hoveredCell.alignment],
                }}
              >
                {ALIGNMENT_LABELS[hoveredCell.alignment]} alignment
              </span>
            </div>
            <p className="text-xs text-[var(--undp-black)] font-medium">
              {hoveredCell.rowLabel} ↔ {hoveredCell.colLabel}
            </p>
            {hoveredCell.description && (
              <p className="text-xs text-[var(--undp-gray)] mt-1 leading-relaxed">
                {hoveredCell.description}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
