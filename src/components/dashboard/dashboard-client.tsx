"use client";

/**
 * DashboardClient — the detailed explorer dashboard.
 *
 * Once the primary view, it now backs the demoted `/prototypes` route after the
 * findings-first CoherenceDashboard took over `/dashboard` and `/{country}`.
 * Reads the same `/api/dashboard` payload as CoherenceDashboard.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/ui/header";
import { InfoBox } from "@/components/ui/info-box";
import { DataProvenance, type ProvenanceSource } from "@/components/ui/data-provenance";
import { chartDocKey, countByCategory, getDocFullLabel, getDocTypeOrder } from "@/lib/utils";
import { formatSourceRef } from "@/lib/source-ref";
import { getCountry, listVisibleCountries } from "@/config/countries";
import { ThemeBarChart } from "@/components/viz/theme-bar-chart";
import { DataSourcesOverview } from "@/components/viz/data-sources-overview";
import { OutcomeStats } from "@/components/viz/outcome-stats";
import { PolicyCoherenceExplorer } from "@/components/viz/policy-coherence-explorer";
import { Nr7Progress } from "@/components/viz/nr7-progress";
import { ImplementationCoverage } from "@/components/viz/implementation-coverage";
import { EmissionsTrend } from "@/components/viz/emissions-trend";
import { VisionAnchorCoverage } from "@/components/viz/vision-anchor-coverage";
import { formatFootprintValue, type FootprintSnapshot } from "@/lib/footprint";
import { FinancingCoherence } from "@/components/viz/financing-coherence";
import type {
  Target,
  PolicyDocumentType,
  ThematicClassification,
  AlignmentResult,
  NbsCategory,
  IpccSector,
  GlobeCategory,
  GlobeSubcategory,
  BtrData,
  BerData,
  Nr7Data,
  CountryConfig,
} from "@/types";
import type { DashboardResponse } from "@/lib/dashboard-data";

interface DashboardData {
  targets: Target[];
  nbsCategories: NbsCategory[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  globeSubcategories: GlobeSubcategory[];
  classifications: ThematicClassification[];
  alignment: AlignmentResult[];
  btrData: BtrData | null;
  nr7Data: Nr7Data | null;
  berData: BerData | null;
  budgetAlignment: AlignmentResult[] | null;
  budgetPseudoTargets: Target[] | null;
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

/** Build the dashboard view-model from the raw payload. Shared by the
 *  server-provided initialData path and the client fetch fallback so both
 *  produce identical state. */
function normalizeDashboardResponse(raw: DashboardResponse): DashboardData {
  return {
    targets: ((raw.targets ?? []) as Record<string, unknown>[]).map(normalizeTarget),
    nbsCategories: (raw.nbsCategories ?? []) as NbsCategory[],
    sectors: ((raw.sectors ?? []) as Record<string, unknown>[]).map(normalizeSector),
    globeCategories: ((raw.globeCategories ?? []) as Record<string, unknown>[]).map(normalizeSector),
    globeSubcategories: (raw.globeSubcategories ?? []) as GlobeSubcategory[],
    classifications: (raw.classifications ?? []) as ThematicClassification[],
    alignment: (raw.alignment ?? []) as AlignmentResult[],
    btrData: (raw.btrData ?? null) as BtrData | null,
    nr7Data: (raw.nr7Data ?? null) as Nr7Data | null,
    berData: (raw.berData ?? null) as BerData | null,
    budgetAlignment: (raw.budgetAlignment ?? null) as AlignmentResult[] | null,
    budgetPseudoTargets:
      (raw.budgetPseudoTargets as Record<string, unknown>[] | null)?.map(normalizeTarget) ?? null,
    footprint: (raw.footprint as FootprintSnapshot | null) ?? null,
    countryConfig: (raw.countryConfig as CountryConfig | null) ?? null,
  };
}

type ClassificationView = "sector" | "globe";

