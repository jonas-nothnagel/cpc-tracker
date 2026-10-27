import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { countryNameIn, getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { buildBriefSource } from "@/lib/brief/source";
import { labelsIn, loadTargetLabels } from "@/lib/brief/target-labels";
import { briefInEnglish } from "@/lib/brief/language-gate";
import { loadContracts } from "@/lib/brief/contracts/load";
import { contractsSetup } from "@/lib/brief/contracts/setup";
import { geoFor } from "@/lib/brief/contracts/geo-data";
import { ContractsPage } from "@/components/brief/contracts/contracts-page";

// Pipeline output lives on the persistent volume and changes at runtime.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string; country: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function load(props: Props) {
  const { locale, country } = await props.params;
  const entry = getCountry(country.toLowerCase());
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
}

export async function generateMetadata(props: Props) {
  const loaded = await load(props);
  if (!loaded) return {};
  const t = await getTranslations({ locale: loaded.locale, namespace: "brief.contracts" });
  const title = t("metaTitle", { country: loaded.setup.countryName });
  return { title, openGraph: { title } };
}

/** Public contracts beside the targets: a page of its own for countries whose
 *  contract record has been baked (python/scripts/build_contracts_layer.py). */
export default async function ContractsRoute(props: Props) {
  // A brief is in English and its country's own language only.
  const { locale, country } = await props.params;
  const entry = getCountry(country.toLowerCase());
  const english = entry && briefInEnglish(entry, locale, "brief/contracts", await props.searchParams);
  if (english) redirect(english);
  const loaded = await load(props);
  if (!loaded) notFound();
  const { cur, contract } = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // Only a contract the page lists opens (a link from the brief names one).
  const opened = loaded.setup.file.contracts.some((c) => c.id === first(contract)) ? first(contract) : undefined;
  return (
    <ContractsPage
      setup={loaded.setup}
      geo={geoFor(loaded.setup.countryId, loaded.locale)}
      // Money in US$ on every page but the Mongolian one, which opens in
      // tugrik and may switch to US$ (a shared link keeps that choice, ?cur=usd).
      initialCurrency={loaded.locale === "mn" ? (first(cur) === "usd" ? "usd" : "mnt") : "usd"}
      localCurrency={loaded.locale === "mn"}
      initialContract={opened}
    />
  );
}
