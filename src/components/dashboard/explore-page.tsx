"use client";

/**
 * Standalone Explore page: the Header plus the coherence workbench at full
 * viewport height, fed by the same dashboard payload as the country briefing
 * (`useDashboardData`). Gives the explorer its own URL and a header entry
 * instead of living only as the last section of the briefing.
 */

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/ui/header";
import { getCountry } from "@/config/countries";
import { PolicyCoherenceExplorer } from "@/components/viz/policy-coherence-explorer";
import { EXPLORE_SECTION_ID } from "./coherence-briefing/sections/explore";
import { explorerPropsFromDashboardData, useDashboardData } from "./use-dashboard-data";

export function ExplorePage({ country, basePath }: { country: string; basePath: string }) {
  const t = useTranslations("dashboard");
  // No model selector on this page, but the briefing's `?model=` is honoured
  // (the Header carries it onto the Explore link) so the two surfaces never
  // show different model runs for the same country.
  const searchParams = useSearchParams();
  const selectedModel = searchParams.get("model");
  const { data, error } = useDashboardData({ country, model: selectedModel });
  const countryName =
    getCountry(country)?.name ?? data?.targets[0]?.country ?? t("loading.subtitle");

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-white p-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-lg font-medium text-red-600 mb-2">{t("error.heading")}</h2>
          <p className="text-sm text-[var(--undp-gray)] mb-6">{t("error.body")}</p>
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

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      <Header
        subtitle={countryName}
        currentCountryId={country}
        basePath={basePath}
        model={selectedModel}
      />
      {/* pb-10 keeps the fixed footprint chip off the rail's bottom edge.
          data-section-id: the usage analytics attribute clicks to the nearest
          section, so the standalone workbench counts under "explore" like the
          briefing's finale does. */}
      <main className="flex-1 px-4 pb-10 pt-3 sm:px-6" data-section-id={EXPLORE_SECTION_ID}>
        {data ? (
          <PolicyCoherenceExplorer
            key={country}
            {...explorerPropsFromDashboardData(data)}
            variant="workbench"
          />
        ) : (
          <div className="flex min-h-[70vh] items-center justify-center" aria-busy="true">
            <div className="h-[420px] w-[420px] max-w-full rounded-full border border-gray-100 bg-gray-50 animate-pulse" />
          </div>
        )}
      </main>
    </div>
  );
}
