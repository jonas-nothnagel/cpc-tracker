import { cache } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { countryNameIn, getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { buildBriefSource } from "@/lib/brief/source";
import { briefStaticParams } from "@/lib/brief/language-gate";
import { exploreSetup } from "@/lib/brief/explore/setup";
import { loadBerNames } from "@/lib/brief/ber-names";
import { labelsIn, loadTargetLabels } from "@/lib/brief/target-labels";
import { loadContracts } from "@/lib/brief/contracts/load";
import { ExplorePage } from "@/components/brief/explore/explore-page";

// Built once, when the site is deployed, like the brief (see its page).
export const dynamicParams = false;

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return briefStaticParams(params.locale);
}

interface Props {
  params: Promise<{ locale: string; country: string }>;
}

// The page and its title share one load.
const load = cache((locale: string, country: string) => {
  const entry = getCountry(country);
  if (!entry || !entry.visible) return null;
  const result = getCountryDashboardPayload(entry.id, locale, null);
  if (result.kind !== "ok") return null;
  const data = result.payload.data as unknown as Record<string, unknown>;
  // Titles in the page's language where the country's documents give none.
  const targetLabels = loadTargetLabels(entry.id);
  const source = buildBriefSource({
    countryId: entry.id,
    countryName: countryNameIn(entry, locale),
    data,
    locale,
    labels: labelsIn(targetLabels, locale),
  });
  return { locale, source, data, targetLabels };
});

export async function generateMetadata(props: Props) {
  const { locale, country } = await props.params;
  const loaded = load(locale, country);
  if (!loaded) return {};
  const t = await getTranslations({ locale: loaded.locale, namespace: "brief.explore" });
  const title = t("metaTitle", { country: loaded.source.countryName });
  return { title, openGraph: { title } };
}

/** The brief's explorer on a page of its own, to share on its own; the same
 *  link parameters as in the brief (documents, centre, grouping, layers). */
export default async function ExploreStandalonePage(props: Props) {
  const { locale, country } = await props.params;
  setRequestLocale(locale);
  const loaded = load(locale, country);
  if (!loaded) notFound();
  return (
    <ExplorePage
      source={loaded.source}
      setup={exploreSetup({
        data: loaded.data,
        source: loaded.source,
        locale: loaded.locale,
        berNames: loadBerNames(loaded.source.countryId),
        targetLabels: loaded.targetLabels,
      })}
      // Money as in the brief: US$ on every page but the Mongolian one, which
      // opens in tugrik and keeps a shared link's US$ (?cur=usd). The
      // contracts under a comparison convert at their record's indicative rate.
      localCurrency={loaded.locale === "mn"}
      rate={loadContracts(loaded.source.countryId)?.source.usdRate ?? 0}
    />
  );
}
