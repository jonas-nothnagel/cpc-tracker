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

import { useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Header } from "@/components/ui/header";
import { getCountry, listVisibleCountries } from "@/config/countries";
import { CoherenceBriefing } from "./coherence-briefing";
import { ModelSelector } from "./model-selector";
import { useDashboardData } from "./use-dashboard-data";
import type { DashboardResponse } from "@/lib/dashboard-data";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedModel = searchParams.get("model");
  const { data, error } = useDashboardData({
    analysisId,
    country,
    initialData,
    model: selectedModel,
  });

  const countryDisplayName = country ? getCountry(country)?.name : undefined;

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
        // Comparing needs something to compare: the link appears for any
        // country with more than one per-model run on disk.
        comparisonHref={
          country && data.availableModels.length > 1
            ? `/${country}/model-comparison`
            : undefined
        }
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
