"use client";

/**
 * Reporting & Implementation Coverage view.
 *
 * Replaces the previous SectorScorecard. Designed to lead with the reporting
 * gap signal (which targets have no reported action, which sectors have no
 * action filed) instead of a wall of status badges that all turn out to be
 * "ongoing" — see feedback memory `feedback_scorecard_design`.
 *
 * Mitigation tracks naturally on IPCC sectors (CTF Table 5 is sector-keyed).
 * Adaptation tracks on country-specific frameworks: for Mongolia we use the
 * APNDC's 8 adaptation goals from BTR Table III.9. Forcing adaptation into
 * IPCC sectors dumps half of it into "sector_other" and hides the structure
 * (see project memory `project_btr_data_taxonomy_split`).
 */

import React, { useMemo, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import { getDocColor, getDocLabel } from "@/lib/utils";
import { InfoBox } from "@/components/ui/info-box";
import {
  TargetTextWithHighlights,
  ActionTypeBadge,
  MeasureLanguageChip,
} from "./target-text";
import type {
  BtrData,
  CountryConfig,
  GlobeCategory,
  GgaCategory,
  HrCategory,
  IpccSector,
  MitigationMeasure,
  SupportProject,
  Target,
  ThematicClassification,
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

const APNDC_GOAL_PALETTE = [
  "#0d9488", // teal
  "#7c3aed", // violet
  "#0284c7", // sky
  "#16a34a", // emerald
  "#f59e0b", // amber
  "#dc2626", // red
  "#ea580c", // orange
  "#6366f1", // indigo
];

// ---------------------------------------------------------------------------
// Status taxonomy
// ---------------------------------------------------------------------------

/**
 * Three-state coverage status for the Mitigation by IPCC sector table.
 * Derived only from the reported actions themselves — no dependency on noisy
 * NDC-to-sector classifications. Sectors with zero reported mitigation are
 * filtered out of the table (they belong in the gaps callout instead).
 */
type CoverageStatus = "active" | "partial" | "no_data";

type TFn = ReturnType<typeof useTranslations>;

const STATUS_STYLES: Record<CoverageStatus, { color: string; bg: string }> = {
  active: { color: "#15803d", bg: "bg-green-50" },
  partial: { color: "#0d9488", bg: "bg-teal-50" },
  no_data: { color: "#94a3b8", bg: "bg-gray-50" },
};

function statusConfig(
  t: TFn,
): Record<CoverageStatus, { label: string; color: string; bg: string; description: string }> {
  return {
    active: { ...STATUS_STYLES.active, label: t("status.active.label"), description: t("status.active.description") },
    partial: { ...STATUS_STYLES.partial, label: t("status.partial.label"), description: t("status.partial.description") },
    no_data: { ...STATUS_STYLES.no_data, label: t("status.noData.label"), description: t("status.noData.description") },
  };
}

function deriveStatus(mitMeasures: number, implemented: number): CoverageStatus {
  if (mitMeasures === 0) return "no_data";
  if (implemented > 0) return "active";
  return "partial";
}

// ---------------------------------------------------------------------------
// Mitigation row builder
// ---------------------------------------------------------------------------

interface MitigationRow {
  sector: IpccSector;
  /** Policy targets (cross-document, excluding BTR pseudo-targets) classified to this sector. */
  policyTargets: Target[];
  measures: MitigationMeasure[];
  implementedCount: number;
  support: SupportProject[];
  emissionsChange: number | null;
  latestEmission: number | null;
  latestYear: string | null;
  sparklineData: { year: string; value: number }[];
  projectionData: { year: string; value: number }[];
  status: CoverageStatus;
}

function buildMitigationRows(
  btrData: BtrData,
  sectors: IpccSector[],
  targets: Target[],
  classifications: ThematicClassification[],
): MitigationRow[] {
  // Cross-document policy target classifications keyed by sector id.
  // Uses *all* policy documents (not just NDC) — round 3's NDC-only filter
  // was the noisy bit; the underlying tagging is fine when widened.
  const targetsBySector = new Map<string, Target[]>();
  const policyTargetById = new Map<string, Target>();
  for (const t of targets) {
    if (t.sourceDocument === "BTR") continue;
    policyTargetById.set(t.id, t);
  }
  for (const c of classifications) {
    if (c.taxonomyType !== "sector" || c.isPrimary !== true) continue;
    const t = policyTargetById.get(c.targetId);
    if (!t) continue;
    if (!targetsBySector.has(c.categoryId)) targetsBySector.set(c.categoryId, []);
    targetsBySector.get(c.categoryId)!.push(t);
  }

  return sectors.map((sector): MitigationRow => {
    // Mitigation only — exclude adaptation rows even if they happen to share
    // a sector. Status filter removes empty rows (template artifacts).
    const measures = btrData.mitigationMeasures.filter(
      (m) =>
        m.status?.trim() &&
        m.sector === sector.id &&
        m.actionType !== "adaptation",
    );
    const implementedCount = measures.filter((m) =>
      m.status.toLowerCase().includes("implemented"),
    ).length;
    const policyTargets = targetsBySector.get(sector.id) ?? [];

    const support = (btrData.supportProjects ?? [
      ...btrData.technologySupport,
      ...btrData.capacityBuilding,
    ]).filter(
      (p) =>
        p.sector === sector.id &&
        (p.supportType?.trim() || p.description?.trim() || p.timeFrame?.trim()),
    );

    const emissions = btrData.sectorEmissions.bySector.find(
      (s) => s.normalizedSector === sector.id && !s.isTotal,
    );
    const years = emissions ? Object.keys(emissions.yearlyEmissions).sort() : [];
    const recentYears = years.filter((y) => parseInt(y) >= 2005);
    const sparklineData = recentYears.map((y) => ({
      year: y,
      value: emissions!.yearlyEmissions[y],
    }));

    const earliest = years.length > 0 ? emissions!.yearlyEmissions[years[0]] : null;
    const latest =
      years.length > 0 ? emissions!.yearlyEmissions[years[years.length - 1]] : null;
    const emissionsChange =
      earliest != null && latest != null && earliest !== 0
        ? Math.round(((latest - earliest) / Math.abs(earliest)) * 100)
        : null;

    const projection = btrData.projections.find(
      (p) => p.scenario === "wem" && p.normalizedSector === sector.id && !p.isTotal,
    );
    const projYears = projection ? Object.keys(projection.yearlyValues).sort() : [];
    const projectionData = projYears.map((y) => ({
      year: y,
      value: projection!.yearlyValues[y],
    }));

    return {
      sector,
      policyTargets,
      measures,
      implementedCount,
      support,
      emissionsChange,
      latestEmission: latest,
      latestYear: years.length > 0 ? years[years.length - 1] : null,
      sparklineData,
      projectionData,
      status: deriveStatus(measures.length, implementedCount),
    };
  });
}

// ---------------------------------------------------------------------------
// Imbalance indicator
// ---------------------------------------------------------------------------

/**
 * Tiny arrow hint of the policy-vs-reporting imbalance:
 * - ↗ when policy commitments exceed reported actions ("under-reported")
 * - ↘ when reported actions exceed policy commitments ("over-reported")
 * - · when balanced or both zero
 */
function imbalanceArrow(
  policyCount: number,
  reportedCount: number,
  t: TFn,
): { arrow: string; tone: "under" | "over" | "neutral"; title: string } {
  if (policyCount === 0 && reportedCount === 0) {
    return { arrow: "·", tone: "neutral", title: t("imbalance.none") };
  }
  if (policyCount > reportedCount) {
    return {
      arrow: "↗",
      tone: "under",
      title: t("imbalance.under", { policyCount, reportedCount }),
    };
  }
  if (reportedCount > policyCount) {
    return {
      arrow: "↘",
      tone: "over",
      title: t("imbalance.over", { policyCount, reportedCount }),
    };
  }
  return {
    arrow: "·",
    tone: "neutral",
    title: t("imbalance.balanced", { policyCount, reportedCount }),
  };
}

const IMBALANCE_TONE_CLASSES: Record<"under" | "over" | "neutral", string> = {
  under: "text-amber-700",
  over: "text-blue-700",
  neutral: "text-[var(--undp-gray)]",
};

// ---------------------------------------------------------------------------
// Adaptation row builder (grouped by APNDC goal)
// ---------------------------------------------------------------------------

interface AdaptationRow {
  goalNumber: number;
  /**
   * Verbatim goal text from the country's adaptation action plan
   * (e.g. Mongolia BTR1 Table III.9). Truncated for row display via CSS,
   * shown in full on hover and in the click-to-expand panel. There is no
   * separate "name" field — see feedback memory `feedback_no_fabricated_labels`.
   */
  goalDescription: string;
  /** Policy targets (cross-document, excluding BTR pseudo-targets) classified to this goal. */
  policyTargets: Target[];
  actions: MitigationMeasure[];
  ongoing: number;
  adopted: number;
  implemented: number;
}

function buildAdaptationRows(
  btrData: BtrData,
  targets: Target[],
  classifications: ThematicClassification[],
): AdaptationRow[] {
  const adp = btrData.mitigationMeasures.filter(
    (m) => m.actionType === "adaptation" && m.status?.trim(),
  );
  const byGoal = new Map<number, MitigationMeasure[]>();
  for (const a of adp) {
    const goal = a.adaptationGoal ?? 0;
    if (!byGoal.has(goal)) byGoal.set(goal, []);
    byGoal.get(goal)!.push(a);
  }

  // Goal descriptions come from the country's data file as an array of
  // {id, description}. Build a lookup map by string id (the classification's
  // categoryId is also string-keyed for symmetry).
  const goalDescById = new Map<string, string>();
  for (const g of btrData.adaptationGoals ?? []) {
    goalDescById.set(g.id, g.description);
  }

  // Cross-document policy targets classified to each adaptation goal.
  // Uses the new `adaptation_goal` taxonomy populated by the Python pipeline.
  const policyTargetById = new Map<string, Target>();
  for (const t of targets) {
    if (t.sourceDocument !== "BTR") policyTargetById.set(t.id, t);
  }
  const targetsByGoal = new Map<string, Target[]>();
  for (const c of classifications) {
    if (c.taxonomyType !== "adaptation_goal" || c.isPrimary !== true) continue;
    const t = policyTargetById.get(c.targetId);
    if (!t) continue;
    if (!targetsByGoal.has(c.categoryId)) targetsByGoal.set(c.categoryId, []);
    targetsByGoal.get(c.categoryId)!.push(t);
  }

  const rows: AdaptationRow[] = [];
  for (const [goalNumber, actions] of byGoal.entries()) {
    if (goalNumber === 0) continue; // skip un-grouped
    const ongoing = actions.filter((a) =>
      a.status.toLowerCase().includes("ongoing"),
    ).length;
    const adopted = actions.filter((a) =>
      a.status.toLowerCase().includes("adopted"),
    ).length;
    const implemented = actions.filter((a) =>
      a.status.toLowerCase().includes("implemented"),
    ).length;

    const idStr = goalNumber.toString();
    rows.push({
      goalNumber,
      goalDescription: goalDescById.get(idStr) ?? "",
      policyTargets: targetsByGoal.get(idStr) ?? [],
      actions,
      ongoing,
      adopted,
      implemented,
    });
  }

  return rows.sort((a, b) => a.goalNumber - b.goalNumber);
}

// ---------------------------------------------------------------------------
// Biodiversity row builder (grouped by GLOBE category)
// ---------------------------------------------------------------------------

type CoverageGroupMode = "default" | "biodiversity" | "country_sectors" | "gga" | "hr";

const BIODIVERSITY_PALETTE = [
  "#0d9488", "#7c3aed", "#0284c7", "#16a34a",
  "#f59e0b", "#dc2626", "#ea580c", "#6366f1",
];

interface BiodiversityRow {
  category: GlobeCategory | GgaCategory;
  /** All BTR measures (mitigation + adaptation) classified under this category */
  measures: MitigationMeasure[];
  /** Policy targets (cross-document, excluding BTR) classified under this category */
  policyTargets: Target[];
  implementedCount: number;
  ongoingCount: number;
}

function buildBiodiversityRows(
  btrData: BtrData,
  categories: (GlobeCategory | GgaCategory)[],
  targets: Target[],
  classifications: ThematicClassification[],
  taxonomyType: string = "globe",
): { rows: BiodiversityRow[]; unclassified: MitigationMeasure[] } {
  const allMeasures = btrData.mitigationMeasures.filter((m) => m.status?.trim());

  // BTR pseudo-targets in the targets array carry IDs like "BTR_energy_1"
  // that match the targetId in classifications. Build a map from targetId →
  // set of globe category ids.
  const btrTargets = targets.filter((t) => t.sourceDocument === "BTR");
  const globeClassForBtr = classifications.filter(
    (c) =>
      c.taxonomyType === taxonomyType &&
      c.isPrimary === true &&
      btrTargets.some((t) => t.id === c.targetId),
  );
  const targetToGlobe = new Map<string, Set<string>>();
  for (const c of globeClassForBtr) {
    if (!targetToGlobe.has(c.targetId)) targetToGlobe.set(c.targetId, new Set());
    targetToGlobe.get(c.targetId)!.add(c.categoryId);
  }

  // Link measures to their BTR pseudo-target by matching the truncated name
  // against sourceLabel (both are derived from the same raw measure name).
  function findBtrTarget(m: MitigationMeasure): Target | undefined {
    for (const t of btrTargets) {
      if (m.name.startsWith(t.sourceLabel.replace(/\.{3}$/, "")) || t.sourceLabel.startsWith(m.name.slice(0, 40))) {
        return t;
      }
    }
    return undefined;
  }

  // Policy target classifications (non-BTR targets classified under globe)
  const policyTargetById = new Map<string, Target>();
  for (const t of targets) {
    if (t.sourceDocument !== "BTR") policyTargetById.set(t.id, t);
  }
  const policyTargetsByCategory = new Map<string, Target[]>();
  for (const c of classifications) {
    if (c.taxonomyType !== taxonomyType || c.isPrimary !== true) continue;
    const t = policyTargetById.get(c.targetId);
    if (!t) continue;
    if (!policyTargetsByCategory.has(c.categoryId)) policyTargetsByCategory.set(c.categoryId, []);
    policyTargetsByCategory.get(c.categoryId)!.push(t);
  }

  // Group measures by GLOBE category via their linked pseudo-target
  const measuresByCategory = new Map<string, MitigationMeasure[]>();
  const classifiedMeasures = new Set<MitigationMeasure>();

  for (const m of allMeasures) {
    const pt = findBtrTarget(m);
    if (!pt) continue;
    const cats = targetToGlobe.get(pt.id);
    if (!cats || cats.size === 0) continue;
    for (const catId of cats) {
      if (!measuresByCategory.has(catId)) measuresByCategory.set(catId, []);
      measuresByCategory.get(catId)!.push(m);
      classifiedMeasures.add(m);
    }
  }

  const rows: BiodiversityRow[] = [];
  for (const cat of categories) {
    const measures = measuresByCategory.get(cat.id) ?? [];
    const policyTargets = policyTargetsByCategory.get(cat.id) ?? [];
    rows.push({
      category: cat,
      measures,
      policyTargets,
      implementedCount: measures.filter((m) =>
        m.status.toLowerCase().includes("implemented"),
      ).length,
      ongoingCount: measures.filter((m) =>
        m.status.toLowerCase().includes("ongoing"),
      ).length,
    });
  }

  const unclassified = allMeasures.filter((m) => !classifiedMeasures.has(m));

  rows.sort((a, b) => b.measures.length - a.measures.length || b.policyTargets.length - a.policyTargets.length);
  return { rows, unclassified };
}

// ---------------------------------------------------------------------------
// Sub-component: Reporting gaps callout
// ---------------------------------------------------------------------------

function ReportingGapsCard({ gaps }: { gaps: string[] }) {
  const t = useTranslations("viz.implementationCoverage");
  if (gaps.length === 0) return null;
  return (
    <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3.5 mb-5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 mb-2">
        {t("gaps.title")}
      </p>
      <ul className="space-y-1.5">
        {gaps.map((g, i) => (
          <li
            key={i}
            className="text-xs text-[var(--undp-black)] leading-relaxed flex gap-2"
          >
            <span className="text-amber-700 shrink-0">•</span>
            <span>{g}</span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-[var(--undp-gray)] italic mt-2.5">
        {t("gaps.footnote")}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Mitigation table — by IPCC sector
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: CoverageStatus }) {
  const t = useTranslations("viz.implementationCoverage");
  const cfg = statusConfig(t)[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${cfg.bg}`}
      style={{ color: cfg.color }}
      title={cfg.description}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: cfg.color }}
      />
      {cfg.label}
    </span>
  );
}

function Sparkline({
  data,
  color,
  width = 64,
  height = 20,
}: {
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
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MitigationDetail({ row, countryConfig }: { row: MitigationRow; countryConfig?: CountryConfig | null }) {
  const t = useTranslations("viz.implementationCoverage");
  const color = SECTOR_COLORS[row.sector.id] ?? "#a9b1b7";

  const combinedChart = useMemo(() => {
    if (row.sparklineData.length === 0 && row.projectionData.length === 0) return null;
    const allYears = new Map<string, { historical?: number; projected?: number }>();
    for (const d of row.sparklineData)
      allYears.set(d.year, { ...allYears.get(d.year), historical: d.value });
    for (const d of row.projectionData)
      allYears.set(d.year, { ...allYears.get(d.year), projected: d.value });
    return Array.from(allYears.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, vals]) => ({ year, ...vals }));
  }, [row.sparklineData, row.projectionData]);

  const lastHistYear =
    row.sparklineData.length > 0
      ? row.sparklineData[row.sparklineData.length - 1].year
      : null;

  const implemented = row.measures.filter((m) =>
    m.status.toLowerCase().includes("implemented"),
  );
  const other = row.measures.filter(
    (m) => !m.status.toLowerCase().includes("implemented"),
  );

  return (
    <div className="border-t border-gray-100 px-5 py-5 bg-[var(--undp-light)]/40">
      {/* Two-column layout: policy targets (cross-document) on the left, reported actions on the right */}
      <div className="grid md:grid-cols-2 gap-6 mb-5">
        {/* Policy targets classified to this sector across NDC + NBSAP + NAP + Sectoral */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
            {t("mitigation.policyTargetsInSector", { count: row.policyTargets.length })}
          </p>
          {row.policyTargets.length === 0 ? (
            <p className="text-xs text-[var(--undp-gray)] italic">
              {t("mitigation.noPolicyTargetsInSector")}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {row.policyTargets.map((t) => (
                <li key={t.id} className="py-2 first:pt-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white leading-none"
                      style={{ backgroundColor: getDocColor(countryConfig, t.sourceDocument) }}
                    >
                      {getDocLabel(countryConfig, t.sourceDocument)}
                    </span>
                    <span className="text-xs font-medium text-[var(--undp-black)]">
                      {t.sourceLabel}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--undp-gray)] leading-relaxed">
                    <TargetTextWithHighlights target={t} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reported mitigation actions */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
            {t("mitigation.reportedActions", { count: row.measures.length })}
          </p>
        {row.measures.length === 0 ? (
          <p className="text-xs text-[var(--undp-gray)] italic">
            {t("mitigation.noReportedActions")}
          </p>
        ) : (
          <div className="space-y-3">
            {implemented.length > 0 && (
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-[#15803d] mb-1 flex items-center gap-1">
                  <span>✓</span> {t("status.implementedCount", { count: implemented.length })}
                </p>
                <ul className="divide-y divide-gray-100">
                  {implemented.map((m, i) => (
                    <li
                      key={i}
                      className="py-2 first:pt-0 border-l-2 border-[#15803d] pl-2"
                    >
                      <p className="text-xs text-[var(--undp-black)] leading-relaxed">
                        {m.name} <MeasureLanguageChip measure={m} />
                      </p>
                      {m.implementingEntity && (
                        <p className="text-[10px] text-[var(--undp-gray)] mt-0.5">
                          {m.implementingEntity}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {other.length > 0 && (
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1">
                  {t("status.adoptedPlanned", { count: other.length })}
                </p>
                <ul className="divide-y divide-gray-100">
                  {other.map((m, i) => (
                    <li key={i} className="py-2 first:pt-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none bg-amber-100 text-amber-800">
                          {m.status}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--undp-black)] leading-relaxed">
                        {m.name} <MeasureLanguageChip measure={m} />
                      </p>
                      {m.implementingEntity && (
                        <p className="text-[10px] text-[var(--undp-gray)] mt-0.5">
                          {m.implementingEntity}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Emissions trajectory chart */}
      {combinedChart && combinedChart.length > 1 && (
        <div className="pt-4 border-t border-gray-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
            {t("mitigation.emissionsTrajectory", { sector: row.sector.name })}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart
              data={combinedChart}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 12, fill: "var(--undp-gray)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 12, fill: "var(--undp-gray)" }}
                tickFormatter={(v: number) =>
                  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0" }}
                formatter={(value) => [
                  t("chart.ktValue", { value: Math.round(Number(value)) }),
                  "",
                ]}
                labelFormatter={(label) => t("chart.yearLabel", { year: String(label) })}
              />
              {lastHistYear && (
                <ReferenceLine
                  x={lastHistYear}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              )}
              <Line
                type="monotone"
                dataKey="historical"
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls
                name={t("chart.historical")}
              />
              <Line
                type="monotone"
                dataKey="projected"
                stroke={color}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
                name={t("chart.projectedWem")}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function MitigationByIpccSector({
  rows,
  expandedSector,
  onToggle,
  highlightSector,
  countryConfig,
}: {
  rows: MitigationRow[];
  expandedSector: string | null;
  onToggle: (id: string) => void;
  highlightSector?: string | null;
  countryConfig?: CountryConfig | null;
}) {
  const t = useTranslations("viz.implementationCoverage");
  // Show all IPCC sectors. Empty rows still convey signal -- "this sector has
  // policy targets but no reported mitigation action" is exactly the gap the
  // view exists to surface, and seeing the full sector list inline matters.
  if (rows.length === 0) return null;

  const hasAnyEmissionsData = rows.some((r) => r.sparklineData.length > 1);

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden bg-white mb-6">
      <div className="px-5 py-3 border-b border-gray-100 bg-[var(--undp-light)]/30">
        <h3 className="text-sm font-semibold text-[var(--undp-black)]">
          {t("mitigation.byIpccSector")}
        </h3>
        <p className="text-[11px] text-[var(--undp-gray)] mt-0.5 italic">
          {hasAnyEmissionsData
            ? t("mitigation.byIpccSectorDescWithChart")
            : t("mitigation.byIpccSectorDesc")}
        </p>
      </div>
      {rows.map((row) => {
        const isExpanded = expandedSector === row.sector.id;
        const isHighlighted = highlightSector === row.sector.id;
        const color = SECTOR_COLORS[row.sector.id] ?? "#a9b1b7";
        const imbalance = imbalanceArrow(row.policyTargets.length, row.measures.length, t);

        return (
          <div
            key={row.sector.id}
            id={`mit-sector-row-${row.sector.id}`}
            className={`border-b border-gray-100 last:border-b-0 ${
              isHighlighted ? "ring-2 ring-[var(--undp-blue)] ring-inset" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onToggle(row.sector.id)}
              className="w-full text-left px-5 py-3 hover:bg-gray-50/60 transition-colors cursor-pointer"
            >
              <div
                className="grid items-center gap-4"
                style={{
                  gridTemplateColumns: hasAnyEmissionsData
                    ? "minmax(180px, 1.6fr) 130px minmax(140px, 1fr) 130px 110px 16px"
                    : "minmax(180px, 1.6fr) 130px minmax(140px, 1fr) 130px 16px",
                }}
              >
                {/* Sector name */}
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs font-medium text-[var(--undp-black)] truncate">
                    {row.sector.name}
                  </span>
                </div>

                {/* Policy targets count + imbalance arrow */}
                <span className="text-xs text-[var(--undp-gray)] tabular-nums">
                  <span className="font-semibold text-[var(--undp-black)]">
                    {row.policyTargets.length}
                  </span>{" "}
                  {t("counts.policyTargetsShort", { count: row.policyTargets.length })}{" "}
                  <span
                    className={`font-semibold ${IMBALANCE_TONE_CLASSES[imbalance.tone]}`}
                    title={imbalance.title}
                  >
                    {imbalance.arrow}
                  </span>
                </span>

                {/* Reported actions count */}
                <span className="text-xs text-[var(--undp-gray)] tabular-nums">
                  <span className="font-semibold text-[var(--undp-black)]">
                    {row.measures.length}
                  </span>{" "}
                  {t("counts.reported")}
                  {row.implementedCount > 0 && (
                    <span className="text-[#15803d]">
                      {" "}
                      {t("counts.implementedParen", { count: row.implementedCount })}
                    </span>
                  )}
                </span>

                {/* Status */}
                <div>
                  <StatusBadge status={row.status} />
                </div>

                {/* Emissions — hidden entirely when no rows have data */}
                {hasAnyEmissionsData && (
                  <div className="flex items-center gap-2">
                    {row.sparklineData.length > 1 ? (
                      <>
                        <Sparkline data={row.sparklineData} color={color} />
                        <div className="flex flex-col leading-tight">
                          {row.latestEmission !== null && (
                            <span className="text-[10px] text-[var(--undp-gray)] tabular-nums">
                              {Math.abs(row.latestEmission) >= 1000
                                ? `${(row.latestEmission / 1000).toFixed(0)}k kt`
                                : `${Math.round(row.latestEmission)} kt`}
                            </span>
                          )}
                          {row.emissionsChange !== null && (
                            <span
                              className="text-[10px] tabular-nums font-medium"
                              style={{
                                color:
                                  row.emissionsChange > 5
                                    ? "#dc2626"
                                    : row.emissionsChange < -5
                                      ? "#16a34a"
                                      : "#94a3b8",
                              }}
                            >
                              {row.emissionsChange > 0 ? "+" : ""}
                              {row.emissionsChange}%
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <span className="text-[10px] text-[var(--undp-gray)]">{t("counts.noDataLower")}</span>
                    )}
                  </div>
                )}

                {/* Expand arrow */}
                <span className="text-[10px] text-[var(--undp-gray)]">
                  {isExpanded ? "▾" : "▸"}
                </span>
              </div>
            </button>
            {isExpanded && <MitigationDetail row={row} countryConfig={countryConfig} />}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Adaptation table — by APNDC goal
// ---------------------------------------------------------------------------

/** Sort priority for adaptation action status: implemented first, then adopted, then ongoing. */
const ADAPTATION_STATUS_RANK: Record<string, number> = {
  implemented: 0,
  adopted: 1,
  ongoing: 2,
};

function adaptationStatusRank(status: string | undefined): number {
  if (!status) return 99;
  const lower = status.toLowerCase();
  if (lower.includes("implemented")) return ADAPTATION_STATUS_RANK.implemented;
  if (lower.includes("adopted")) return ADAPTATION_STATUS_RANK.adopted;
  if (lower.includes("ongoing")) return ADAPTATION_STATUS_RANK.ongoing;
  return 99;
}

function adaptationStatusBadgeClasses(status: string | undefined): string {
  if (!status) return "bg-gray-100 text-gray-700";
  const lower = status.toLowerCase();
  if (lower.includes("implemented")) return "bg-green-100 text-green-800";
  if (lower.includes("adopted")) return "bg-amber-100 text-amber-800";
  // ongoing and any other status: muted gray (ongoing is the default state for adaptation)
  return "bg-gray-100 text-gray-700";
}

function AdaptationDetail({ row, countryConfig }: { row: AdaptationRow; countryConfig?: CountryConfig | null }) {
  const t = useTranslations("viz.implementationCoverage");
  // Sort actions: implemented first, then adopted, then ongoing.
  // Mirrors MitigationDetail's "Implemented (X)" promotion to the top.
  const sortedActions = useMemo(
    () =>
      [...row.actions].sort(
        (a, b) =>
          adaptationStatusRank(a.status) - adaptationStatusRank(b.status),
      ),
    [row.actions],
  );

  return (
    <div className="border-t border-gray-100 px-5 py-4 bg-[var(--undp-light)]/40">
      {/* Full verbatim goal description */}
      {row.goalDescription && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1">
            {t("adaptation.goal", { number: row.goalNumber })}
          </p>
          <p className="text-xs text-[var(--undp-black)] leading-relaxed">
            {row.goalDescription}
          </p>
        </div>
      )}

      {/* Policy targets classified to this goal (cross-document) */}
      {row.policyTargets.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
            {t("adaptation.policyTargetsAligned", { count: row.policyTargets.length })}
          </p>
          <ul className="divide-y divide-gray-100">
            {row.policyTargets.map((t) => (
              <li key={t.id} className="py-2 first:pt-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white leading-none"
                    style={{ backgroundColor: getDocColor(countryConfig, t.sourceDocument) }}
                  >
                    {getDocLabel(countryConfig, t.sourceDocument)}
                  </span>
                  <span className="text-xs font-medium text-[var(--undp-black)]">
                    {t.sourceLabel}
                  </span>
                </div>
                <p className="text-xs text-[var(--undp-gray)] leading-relaxed">
                  <TargetTextWithHighlights target={t} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
        {t("adaptation.reportedActions", { count: sortedActions.length })}
      </p>
      <ul className="divide-y divide-gray-100">
        {sortedActions.map((a, i) => {
          const isImplemented = a.status?.toLowerCase().includes("implemented");
          return (
            <li
              key={i}
              className={`py-3 first:pt-0 ${
                isImplemented ? "border-l-2 border-green-600 pl-2" : ""
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <ActionTypeBadge actionType="adaptation" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]">
                  {t("adaptation.goal", { number: row.goalNumber })}
                </span>
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${adaptationStatusBadgeClasses(a.status)}`}
                >
                  {a.status}
                </span>
              </div>
              <p className="text-xs text-[var(--undp-black)] leading-relaxed font-medium">
                {a.name}
              </p>
              {a.indicator && (
                <p className="text-[11px] text-[var(--undp-gray)] mt-0.5">
                  <span className="font-semibold uppercase text-[9px] tracking-wide">
                    {t("adaptation.indicatorLabel")}
                  </span>{" "}
                  {a.indicator}
                </p>
              )}
              {a.implementationStatus && (
                <p className="text-[11px] text-[var(--undp-gray)] mt-1 leading-relaxed italic">
                  {a.implementationStatus}
                </p>
              )}
              {a.implementingEntity && (
                <p className="text-[10px] text-[var(--undp-gray)]/80 mt-1">
                  {t("adaptation.responsible", { entity: a.implementingEntity })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AdaptationByApndcGoal({
  rows,
  expandedGoal,
  onToggle,
  groupingLabel,
  countryConfig,
}: {
  rows: AdaptationRow[];
  expandedGoal: number | null;
  onToggle: (n: number) => void;
  /** Country-specific label for the grouping (e.g. "APNDC adaptation goal"). */
  groupingLabel?: string;
  countryConfig?: CountryConfig | null;
}) {
  const t = useTranslations("viz.implementationCoverage");
  if (rows.length === 0) return null;
  const sectionTitle = groupingLabel
    ? t("adaptation.sectionTitleWithLabel", { label: groupingLabel })
    : t("adaptation.sectionTitle");
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden bg-white mb-6">
      <div className="px-5 py-3 border-b border-gray-100 bg-[var(--undp-light)]/30">
        <h3 className="text-sm font-semibold text-[var(--undp-black)]">
          {sectionTitle}
          <InfoBox>
            {t("adaptation.infoBox")}
          </InfoBox>
        </h3>
        <p className="text-[11px] text-[var(--undp-gray)] mt-0.5 italic">
          {t("adaptation.sectionDesc")}
        </p>
      </div>
      {rows.map((row) => {
        const isExpanded = expandedGoal === row.goalNumber;
        const color =
          APNDC_GOAL_PALETTE[(row.goalNumber - 1) % APNDC_GOAL_PALETTE.length];
        const imbalance = imbalanceArrow(row.policyTargets.length, row.actions.length, t);
        return (
          <div
            key={row.goalNumber}
            className="border-b border-gray-100 last:border-b-0"
          >
            <button
              type="button"
              onClick={() => onToggle(row.goalNumber)}
              className="w-full text-left px-5 py-3 hover:bg-gray-50/60 transition-colors cursor-pointer"
            >
              <div
                className="grid items-center gap-4"
                style={{
                  gridTemplateColumns:
                    "minmax(260px, 2fr) 130px 180px 16px",
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <p
                    className="text-xs font-medium text-[var(--undp-black)] truncate"
                    title={row.goalDescription || t("adaptation.goal", { number: row.goalNumber })}
                  >
                    {t("adaptation.goal", { number: row.goalNumber })}
                    {row.goalDescription ? ` — ${row.goalDescription}` : ""}
                  </p>
                </div>

                <div className="text-xs text-[var(--undp-gray)] tabular-nums">
                  <span className="font-semibold text-[var(--undp-black)]">
                    {row.policyTargets.length}
                  </span>{" "}
                  {t("counts.policyTargetsShort", { count: row.policyTargets.length })}{" "}
                  <span
                    className={`font-semibold ${IMBALANCE_TONE_CLASSES[imbalance.tone]}`}
                    title={imbalance.title}
                  >
                    {imbalance.arrow}
                  </span>
                </div>

                <div className="text-xs text-[var(--undp-gray)] tabular-nums">
                  <span className="font-semibold text-[var(--undp-black)]">
                    {row.actions.length}
                  </span>{" "}
                  {t("counts.actions", { count: row.actions.length })}
                  <div className="text-[10px] text-[var(--undp-gray)] mt-0.5 flex flex-wrap gap-x-2">
                    {row.ongoing > 0 && <span>{t("counts.ongoing", { count: row.ongoing })}</span>}
                    {row.adopted > 0 && <span>{t("counts.adopted", { count: row.adopted })}</span>}
                    {row.implemented > 0 && (
                      <span className="text-[#15803d]">
                        {t("counts.implementedCheck", { count: row.implemented })}
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-[10px] text-[var(--undp-gray)]">
                  {isExpanded ? "▾" : "▸"}
                </span>
              </div>
            </button>
            {isExpanded && <AdaptationDetail row={row} countryConfig={countryConfig} />}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Biodiversity table — by GLOBE category
// ---------------------------------------------------------------------------

function BiodiversityDetail({ row, countryConfig }: { row: BiodiversityRow; countryConfig?: CountryConfig | null }) {
  const t = useTranslations("viz.implementationCoverage");
  const implemented = row.measures.filter((m) =>
    m.status.toLowerCase().includes("implemented"),
  );
  const other = row.measures.filter(
    (m) => !m.status.toLowerCase().includes("implemented"),
  );

  return (
    <div className="border-t border-gray-100 px-5 py-5 bg-[var(--undp-light)]/40">
      <div className="grid md:grid-cols-2 gap-6 mb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
            {t("biodiversity.policyTargetsInCategory", { count: row.policyTargets.length })}
          </p>
          {row.policyTargets.length === 0 ? (
            <p className="text-xs text-[var(--undp-gray)] italic">
              {t("biodiversity.noPolicyTargets")}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {row.policyTargets.map((t) => (
                <li key={t.id} className="py-2 first:pt-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white leading-none"
                      style={{ backgroundColor: getDocColor(countryConfig, t.sourceDocument) }}
                    >
                      {getDocLabel(countryConfig, t.sourceDocument)}
                    </span>
                    <span className="text-xs font-medium text-[var(--undp-black)]">
                      {t.sourceLabel}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--undp-gray)] leading-relaxed">
                    <TargetTextWithHighlights target={t} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
            {t("biodiversity.reportedActions", { count: row.measures.length })}
          </p>
          {row.measures.length === 0 ? (
            <p className="text-xs text-[var(--undp-gray)] italic">
              {t("biodiversity.noReportedActions")}
            </p>
          ) : (
            <div className="space-y-3">
              {implemented.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-[#15803d] mb-1 flex items-center gap-1">
                    <span>✓</span> {t("status.implementedCount", { count: implemented.length })}
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {implemented.map((m, i) => (
                      <li key={i} className="py-2 first:pt-0 border-l-2 border-[#15803d] pl-2">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <ActionTypeBadge actionType={m.actionType ?? "mitigation"} />
                        </div>
                        <p className="text-xs text-[var(--undp-black)] leading-relaxed">{m.name} <MeasureLanguageChip measure={m} /></p>
                        {m.implementingEntity && (
                          <p className="text-[10px] text-[var(--undp-gray)] mt-0.5">{m.implementingEntity}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {other.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1">
                    {t("status.adoptedOngoingPlanned", { count: other.length })}
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {other.map((m, i) => (
                      <li key={i} className="py-2 first:pt-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <ActionTypeBadge actionType={m.actionType ?? "mitigation"} />
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none bg-amber-100 text-amber-800">
                            {m.status}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--undp-black)] leading-relaxed">{m.name} <MeasureLanguageChip measure={m} /></p>
                        {m.implementingEntity && (
                          <p className="text-[10px] text-[var(--undp-gray)] mt-0.5">{m.implementingEntity}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BiodiversityByGlobe({
  rows,
  unclassified,
  expandedCategory,
  onToggle,
  countryConfig,
  title,
  sectionDesc,
  infoBox,
}: {
  rows: BiodiversityRow[];
  unclassified: MitigationMeasure[];
  expandedCategory: string | null;
  onToggle: (id: string) => void;
  countryConfig?: CountryConfig | null;
  /** Section heading. Defaults to the GLOBE/biodiversity copy; pass to reuse
   *  this category-coverage table for another single-level taxonomy (e.g. GGA). */
  title?: string;
  sectionDesc?: string;
  /** Heading info popover. Defaults to the biodiversity explainer; pass `null`
   *  to omit it (the biodiversity-specific note does not fit other taxonomies). */
  infoBox?: React.ReactNode;
}) {
  const t = useTranslations("viz.implementationCoverage");
  if (rows.length === 0 && unclassified.length === 0) return null;

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden bg-white mb-6">
      <div className="px-5 py-3 border-b border-gray-100 bg-[var(--undp-light)]/30">
        <h3 className="text-sm font-semibold text-[var(--undp-black)]">
          {title ?? t("biodiversity.title")}
          {infoBox === undefined ? (
            <InfoBox>
              {t.rich("biodiversity.infoBox", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </InfoBox>
          ) : (
            infoBox
          )}
        </h3>
        <p className="text-[11px] text-[var(--undp-gray)] mt-0.5 italic">
          {sectionDesc ?? t("biodiversity.sectionDesc")}
        </p>
      </div>
      {rows.map((row, idx) => {
        const isExpanded = expandedCategory === row.category.id;
        const color = BIODIVERSITY_PALETTE[idx % BIODIVERSITY_PALETTE.length];
        return (
          <div key={row.category.id} className="border-b border-gray-100 last:border-b-0">
            <button
              type="button"
              onClick={() => onToggle(row.category.id)}
              className="w-full text-left px-5 py-3 hover:bg-gray-50/60 transition-colors cursor-pointer"
            >
              <div
                className="grid items-center gap-4"
                style={{ gridTemplateColumns: "minmax(260px, 2fr) 130px 180px 16px" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="text-xs font-medium text-[var(--undp-black)] truncate"
                    title={row.category.name}
                  >
                    {row.category.name}
                  </span>
                </div>
                <span className="text-xs text-[var(--undp-gray)] tabular-nums">
                  <span className="font-semibold text-[var(--undp-black)]">
                    {row.policyTargets.length}
                  </span>{" "}
                  {t("counts.policyTargetsShort", { count: row.policyTargets.length })}
                </span>
                <div className="text-xs text-[var(--undp-gray)] tabular-nums">
                  {row.measures.length === 0 && row.policyTargets.length > 0 ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700" title={t("biodiversity.gapTitle")}>
                      {t("biodiversity.zeroActionsGap")}
                    </span>
                  ) : row.measures.length === 0 && row.policyTargets.length === 0 ? (
                    <span className="text-[var(--undp-gray)] italic text-[10px]">{t("biodiversity.noCoverageYet")}</span>
                  ) : (
                    <>
                      <span className="font-semibold text-[var(--undp-black)]">
                        {row.measures.length}
                      </span>{" "}
                      {t("counts.actions", { count: row.measures.length })}
                      <div className="text-[10px] text-[var(--undp-gray)] mt-0.5 flex flex-wrap gap-x-2">
                        {row.ongoingCount > 0 && <span>{t("counts.ongoing", { count: row.ongoingCount })}</span>}
                        {row.implementedCount > 0 && (
                          <span className="text-[#15803d]">{t("counts.implementedCheck", { count: row.implementedCount })}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <span className="text-[10px] text-[var(--undp-gray)]">
                  {isExpanded ? "▾" : "▸"}
                </span>
              </div>
            </button>
            {isExpanded && <BiodiversityDetail row={row} countryConfig={countryConfig} />}
          </div>
        );
      })}
      {unclassified.length > 0 && (
        <div className="border-b border-gray-100 last:border-b-0">
          <button
            type="button"
            onClick={() => onToggle("__unclassified")}
            className="w-full text-left px-5 py-3 hover:bg-gray-50/60 transition-colors cursor-pointer"
          >
            <div
              className="grid items-center gap-4"
              style={{ gridTemplateColumns: "minmax(260px, 2fr) 130px 180px 16px" }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0 bg-gray-300" />
                <span className="text-xs font-medium text-[var(--undp-gray)] italic">
                  {t("biodiversity.notClassified")}
                </span>
              </div>
              <span className="text-xs text-[var(--undp-gray)]" />
              <span className="text-xs text-[var(--undp-gray)] tabular-nums">
                <span className="font-semibold text-[var(--undp-black)]">
                  {unclassified.length}
                </span>{" "}
                {t("counts.actions", { count: unclassified.length })}
              </span>
              <span className="text-[10px] text-[var(--undp-gray)]">
                {expandedCategory === "__unclassified" ? "▾" : "▸"}
              </span>
            </div>
          </button>
          {expandedCategory === "__unclassified" && (
            <div className="border-t border-gray-100 px-5 py-4 bg-[var(--undp-light)]/40">
              <ul className="divide-y divide-gray-100">
                {unclassified.map((m, i) => (
                  <li key={i} className="py-2 first:pt-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <ActionTypeBadge actionType={m.actionType ?? "mitigation"} />
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none bg-gray-100 text-gray-700">
                        {m.status}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--undp-black)] leading-relaxed">{m.name} <MeasureLanguageChip measure={m} /></p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Country-sector row builder (for countries with their own mitigation taxonomy)
// ---------------------------------------------------------------------------

const COUNTRY_SECTOR_PALETTE = [
  "#0468b1", "#0d9488", "#7c3aed", "#16a34a", "#f59e0b",
  "#0284c7", "#ea580c", "#6366f1", "#dc2626", "#ca8a04",
  "#166534",
];

interface CountrySectorRow {
  id: string;
  name: string;
  nameOriginal?: string;
  measures: MitigationMeasure[];
  implementedCount: number;
  status: CoverageStatus;
}

function buildCountrySectorRows(
  btrData: BtrData,
  countrySectors: NonNullable<CountryConfig["countrySectors"]>,
): CountrySectorRow[] {
  const mitigation = btrData.mitigationMeasures.filter(
    (m) => m.status?.trim() && m.actionType !== "adaptation",
  );

  return countrySectors.map((cs): CountrySectorRow => {
    const measures = mitigation.filter((m) => m.sectorRaw === cs.id);
    const implementedCount = measures.filter((m) =>
      m.status.toLowerCase().includes("implemented"),
    ).length;
    return {
      id: cs.id,
      name: cs.name,
      nameOriginal: cs.nameOriginal,
      measures,
      implementedCount,
      status: deriveStatus(measures.length, implementedCount),
    };
  });
}

function CountrySectorDetail({ row }: { row: CountrySectorRow }) {
  const t = useTranslations("viz.implementationCoverage");
  const implemented = row.measures.filter((m) =>
    m.status.toLowerCase().includes("implemented"),
  );
  const other = row.measures.filter(
    (m) => !m.status.toLowerCase().includes("implemented"),
  );

  return (
    <div className="border-t border-gray-100 px-5 py-5 bg-[var(--undp-light)]/40">
      {row.nameOriginal && (
        <p className="text-[10px] text-[var(--undp-gray)] mb-3 italic">
          {t("countrySector.original", { name: row.nameOriginal })}
        </p>
      )}
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
        {t("mitigation.reportedActions", { count: row.measures.length })}
      </p>
      {row.measures.length === 0 ? (
        <p className="text-xs text-[var(--undp-gray)] italic">
          {t("countrySector.noReportedActions")}
        </p>
      ) : (
        <div className="space-y-3">
          {implemented.length > 0 && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-[#15803d] mb-1 flex items-center gap-1">
                <span>✓</span> {t("status.implementedCount", { count: implemented.length })}
              </p>
              <ul className="divide-y divide-gray-100">
                {implemented.map((m, i) => (
                  <li key={i} className="py-2 first:pt-0 border-l-2 border-[#15803d] pl-2">
                    <p className="text-xs text-[var(--undp-black)] leading-relaxed">
                      {m.name} <MeasureLanguageChip measure={m} />
                    </p>
                    {m.implementingEntity && (
                      <p className="text-[10px] text-[var(--undp-gray)] mt-0.5">{m.implementingEntity}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {other.length > 0 && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1">
                {t("status.adoptedPlanned", { count: other.length })}
              </p>
              <ul className="divide-y divide-gray-100">
                {other.map((m, i) => (
                  <li key={i} className="py-2 first:pt-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none bg-amber-100 text-amber-800">
                        {m.status}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--undp-black)] leading-relaxed">
                      {m.name} <MeasureLanguageChip measure={m} />
                    </p>
                    {m.implementingEntity && (
                      <p className="text-[10px] text-[var(--undp-gray)] mt-0.5">{m.implementingEntity}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MitigationByCountrySector({
  rows,
  expandedSector,
  onToggle,
}: {
  rows: CountrySectorRow[];
  expandedSector: string | null;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("viz.implementationCoverage");
  if (rows.length === 0) return null;

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden bg-white mb-6">
      <div className="px-5 py-3 border-b border-gray-100 bg-[var(--undp-light)]/30">
        <h3 className="text-sm font-semibold text-[var(--undp-black)]">
          {t("countrySector.title")}
        </h3>
        <p className="text-[11px] text-[var(--undp-gray)] mt-0.5 italic">
          {t("countrySector.sectionDesc")}
        </p>
      </div>
      {rows.map((row, idx) => {
        const isExpanded = expandedSector === row.id;
        const color = COUNTRY_SECTOR_PALETTE[idx % COUNTRY_SECTOR_PALETTE.length];

        return (
          <div key={row.id} className="border-b border-gray-100 last:border-b-0">
            <button
              type="button"
              onClick={() => onToggle(row.id)}
              className="w-full text-left px-5 py-3 hover:bg-gray-50/60 transition-colors cursor-pointer"
            >
              <div
                className="grid items-center gap-4"
                style={{
                  gridTemplateColumns: "minmax(260px, 2fr) 180px 130px 16px",
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="text-xs font-medium text-[var(--undp-black)] truncate"
                    title={row.nameOriginal ? `${row.name} (${row.nameOriginal})` : row.name}
                  >
                    {row.name}
                  </span>
                  {row.nameOriginal && (
                    <span
                      className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-[var(--undp-gray)] cursor-help"
                      title={row.nameOriginal}
                    >
                      ES
                    </span>
                  )}
                </div>

                <span className="text-xs text-[var(--undp-gray)] tabular-nums">
                  <span className="font-semibold text-[var(--undp-black)]">
                    {row.measures.length}
                  </span>{" "}
                  {t("counts.reported")}
                  {row.implementedCount > 0 && (
                    <span className="text-[#15803d]">
                      {" "}{t("counts.implementedParen", { count: row.implementedCount })}
                    </span>
                  )}
                </span>

                <div>
                  <StatusBadge status={row.status} />
                </div>

                <span className="text-[10px] text-[var(--undp-gray)]">
                  {isExpanded ? "▾" : "▸"}
                </span>
              </div>
            </button>
            {isExpanded && <CountrySectorDetail row={row} />}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ImplementationCoverageProps {
  btrData: BtrData;
  /**
   * Policy targets (NDC, NBSAP, NAP, Sectoral). Used for the banner total count
   * and for cross-document policy-target-vs-reported-action coverage in both
   * the mitigation (IPCC sector) and adaptation (APNDC goal) tables.
   */
  targets: Target[];
  sectors: IpccSector[];
  globeCategories?: GlobeCategory[];
  /** GGA climate-resilience themes (decision 2/CMA.5); enables a "By climate
   *  resilience" grouping mode, single-level like the GLOBE biodiversity view. */
  ggaCategories?: GgaCategory[];
  hrCategories?: HrCategory[];
  /**
   * Existing classifications from the pipeline. Filtered by `taxonomyType` —
   * `sector` for the mitigation table, `adaptation_goal` for the adaptation
   * table, `globe` for the biodiversity view. The view never re-classifies;
   * it leverages the existing tagging.
   */
  classifications: ThematicClassification[];
  highlightSector?: string | null;
  countryConfig?: CountryConfig | null;
}

export function ImplementationCoverage({
  btrData,
  targets,
  sectors,
  globeCategories,
  ggaCategories,
  hrCategories,
  classifications,
  highlightSector,
  countryConfig,
}: ImplementationCoverageProps) {
  const t = useTranslations("viz.implementationCoverage");
  const hasCountrySectors =
    countryConfig?.mitigationTaxonomy === "country_sectors" &&
    countryConfig.countrySectors != null &&
    countryConfig.countrySectors.length > 0;

  const [groupMode, setGroupMode] = useState<CoverageGroupMode>(
    hasCountrySectors ? "country_sectors" : "default",
  );
  const [expandedSector, setExpandedSector] = useState<string | null>(null);
  const [expandedGoal, setExpandedGoal] = useState<number | null>(null);
  const [expandedBioCategory, setExpandedBioCategory] = useState<string | null>(null);
  const [expandedCountrySector, setExpandedCountrySector] = useState<string | null>(null);

  const mitigationRows = useMemo(
    () => buildMitigationRows(btrData, sectors, targets, classifications),
    [btrData, sectors, targets, classifications],
  );

  const adaptationRows = useMemo(
    () => buildAdaptationRows(btrData, targets, classifications),
    [btrData, targets, classifications],
  );

  const biodiversityData = useMemo(
    () =>
      globeCategories && globeCategories.length > 0
        ? buildBiodiversityRows(btrData, globeCategories, targets, classifications)
        : { rows: [], unclassified: [] },
    [btrData, globeCategories, targets, classifications],
  );

  // GGA climate-resilience grouping. Single-level taxonomy (no subcategories),
  // so the GLOBE category-coverage builder is reused with taxonomyType "gga".
  const ggaData = useMemo(
    () =>
      ggaCategories && ggaCategories.length > 0
        ? buildBiodiversityRows(btrData, ggaCategories, targets, classifications, "gga")
        : { rows: [], unclassified: [] },
    [btrData, ggaCategories, targets, classifications],
  );

  // Human rights grouping. Single-level taxonomy, so the same category-coverage
  // builder is reused with taxonomyType "hr".
  const hrData = useMemo(
    () =>
      hrCategories && hrCategories.length > 0
        ? buildBiodiversityRows(btrData, hrCategories, targets, classifications, "hr")
        : { rows: [], unclassified: [] },
    [btrData, hrCategories, targets, classifications],
  );

  const countrySectorRows = useMemo(
    () =>
      hasCountrySectors
        ? buildCountrySectorRows(btrData, countryConfig!.countrySectors!)
        : [],
    [btrData, hasCountrySectors, countryConfig],
  );

  // Counts feeding the gaps callout. `policyTargetCount` was previously also
  // used by an inline CoverageBanner in this section; that banner is now
  // surfaced in the top-of-dashboard Data Sources panel, so we no longer
  // recompute it here.
  const mitigationCount = useMemo(
    () =>
      btrData.mitigationMeasures.filter(
        (m) => m.status?.trim() && m.actionType !== "adaptation",
      ).length,
    [btrData],
  );
  const adaptationCount = useMemo(
    () =>
      btrData.mitigationMeasures.filter(
        (m) => m.status?.trim() && m.actionType === "adaptation",
      ).length,
    [btrData],
  );
  const implementedCount = useMemo(
    () =>
      btrData.mitigationMeasures.filter(
        (m) =>
          m.status?.trim() &&
          m.status.toLowerCase().includes("implemented"),
      ).length,
    [btrData],
  );

  // Reporting gaps — derived from the BTR action records themselves, not from
  // policy-target classifications. The `m.sector` field on each measure is
  // hand-curated for Mongolia mitigation (initial commit values, preserved by
  // run_analysis.py instead of LLM-overwritten on every pipeline run) and
  // parser-extracted from the BTR document for Panama. The numbers below are
  // therefore stable across pipeline executions, even though they are not
  // strict raw-document groundtruth in every case.
  const gaps = useMemo(() => {
    const out: string[] = [];

    // Cross-cutting sector coverage (groundtruth from btrData.mitigationMeasures)
    if (hasCountrySectors && countryConfig?.countrySectors) {
      // Country-specific sector taxonomy
      const csWithMit = new Set(
        btrData.mitigationMeasures
          .filter((m) => m.status?.trim() && m.actionType !== "adaptation")
          .map((m) => m.sectorRaw),
      );
      const csList = countryConfig.countrySectors;
      const csCovered = csList.filter((s) => csWithMit.has(s.id)).length;
      if (csList.length > 0 && csCovered < csList.length) {
        const uncovered = csList.filter((s) => !csWithMit.has(s.id)).map((s) => s.name);
        out.push(
          t("gaps.nationalSectorCoverage", {
            covered: csCovered,
            total: csList.length,
            names: uncovered.join(", "),
            count: uncovered.length,
          }),
        );
      }
    } else {
      // IPCC sector taxonomy
      const sectorsWithMit = new Set(
        btrData.mitigationMeasures
          .filter((m) => m.status?.trim() && m.actionType !== "adaptation")
          .map((m) => m.sector),
      );
      const coveredCount = sectorsWithMit.size;
      const totalSectors = sectors.length;
      if (totalSectors > 0 && coveredCount < totalSectors) {
        const uncoveredNames = sectors
          .filter((s) => !sectorsWithMit.has(s.id))
          .map((s) => s.name);
        out.push(
          t("gaps.ipccSectorCoverage", {
            covered: coveredCount,
            total: totalSectors,
            names: uncoveredNames.join(", "),
            count: uncoveredNames.length,
          }),
        );
      }
    }

    // Aggregate implementation status
    const totalActions = mitigationCount + adaptationCount;
    if (totalActions > 0) {
      out.push(
        t("gaps.implementationStatus", {
          implemented: implementedCount,
          total: totalActions,
          other: totalActions - implementedCount,
        }),
      );
    }

    // Adaptation narrative status
    if (adaptationCount > 0) {
      const ongoingAdp = btrData.mitigationMeasures.filter(
        (m) =>
          m.actionType === "adaptation" &&
          m.status?.toLowerCase().includes("ongoing"),
      ).length;
      if (ongoingAdp > 0) {
        out.push(
          t("gaps.adaptationNarrative", {
            ongoing: ongoingAdp,
            total: adaptationCount,
          }),
        );
      }
    }

    return out;
  }, [btrData, sectors, mitigationCount, adaptationCount, implementedCount, hasCountrySectors, countryConfig, t]);

  const toggleSector = useCallback((id: string) => {
    setExpandedSector((prev) => (prev === id ? null : id));
  }, []);
  const toggleGoal = useCallback((n: number) => {
    setExpandedGoal((prev) => (prev === n ? null : n));
  }, []);
  const toggleBioCategory = useCallback((id: string) => {
    setExpandedBioCategory((prev) => (prev === id ? null : id));
  }, []);
  const toggleCountrySector = useCallback((id: string) => {
    setExpandedCountrySector((prev) => (prev === id ? null : id));
  }, []);

  const hasBiodiversityData =
    globeCategories != null && globeCategories.length > 0;
  const hasGgaData = ggaCategories != null && ggaCategories.length > 0;
  const hasHrData = hrCategories != null && hrCategories.length > 0;

  return (
    <div>
      {(hasBiodiversityData || hasCountrySectors || hasGgaData || hasHrData) && (
        <div className="flex items-center gap-2 mb-4">
          <select
            value={groupMode}
            onChange={(e) => setGroupMode(e.target.value as CoverageGroupMode)}
            className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-[var(--undp-black)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]/30"
          >
            {hasCountrySectors ? (
              <>
                <option value="country_sectors">
                  {t("groupMode.byNationalSector")}
                </option>
                <option value="default">
                  {t("groupMode.byIpccSector")}
                </option>
              </>
            ) : (
              <option value="default">
                {t("groupMode.default")}
              </option>
            )}
            {hasBiodiversityData && (
              <option value="biodiversity">{t("groupMode.byBiodiversity")}</option>
            )}
            {hasGgaData && (
              <option value="gga">{t("groupMode.byGga")}</option>
            )}
            {hasHrData && (
              <option value="hr">{t("groupMode.byHr")}</option>
            )}
          </select>
        </div>
      )}

      <ReportingGapsCard gaps={gaps} />

      {groupMode === "country_sectors" ? (
        <>
          <MitigationByCountrySector
            rows={countrySectorRows}
            expandedSector={expandedCountrySector}
            onToggle={toggleCountrySector}
          />
          <AdaptationByApndcGoal
            rows={adaptationRows}
            expandedGoal={expandedGoal}
            onToggle={toggleGoal}
            groupingLabel={btrData.adaptationGroupingLabel}
            countryConfig={countryConfig}
          />
        </>
      ) : groupMode === "biodiversity" ? (
        <BiodiversityByGlobe
          rows={biodiversityData.rows}
          unclassified={biodiversityData.unclassified}
          expandedCategory={expandedBioCategory}
          onToggle={toggleBioCategory}
          countryConfig={countryConfig}
        />
      ) : groupMode === "gga" ? (
        <BiodiversityByGlobe
          rows={ggaData.rows}
          unclassified={ggaData.unclassified}
          expandedCategory={expandedBioCategory}
          onToggle={toggleBioCategory}
          countryConfig={countryConfig}
          title={t("gga.title")}
          sectionDesc={t("gga.sectionDesc")}
          infoBox={null}
        />
      ) : groupMode === "hr" ? (
        <BiodiversityByGlobe
          rows={hrData.rows}
          unclassified={hrData.unclassified}
          expandedCategory={expandedBioCategory}
          onToggle={toggleBioCategory}
          countryConfig={countryConfig}
          title={t("hr.title")}
          sectionDesc={t("hr.sectionDesc")}
          infoBox={null}
        />
      ) : (
        <>
          <MitigationByIpccSector
            rows={mitigationRows}
            expandedSector={expandedSector}
            onToggle={toggleSector}
            highlightSector={highlightSector}
            countryConfig={countryConfig}
          />
          <AdaptationByApndcGoal
            rows={adaptationRows}
            expandedGoal={expandedGoal}
            onToggle={toggleGoal}
            groupingLabel={btrData.adaptationGroupingLabel}
            countryConfig={countryConfig}
          />
        </>
      )}
    </div>
  );
}
