"use client";

/**
 * CoherenceDashboard — the live findings-first dashboard.
 *
 * Wraps CoherenceBriefing with the page chrome (Header + footer) and the data
 * layer. Serves the primary `/dashboard` route and the standalone `/{country}`
 * routes. Reads the same `/api/dashboard` payload as the demoted explorer
 * dashboard (DashboardClient, now on `/prototypes`); when the server inlines
 * the payload via `initialData` we seed state from it and skip the client
 * fetch, avoiding the ~10 MB post-hydration round trip.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/ui/header";
import { getCountry, listVisibleCountries } from "@/config/countries";
import { CoherenceBriefing } from "./coherence-briefing";
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
  DocPairSynthesis,
  SectorSynthesis,
} from "@/types";
import type {
  CorpusThemesPayload,
  SectorSynthesisPayload,
} from "@/lib/coherence-briefing";
import type { FootprintSnapshot } from "@/lib/footprint";
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
  docPairSynthesis: DocPairSynthesis[];
  // Raw payloads carrying the `states` map for the document toggle; the
  // briefing selects the matching state client-side. corpusThemes may be a
  // legacy CorpusThemes (no states); sectorSynthesis may be a legacy bare array.
  corpusThemes: CorpusThemesPayload | null;
  sectorSynthesis: SectorSynthesisPayload | SectorSynthesis[];
  countryConfig: CountryConfig | null;
}

function normalizeTarget(t: Record<string, unknown>): Target {
  // Pseudo-target extras (`measureStatus` on BTR rows, `expenditure` on
  // BER rows) are not declared on the Target type, but the Atlas
  // signals layer reads them via a narrow cast to compute
  // quality-weighted backing. Passing them through here keeps the
  // data intact between the API and that consumer; anything that sees
  // them through the plain `Target` contract simply ignores them.
  const extras: Record<string, unknown> = {};
  if (t.measureStatus !== undefined) extras.measureStatus = t.measureStatus;
  if (t.expenditure !== undefined) extras.expenditure = t.expenditure;
  return {
    id: String(t.id),
    text: String(t.text),
    sourceDocument: t.sourceDocument as PolicyDocumentType,
    sourceLabel: String(t.sourceLabel),
    country: String(t.country),
    isQuantitative: Boolean(t.isQuantitative),
    isTimeBound: Boolean(t.isTimeBound),
    quantitativeDetails: t.quantitativeDetails ? String(t.quantitativeDetails) : undefined,
    timeBoundDetails: t.timeBoundDetails ? String(t.timeBoundDetails) : undefined,
    activities: t.activities ? String(t.activities) : undefined,
    actions: t.actions ? String(t.actions) : undefined,
    textOriginal: t.textOriginal ? String(t.textOriginal) : undefined,
    sourceLabelOriginal: t.sourceLabelOriginal ? String(t.sourceLabelOriginal) : undefined,
    actionType:
      t.actionType === "mitigation" || t.actionType === "adaptation"
        ? t.actionType
        : undefined,
    ...extras,
  } as Target;
}

function normalizeCategory(t: Record<string, unknown>): IpccSector {
  return {
    id: String(t.id),
    name: String(t.name),
    description: String(t.description ?? ""),
  };
}

/** Build the view-model from the raw payload. Shared by the server-provided
 *  `initialData` path and the client fetch fallback so both produce identical
 *  state. */
function normalize(raw: DashboardResponse): DashboardData {
  const r = raw as unknown as Record<string, unknown>;
  return {
    targets: ((r.targets as Record<string, unknown>[]) ?? []).map(normalizeTarget),
    nbsCategories: (r.nbsCategories as NbsCategory[]) ?? [],
    sectors: ((r.sectors as Record<string, unknown>[]) ?? []).map(normalizeCategory),
    globeCategories: ((r.globeCategories as Record<string, unknown>[]) ?? []).map(normalizeCategory),
    globeSubcategories: (r.globeSubcategories as GlobeSubcategory[]) ?? [],
    classifications: (r.classifications as ThematicClassification[]) ?? [],
    alignment: (r.alignment as AlignmentResult[]) ?? [],
    btrData: (r.btrData as BtrData | null) ?? null,
    nr7Data: (r.nr7Data as Nr7Data | null) ?? null,
    berData: (r.berData as BerData | null) ?? null,
    budgetAlignment: (r.budgetAlignment as AlignmentResult[] | null) ?? null,
    budgetPseudoTargets:
      (r.budgetPseudoTargets as Record<string, unknown>[] | null)?.map(normalizeTarget) ?? null,
    footprint: (r.footprint as FootprintSnapshot | null) ?? null,
    docPairSynthesis: (r.docPairSynthesis as DocPairSynthesis[] | null) ?? [],
    corpusThemes: (r.corpusThemes as CorpusThemesPayload | null) ?? null,
    sectorSynthesis:
      (r.sectorSynthesis as SectorSynthesisPayload | SectorSynthesis[] | null) ??
      [],
    countryConfig: (r.countryConfig as CountryConfig | null) ?? null,
  };
}

export function CoherenceDashboard({
  analysisId,
  country,
  basePath,
  initialData,
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
}) {
  const [data, setData] = useState<DashboardData | null>(
    initialData ? normalize(initialData) : null,
  );
  const [error, setError] = useState<string | null>(null);

  const countryDisplayName = country ? getCountry(country)?.name : undefined;

  useEffect(() => {
    if (!analysisId && !country) return;
    // Pilot/country flow with a server-inlined payload: state was already
    // seeded from initialData, so there's nothing to fetch.
    if (initialData) return;

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
        setData(normalize(raw as DashboardResponse));
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
            It looks like no analysis has been run yet. Upload your policy
            targets or pick a pre-loaded country to get started.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-[var(--undp-blue)] hover:bg-[var(--undp-blue-dark)] transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#fbfaf7" }}>
        <Header subtitle="Dashboard" basePath={basePath} />
        <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
          <div className="h-7 w-72 bg-gray-100 rounded animate-pulse mb-2" />
          <div className="h-4 w-96 bg-gray-100 rounded animate-pulse mb-8" />
          <div className="h-[520px] bg-gray-50 border border-gray-100 rounded-lg animate-pulse" />
        </main>
      </div>
    );
  }

  const targets = data.targets;
  const displayCountry =
    countryDisplayName ?? data?.targets[0]?.country ?? "Dashboard";

  const briefingTargets = targets.filter(
    (t) => t.sourceDocument !== "BER" && t.sourceDocument !== "BTR",
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#fbfaf7" }}>
      <Header
        subtitle={displayCountry}
        currentCountryId={country}
        countries={basePath ? undefined : listVisibleCountries().map((c) => ({ id: c.id, name: c.name }))}
        basePath={basePath}
      />

      <CoherenceBriefing
        countryName={displayCountry}
        countryId={country}
        targets={briefingTargets}
        explorerTargets={data.targets}
        btrData={data.btrData}
        berData={data.berData}
        nr7Data={data.nr7Data}
        globeSubcategories={data.globeSubcategories}
        alignment={data.alignment}
        classifications={data.classifications}
        sectors={data.sectors}
        globeCategories={data.globeCategories}
        nbsCategories={data.nbsCategories}
        countryConfig={data.countryConfig}
        docPairSyntheses={data.docPairSynthesis}
        corpusThemes={data.corpusThemes}
        sectorSyntheses={data.sectorSynthesis}
      />

      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4 text-xs text-[var(--undp-gray)]">
          United Nations Development Programme · CPC Tracker
        </div>
      </footer>
    </div>
  );
}
