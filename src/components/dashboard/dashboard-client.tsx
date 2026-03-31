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
import { TensionClusters } from "@/components/viz/tension-clusters";
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
  nbsCategories, sectors, themes,
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
  nbsCategories: NbsCategory[];
  sectors: IpccSector[];
  themes: TaxonomyCategory[];
}) {
  const viewOptions: { value: ClassificationView; label: string }[] = [
    ...(nbsCategories.length > 0
      ? [{ value: "nbs" as const, label: `Nature-Based Solutions (${nbsCategories.length})` }]
      : []),
    ...(sectors.length > 0
      ? [{ value: "sector" as const, label: `IPCC Sectors (${sectors.length})` }]
      : []),
    ...(themes.length > 0
      ? [{ value: "theme" as const, label: `Cross-Cutting Themes (${themes.length})` }]
      : []),
  ];

  const [view, setView] = useState<ClassificationView>(viewOptions[0]?.value ?? "nbs");

  const mappedTargetsByView: Record<ClassificationView, { count: number; label: string }> = {
    nbs: { count: targetsWithNbs, label: `Mapped to NBS (${nbsCategories.length} categories)` },
    sector: { count: targetsWithSectors, label: `Mapped to IPCC sectors (${sectors.length})` },
    theme: { count: targetsWithThemes, label: `Mapped to themes (${themes.length})` },
  };

  const viewSubtitles: Record<ClassificationView, string> = {
    nbs: `${targetsWithNbs} targets (${Math.round((targetsWithNbs / targets.length) * 100)}%) classified across ${nbsCategories.length} NBS categories`,
    sector: `${targetsWithSectors} targets (${Math.round((targetsWithSectors / targets.length) * 100)}%) classified across ${sectors.length} IPCC sectors`,
    theme: `${targetsWithThemes} targets (${Math.round((targetsWithThemes / targets.length) * 100)}%) classified across ${themes.length} cross-cutting themes`,
  };

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-[var(--undp-black)]">
          Thematic Classification
          <InfoBox>
            Each policy target is classified against established taxonomies using AI.{" "}
            <strong>Nature-Based Solutions (NBS)</strong> categories identify targets that use natural ecosystems.{" "}
            <strong>IPCC Sectors</strong> map targets to standard emissions categories.{" "}
            Targets may appear in multiple categories if they span several themes.
          </InfoBox>
        </h2>
        <div className="flex gap-1.5 text-xs">
          {viewOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setView(opt.value)}
              className={`px-3.5 py-1.5 rounded-full transition-colors ${
                view === opt.value
                  ? "bg-[var(--undp-blue)] text-white"
                  : "bg-gray-100 text-[var(--undp-gray)] hover:bg-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-[var(--undp-gray)] mb-4">
        {viewSubtitles[view]}. Click a segment to see which targets.
      </p>

      <OutcomeStats
        quantitativeTargets={targets.filter((t) => t.isQuantitative)}
        timeBoundTargets={targets.filter((t) => t.isTimeBound)}
        totalTargets={targets.length}
        mappedTargets={mappedTargetsByView[view]}
      />

      <div className="mt-4">
        {view === "nbs" && (
          <NbsBarChart
            data={nbsSorted}
            documentTypes={[...documentTypes]}
            targets={targets}
            nbsClassifications={nbsClassifications}
          />
        )}
        {view === "sector" && (
          <ThemeBarChart
            data={sectorSorted}
            documentTypes={[...documentTypes]}
            targets={targets}
            themeClassifications={sectorClassifications}
            taxonomyType="sector"
          />
        )}
        {view === "theme" && (
          <ThemeBarChart
            data={themeSorted}
            documentTypes={[...documentTypes]}
            targets={targets}
            themeClassifications={themeClassifications}
            taxonomyType="theme"
          />
        )}
      </div>
    </section>
  );
}

// ─── NR7 Implementation Progress (collapsible) ──────────────────────────────


export function DashboardClient({ analysisId }: { analysisId?: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusTargetId, setFocusTargetId] = useState<string | null>(null);

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
        </section>

        <DataSourcesOverview
          targets={targets}
          alignmentOpportunities={data.alignment.filter((a) => a.alignment === "high" || a.alignment === "medium").length}
          btrData={data.btrData}
          nr7Data={data.nr7Data}
        />

        {/* --- Policy Coherence Explorer --- */}
        <div className="pt-8 border-t-2 border-[var(--undp-blue)]/20">
        <PolicyCoherenceExplorer
          targets={targets}
          alignment={data.alignment}
          sectors={data.sectors}
          themes={data.themes}
          nbsCategories={data.nbsCategories}
          classifications={data.classifications}
          nr7Data={data.nr7Data}
          focusTargetId={focusTargetId}
        />
        </div>

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
          nbsCategories={data.nbsCategories}
          sectors={data.sectors}
          themes={data.themes}
        />

        {/* --- Structural Tension Analysis --- */}
        <TensionClusters
          alignmentData={data.alignment}
          targets={targets}
          classifications={data.classifications}
          sectors={data.sectors}
          nbsCategories={data.nbsCategories}
          themes={data.themes}
          onFocusTarget={setFocusTargetId}
        />

        {/* --- Financial Alignment (placeholder) --- */}
        <section className="mb-10 pt-8 border-t-2 border-[var(--undp-blue)]/20">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--undp-black)]">
              Budget &amp; Finance Flows
            </h2>
            <p className="text-sm text-[var(--undp-gray)] mt-0.5">
              Financial flows and budget allocations analysis.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 border-dashed rounded-lg px-5 py-6 text-center">
            <p className="text-sm text-[var(--undp-gray)]">
              Under Development
            </p>
          </div>
        </section>

        {/* --- Progress Alignment (unified NR7 + BTR) --- */}
        {((data.nr7Data && data.nr7Data.progressItems.length > 0) ||
          (data.btrData && data.btrData.mitigationMeasures.some(m => m.status?.trim()))) && (
          <section className="mb-10 pt-8 border-t-2 border-[var(--undp-blue)]/20">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-[var(--undp-black)]">
                Implementation Progress
                <InfoBox>
                  Reported progress on national biodiversity and climate commitments from official reporting mechanisms.{" "}
                  NBSAP progress is drawn from the 7th National Report to the CBD; NDC implementation from the Biennial Transparency Report.
                </InfoBox>
              </h2>
              <p className="text-sm text-[var(--undp-gray)] mt-0.5">
                Tracking reported progress across national biodiversity and climate commitments.
              </p>
            </div>

            {data.nr7Data && data.nr7Data.progressItems.length > 0 && (
              <Nr7Progress
                nr7Data={data.nr7Data}
                alignmentData={data.alignment}
                targets={targets}
              />
            )}

            {data.btrData && data.btrData.mitigationMeasures.filter(m => m.status?.trim()).length > 0 && (
              <div className={data.nr7Data && data.nr7Data.progressItems.length > 0 ? "mt-8" : ""}>
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-[var(--undp-black)]">
                    NDC Implementation
                    <InfoBox>
                      This section brings together two data sources: <strong>policy targets</strong> from the NDC{" "}
                      (Nationally Determined Contribution) and <strong>reported actions</strong> from the BTR{" "}
                      (Biennial Transparency Report, where governments report what they are doing to meet their{" "}
                      climate commitments). For each sector, it shows whether targets have corresponding actions{" "}
                      and highlights gaps where targets exist but no actions have been reported.
                      <br /><br />
                      <em>Reported actions are called &ldquo;mitigation measures&rdquo; in official BTR terminology.</em>
                    </InfoBox>
                  </h3>
                  <p className="text-sm text-[var(--undp-gray)] mt-0.5">
                    {data.btrData.mitigationMeasures.filter(m => m.status?.trim()).length} reported actions and{" "}
                    {(data.btrData.supportProjects ?? [...data.btrData.technologySupport, ...data.btrData.capacityBuilding]).length} support
                    projects from the Biennial Transparency Report
                    {(() => { const v = data.btrData.sourceFile?.match(/BTR(\d+)/)?.[0]; return v ? ` (${v})` : ""; })()}
                  </p>
                </div>

                <SectorScorecard
                  btrData={data.btrData}
                  targets={targets}
                  sectors={data.sectors}
                  classifications={data.classifications}
                  alignmentData={data.alignment}
                />

                <div className="bg-[var(--undp-light)] border border-gray-100 p-6 mt-4 rounded-lg">
                  <EmissionsTrend btrData={data.btrData} />
                </div>
              </div>
            )}
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
