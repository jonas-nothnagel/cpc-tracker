import { cache } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { countryNameIn, getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { buildBriefSource } from "@/lib/brief/source";
import { briefStaticParams } from "@/lib/brief/language-gate";
import { defaultSelection } from "@/lib/brief/selection";
import { exploreSetup } from "@/lib/brief/explore/setup";
import { loadBerNames } from "@/lib/brief/ber-names";
import { labelsIn, loadTargetLabels } from "@/lib/brief/target-labels";
import { loadContracts } from "@/lib/brief/contracts/load";
import { contractsSetup } from "@/lib/brief/contracts/setup";
import { geoFor } from "@/lib/brief/contracts/geo-data";
import { spendingSetup } from "@/lib/brief/spending";
import { loadBerAreas } from "@/lib/brief/ber-areas";
import { BriefApp } from "@/components/brief/brief-app";

// Built once, when the site is deployed, for every country in each language
// it offers: a country's pipeline output ships with the site and changes only
// with a deploy (start.sh copies it to the persistent volume on every start).
// The choices a link carries are applied in the browser (lib/brief/link.ts);
// an address in another language or spelling is sent on first (proxy.ts).
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
  // A country whose contract record is baked also shows its public contracts.
  const file = loadContracts(entry.id);
  // Titles in the page's language where the country's documents give none.
  const targetLabels = loadTargetLabels(entry.id);
  const base = buildBriefSource({
    countryId: entry.id,
    countryName: countryNameIn(entry, locale),
    data,
    locale,
    labels: labelsIn(targetLabels, locale),
  });
  // A country whose expenditure review is rebuilt from its own workbook (or,
  // for Country X, states the public spending it is part of) also shows its
  // reviewed spending, with each line's area as AI-suggested or checked.
  const spending =
    spendingSetup(data, base, { areas: loadBerAreas(entry.id), names: loadBerNames(entry.id), locale }) ?? undefined;
  const source = { ...base, contracts: file !== null, spending: spending !== undefined };
  const contracts = file ? { setup: contractsSetup({ file, source }), geo: geoFor(entry.id, locale) } : undefined;
  return { locale, source, data, contracts, spending, targetLabels };
});

export async function generateMetadata(props: Props) {
  const { locale, country } = await props.params;
  const loaded = load(locale, country);
  if (!loaded) return {};
  const t = await getTranslations({ locale: loaded.locale, namespace: "brief" });
  const title = t("metaTitle", { country: loaded.source.countryName });
  return { title, openGraph: { title } };
}

export default async function BriefPage(props: Props) {
  const { locale, country } = await props.params;
  setRequestLocale(locale);
  const loaded = load(locale, country);
  if (!loaded) notFound();
  return (
    <BriefApp
      source={loaded.source}
      initialSelection={defaultSelection(loaded.source)}
      preparedOn={new Date().toISOString()}
      explore={exploreSetup({
        data: loaded.data,
        source: loaded.source,
        locale: loaded.locale,
        berNames: loadBerNames(loaded.source.countryId),
        targetLabels: loaded.targetLabels,
      })}
      contracts={loaded.contracts}
      spending={loaded.spending}
      // Money in US$ on every page but the Mongolian one, which opens in
      // tugrik and may switch to US$ (a shared link keeps that choice, ?cur=usd).
      initialCurrency={loaded.locale === "mn" ? "mnt" : "usd"}
      localCurrency={loaded.locale === "mn"}
    />
  );
}
