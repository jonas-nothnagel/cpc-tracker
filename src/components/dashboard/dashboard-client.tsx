"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { countByCategory } from "@/lib/utils";
import { NbsBarChart } from "@/components/viz/nbs-bar-chart";
import { ThemeBarChart } from "@/components/viz/theme-bar-chart";
import { DataSourcesOverview } from "@/components/viz/data-sources-overview";
import { OutcomeStats } from "@/components/viz/outcome-stats";
import { PolicyCoherenceExplorer } from "@/components/viz/policy-coherence-explorer";
import { ContradictionSummary } from "@/components/viz/contradiction-summary";
import { SectorScorecard } from "@/components/viz/sector-scorecard";
import { EmissionsTrend } from "@/components/viz/emissions-trend";
import type {
  Target,
  PolicyDocumentType,
  ThematicClassification,
  AlignmentResult,
  NbsCategory,
  IpccSector,
  BtrData,
  Nr7Data,
  Nr7ProgressItem,
} from "@/types";

interface TaxonomyCategory {
  id: string;
  name: string;
  description: string;
}

interface DashboardData {
  targets: Target[];
  nbsCategories: NbsCategory[];
  sectors: IpccSector[];
  themes: TaxonomyCategory[];
  classifications: ThematicClassification[];
  alignment: AlignmentResult[];
  btrData: BtrData | null;
  nr7Data: Nr7Data | null;
}

/** Ensure targets have optional fields */
function normalizeTarget(t: Record<string, unknown>): Target {
  return {
    id: String(t.id),
    text: String(t.text),
    sourceDocument: t.sourceDocument as Target["sourceDocument"],
    sourceLabel: String(t.sourceLabel),
    country: String(t.country),
    isQuantitative: Boolean(t.isQuantitative),
    isTimeBound: Boolean(t.isTimeBound),
    quantitativeDetails: t.quantitativeDetails ? String(t.quantitativeDetails) : undefined,
    timeBoundDetails: t.timeBoundDetails ? String(t.timeBoundDetails) : undefined,
  };
}

function normalizeSector(t: Record<string, unknown>): IpccSector {
  return {
    id: String(t.id),
    name: String(t.name),
    description: String(t.description ?? ""),
  };
}

type ClassificationView = "nbs" | "sector" | "theme";

