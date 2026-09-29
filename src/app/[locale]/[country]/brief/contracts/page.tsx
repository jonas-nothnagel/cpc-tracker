import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { buildBriefSource } from "@/lib/brief/source";
import { loadContracts } from "@/lib/brief/contracts/load";
import { contractsSetup } from "@/lib/brief/contracts/setup";
import { GEO } from "@/lib/brief/contracts/geo-data";
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
  const source = buildBriefSource({ countryId: entry.id, countryName: entry.name, data, locale });
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
  const loaded = await load(props);
  if (!loaded) notFound();
  const { cur } = await props.searchParams;
  return (
    <ContractsPage
      setup={loaded.setup}
      geo={GEO[loaded.setup.countryId] ?? null}
      initialCurrency={(Array.isArray(cur) ? cur[0] : cur) === "usd" ? "usd" : "mnt"}
    />
  );
}
