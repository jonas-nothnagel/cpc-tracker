"use client";

/**
 * Data layer for the country / analysis dashboards and the standalone explore
 * page: fetches `/api/dashboard` (or seeds from a server-provided payload) and
 * normalizes it into the typed view-model every surface reads. Extracted from
 * CoherenceDashboard so the explore route can reuse it without the briefing.
 */

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
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

export interface DashboardData {
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
    // `activitySources` is the gate `itemisedActivities()` reads (viz/target-text):
    // without it a target's listed activities collapse into one paragraph and
    // "Activities & Actions (1)". `sources` feeds the document drawer's verbatim
    // quote and the public source links. Both are arrays the API already ships.
    activitySources: Array.isArray(t.activitySources) ? t.activitySources : undefined,
    sources: Array.isArray(t.sources) ? (t.sources as Target["sources"]) : undefined,
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
export function normalize(raw: DashboardResponse, locale?: string): DashboardData {
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

export function useDashboardData({
  analysisId,
  country,
  initialData,
  model,
}: {
  analysisId?: string;
  country?: string;
  /** Server-assembled payload: seeds the first render and skips the fetch. */
  initialData?: DashboardResponse;
  /** Per-model output subdir to request; null for the country's default. */
  model: string | null;
}): { data: DashboardData | null; error: string | null } {
  const locale = useLocale();
  const [data, setData] = useState<DashboardData | null>(
    initialData ? normalize(initialData, locale) : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!analysisId && !country) return;
    // initialData seeds the FIRST render only; once the user toggles a
    // different model via the selector, we always refetch so the displayed
    // payload matches the URL.
    if (initialData && !model) return;

    const localeQuery = locale && locale !== "en" ? `&locale=${encodeURIComponent(locale)}` : "";
    const modelQuery = model ? `&model=${encodeURIComponent(model)}` : "";
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
  }, [analysisId, country, initialData, locale, model]);

  return { data, error };
}

/** The slice of the view-model the Explore workbench takes (the same twelve
 *  fields the briefing hands it). */
export function explorerPropsFromDashboardData(d: DashboardData) {
  return {
    targets: d.targets,
    alignment: d.alignment,
    sectors: d.sectors,
    globeCategories: d.globeCategories,
    globeSubcategories: d.globeSubcategories,
    ggaCategories: d.ggaCategories,
    hrCategories: d.hrCategories,
    classifications: d.classifications,
    nr7Data: d.nr7Data,
    btrData: d.btrData,
    berData: d.berData,
    countryConfig: d.countryConfig,
  };
}