function ClassificationSection({
  targets, documentTypes, nbsSorted, sectorSorted, themeSorted,
  nbsClassifications, sectorClassifications, themeClassifications,
  targetsWithNbs, targetsWithSectors, targetsWithThemes,
}: {
  targets: Target[];
  documentTypes: PolicyDocumentType[];
  nbsSorted: ReturnType<typeof countByCategory>;
  sectorSorted: ReturnType<typeof countByCategory>;
  themeSorted: ReturnType<typeof countByCategory>;
  nbsClassifications: ThematicClassification[];
  sectorClassifications: ThematicClassification[];
  themeClassifications: ThematicClassification[];
  targetsWithNbs: number;
  targetsWithSectors: number;
  targetsWithThemes: number;
}) {
  const [view, setView] = useState<ClassificationView>("nbs");

  const mappedTargetsByView: Record<ClassificationView, { count: number; label: string }> = {
    nbs: { count: targetsWithNbs, label: "of targets mapped to nature-based solutions" },
    sector: { count: targetsWithSectors, label: "of targets mapped to IPCC sectors" },
    theme: { count: targetsWithThemes, label: "of targets mapped to cross-cutting themes" },
  };

  const viewOptions: { value: ClassificationView; label: string }[] = [
    { value: "nbs", label: "Nature-Based Solutions" },
    { value: "sector", label: "IPCC Sectors" },
    { value: "theme", label: "Cross-Cutting Themes" },
  ];

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-[var(--undp-black)]">
          Thematic Classification
        </h2>
        <div className="flex rounded-md border border-gray-200 text-xs overflow-hidden">
          {viewOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setView(opt.value)}
              className={`px-3 py-1.5 transition-colors ${
                view === opt.value
                  ? "bg-[var(--undp-blue)] text-white"
                  : "bg-white text-[var(--undp-gray)] hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-[var(--undp-light)] border border-gray-100 p-6 rounded-lg">
          {view === "nbs" && (
            <NbsBarChart
              title="Nature-Based Solutions Breakdown"
              subtitle={`${targetsWithNbs} targets (${Math.round((targetsWithNbs / targets.length) * 100)}%) refer to NBS. Click a segment to see which targets.`}
              data={nbsSorted}
              documentTypes={[...documentTypes]}
              targets={targets}
              nbsClassifications={nbsClassifications}
            />
          )}
          {view === "sector" && (
            <ThemeBarChart
              title="IPCC Sector Classification"
              subtitle="Number of targets per IPCC sector. Click a segment to see which targets."
              data={sectorSorted}
              documentTypes={[...documentTypes]}
              targets={targets}
              themeClassifications={sectorClassifications}
              taxonomyType="sector"
            />
          )}
          {view === "theme" && (
            <ThemeBarChart
              title="Cross-Cutting Themes"
              subtitle="Number of targets per cross-cutting theme. Click a segment to see which targets."
              data={themeSorted}
              documentTypes={[...documentTypes]}
              targets={targets}
              themeClassifications={themeClassifications}
              taxonomyType="theme"
            />
          )}
        </div>
        <div className="flex flex-col h-full">
          <OutcomeStats
            quantitativeTargets={targets.filter((t) => t.isQuantitative)}
            timeBoundTargets={targets.filter((t) => t.isTimeBound)}
            totalTargets={targets.length}
            mappedTargets={mappedTargetsByView[view]}
          />
        </div>
      </div>
    </section>
  );
}

// ─── NR7 Implementation Progress (collapsible) ──────────────────────────────

const NR7_COLORS: Record<string, string> = {
  on_track: "#16a34a", limited: "#d97706",
  no_progress: "#dc2626", unknown: "#9ca3af",
};
const NR7_LABELS: Record<string, string> = {
  on_track: "On track", limited: "Limited progress",
  no_progress: "No progress", unknown: "Unknown",
};

function Nr7Section({ nr7Data }: { nr7Data: Nr7Data }) {
  const [collapsed, setCollapsed] = useState(true);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const displayLabel = (item: Nr7ProgressItem) =>
    item.nbsapTargetId ? `NBT ${item.nbsapTargetId.replace("NBT_", "")}` : item.targetId;

  const statusCounts = (["on_track", "limited", "no_progress", "unknown"] as const)
    .map((s) => ({ status: s, count: nr7Data.progressItems.filter((p) => p.progressStatus === s).length }))
    .filter((s) => s.count > 0);

  return (
    <section className="mb-10">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group text-left"
      >
        <div>
          <h2 className="text-lg font-semibold text-[var(--undp-black)]">
            NR7 Implementation Progress
          </h2>
          <p className="text-sm text-[var(--undp-gray)] mt-0.5">
            {nr7Data.progressItems.length} national biodiversity targets — 7th National Report to the CBD
            {nr7Data.reportingPeriod ? ` (${nr7Data.reportingPeriod})` : ""}
          </p>
        </div>
        <span className="text-[var(--undp-gray)] group-hover:text-[var(--undp-black)] transition-colors text-lg">
          {collapsed ? "▸" : "▾"}
        </span>
      </button>

      {/* Summary badges — always visible */}
      <div className="flex flex-wrap gap-3 mb-3 text-sm">
        {statusCounts.map(({ status, count }) => (
          <span key={status} className="flex items-center gap-1.5 bg-white border border-gray-100 rounded-full px-3 py-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: NR7_COLORS[status] }} />
            <span className="font-semibold text-[var(--undp-black)]">{count}</span>
            <span className="text-[var(--undp-gray)]">{NR7_LABELS[status]}</span>
          </span>
        ))}
      </div>

      {/* Expandable target list */}
      {!collapsed && (
        <div className="grid gap-1.5">
          {nr7Data.progressItems.map((item) => {
            const isExpanded = expandedItem === item.targetId;
            const hasDetail = item.progressSummary || item.challenges;
            return (
              <div
                key={item.targetId}
                className={`rounded-lg border transition-colors ${isExpanded ? "border-gray-200 bg-white shadow-sm" : "border-gray-100 bg-[var(--undp-light)]"}`}
              >
                <button
                  type="button"
                  onClick={() => hasDetail && setExpandedItem(isExpanded ? null : item.targetId)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: NR7_COLORS[item.progressStatus] ?? "#9ca3af" }}
                  />
                  <span className="text-xs font-semibold text-[var(--undp-black)] w-12 shrink-0">
                    {displayLabel(item)}
                  </span>
                  <span className="text-xs text-[var(--undp-gray)] flex-1 truncate">
                    {item.targetText}
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0" style={{
                    backgroundColor: `${NR7_COLORS[item.progressStatus]}15`,
                    color: NR7_COLORS[item.progressStatus],
                  }}>
                    {NR7_LABELS[item.progressStatus] ?? "Unknown"}
                  </span>
                  {hasDetail && (
                    <span className="text-[10px] text-[var(--undp-gray)] shrink-0">{isExpanded ? "▾" : "▸"}</span>
                  )}
                </button>
                {isExpanded && hasDetail && (
                  <div className="px-4 pb-3 pt-0 border-t border-gray-50 ml-[42px] text-xs text-[var(--undp-gray)] space-y-2">
                    {item.progressSummary && (
                      <div>
                        <span className="font-medium text-[var(--undp-black)]">Progress: </span>
                        {item.progressSummary}
                      </div>
                    )}
                    {item.challenges && (
                      <div>
                        <span className="font-medium text-[var(--undp-black)]">Challenges: </span>
                        {item.challenges}
                      </div>
                    )}
                    {item.examples && (
                      <div>
                        <span className="font-medium text-[var(--undp-black)]">Examples: </span>
                        {item.examples}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function DashboardClient({ analysisId }: { analysisId?: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = analysisId
      ? `/api/dashboard?analysisId=${encodeURIComponent(analysisId)}`
      : "/api/dashboard";
    fetch(url)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e));
        return r.json();
      })
      .then((raw) => {
        setData({
          targets: (raw.targets ?? []).map(normalizeTarget),
          nbsCategories: raw.nbsCategories ?? [],
          sectors: (raw.sectors ?? []).map(normalizeSector),
          themes: (raw.themes ?? []).map(normalizeSector),
          classifications: raw.classifications ?? [],
          alignment: raw.alignment ?? [],
          btrData: raw.btrData ?? null,
          nr7Data: raw.nr7Data ?? null,
        });
      })
      .catch((e) => setError(e?.error ?? String(e)));
  }, [analysisId]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-white p-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-lg font-medium text-red-600 mb-2">
            Could not load dashboard data
          </h2>
          <p className="text-sm text-[var(--undp-gray)] mb-4">{error}</p>
          <p className="text-sm text-[var(--undp-gray)]">
            Run the pipeline first:{" "}
            <code className="bg-gray-100 px-2 py-1 rounded">
              cd python && uv run python -m src.run_analysis
            </code>
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-[var(--undp-gray)]">Loading dashboard…</p>
      </div>
    );
  }

  const targets = data.targets;

  // Group targets by document type (dynamic)
  const targetsByDoc = new Map<string, Target[]>();
  for (const t of targets) {
    const list = targetsByDoc.get(t.sourceDocument) || [];
    list.push(t);
    targetsByDoc.set(t.sourceDocument, list);
  }

  const nbsClassifications = data.classifications.filter(
    (c) => c.taxonomyType === "nbs"
  );
  const sectorClassifications = data.classifications.filter(
    (c) => c.taxonomyType === "sector"
  );
  const themeClassifications = data.classifications.filter(
    (c) => c.taxonomyType === "theme"
  );

  const nbsCounts = countByCategory(targets, nbsClassifications, data.nbsCategories);
  const sectorCounts = countByCategory(targets, sectorClassifications, data.sectors);
  const themeCounts = countByCategory(targets, themeClassifications, data.themes);

  const targetsWithNbs = new Set(
    nbsClassifications.filter((c) => c.isRelevant).map((c) => c.targetId)
  ).size;
  const targetsWithSectors = new Set(
    sectorClassifications.filter((c) => c.isRelevant).map((c) => c.targetId)
  ).size;
  const targetsWithThemes = new Set(
    themeClassifications.filter((c) => c.isRelevant).map((c) => c.targetId)
  ).size;

  const documentTypes = Array.from(targetsByDoc.keys()) as Target["sourceDocument"][];
  const nbsSorted = [...nbsCounts].sort((a, b) => b.total - a.total);
  const sectorSorted = [...sectorCounts].sort((a, b) => b.total - a.total);
  const themeSorted = [...themeCounts].sort((a, b) => b.total - a.total);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-100 sticky top-0 bg-white z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-4">
              <Image
                src="/undp-logo.png"
                alt="UNDP"
                width={48}
                height={72}
                className="h-12 w-auto"
              />
              <div>
                <p className="text-sm font-medium text-[var(--undp-black)]">
                  Policy Coherence Tracker
                </p>
                <p className="text-xs text-[var(--undp-gray)]">
                  {data?.targets[0]?.country ?? "Dashboard"}
                </p>
              </div>
            </Link>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/upload"
              className="text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors"
            >
              Upload Data
            </Link>
            <Link
              href="/"
              className="text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors"
            >
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        <section className="mb-10">
          <h1 className="text-2xl font-medium text-[var(--undp-black)] mb-1">
            {data.targets[0]?.country ?? "Country"} Nature-Climate Target Assessment
          </h1>
          <p className="text-sm text-[var(--undp-gray)]">
            AI-assisted assessment for national review and consideration
          </p>
        </section>

        <DataSourcesOverview
          targets={targets}
          alignmentOpportunities={data.alignment.filter((a) => a.alignment === "high" || a.alignment === "medium").length}
          btrData={data.btrData}
          nr7Data={data.nr7Data}
        />

        {/* --- Thematic Classification (switchable) --- */}
        <ClassificationSection
          targets={targets}
          documentTypes={documentTypes}
          nbsSorted={nbsSorted}
          sectorSorted={sectorSorted}
          themeSorted={themeSorted}
          nbsClassifications={nbsClassifications}
          sectorClassifications={sectorClassifications}
          themeClassifications={themeClassifications}
          targetsWithNbs={targetsWithNbs}
          targetsWithSectors={targetsWithSectors}
          targetsWithThemes={targetsWithThemes}
        />

        {/* --- Policy Coherence Explorer --- */}
        <PolicyCoherenceExplorer
          targets={targets}
          alignment={data.alignment}
          sectors={data.sectors}
          themes={data.themes}
          nbsCategories={data.nbsCategories}
          classifications={data.classifications}
          nr7Data={data.nr7Data}
        />

        {/* --- NR7 Implementation Progress --- */}
        {data.nr7Data && data.nr7Data.progressItems.length > 0 && (
          <Nr7Section nr7Data={data.nr7Data} />
        )}

        {/* --- Contradiction Summary --- */}
        <ContradictionSummary
          alignmentData={data.alignment}
          targets={targets}
        />

        {/* --- Implementation Gap Analysis (BTR data) --- */}
        {data.btrData && data.btrData.mitigationMeasures.length > 0 && (
          <section className="mb-10">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[var(--undp-black)]">
                Policy-to-Implementation Overview
              </h2>
              <p className="text-sm text-[var(--undp-gray)] mt-1">
                How national policy targets connect to reported implementation measures by sector.{" "}
                {data.btrData.mitigationMeasures.length} mitigation measures and{" "}
                {data.btrData.technologySupport.length + data.btrData.capacityBuilding.length} support
                projects from the Biennial Transparency Report.
              </p>
            </div>

            <SectorScorecard
              btrData={data.btrData}
              targets={targets}
              sectors={data.sectors}
              classifications={data.classifications}
            />

            <div className="bg-[var(--undp-light)] border border-gray-100 p-6 mt-4 rounded-lg">
              <EmissionsTrend btrData={data.btrData} />
            </div>
          </section>
        )}

        <section className="mb-10 bg-[var(--undp-light)] border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-2">
            About this analysis
          </h3>
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed mb-3">
            This dashboard displays results from the Nature-Climate Target
            Alignment Assessment pipeline. {targets.length} targets
            from {documentTypes.length} document source{documentTypes.length !== 1 ? "s" : ""} were
            classified against {data.nbsCategories.length} NBS categories
            and {data.sectors.length} IPCC sectors. Alignment and
            contradictions are assessed pairwise across documents.
          </p>
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
            <strong>Note:</strong> All results should be validated with national
            experts.
          </p>
        </section>
      </main>

      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 text-sm text-[var(--undp-gray)]">
          United Nations Development Programme · CPC Tracker
        </div>
      </footer>
    </div>
  );
}
