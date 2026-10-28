import { cache } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { countryNameIn, getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { buildBriefSource } from "@/lib/brief/source";
import { labelsIn, loadTargetLabels } from "@/lib/brief/target-labels";
import { briefStaticParams } from "@/lib/brief/language-gate";
import { loadContracts } from "@/lib/brief/contracts/load";
import { contractsSetup } from "@/lib/brief/contracts/setup";
import { geoFor } from "@/lib/brief/contracts/geo-data";
import { ContractsPage } from "@/components/brief/contracts/contracts-page";

// Built once, when the site is deployed, like the brief (see its page); a
// country without a baked contract record builds as not found.
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
  const file = loadContracts(entry.id);
  if (!file) return null;
  const result = getCountryDashboardPayload(entry.id, locale, null);
  if (result.kind !== "ok") return null;
  const data = result.payload.data as unknown as Record<string, unknown>;
  // Titles in the page's language where the country's documents give none.
  const labels = labelsIn(loadTargetLabels(entry.id), locale);
  const source = buildBriefSource({ countryId: entry.id, countryName: countryNameIn(entry, locale), data, locale, labels });
  return { locale, setup: contractsSetup({ file, source }) };
});

export async function generateMetadata(props: Props) {
  const { locale, country } = await props.params;
  const loaded = load(locale, country);
  if (!loaded) return {};
  const t = await getTranslations({ locale: loaded.locale, namespace: "brief.contracts" });
  const title = t("metaTitle", { country: loaded.setup.countryName });
  return { title, openGraph: { title } };
}

/** Public contracts beside the targets: a page of its own for countries whose
 *  contract record has been baked (python/scripts/build_contracts_layer.py). */
export default async function ContractsRoute(props: Props) {
  const { locale, country } = await props.params;
  setRequestLocale(locale);
  const loaded = load(locale, country);
  if (!loaded) notFound();
  return (
    <ContractsPage
      setup={loaded.setup}
      geo={geoFor(loaded.setup.countryId, loaded.locale)}
      // Money in US$ on every page but the Mongolian one, which opens in
      // tugrik and may switch to US$ (a shared link keeps that choice, ?cur=usd).
      localCurrency={loaded.locale === "mn"}
    />
  );
}