function ClassificationSection({
  targets, policyTargets,
  documentTypes, sectorSorted, globeSorted,
  sectorClassifications, globeClassifications,
  targetsWithSectors, targetsWithGlobe,
  sectorCategoriesUsed, globeCategoriesUsed,
  sectors, globeCategories, countryConfig,
}: {
  targets: Target[];
  policyTargets: Target[];
  documentTypes: PolicyDocumentType[];
  sectorSorted: ReturnType<typeof countByCategory>;
  globeSorted: ReturnType<typeof countByCategory>;
  sectorClassifications: ThematicClassification[];
  globeClassifications: ThematicClassification[];
  targetsWithSectors: number;
  targetsWithGlobe: number;
  sectorCategoriesUsed: number;
  globeCategoriesUsed: number;
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

  const policyCount = policyTargets.length;
  const pct = (n: number) => policyCount > 0 ? Math.round((n / policyCount) * 100) : 0;

  // Third stat card: how many taxonomy categories actually received a policy
  // target (the chart's empty rows make the gap visible — the stat names it).
  // Sub-line shows classification completeness (% of targets that got a
  // primary classification, normally 100% for sector, can be lower for globe).
  const coverageByView: Record<ClassificationView, { primary: string; secondary: string; label: string }> = {
    sector: {
      primary: `${sectorCategoriesUsed} of ${sectors.length}`,
      secondary: `categories with policy targets · ${pct(targetsWithSectors)}% of policy targets classified`,
      label: `Climate Mitigation category coverage`,
    },
    globe: {
      primary: `${globeCategoriesUsed} of ${globeCategories.length}`,
      secondary: `categories with policy targets · ${pct(targetsWithGlobe)}% of policy targets classified`,
      label: `Biodiversity category coverage`,
    },
  };

  const viewSubtitles: Record<ClassificationView, string> = {
    sector: `${targetsWithSectors} of ${policyCount} policy targets (${pct(targetsWithSectors)}%) classified into ${sectorCategoriesUsed} of ${sectors.length} Climate Mitigation categories.`,
    globe: `${targetsWithGlobe} of ${policyCount} policy targets (${pct(targetsWithGlobe)}%) classified into ${globeCategoriesUsed} of ${globeCategories.length} Biodiversity categories.`,
  };

  const provenanceSources: ProvenanceSource[] = Array.from(
    new Set(policyTargets.map((t) => t.sourceDocument)),
  ).map((dt) => ({
    label: getDocFullLabel(countryConfig, dt),
    citation: countryConfig?.docProvenance?.[dt],
  }));

  const taxonomyLabel: Record<ClassificationView, string> = {
    sector: "IPCC Climate Mitigation taxonomy",
    globe: "BIOFIN GLOBE biodiversity expenditure taxonomy",
  };

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-[var(--undp-black)] flex items-center flex-wrap gap-y-1">
          Thematic Classification
          <InfoBox>
            Each policy target is classified against established taxonomies using AI.{" "}
            <strong>Climate Mitigation Taxonomy</strong> maps targets to standard IPCC emissions categories.{" "}
            <strong>Biodiversity Taxonomy</strong> uses BIOFIN&apos;s GLOBE expenditure taxonomy to enable cross-level analysis.{" "}
            Targets may appear in multiple categories if they span several domains.
          </InfoBox>
          <DataProvenance
            origin="mixed"
            sources={provenanceSources}
            method={
              <>
                Each target is scored by an LLM against every category in the
                active taxonomy ({taxonomyLabel[view]}). The chart shows
                primary-category counts; targets above the relevance threshold
                in additional categories are surfaced in click-through views.
              </>
            }
            caveat="Counts depend on which categories the model judged primary. Click a segment and inspect a few targets before treating shares as exhaustive — the model may split similar targets across adjacent categories."
          />
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
        {viewSubtitles[view]} Click a segment to see which targets.
      </p>

      <OutcomeStats
        quantitativeTargets={policyTargets.filter((t) => t.isQuantitative)}
        timeBoundTargets={policyTargets.filter((t) => t.isTimeBound)}
        totalTargets={policyCount}
        coverageStat={coverageByView[view]}
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
  basePath,
  initialData,
  switcherPath,
}: {
  analysisId?: string;
  country?: string;
  /** When set, the dashboard runs in standalone mode: the header hides the
   *  country switcher and scopes all nav links to this path. */
  basePath?: string;
  /** Server-assembled payload (pilot/country flow). When present the component
   *  renders from it immediately and skips the client fetch, avoiding the
   *  ~10 MB post-hydration round trip. */
  initialData?: DashboardResponse;
  /** Path the header country switcher navigates to. Defaults to "/dashboard".
   *  This component now backs the demoted explorer on /prototypes, which passes
   *  "/prototypes" so switching country keeps the user on that route. */
  switcherPath?: string;
}) {
  const [data, setData] = useState<DashboardData | null>(
    initialData ? normalizeDashboardResponse(initialData) : null,
  );
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
    // Pilot/country flow: the server already assembled and inlined the payload
    // (state was seeded from initialData above), so there's nothing to fetch.
    if (initialData) {
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
        setData(normalizeDashboardResponse(raw));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.error ?? String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId, country, initialData]);

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

  // BTR pseudo-targets are reported implementation actions, not commitments.
  // The chart shows them as separate stacks (purple = BTR Mitigation, magenta
  // = BTR Adaptation) so policymakers can see where reported actions cluster
  // relative to targets. The stats and "of targets" copy describe policy
  // targets only.
  const policyTargets = targets.filter((t) => t.sourceDocument !== "BTR");
  const policyTargetIds = new Set(policyTargets.map((t) => t.id));

  // Group all targets (including BTR) by document type for the chart legend.
  const targetsByDoc = new Map<string, Target[]>();
  for (const t of targets) {
    const key = chartDocKey(t);
    const list = targetsByDoc.get(key) || [];
    list.push(t);
    targetsByDoc.set(key, list);
  }

  // Chart-feeding classifications include BTR pseudo-target classifications so
  // BTR stacks render. The pipeline also writes primary records for BER pseudo-
  // targets (consumed by Financing Coherence); filter those out by membership
  // in the dashboard's `targets` list.
  const allDashboardTargetIds = new Set(targets.map((t) => t.id));
  const sectorClassifications = data.classifications.filter(
    (c) =>
      c.taxonomyType === "sector" &&
      c.isPrimary === true &&
      allDashboardTargetIds.has(c.targetId)
  );
  const globeClassifications = data.classifications.filter(
    (c) =>
      c.taxonomyType === "globe" &&
      c.isPrimary === true &&
      allDashboardTargetIds.has(c.targetId)
  );

  const sectorCounts = countByCategory(targets, sectorClassifications, data.sectors, chartDocKey);
  const globeCounts = countByCategory(targets, globeClassifications, data.globeCategories, chartDocKey);

  // Stats describe policy-target coverage — restrict to policy IDs.
  const policySectorClassifications = sectorClassifications.filter((c) =>
    policyTargetIds.has(c.targetId),
  );
  const policyGlobeClassifications = globeClassifications.filter((c) =>
    policyTargetIds.has(c.targetId),
  );
  const targetsWithSectors = new Set(
    policySectorClassifications.map((c) => c.targetId),
  ).size;
  const targetsWithGlobe = new Set(
    policyGlobeClassifications.map((c) => c.targetId),
  ).size;
  // # of categories that received at least one policy-target classification.
  // Surfaces "where do targets actually land?" — empty taxonomy categories
  // (e.g. Energy, Transport for Mongolia) make the gap visible.
  const sectorCategoriesUsed = new Set(
    policySectorClassifications.map((c) => c.categoryId),
  ).size;
  const globeCategoriesUsed = new Set(
    policyGlobeClassifications.map((c) => c.categoryId),
  ).size;

  // Country-declared docs first, then reserved tokens (BTR, BTR_ADP) adjacent
  // in the legend. Without sorting the chart legend would render in insertion
  // order which depends on target ordering and would put BTR_ADP wherever its
  // first adaptation pseudo-target lands.
  const documentTypes = (
    Array.from(targetsByDoc.keys()) as Target["sourceDocument"][]
  ).sort(
    (a, b) => getDocTypeOrder(data.countryConfig, a) - getDocTypeOrder(data.countryConfig, b),
  );
  const sectorSorted = [...sectorCounts].sort((a, b) => b.total - a.total);
  const globeSorted = [...globeCounts].sort((a, b) => b.total - a.total);

  const displayCountry =
    countryDisplayName ?? data?.targets[0]?.country ?? "Dashboard";

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header
        subtitle={displayCountry}
        currentCountryId={country}
        countries={basePath ? undefined : listVisibleCountries().map(c => ({ id: c.id, name: c.name }))}
        basePath={basePath}
        switcherPath={switcherPath}
      />

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
          globeSubcategories={data.globeSubcategories}
          classifications={data.classifications}
          nr7Data={data.nr7Data}
          btrData={data.btrData}
          berData={data.berData}
          focusTargetId={focusTargetId}
          countryConfig={data.countryConfig}
        />
        </div>

        {/* --- Vision Anchor Coverage (countries that declare an anchor doc) --- */}
        {data.countryConfig?.anchorDocType && (
          <VisionAnchorCoverage
            targets={targets}
            alignment={data.alignment}
            countryConfig={data.countryConfig}
            anchorDocType={data.countryConfig.anchorDocType}
            onFocusTarget={setFocusTargetId}
          />
        )}

        {/* --- Thematic Classification (switchable) --- */}
        <ClassificationSection
          targets={targets}
          policyTargets={policyTargets}
          documentTypes={documentTypes}
          sectorSorted={sectorSorted}
          globeSorted={globeSorted}
          sectorClassifications={sectorClassifications}
          globeClassifications={globeClassifications}
          targetsWithSectors={targetsWithSectors}
          targetsWithGlobe={targetsWithGlobe}
          sectorCategoriesUsed={sectorCategoriesUsed}
          globeCategoriesUsed={globeCategoriesUsed}
          sectors={data.sectors}
          globeCategories={data.globeCategories}
          countryConfig={data.countryConfig}
        />

        {/* --- Budget & Financing Coherence — Beta, collapsed by default --- */}
        {data.berData && (
          <section className="mb-10 pt-8 border-t-2 border-[var(--undp-blue)]/20">
            <details className="bg-[var(--undp-light)] border border-gray-100 p-4 rounded-lg">
              <summary className="cursor-pointer flex items-center flex-wrap gap-x-3 gap-y-1">
                <span className="text-lg font-semibold text-[var(--undp-black)]">
                  Budget &amp; Financing Coherence
                </span>
                <span className="bg-[var(--undp-blue)]/10 text-[var(--undp-blue)] px-2 py-0.5 rounded-full text-xs uppercase tracking-wide font-medium">
                  Beta
                </span>
                <span className="text-sm text-[var(--undp-gray)]">
                  Financing layer is still in development; outputs may change.
                </span>
              </summary>

              <div className="mt-6">
                <FinancingCoherence
                  berData={data.berData}
                  targets={targets.filter((t) => !t.id.startsWith("BER_"))}
                  classifications={data.classifications}
                  budgetAlignment={data.budgetAlignment ?? []}
                  globeCategories={data.globeCategories}
                  globeSubcategories={data.globeSubcategories}
                  sectors={data.sectors}
                  countryConfig={data.countryConfig}
                  embedded
                />
              </div>
            </details>
          </section>
        )}

        {/* --- Progress Alignment (unified NR7 + BTR) — Beta, collapsed by default --- */}
        {((data.nr7Data && data.nr7Data.progressItems.length > 0) ||
          (data.btrData && data.btrData.mitigationMeasures.some(m => m.status?.trim()))) && (
          <section className="mb-10 pt-8 border-t-2 border-[var(--undp-blue)]/20">
            <details className="bg-[var(--undp-light)] border border-gray-100 p-4 rounded-lg">
              <summary className="cursor-pointer flex items-center flex-wrap gap-x-3 gap-y-1">
                <span className="text-lg font-semibold text-[var(--undp-black)]">
                  Implementation Progress
                </span>
                <span className="bg-[var(--undp-blue)]/10 text-[var(--undp-blue)] px-2 py-0.5 rounded-full text-xs uppercase tracking-wide font-medium">
                  Beta
                </span>
                <span className="text-sm text-[var(--undp-gray)]">
                  Reporting layer is still in development; outputs may change.
                </span>
              </summary>

              <div className="mt-6">
                <p className="text-sm text-[var(--undp-gray)] leading-relaxed mb-6">
                  Reported actions and progress from official reporting mechanisms.
                  NBSAP progress comes from the 7th National Report to the CBD;
                  NDC implementation from the Biennial Transparency Report. This
                  view shows what was reported, not whether it is sufficient to
                  meet the underlying targets.
                </p>

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
                      <h3 className="text-base font-semibold text-[var(--undp-black)] flex items-center flex-wrap gap-y-1">
                        Reporting &amp; Implementation Coverage
                        <DataProvenance
                          origin="user-uploaded"
                          sources={[
                            {
                              label: getDocFullLabel(data.countryConfig, "BTR"),
                              citation:
                                formatSourceRef(data.countryConfig?.btrMitigationSourceRef)
                                ?? data.countryConfig?.docProvenance?.BTR,
                            },
                            ...(data.btrData.adaptationSourceRef
                              ? [{
                                  label: "BTR adaptation actions",
                                  citation: formatSourceRef(data.btrData.adaptationSourceRef),
                                }]
                              : []),
                          ]}
                          method="Reported actions are read from the BTR's CTF tables as filed by the country. The dashboard groups them by IPCC sector (mitigation) or the country's adaptation framework, and maps each action to taxonomy categories via the LLM classifier for the coverage tables below."
                          caveat="Implementation status, action descriptions, and support-project counts are reproduced from the BTR as filed. The dashboard does not independently verify whether reported actions are sufficient to meet the underlying targets."
                        />
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

                    <div className="bg-white border border-gray-100 p-6 mt-4 rounded-lg">
                      <EmissionsTrend btrData={data.btrData} />
                    </div>
                  </div>
                )}
              </div>
            </details>
          </section>
        )}

        <details className="mb-10 bg-[var(--undp-light)] border border-gray-100 p-4 rounded-lg">
          <summary className="text-sm font-semibold text-[var(--undp-black)] cursor-pointer">
            About this analysis
          </summary>
          {(() => {
            const policyTargets = targets.filter((t) => t.sourceDocument !== "BTR");
            const btrActions = targets.length - policyTargets.length;
            const policySources = new Set(policyTargets.map((t) => t.sourceDocument)).size;
            return (
              <p className="text-sm text-[var(--undp-gray)] leading-relaxed mt-2 mb-2">
                This dashboard displays results from the Nature-Climate Target
                Alignment Assessment pipeline. {policyTargets.length} policy
                target{policyTargets.length !== 1 ? "s" : ""} from {policySources}{" "}
                document source{policySources !== 1 ? "s" : ""} were classified
                against {data.sectors.length} Climate Mitigation and{" "}
                {data.globeCategories.length} Biodiversity categories. Alignment
                and flagged misalignments are assessed pairwise across documents.
                {btrActions > 0 && (
                  <>
                    {" "}
                    {btrActions} BTR-reported action{btrActions !== 1 ? "s" : ""}{" "}
                    are included alongside for implementation tracking.
                  </>
                )}
              </p>
            );
          })()}
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
