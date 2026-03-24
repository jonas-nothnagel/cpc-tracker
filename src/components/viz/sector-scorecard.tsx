"use client";

import React, { useMemo, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import { TargetTextWithHighlights } from "./target-text";
import type {
  AlignmentResult,
  BtrData,
  MitigationMeasure,
  Target,
  IpccSector,
  ThematicClassification,
  SupportProject,
} from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECTOR_COLORS: Record<string, string> = {
  sector_energy: "#0468b1",
  sector_transport: "#e5243b",
  sector_ippu: "#fcc30b",
  sector_agriculture: "#4c9f38",
  sector_lulucf: "#00689d",
  sector_waste: "#a21942",
  sector_other: "#a9b1b7",
};

type GapLevel = "critical" | "significant" | "moderate" | "on_track" | "no_data";

const GAP_CONFIG: Record<GapLevel, { label: string; color: string; bg: string; description: string }> = {
  critical:    { label: "Action needed",   color: "#b45309", bg: "bg-orange-50",  description: "Policy targets are set for this sector but no implementation measures have been reported yet — this is an area to prioritize." },
  significant: { label: "In progress",     color: "#0468b1", bg: "bg-blue-50",    description: "Measures are planned or adopted but none fully implemented — continued follow-up is recommended." },
  moderate:    { label: "Partially active",color: "#0d9488", bg: "bg-teal-50",    description: "Some measures are underway. Further implementation can strengthen progress toward targets." },
  on_track:    { label: "Active",          color: "#4c9f38", bg: "bg-green-50",   description: "At least one measure has been fully implemented in this sector." },
  no_data:     { label: "No data",         color: "#94a3b8", bg: "bg-gray-50",    description: "No targets or measures have been reported for this sector." },
};

const GAP_ORDER: Record<GapLevel, number> = {
  critical: 0, significant: 1, moderate: 2, on_track: 3, no_data: 4,
};

// ---------------------------------------------------------------------------
// Gap scoring
// ---------------------------------------------------------------------------

function scoreGap(
  targetCount: number,
  measureCount: number,
  implementedCount: number,
  emissionsChange: number | null,
): GapLevel {
  if (targetCount === 0 && measureCount === 0) return "no_data";
  const emGrowing = emissionsChange !== null && emissionsChange > 20;
  if (targetCount > 0 && measureCount === 0) {
    return targetCount > 2 || emGrowing ? "critical" : "significant";
  }
  if (targetCount > 0 && implementedCount === 0 && (emGrowing || measureCount < targetCount / 2)) {
    return "significant";
  }
  if (measureCount > 0 && implementedCount < measureCount) return "moderate";
  if (implementedCount > 0 && measureCount >= 1) return "on_track";
  return "moderate";
}

// ---------------------------------------------------------------------------
// Gap insight text generation (inline — no LLM)
// ---------------------------------------------------------------------------

function buildGapInsightText(row: {
  targets: Target[];
  measures: MitigationMeasure[];
  implemented: number;
  emissionsChange: number | null;
  latestYear: string | null;
  projectionData: { year: string; value: number }[];
  gapLevel: GapLevel;
}): string {
  const t = row.targets.length;
  const m = row.measures.length;
  const impl = row.implemented;
  const chg = row.emissionsChange;
  const projYears = row.projectionData.map((d) => d.year).sort();
  const projLatest = projYears.length > 0
    ? row.projectionData.find((d) => d.year === projYears[projYears.length - 1])?.value ?? null
    : null;

  if (row.gapLevel === "on_track") {
    return `${m} measure${m !== 1 ? "s" : ""} reported, ${impl} fully implemented.${chg !== null ? ` Emissions ${chg > 0 ? "+" : ""}${chg}% since baseline.` : ""}`;
  }
  if (row.gapLevel === "no_data") {
    return "No policy targets or implementation measures have been reported for this sector.";
  }

  const parts: string[] = [];

  if (t > 0 && m === 0) {
    parts.push(`${t} policy target${t !== 1 ? "s" : ""} but zero implementation measures reported`);
  } else if (t > 0 && impl === 0) {
    parts.push(`${m} measure${m !== 1 ? "s" : ""} adopted but none fully implemented`);
  } else if (m > 0 && impl < m) {
    parts.push(`${m} measures, ${impl} fully implemented`);
  }

  if (chg !== null && row.latestYear) {
    const earliest = Number(row.latestYear) - (row.measures.length > 0 ? 32 : 32);
    parts.push(`Emissions ${chg > 0 ? "grew" : "fell"} ${Math.abs(chg)}% since ~1990`);
  }

  if (projLatest !== null && projYears.length > 0) {
    parts.push(`projected ${Math.round(projLatest).toLocaleString()} kt by ${projYears[projYears.length - 1]}`);
  }

  return parts.length > 0 ? parts.join(". ") + "." : "";
}

// ---------------------------------------------------------------------------
// Data assembly
// ---------------------------------------------------------------------------

interface SectorRow {
  sector: IpccSector;
  targets: Target[];
  measures: MitigationMeasure[];
  adopted: number;
  implemented: number;
  support: SupportProject[];
  emissionsChange: number | null;
  latestEmission: number | null;
  latestYear: string | null;
  earliestYear: string | null;
  sparklineData: { year: string; value: number }[];
  projectionData: { year: string; value: number }[];
  gapLevel: GapLevel;
}

function buildSectorRows(
  btrData: BtrData,
  targets: Target[],
  sectors: IpccSector[],
  classifications: ThematicClassification[],
): SectorRow[] {
  const sectorClassifications = classifications.filter(
    (c) => c.taxonomyType === "sector" && c.isRelevant
  );

  const rows = sectors.map((sector): SectorRow => {
    const targetIds = new Set(
      sectorClassifications
        .filter((c) => c.categoryId === sector.id)
        .map((c) => c.targetId)
    );
    const sectorTargets = targets.filter((t) => targetIds.has(t.id));

    const measures = btrData.mitigationMeasures.filter((m) => m.sector === sector.id);
    const adopted = measures.filter((m) => m.status.toLowerCase().includes("adopted")).length;
    const implemented = measures.filter((m) => m.status.toLowerCase().includes("implemented")).length;

    const support = [
      ...btrData.technologySupport.filter((p) => p.sector === sector.id),
      ...btrData.capacityBuilding.filter((p) => p.sector === sector.id),
    ];

    const emissions = btrData.sectorEmissions.bySector.find(
      (s) => s.normalizedSector === sector.id && !s.isTotal
    );
    const years = emissions ? Object.keys(emissions.yearlyEmissions).sort() : [];
    const recentYears = years.filter((y) => parseInt(y) >= 2005);
    const sparklineData = recentYears.map((y) => ({ year: y, value: emissions!.yearlyEmissions[y] }));

    const earliest = years.length > 0 ? emissions!.yearlyEmissions[years[0]] : null;
    const latest = years.length > 0 ? emissions!.yearlyEmissions[years[years.length - 1]] : null;
    const emissionsChange =
      earliest != null && latest != null && earliest !== 0
        ? Math.round(((latest - earliest) / Math.abs(earliest)) * 100)
        : null;

    const projection = btrData.projections.find(
      (p) => p.scenario === "wem" && p.normalizedSector === sector.id && !p.isTotal
    );
    const projYears = projection ? Object.keys(projection.yearlyValues).sort() : [];
    const projectionData = projYears.map((y) => ({ year: y, value: projection!.yearlyValues[y] }));

    const gapLevel = scoreGap(sectorTargets.length, measures.length, implemented, emissionsChange);

    return {
      sector,
      targets: sectorTargets,
      measures,
      adopted,
      implemented,
      support,
      emissionsChange,
      latestEmission: latest,
      latestYear: years.length > 0 ? years[years.length - 1] : null,
      earliestYear: years.length > 0 ? years[0] : null,
      sparklineData,
      projectionData,
      gapLevel,
    };
  });

  return rows
    .filter((r) => r.targets.length > 0 || r.measures.length > 0 || r.support.length > 0)
    .sort((a, b) => GAP_ORDER[a.gapLevel] - GAP_ORDER[b.gapLevel]);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PipelineFlow({
  targetCount, adopted, implemented, supportCount,
}: {
  targetCount: number; adopted: number; implemented: number; supportCount: number;
}) {
  const Chip = ({ count, label, color, bg, check }: {
    count: number; label: string; color: string; bg: string; check?: boolean;
  }) => (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none whitespace-nowrap"
      style={{ color, backgroundColor: bg }}
      title={`${count} ${label}`}
    >
      {check && <span className="text-[9px]">✓</span>}
      <span>{count}</span>
      <span className="font-normal opacity-75">{label}</span>
    </span>
  );
  const Arrow = () => (
    <span className="text-[#cbd5e1] text-[11px] leading-none select-none">→</span>
  );

  const hasNdcPipeline = targetCount > 0 || adopted > 0 || implemented > 0;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {targetCount > 0 && (
        <Chip count={targetCount} label="targets" color="#0468b1" bg="#e8f1f8" />
      )}
      {adopted > 0 && (
        <>
          {targetCount > 0 && <Arrow />}
          <Chip count={adopted} label="measures" color="#3d8c23" bg="#eaf5e4" />
        </>
      )}
      {implemented > 0 && (
        <>
          <Arrow />
          <Chip count={implemented} label="impl." color="#2d6e17" bg="#d4edcc" check />
        </>
      )}
      {supportCount > 0 && (
        <>
          {hasNdcPipeline && (
            <span className="text-[#cbd5e1] text-[10px] leading-none select-none mx-0.5">|</span>
          )}
          <Chip count={supportCount} label="support" color="#92620a" bg="#fef3c7" />
        </>
      )}
      {!hasNdcPipeline && supportCount === 0 && (
        <span className="text-[11px] text-[#94a3b8]">—</span>
      )}
    </div>
  );
}

/** Inline SVG sparkline — shape only, normalized to own range. Used alongside explicit numbers. */
function Sparkline({ data, color, width = 64, height = 20 }: {
  data: { year: string; value: number }[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return <div style={{ width, height }} />;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d.value - min) / range) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} className="shrink-0">
      <polygon points={areaPoints} fill={color} opacity={0.1} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GapBadge({ level }: { level: GapLevel }) {
  const cfg = GAP_CONFIG[level];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${cfg.bg}`}
      style={{ color: cfg.color }}
      title={cfg.description}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  );
}

/** Merged Emissions column: sparkline shape + latest kt value + direction arrow + change % */
function EmissionsColumn({ sparklineData, latestEmission, latestYear, emissionsChange, color }: {
  sparklineData: { year: string; value: number }[];
  latestEmission: number | null;
  latestYear: string | null;
  emissionsChange: number | null;
  color: string;
}) {
  if (latestEmission === null && sparklineData.length === 0) {
    return <span className="text-[10px] text-[var(--undp-gray)]">&mdash;</span>;
  }

  const changeColor = emissionsChange === null ? "#94a3b8"
    : emissionsChange > 5 ? "#ee402d"
    : emissionsChange < -5 ? "#4c9f38"
    : "#94a3b8";

  const ktLabel = latestEmission !== null
    ? (Math.abs(latestEmission) >= 1000
        ? `${(latestEmission / 1000).toFixed(0)}k kt`
        : `${Math.round(latestEmission)} kt`)
    : null;

  const title = [
    ktLabel ? `Latest: ${ktLabel} CO₂eq (${latestYear})` : "",
    emissionsChange !== null ? `Change since baseline: ${emissionsChange > 0 ? "+" : ""}${emissionsChange}%` : "",
  ].filter(Boolean).join(" | ");

  return (
    <div className="flex flex-col items-center gap-0.5" title={title}>
      <Sparkline data={sparklineData} color={color} />
      <div className="flex items-baseline gap-1">
        {ktLabel && (
          <span className="text-[9px] text-[var(--undp-gray)] tabular-nums leading-none">
            {ktLabel}
          </span>
        )}
        {emissionsChange !== null && (
          <span className="text-[10px] font-medium tabular-nums leading-none" style={{ color: changeColor }}>
            {emissionsChange > 0 ? "+" : ""}{emissionsChange}%
          </span>
        )}
      </div>
    </div>
  );
}

/** Small implementation fraction badge — shown in compact row. */
function ImplFraction({ implemented, total }: { implemented: number; total: number }) {
  if (total === 0) return null;
  const hasImpl = implemented > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
        hasImpl ? "bg-green-100 text-[#4c9f38]" : "bg-gray-100 text-[var(--undp-gray)]"
      }`}
      title={`${implemented} of ${total} measures fully implemented`}
    >
      {hasImpl && <span className="text-[#4c9f38]">✓</span>}
      {implemented}/{total} impl.
    </span>
  );
}

