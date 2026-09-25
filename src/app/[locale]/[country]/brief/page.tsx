import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { buildBriefSource } from "@/lib/brief/source";
import { parseSelection } from "@/lib/brief/selection";
import { exploreSetup } from "@/lib/brief/explore/setup";
import { BriefApp } from "@/components/brief/brief-app";

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
  const result = getCountryDashboardPayload(entry.id, locale, null);
  if (result.kind !== "ok") return null;
  const data = result.payload.data as unknown as Record<string, unknown>;
  const source = buildBriefSource({ countryId: entry.id, countryName: entry.name, data, locale });
  return { locale, source, data };
}

export async function generateMetadata(props: Props) {
  const loaded = await load(props);
  if (!loaded) return {};
  const t = await getTranslations({ locale: loaded.locale, namespace: "brief" });
  const title = t("metaTitle", { country: loaded.source.countryName });
  return { title, openGraph: { title } };
}

export default async function BriefPage(props: Props) {
  const loaded = await load(props);
  if (!loaded) notFound();
  const searchParams = await props.searchParams;
  const selection = parseSelection(searchParams, loaded.source);
  return (
    <BriefApp
      source={loaded.source}
      initialSelection={selection}
      preparedOn={new Date().toISOString()}
      explore={exploreSetup({ data: loaded.data, source: loaded.source, docs: selection.docs, searchParams })}
    />
  );
}
