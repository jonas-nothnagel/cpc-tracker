"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/ui/header";
import { InfoBox } from "@/components/ui/info-box";
import { countByCategory } from "@/lib/utils";
import { NbsBarChart } from "@/components/viz/nbs-bar-chart";
import { ThemeBarChart } from "@/components/viz/theme-bar-chart";
import { DataSourcesOverview } from "@/components/viz/data-sources-overview";
import { OutcomeStats } from "@/components/viz/outcome-stats";
import { PolicyCoherenceExplorer } from "@/components/viz/policy-coherence-explorer";
import { ContradictionSummary } from "@/components/viz/contradiction-summary";
import { Nr7Progress } from "@/components/viz/nr7-progress";
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
    activities: t.activities ? String(t.activities) : undefined,
    actions: t.actions ? String(t.actions) : undefined,
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
          <InfoBox>
            Each policy target is classified against established taxonomies using AI.{" "}
            <strong>Nature-Based Solutions (NBS)</strong> categories identify targets that use natural ecosystems.{" "}
            <strong>IPCC Sectors</strong> map targets to standard emissions categories.{" "}
            Targets may appear in multiple categories if they span several themes.
          </InfoBox>
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
            No analysis data available
          </h2>
          <p className="text-sm text-[var(--undp-gray)] mb-6">
            It looks like no analysis has been run yet. Upload your policy targets to get started.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-[var(--undp-blue)] hover:bg-[var(--undp-blue-dark)] transition-colors"
          >
            Upload Targets
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <header className="border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
            <div className="w-12 h-16 bg-gray-100 rounded animate-pulse" />
            <div>
              <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse mt-1.5" />
            </div>
          </div>
        </header>
        <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
          <div className="h-7 w-72 bg-gray-100 rounded animate-pulse mb-2" />
          <div className="h-4 w-56 bg-gray-100 rounded animate-pulse mb-8" />
          <div className="flex gap-2 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 w-32 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
          <div className="grid md:grid-cols-3 gap-4 mb-10">
            <div className="md:col-span-2 h-64 bg-gray-50 border border-gray-100 rounded-lg animate-pulse" />
            <div className="h-64 bg-gray-50 border border-gray-100 rounded-lg animate-pulse" />
          </div>
          <div className="h-96 bg-gray-50 border border-gray-100 rounded-lg animate-pulse mb-10" />
        </main>
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
      <Header subtitle={data?.targets[0]?.country ?? "Dashboard"} />

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        <section className="mb-10">
          <h1 className="text-2xl font-medium text-[var(--undp-black)] mb-1">
            {data.targets[0]?.country ?? "Country"} Nature-Climate Target Assessment
          </h1>
          <p className="text-sm text-[var(--undp-gray)]">
            AI-assisted assessment for national review and consideration
          </p>
          <div className="bg-[var(--undp-blue)]/5 border border-[var(--undp-blue)]/15 rounded-lg px-4 py-3 mt-3">
            <p className="text-sm text-[var(--undp-black)]">
              This dashboard shows how policy targets across your national documents align with each other.{" "}
              Start by exploring the <strong>data sources</strong> below, then see how targets{" "}
              connect in the <strong>coherence explorer</strong>.
            </p>
          </div>
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

        {/* --- Contradiction Summary --- */}
        <ContradictionSummary
          alignmentData={data.alignment}
          targets={targets}
        />

        {/* --- NR7 Implementation Progress --- */}
        {data.nr7Data && data.nr7Data.progressItems.length > 0 && (
          <Nr7Progress nr7Data={data.nr7Data} />
        )}

        {/* --- Implementation Gap Analysis (BTR data) --- */}
        {data.btrData && data.btrData.mitigationMeasures.length > 0 && (
          <section className="mb-10">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[var(--undp-black)]">
                Policy-to-Implementation Overview
                <InfoBox>
                  This section connects policy targets to implementation measures reported in the Biennial Transparency Report (BTR).{" "}
                  The scorecard shows which sectors have concrete measures in place, emissions trends,{" "}
                  and identifies implementation gaps where targets exist without corresponding action.
                </InfoBox>
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

        <details className="mb-10 bg-[var(--undp-light)] border border-gray-100 p-4 rounded-lg">
          <summary className="text-sm font-semibold text-[var(--undp-black)] cursor-pointer">
            About this analysis
          </summary>
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed mt-2 mb-2">
            This dashboard displays results from the Nature-Climate Target
            Alignment Assessment pipeline. {targets.length} targets
            from {documentTypes.length} document source{documentTypes.length !== 1 ? "s" : ""} were
            classified against {data.nbsCategories.length} NBS categories
            and {data.sectors.length} IPCC sectors. Alignment and
            contradictions are assessed pairwise across documents.
          </p>
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
            <strong>Note:</strong> All results should be validated with national experts.
          </p>
        </details>
      </main>

      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 text-sm text-[var(--undp-gray)]">
          United Nations Development Programme · CPC Tracker
        </div>
      </footer>
    </div>
  );
}
