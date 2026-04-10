"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/ui/header";
import { InfoBox } from "@/components/ui/info-box";
import { countByCategory } from "@/lib/utils";
import { getCountry } from "@/config/countries";
import { ThemeBarChart } from "@/components/viz/theme-bar-chart";
import { DataSourcesOverview } from "@/components/viz/data-sources-overview";
import { OutcomeStats } from "@/components/viz/outcome-stats";
import { PolicyCoherenceExplorer } from "@/components/viz/policy-coherence-explorer";
import { TensionClusters } from "@/components/viz/tension-clusters";
import { Nr7Progress } from "@/components/viz/nr7-progress";
import { ImplementationCoverage } from "@/components/viz/implementation-coverage";
import { EmissionsTrend } from "@/components/viz/emissions-trend";
import { formatFootprintValue, type FootprintSnapshot } from "@/lib/footprint";
import type {
  Target,
  PolicyDocumentType,
  ThematicClassification,
  AlignmentResult,
  NbsCategory,
  IpccSector,
  GlobeCategory,
  BtrData,
  Nr7Data,
  CountryConfig,
} from "@/types";

interface DashboardData {
  targets: Target[];
  nbsCategories: NbsCategory[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  classifications: ThematicClassification[];
  alignment: AlignmentResult[];
  btrData: BtrData | null;
  nr7Data: Nr7Data | null;
  footprint: FootprintSnapshot | null;
  countryConfig: CountryConfig | null;
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
    // Translation originals pass through for countries whose source data is not
    // in English (populated in PR2 for Panama). Undefined for Mongolia.
    textOriginal: t.textOriginal ? String(t.textOriginal) : undefined,
    sourceLabelOriginal: t.sourceLabelOriginal ? String(t.sourceLabelOriginal) : undefined,
    // BTR pseudo-targets carry actionType to distinguish reported mitigation
    // measures from adaptation actions; policy targets do not.
    actionType:
      t.actionType === "mitigation" || t.actionType === "adaptation"
        ? t.actionType
        : undefined,
  };
}

function normalizeSector(t: Record<string, unknown>): IpccSector {
  return {
    id: String(t.id),
    name: String(t.name),
    description: String(t.description ?? ""),
  };
}

type ClassificationView = "sector" | "globe";

function ClassificationSection({
  targets, documentTypes, sectorSorted, globeSorted,
  sectorClassifications, globeClassifications,
  targetsWithSectors, targetsWithGlobe,
  sectors, globeCategories, countryConfig,
}: {
  targets: Target[];
  documentTypes: PolicyDocumentType[];
  sectorSorted: ReturnType<typeof countByCategory>;
  globeSorted: ReturnType<typeof countByCategory>;
  sectorClassifications: ThematicClassification[];
  globeClassifications: ThematicClassification[];
  targetsWithSectors: number;
  targetsWithGlobe: number;
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  countryConfig: CountryConfig | null;
}) {
  const viewOptions: { value: ClassificationView; label: string }[] = [
    ...(sectors.length > 0
      ? [{ value: "sector" as const, label: `Climate Mitigation Taxonomy (${sectors.length})` }]
      : []),
    ...(globeCategories.length > 0
      ? [{ value: "globe" as const, label: `Biodiversity Taxonomy (${globeCategories.length})` }]
      : []),
  ];

  const [view, setView] = useState<ClassificationView>(viewOptions[0]?.value ?? "sector");

  const mappedTargetsByView: Record<ClassificationView, { count: number; label: string }> = {
    sector: { count: targetsWithSectors, label: `Mapped to Climate Mitigation categories (${sectors.length})` },
    globe: { count: targetsWithGlobe, label: `Mapped to Biodiversity categories (${globeCategories.length})` },
  };

  const viewSubtitles: Record<ClassificationView, string> = {
    sector: `${targetsWithSectors} targets (${Math.round((targetsWithSectors / targets.length) * 100)}%) classified across ${sectors.length} Climate Mitigation categories`,
    globe: `${targetsWithGlobe} targets (${Math.round((targetsWithGlobe / targets.length) * 100)}%) classified across ${globeCategories.length} Biodiversity categories`,
  };

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-[var(--undp-black)]">
          Thematic Classification
          <InfoBox>
            Each policy target is classified against established taxonomies using AI.{" "}
            <strong>Climate Mitigation Taxonomy</strong> maps targets to standard IPCC emissions categories.{" "}
            <strong>Biodiversity Taxonomy</strong> uses BIOFIN&apos;s GLOBE expenditure taxonomy to enable cross-level analysis.{" "}
            Targets may appear in multiple categories if they span several domains.
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
        countryConfig={countryConfig}
      />

      <div className="mt-4">
        {view === "sector" && (
          <ThemeBarChart
            data={sectorSorted}
            documentTypes={[...documentTypes]}
            targets={targets}
            themeClassifications={sectorClassifications}
            taxonomyType="sector"
            countryConfig={countryConfig}
          />
        )}
        {view === "globe" && (
          <ThemeBarChart
            data={globeSorted}
            documentTypes={[...documentTypes]}
            targets={targets}
            themeClassifications={globeClassifications}
            taxonomyType="globe"
            countryConfig={countryConfig}
          />
        )}
      </div>
    </section>
  );
}