// ---------------------------------------------------------------------------
// Gap legend
// ---------------------------------------------------------------------------

function GapLegend() {
  const [expanded, setExpanded] = useState(false);
  const levels: GapLevel[] = ["critical", "significant", "moderate", "on_track", "no_data"];

  return (
    <div className="px-5 py-2.5 border-b border-gray-100 bg-white/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-[10px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] transition-colors cursor-pointer"
      >
        <span className="font-semibold uppercase tracking-wide">Gap rating legend</span>
        <span>{expanded ? "▾" : "▸"}</span>
      </button>

      {!expanded && (
        <div className="flex flex-wrap gap-3 mt-1.5">
          {levels.map((level) => {
            const cfg = GAP_CONFIG[level];
            return (
              <span key={level} className="flex items-center gap-1 text-[10px]" style={{ color: cfg.color }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                {cfg.label}
              </span>
            );
          })}
        </div>
      )}

      {expanded && (
        <div className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {levels.map((level) => {
            const cfg = GAP_CONFIG[level];
            return (
              <div key={level} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: cfg.color }} />
                <span className="text-[10px] text-[var(--undp-gray)] leading-relaxed">
                  <span className="font-semibold" style={{ color: cfg.color }}>{cfg.label}:</span>{" "}
                  {cfg.description}
                </span>
              </div>
            );
          })}
          <p className="text-[10px] text-[var(--undp-gray)]/70 sm:col-span-2 mt-0.5">
            Rating is computed from: number of policy targets, number of BTR mitigation measures, implementation status, and emissions growth trend.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded detail panel
// ---------------------------------------------------------------------------

const SHOW_MORE_INITIAL = 4;

function ShowMoreList<T>({
  items,
  renderItem,
  className = "space-y-2",
}: {
  items: T[];
  renderItem: (item: T, i: number) => React.ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? items : items.slice(0, SHOW_MORE_INITIAL);
  const hidden = items.length - SHOW_MORE_INITIAL;
  return (
    <>
      <ul className={className}>{visible.map((item, i) => renderItem(item, i))}</ul>
      {items.length > SHOW_MORE_INITIAL && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[10px] text-[#0468b1] hover:underline focus:outline-none"
        >
          {expanded ? "Show less" : `Show ${hidden} more…`}
        </button>
      )}
    </>
  );
}

function ExpandedDetail({ row }: { row: SectorRow }) {
  const color = SECTOR_COLORS[row.sector.id] ?? "#a9b1b7";

  const { implementedMeasures, otherMeasures } = useMemo(() => {
    const impl = row.measures.filter((m) => m.status.toLowerCase().includes("implemented"));
    const other = row.measures.filter((m) => !m.status.toLowerCase().includes("implemented"));
    return { implementedMeasures: impl, otherMeasures: other };
  }, [row.measures]);

  const combinedChart = useMemo(() => {
    if (row.sparklineData.length === 0 && row.projectionData.length === 0) return null;
    const allYears = new Map<string, { historical?: number; projected?: number }>();
    for (const d of row.sparklineData) allYears.set(d.year, { ...allYears.get(d.year), historical: d.value });
    for (const d of row.projectionData) allYears.set(d.year, { ...allYears.get(d.year), projected: d.value });
    return Array.from(allYears.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, vals]) => ({ year, ...vals }));
  }, [row.sparklineData, row.projectionData]);

  const lastHistYear = row.sparklineData.length > 0
    ? row.sparklineData[row.sparklineData.length - 1].year
    : null;

  return (
    <div className="border-t border-gray-100 px-5 py-5 bg-[var(--undp-light)]/50">
      <div className="grid md:grid-cols-3 gap-6">
        {/* Policy targets */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
            Policy Targets ({row.targets.length})
          </p>
          {row.targets.length === 0 ? (
            <p className="text-xs text-[var(--undp-gray)] italic">No targets classified in this sector</p>
          ) : (
            <ShowMoreList
              items={row.targets}
              renderItem={(t) => (
                <li key={t.id} className="text-xs text-[var(--undp-black)] leading-relaxed">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white mr-2"
                    style={{ backgroundColor: DOC_COLORS[t.sourceDocument] }}
                  >
                    {DOC_LABELS[t.sourceDocument]} {t.sourceLabel}
                  </span>
                  <TargetTextWithHighlights target={t} />
                </li>
              )}
            />
          )}
        </div>

        {/* Mitigation measures — implemented first */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
            Mitigation Measures ({row.measures.length})
          </p>
          {row.measures.length === 0 ? (
            <p className="text-xs text-[var(--undp-gray)] italic">No measures reported for this sector</p>
          ) : (
            <div className="space-y-3">
              {implementedMeasures.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-[#4c9f38] mb-1.5 flex items-center gap-1">
                    <span>✓</span> Implemented ({implementedMeasures.length})
                  </p>
                  <ShowMoreList
                    items={implementedMeasures}
                    className="space-y-1.5"
                    renderItem={(m, i) => (
                      <li
                        key={i}
                        className="text-xs text-[var(--undp-black)] leading-relaxed border-l-2 border-[#4c9f38] pl-2"
                      >
                        {m.name.length > 120 ? m.name.slice(0, 120) + "…" : m.name}
                        {m.implementingEntity && (
                          <span className="text-[var(--undp-gray)]"> &mdash; {m.implementingEntity}</span>
                        )}
                      </li>
                    )}
                  />
                </div>
              )}

              {otherMeasures.length > 0 && (
                <div>
                  {implementedMeasures.length > 0 && (
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
                      Planned / Adopted ({otherMeasures.length})
                    </p>
                  )}
                  <ShowMoreList
                    items={otherMeasures}
                    className="space-y-1.5"
                    renderItem={(m, i) => (
                      <li key={i} className="text-xs text-[var(--undp-black)] leading-relaxed">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-2"
                          style={{ backgroundColor: "#fcc30b", color: "#333" }}
                        >
                          {m.status}
                        </span>
                        {m.name.length > 120 ? m.name.slice(0, 120) + "…" : m.name}
                        {m.implementingEntity && (
                          <span className="text-[var(--undp-gray)]"> &mdash; {m.implementingEntity}</span>
                        )}
                      </li>
                    )}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Support projects */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
            Support Projects ({row.support.length})
          </p>
          {row.support.length === 0 ? (
            <p className="text-xs text-[var(--undp-gray)] italic">No support projects for this sector</p>
          ) : (
            <ShowMoreList
              items={row.support}
              renderItem={(p, i) => (
                <li key={i} className="text-xs text-[var(--undp-black)] leading-relaxed flex gap-2">
                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--undp-black)] bg-amber-100 shrink-0">
                    {p.supportType || "Support"}
                  </span>
                  <span>{p.title.length > 90 ? p.title.slice(0, 90) + "…" : p.title}</span>
                </li>
              )}
            />
          )}
        </div>
      </div>

      {/* Sector emissions mini-chart */}
      {combinedChart && combinedChart.length > 1 && (
        <div className="mt-5 pt-4 border-t border-gray-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
            {row.sector.name} Emissions Trajectory (kt CO&#x2082; eq) — solid: historical, dashed: WEM projection
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={combinedChart} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={(v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #e2e8f0" }}
                formatter={(value) => [`${Math.round(Number(value)).toLocaleString()} kt`, ""]}
                labelFormatter={(label) => `Year ${label}`}
              />
              {lastHistYear && (
                <ReferenceLine x={lastHistYear} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
              )}
              <Line type="monotone" dataKey="historical" stroke={color} strokeWidth={2} dot={false} connectNulls name="Historical" />
              <Line type="monotone" dataKey="projected" stroke={color} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls name="Projected (WEM)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SectorScorecardProps {
  btrData: BtrData;
  targets: Target[];
  sectors: IpccSector[];
  classifications: ThematicClassification[];
  highlightSector?: string | null;
  alignmentData?: AlignmentResult[];
}

const POSITIVE_ALIGNMENT_LEVELS = new Set(["low", "medium", "high"]);

export function SectorScorecard({
  btrData,
  targets,
  sectors,
  classifications,
  highlightSector,
  alignmentData,
}: SectorScorecardProps) {
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  const rows = useMemo(
    () => buildSectorRows(btrData, targets, sectors, classifications),
    [btrData, targets, sectors, classifications]
  );

  /* Count NBSAP targets with positive alignment to NDC targets, per sector */
  const nbsapAlignmentBySector = useMemo(() => {
    if (!alignmentData) return new Map<string, number>();
    const ndcIds = new Set(targets.filter((t) => t.sourceDocument === "NDC").map((t) => t.id));
    const nbsapTargets = targets.filter((t) => t.sourceDocument === "NBSAP");
    const nbsapIds = new Set(nbsapTargets.map((t) => t.id));
    // Build NBSAP target → sectors lookup via classifications with taxonomyType "sector"
    const nbsapSectors = new Map<string, Set<string>>();
    for (const c of classifications) {
      if (!nbsapIds.has(c.targetId) || c.taxonomyType !== "sector" || !c.isRelevant) continue;
      if (!nbsapSectors.has(c.targetId)) nbsapSectors.set(c.targetId, new Set());
      nbsapSectors.get(c.targetId)!.add(c.categoryId);
    }
    // Find NBSAP targets that align with any NDC target
    const alignedNbsap = new Set<string>();
    for (const pair of alignmentData) {
      if (!POSITIVE_ALIGNMENT_LEVELS.has(pair.alignment)) continue;
      if (nbsapIds.has(pair.targetAId) && ndcIds.has(pair.targetBId)) alignedNbsap.add(pair.targetAId);
      else if (nbsapIds.has(pair.targetBId) && ndcIds.has(pair.targetAId)) alignedNbsap.add(pair.targetBId);
    }
    // Aggregate per sector
    const result = new Map<string, number>();
    for (const id of alignedNbsap) {
      for (const sector of nbsapSectors.get(id) ?? []) {
        result.set(sector, (result.get(sector) ?? 0) + 1);
      }
    }
    return result;
  }, [alignmentData, targets, classifications]);


  const toggleRow = useCallback((id: string) => {
    setExpandedSector((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="bg-[var(--undp-light)] border border-gray-100 rounded-lg overflow-hidden">
      {/* Gap legend */}
      <GapLegend />

      {/* Table header */}
      <div className="px-5 py-2.5 border-b border-gray-100 bg-white/60">
        <div
          className="grid items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]"
          style={{ gridTemplateColumns: "minmax(130px, 1.2fr) minmax(160px, 2fr) 100px 102px 16px" }}
        >
          <span>Sector</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide" style={{ color: "#0468b1", backgroundColor: "#e8f1f8" }}>targets</span>
            <span className="text-[#cbd5e1] text-[10px]">→</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide" style={{ color: "#3d8c23", backgroundColor: "#eaf5e4" }}>measures</span>
            <span className="text-[#cbd5e1] text-[10px]">→</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide" style={{ color: "#2d6e17", backgroundColor: "#d4edcc" }}>✓ impl.</span>
            <span className="text-[#cbd5e1] text-[10px] mx-0.5">|</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide" style={{ color: "#92620a", backgroundColor: "#fef3c7" }}>support</span>
          </span>
          <span className="text-center">Emissions trend</span>
          <span className="text-center">Gap</span>
          <span />
        </div>
      </div>

      {/* Rows */}
      {rows.map((row) => {
        const isExpanded = expandedSector === row.sector.id;
        const isHighlighted = highlightSector === row.sector.id;
        const color = SECTOR_COLORS[row.sector.id] ?? "#a9b1b7";
        const insightText = buildGapInsightText(row);

        return (
          <div
            key={row.sector.id}
            id={`sector-row-${row.sector.id}`}
            className={`border-b border-gray-100 last:border-b-0 transition-colors ${
              isHighlighted ? "ring-2 ring-[var(--undp-blue)] ring-inset" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => toggleRow(row.sector.id)}
              className="w-full text-left px-5 py-3 hover:bg-gray-50/60 transition-colors cursor-pointer"
            >
              {/* Main grid row */}
              <div
                className="grid items-center gap-3"
                style={{ gridTemplateColumns: "minmax(130px, 1.2fr) minmax(160px, 2fr) 100px 102px 16px" }}
              >
                {/* Sector name */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs font-medium text-[var(--undp-black)] truncate">
                    {row.sector.name}
                  </span>
                </div>

                {/* Pipeline flow */}
                <PipelineFlow
                  targetCount={row.targets.length}
                  adopted={row.adopted}
                  implemented={row.implemented}
                  supportCount={row.support.length}
                />

                {/* Merged emissions column — only rendered when data exists */}
                <div className="flex justify-center">
                  {row.latestEmission !== null || row.sparklineData.length > 0 ? (
                    <EmissionsColumn
                      sparklineData={row.sparklineData}
                      latestEmission={row.latestEmission}
                      latestYear={row.latestYear}
                      emissionsChange={row.emissionsChange}
                      color={color}
                    />
                  ) : (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                </div>

                {/* Gap badge */}
                <div className="flex justify-center">
                  <GapBadge level={row.gapLevel} />
                </div>

                {/* Expand arrow */}
                <span className="text-[10px] text-[var(--undp-gray)]">
                  {isExpanded ? "▾" : "▸"}
                </span>
              </div>

              {/* NBSAP cross-reference */}
              {nbsapAlignmentBySector.get(row.sector.id) != null && nbsapAlignmentBySector.get(row.sector.id)! > 0 && (
                <div
                  className="grid items-center gap-3 mt-1"
                  style={{ gridTemplateColumns: "minmax(130px, 1.2fr) minmax(160px, 2fr) 100px 102px 16px" }}
                >
                  <div />
                  <span className="text-[10px] font-medium text-[#0468b1]">
                    ↔ {nbsapAlignmentBySector.get(row.sector.id)} aligned NBSAP target{nbsapAlignmentBySector.get(row.sector.id)! !== 1 ? "s" : ""} in this sector
                  </span>
                  <div /><div /><div />
                </div>
              )}

              {/* Subtitle: insight text + impl fraction — same grid so text sits under the pipeline bar */}
              {insightText && (
                <div
                  className="grid items-center gap-3 mt-1"
                  style={{ gridTemplateColumns: "minmax(130px, 1.2fr) minmax(160px, 2fr) 100px 102px 16px" }}
                >
                  <div />
                  <div className="flex items-center gap-2 col-span-1">
                    <p className="text-[10px] text-[var(--undp-gray)] leading-relaxed flex-1">
                      {insightText}
                    </p>
                    <ImplFraction implemented={row.implemented} total={row.measures.length} />
                  </div>
                  <div /><div /><div />
                </div>
              )}
            </button>

            {isExpanded && <ExpandedDetail row={row} />}
          </div>
        );
      })}

      {rows.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-[var(--undp-gray)]">
          No sector data available
        </div>
      )}
    </div>
  );
}
