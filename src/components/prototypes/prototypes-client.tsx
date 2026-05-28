"use client";

/**
 * Prototypes page — a scratchpad for experimental visualisations that the
 * team is still scoping. Nothing rendered here is considered final.
 *
 * To add a new prototype: drop a new <section> below the existing ones and
 * feed it from the same `data` object. Same API shape as the main dashboard.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/ui/header";
import { getCountry, listVisibleCountries } from "@/config/countries";
import { CoherenceBriefing } from "./coherence-briefing";
import { TargetAtlas } from "@/components/viz/target-atlas";
import { FinancingGaps } from "@/components/viz/financing-gaps";
import { FundingNetwork } from "@/components/viz/funding-network";

/**
 * Phase A of the findings-first prototype takes over the prototypes page.
 * Flip to `true` to restore the original three prototypes (Target Atlas,
 * Financing Gaps, Funding Network); they remain in source so reverting is
 * a one-line change while the briefing direction is still being shaped.
 */
const SHOW_LEGACY_PROTOTYPES = false;
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
  CorpusThemes,
  DocPairSynthesis,
  SectorSynthesis,
} from "@/types";
import type { FootprintSnapshot } from "@/lib/footprint";

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
  corpusThemes: CorpusThemes | null;
  sectorSynthesis: SectorSynthesis[];
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

export function PrototypesClient({
  analysisId,
  country,
}: {
  analysisId?: string;
  country?: string;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const countryDisplayName = country ? getCountry(country)?.name : undefined;

  useEffect(() => {
    if (!analysisId && !country) return;
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
          sectors: (raw.sectors ?? []).map(normalizeCategory),
          globeCategories: (raw.globeCategories ?? []).map(normalizeCategory),
          globeSubcategories: raw.globeSubcategories ?? [],
          classifications: raw.classifications ?? [],
          alignment: raw.alignment ?? [],
          btrData: raw.btrData ?? null,
          nr7Data: raw.nr7Data ?? null,
          berData: raw.berData ?? null,
          budgetAlignment: raw.budgetAlignment ?? null,
          budgetPseudoTargets:
            (raw.budgetPseudoTargets as Record<string, unknown>[] | null)?.map(
              normalizeTarget,
            ) ?? null,
          footprint: (raw.footprint as FootprintSnapshot | null) ?? null,
          docPairSynthesis: (raw.docPairSynthesis as DocPairSynthesis[] | null) ?? [],
          corpusThemes: (raw.corpusThemes as CorpusThemes | null) ?? null,
          sectorSynthesis: (raw.sectorSynthesis as SectorSynthesis[] | null) ?? [],
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
            The prototypes page renders on top of an existing country
            dataset. Upload targets or pick a pre-loaded country to continue.
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
      <div className="min-h-screen flex flex-col bg-white">
        <Header subtitle="Prototypes" />
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
    countryDisplayName ?? data?.targets[0]?.country ?? "Prototypes";

  const briefingTargets = targets.filter(
    (t) => t.sourceDocument !== "BER" && t.sourceDocument !== "BTR",
  );

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: SHOW_LEGACY_PROTOTYPES ? "#ffffff" : "#fbfaf7" }}
    >
      <Header
        subtitle={`${displayCountry} · Prototypes`}
        currentCountryId={country}
        countries={listVisibleCountries().map((c) => ({ id: c.id, name: c.name }))}
        switcherPath="/prototypes"
      />

      {SHOW_LEGACY_PROTOTYPES ? (
        <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
          <section className="mb-6">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div>
                <h1 className="text-2xl font-medium text-[var(--undp-black)] mb-1">
                  Prototype visualisations
                </h1>
                <p className="text-sm text-[var(--undp-gray)] max-w-2xl">
                  Experimental views scoped with the team. Methodology and
                  visual treatment can change without warning. Treat these as
                  drafts for discussion, not final outputs.
                </p>
              </div>
              <Link
                href={`/dashboard?country=${country ?? ""}`}
                className="text-sm text-[var(--undp-blue)] hover:underline whitespace-nowrap"
              >
                ← Back to dashboard
              </Link>
            </div>
          </section>

          {/* ── Prototype 1: Target Atlas ───────────────────────────────── */}
          <TargetAtlas
            policyTargets={briefingTargets}
            allTargets={[...targets, ...(data.budgetPseudoTargets ?? [])]}
            classifications={data.classifications}
            alignments={data.alignment}
            budgetAlignments={data.budgetAlignment}
            nbsCategories={data.nbsCategories}
            sectors={data.sectors}
            globeCategories={data.globeCategories}
            countryConfig={data.countryConfig}
            berData={data.berData}
          />

          {/* ── Prototype 2: Policy vs Spend disparity ──────────────────── */}
          <FinancingGaps
            classifications={data.classifications}
            budgetAlignments={data.budgetAlignment}
            nbsCategories={data.nbsCategories}
            sectors={data.sectors}
            globeCategories={data.globeCategories}
            berData={data.berData}
          />

          {/* ── Prototype 3: Funding Cluster Network ────────────────────── */}
          {data.berData && data.budgetAlignment && data.budgetPseudoTargets && (
            <FundingNetwork
              berData={data.berData}
              budgetAlignment={data.budgetAlignment}
              budgetPseudoTargets={data.budgetPseudoTargets}
              targets={briefingTargets}
              targetAlignment={data.alignment}
              countryConfig={data.countryConfig}
            />
          )}
        </main>
      ) : (
        <CoherenceBriefing
          countryName={displayCountry}
          countryId={country}
          targets={briefingTargets}
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
      )}

      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4 text-xs text-[var(--undp-gray)]">
          Prototypes page. CPC Tracker scratchpad.
        </div>
      </footer>
    </div>
  );
}