// ─── NR7 Implementation Progress (collapsible) ──────────────────────────────


export function DashboardClient({
  analysisId,
  country,
}: {
  analysisId?: string;
  country?: string;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusTargetId, setFocusTargetId] = useState<string | null>(null);

  // Display name comes from the registry when a country is addressed, so the
  // header doesn't have to wait for target data to render. Falls back to the
  // first target's country field on the upload (analysisId) flow.
  const countryDisplayName = country ? getCountry(country)?.name : undefined;

  useEffect(() => {
    if (!analysisId && !country) {
      // Page handler should have redirected before rendering us; bail.
      return;
    }
    // The page handler passes a `key` prop derived from analysisId/country,
    // so React fully remounts this component on a target change. That means
    // we never have to manually reset error/data here — a country switch
    // gives us a fresh component instance. The cancelled flag still guards
    // against React StrictMode's double-mount in dev.
    const url = analysisId
      ? `/api/dashboard?analysisId=${encodeURIComponent(analysisId)}`
      : `/api/dashboard?country=${encodeURIComponent(country!)}`;

    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e));
        return r.json();
      })
      .then((raw) => {
        if (cancelled) return;
        setData({
          targets: (raw.targets ?? []).map(normalizeTarget),
          nbsCategories: raw.nbsCategories ?? [],
          sectors: (raw.sectors ?? []).map(normalizeSector),
          globeCategories: (raw.globeCategories ?? []).map(normalizeSector),
          classifications: raw.classifications ?? [],
          alignment: raw.alignment ?? [],
          btrData: raw.btrData ?? null,
          nr7Data: raw.nr7Data ?? null,
          footprint: (raw.footprint as FootprintSnapshot | null) ?? null,
          countryConfig: (raw.countryConfig as CountryConfig | null) ?? null,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.error ?? String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId, country]);

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

  const sectorClassifications = data.classifications.filter(
    (c) => c.taxonomyType === "sector"
  );
  const globeClassifications = data.classifications.filter(
    (c) => c.taxonomyType === "globe"
  );

  const sectorCounts = countByCategory(targets, sectorClassifications, data.sectors);
  const globeCounts = countByCategory(targets, globeClassifications, data.globeCategories);

  const targetsWithSectors = new Set(
    sectorClassifications.filter((c) => c.isRelevant).map((c) => c.targetId)
  ).size;
  const targetsWithGlobe = new Set(
    globeClassifications.filter((c) => c.isRelevant).map((c) => c.targetId)
  ).size;

  const documentTypes = Array.from(targetsByDoc.keys()) as Target["sourceDocument"][];
  const sectorSorted = [...sectorCounts].sort((a, b) => b.total - a.total);
  const globeSorted = [...globeCounts].sort((a, b) => b.total - a.total);

  const displayCountry =
    countryDisplayName ?? data?.targets[0]?.country ?? "Dashboard";

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header subtitle={displayCountry} />

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        <section className="mb-10">
          <h1 className="text-2xl font-medium text-[var(--undp-black)] mb-1">
            {countryDisplayName ?? data.targets[0]?.country ?? "Country"} Nature-Climate Target Assessment
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
          countryConfig={data.countryConfig}
        />

        {/* --- Policy Coherence Explorer --- */}
        <div className="pt-8 border-t-2 border-[var(--undp-blue)]/20">
        <PolicyCoherenceExplorer
          targets={targets}
          alignment={data.alignment}
          sectors={data.sectors}
          globeCategories={data.globeCategories}
          classifications={data.classifications}
          nr7Data={data.nr7Data}
          focusTargetId={focusTargetId}
          countryConfig={data.countryConfig}
        />
        </div>

        {/* --- Thematic Classification (switchable) --- */}
        <ClassificationSection
          targets={targets}
          documentTypes={documentTypes}
          sectorSorted={sectorSorted}
          globeSorted={globeSorted}
          sectorClassifications={sectorClassifications}
          globeClassifications={globeClassifications}
          targetsWithSectors={targetsWithSectors}
          targetsWithGlobe={targetsWithGlobe}
          sectors={data.sectors}
          globeCategories={data.globeCategories}
          countryConfig={data.countryConfig}
        />

        {/* --- Structural Tension Analysis --- */}
        <TensionClusters
          alignmentData={data.alignment}
          targets={targets}
          classifications={data.classifications}
          sectors={data.sectors}
          nbsCategories={data.nbsCategories}
          globeCategories={data.globeCategories}
          onFocusTarget={setFocusTargetId}
          countryConfig={data.countryConfig}
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
                    Reporting &amp; Implementation Coverage
                    <InfoBox>
                      This view shows what countries have <strong>reported</strong> in their
                      Biennial Transparency Report (BTR). It doesn&apos;t assess whether the reported
                      actions are sufficient to meet the underlying policy targets — that&apos;s a
                      deeper tracking question that isn&apos;t answered here.
                      <br /><br />
                      <strong>Mitigation</strong> is grouped by <strong>IPCC sector</strong> because
                      CTF Table 5 is sector-keyed and emissions accounting follows those categories.
                      <strong> Adaptation</strong> is grouped by the country&apos;s own adaptation
                      action plan (for Mongolia, the 8 APNDC goals from BTR1 Table III.9), because
                      IPCC sector classifications don&apos;t fit adaptation outcomes like water,
                      disaster, health and social safeguard.
                      <br /><br />
                      <em>
                        Absence of a reported action is not the same as absence of activity on the
                        ground. Government self-reports rarely contradict their own targets, so
                        interpret &ldquo;no contradiction&rdquo; as a neutral signal, not as
                        validation.
                      </em>
                    </InfoBox>
                  </h3>
                  <p className="text-sm text-[var(--undp-gray)] mt-0.5">
                    {data.btrData.mitigationMeasures.filter(m => m.status?.trim()).length} reported actions and{" "}
                    {(data.btrData.supportProjects ?? [...data.btrData.technologySupport, ...data.btrData.capacityBuilding]).length} support
                    projects from the Biennial Transparency Report
                    {(() => { const v = data.btrData.sourceFile?.match(/BTR(\d+)/)?.[0]; return v ? ` (${v})` : ""; })()}
                  </p>
                </div>

                <ImplementationCoverage
                  btrData={data.btrData}
                  targets={targets}
                  sectors={data.sectors}
                  globeCategories={data.globeCategories}
                  classifications={data.classifications}
                  countryConfig={data.countryConfig}
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
            classified against {data.sectors.length} Climate Mitigation
            and {data.globeCategories.length} Biodiversity categories. Alignment and
            contradictions are assessed pairwise across documents.
          </p>
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
            <strong>Note:</strong> All results should be validated with national experts.
          </p>
        </details>
      </main>

      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 text-sm text-[var(--undp-gray)] space-y-4">
          {data.footprint && data.footprint.available && (
            <div className="rounded-md border border-gray-100 bg-gray-50/60 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                <span className="text-xs font-semibold text-[var(--undp-black)] uppercase tracking-wide">
                  Environmental footprint
                </span>
                <span className="text-sm">
                  <strong className="text-[var(--undp-black)]">
                    {formatFootprintValue(data.footprint.energy_wh)}
                  </strong>{" "}
                  Wh energy
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-sm">
                  <strong className="text-[var(--undp-black)]">
                    {formatFootprintValue(data.footprint.water_ml)}
                  </strong>{" "}
                  mL water
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-sm">
                  <strong className="text-[var(--undp-black)]">
                    {formatFootprintValue(data.footprint.co2_geq)}
                  </strong>{" "}
                  gCO<sub>2</sub>eq
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-sm">
                  <strong className="text-[var(--undp-black)]">
                    {formatFootprintValue(data.footprint.minerals_ugsbeq)}
                  </strong>{" "}
                  µgSbeq minerals
                </span>
              </div>
              <p className="text-[11px] text-[var(--undp-gray)] mt-2 leading-snug">
                {data.footprint.source === "estimated"
                  ? `Estimated via EcoLogits from ${data.footprint.cached_call_count.toLocaleString()} LLM calls (this analysis was served from cache, so values are extrapolated from typical per-call impact).`
                  : `Measured via EcoLogits across ${data.footprint.tracked_call_count.toLocaleString()} LLM calls${
                      data.footprint.cached_call_count > 0
                        ? ` (${data.footprint.cached_call_count.toLocaleString()} additional calls served from cache)`
                        : ""
                    }.`}{" "}
                Values are indicative and may differ from actual consumption.
                AI-generated environmental estimate.
              </p>
            </div>
          )}
          <div>United Nations Development Programme · CPC Tracker</div>
        </div>
      </footer>
    </div>
  );
}
