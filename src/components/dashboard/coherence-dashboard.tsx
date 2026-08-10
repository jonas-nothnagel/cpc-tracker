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
import { useSearchParams, usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Header } from "@/components/ui/header";
import { getCountry, listVisibleCountries } from "@/config/countries";
import { CoherenceBriefing } from "./coherence-briefing";
import { ModelSelector } from "./model-selector";
import type {
  Target,
  PolicyDocumentType,
  ThematicClassification,
  AlignmentResult,
  NbsCategory,
  IpccSector,
  GlobeCategory,
  GgaCategory,
  HrCategory,
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
  ggaCategories: GgaCategory[];
  hrCategories: HrCategory[];
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
  /** Model slug whose outputs assembled this payload (null when the country
   *  has no per-model layout). */
  model: string | null;
  /** All model slugs that have been run for this country. Empty when the
   *  country still uses the flat layout. Drives the model selector. */
  availableModels: string[];
}

function normalizeTarget(t: Record<string, unknown>, locale?: string): Target {
  // Pseudo-target extras (`measureStatus` on BTR rows, `expenditure` on
  // BER rows) are not declared on the Target type, but the Atlas
  // signals layer reads them via a narrow cast to compute
  // quality-weighted backing. Passing them through here keeps the
  // data intact between the API and that consumer; anything that sees
  // them through the plain `Target` contract simply ignores them.
  const extras: Record<string, unknown> = {};
  if (t.measureStatus !== undefined) extras.measureStatus = t.measureStatus;
  if (t.expenditure !== undefined) extras.expenditure = t.expenditure;

  let text = String(t.text);
  let sourceLabel = String(t.sourceLabel);
  let textOriginal = t.textOriginal ? String(t.textOriginal) : undefined;
  let sourceLabelOriginal = t.sourceLabelOriginal
    ? String(t.sourceLabelOriginal)
    : undefined;
  const language = t.language ? String(t.language) : undefined;
  // Locale swap for MACHINE back-translations only (the Mongolian targets):
  // there is no genuine source-language text to compare against, so the
  // machine text simply replaces the English under the global
  // machine-translation caveat on the language switcher, and the chip's
  // "original" would be redundant.
  //
  // Genuinely sourced originals (Panama's Spanish) are swapped SERVER-SIDE by
  // `src/lib/locale-text` instead, which keeps the English analysis text in
  // `textTranslation` so the language chip can still show both sides. Doing it
  // here as well would swap twice and, because this function whitelists the
  // fields it returns, would drop the English on the floor.
  if (
    locale &&
    language === locale &&
    textOriginal &&
    t.textOriginalSource === "machine"
  ) {
    text = textOriginal;
    if (sourceLabelOriginal) sourceLabel = sourceLabelOriginal;
    textOriginal = undefined;
    sourceLabelOriginal = undefined;
  }
  return {
    id: String(t.id),
    text,
    sourceDocument: t.sourceDocument as PolicyDocumentType,
    sourceLabel,
    country: String(t.country),
    isQuantitative: Boolean(t.isQuantitative),
    isTimeBound: Boolean(t.isTimeBound),
    quantitativeDetails: t.quantitativeDetails ? String(t.quantitativeDetails) : undefined,
    timeBoundDetails: t.timeBoundDetails ? String(t.timeBoundDetails) : undefined,
    activities: t.activities ? String(t.activities) : undefined,
    actions: t.actions ? String(t.actions) : undefined,
    textOriginal,
    sourceLabelOriginal,
    textOriginalSource:
      t.textOriginalSource === "machine" || t.textOriginalSource === "source"
        ? t.textOriginalSource
        : undefined,
    // Written server-side by src/lib/locale-text when the text was swapped onto
    // its source language: the English the analysis ran on, kept reachable
    // behind the language chip. This whitelist is why they must be listed —
    // anything not named here never reaches the UI.
    textTranslation: t.textTranslation ? String(t.textTranslation) : undefined,
    sourceLabelTranslation: t.sourceLabelTranslation
      ? String(t.sourceLabelTranslation)
      : undefined,
    textLocale: t.textLocale ? String(t.textLocale) : undefined,
    // Which elements the target's text states (src/.../target-quality).
    definition: (t.definition as Target["definition"]) ?? undefined,
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
function normalize(raw: DashboardResponse, locale?: string): DashboardData {
  const r = raw as unknown as Record<string, unknown>;
  return {
    targets: ((r.targets as Record<string, unknown>[]) ?? []).map((t) =>
      normalizeTarget(t, locale),
    ),
    nbsCategories: (r.nbsCategories as NbsCategory[]) ?? [],
    sectors: ((r.sectors as Record<string, unknown>[]) ?? []).map(normalizeCategory),
    globeCategories: ((r.globeCategories as Record<string, unknown>[]) ?? []).map(normalizeCategory),
    ggaCategories: ((r.ggaCategories as Record<string, unknown>[]) ?? []).map(normalizeCategory),
    hrCategories: ((r.hrCategories as Record<string, unknown>[]) ?? []).map(normalizeCategory),
    globeSubcategories: (r.globeSubcategories as GlobeSubcategory[]) ?? [],
    classifications: (r.classifications as ThematicClassification[]) ?? [],
    alignment: (r.alignment as AlignmentResult[]) ?? [],
    btrData: (r.btrData as BtrData | null) ?? null,
    nr7Data: (r.nr7Data as Nr7Data | null) ?? null,
    berData: (r.berData as BerData | null) ?? null,
    budgetAlignment: (r.budgetAlignment as AlignmentResult[] | null) ?? null,
    budgetPseudoTargets:
      (r.budgetPseudoTargets as Record<string, unknown>[] | null)?.map((t) =>
        normalizeTarget(t, locale),
      ) ?? null,
    footprint: (r.footprint as FootprintSnapshot | null) ?? null,
    docPairSynthesis: (r.docPairSynthesis as DocPairSynthesis[] | null) ?? [],
    corpusThemes: (r.corpusThemes as CorpusThemesPayload | null) ?? null,
    sectorSynthesis:
      (r.sectorSynthesis as SectorSynthesisPayload | SectorSynthesis[] | null) ??
      [],
    countryConfig: (r.countryConfig as CountryConfig | null) ?? null,
    model: (r.model as string | null) ?? null,
    availableModels: (r.availableModels as string[] | undefined) ?? [],
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
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedModel = searchParams.get("model");
  const [data, setData] = useState<DashboardData | null>(
    initialData ? normalize(initialData, locale) : null,
  );
  const [error, setError] = useState<string | null>(null);

  const countryDisplayName = country ? getCountry(country)?.name : undefined;

  useEffect(() => {
    if (!analysisId && !country) return;
    // initialData seeds the FIRST render only; once the user toggles a
    // different model via the selector, we always refetch so the displayed
    // payload matches the URL.
    if (initialData && !selectedModel) return;

    const localeQuery = locale && locale !== "en" ? `&locale=${encodeURIComponent(locale)}` : "";
    const modelQuery = selectedModel ? `&model=${encodeURIComponent(selectedModel)}` : "";
    const url = analysisId
      ? `/api/dashboard?analysisId=${encodeURIComponent(analysisId)}${localeQuery}`
      : `/api/dashboard?country=${encodeURIComponent(country!)}${localeQuery}${modelQuery}`;

    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e));
        return r.json();
      })
      .then((raw) => {
        if (cancelled) return;
        // Clear any previous error from a prior model toggle, atomically with
        // the new payload landing — no cascading render in the effect body.
        setError(null);
        setData(normalize(raw as DashboardResponse, locale));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.error ?? String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId, country, initialData, locale, selectedModel]);

  const handleModelChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("model", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-white p-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-lg font-medium text-red-600 mb-2">
            {t("error.heading")}
          </h2>
          <p className="text-sm text-[var(--undp-gray)] mb-6">
            {t("error.body")}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-[var(--undp-blue)] hover:bg-[var(--undp-blue-dark)] transition-colors"
          >
            {t("error.backToHome")}
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#ffffff" }}>
        <Header subtitle={t("loading.subtitle")} basePath={basePath} />
        <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
          <div className="h-8 w-72 bg-gray-100 rounded animate-pulse mb-3" />
          <div className="h-4 w-96 bg-gray-100 rounded animate-pulse mb-10" />
          {/* Skeleton mirrors the briefing layout: a finding + evidence column on
              the left and the circular wheel on the right, so the wait previews
              what is about to load rather than a blank block. */}
          <div className="grid gap-8 lg:grid-cols-[1fr_480px]">
            <div className="space-y-4">
              <div className="h-7 w-full max-w-md bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-full max-w-prose bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-5/6 max-w-prose bg-gray-100 rounded animate-pulse" />
              <div className="mt-6 space-y-3">
                <div className="h-16 bg-gray-50 border border-gray-100 rounded-lg animate-pulse" />
                <div className="h-16 bg-gray-50 border border-gray-100 rounded-lg animate-pulse" />
              </div>
            </div>
            <div className="hidden lg:flex items-start justify-center">
              <div className="w-[420px] h-[420px] rounded-full border border-gray-100 bg-gray-50 animate-pulse" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  const targets = data.targets;
  const displayCountry =
    countryDisplayName ?? data?.targets[0]?.country ?? t("loading.subtitle");

  const briefingTargets = targets.filter(
    (t) => t.sourceDocument !== "BER" && t.sourceDocument !== "BTR",
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#ffffff" }}>
      <Header
        subtitle={displayCountry}
        currentCountryId={country}
        countries={basePath ? undefined : listVisibleCountries().map((c) => ({ id: c.id, name: c.name }))}
        basePath={basePath}
      />

      <ModelSelector
        availableModels={data.availableModels}
        selectedModel={data.model}
        onChange={handleModelChange}
        // The comparison page is a Mongolia-only route for now (the only
        // country with multiple per-model runs on disk).
        comparisonHref={country === "mongolia" ? "/mongolia/model-comparison" : undefined}
      />

      <CoherenceBriefing
        countryName={displayCountry}
        countryId={country}
        targets={briefingTargets}
        explorerTargets={data.targets}
        btrData={data.btrData}
        berData={data.berData}
        budgetAlignment={data.budgetAlignment}
        nr7Data={data.nr7Data}
        globeSubcategories={data.globeSubcategories}
        alignment={data.alignment}
        classifications={data.classifications}
        sectors={data.sectors}
        globeCategories={data.globeCategories}
        ggaCategories={data.ggaCategories}
        hrCategories={data.hrCategories}
        nbsCategories={data.nbsCategories}
        countryConfig={data.countryConfig}
        docPairSyntheses={data.docPairSynthesis}
        corpusThemes={data.corpusThemes}
        sectorSyntheses={data.sectorSynthesis}
      />

      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4 text-xs text-[var(--undp-gray)]">
          {t("footer.text")}
        </div>
      </footer>
    </div>
  );
}
