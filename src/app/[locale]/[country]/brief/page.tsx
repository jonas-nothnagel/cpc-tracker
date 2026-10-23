import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { countryNameIn, getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { buildBriefSource } from "@/lib/brief/source";
import { briefInEnglish } from "@/lib/brief/language-gate";
import { parseSelection } from "@/lib/brief/selection";
import { exploreSetup } from "@/lib/brief/explore/setup";
import { loadBerNames } from "@/lib/brief/ber-names";
import { labelsIn, loadTargetLabels } from "@/lib/brief/target-labels";
import { loadContracts } from "@/lib/brief/contracts/load";
import { contractsSetup } from "@/lib/brief/contracts/setup";
import { geoFor } from "@/lib/brief/contracts/geo-data";
import { spendingSetup } from "@/lib/brief/spending";
import { loadBerAreas } from "@/lib/brief/ber-areas";
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
}

export async function generateMetadata(props: Props) {
  const loaded = await load(props);
  if (!loaded) return {};
  const t = await getTranslations({ locale: loaded.locale, namespace: "brief" });
  const title = t("metaTitle", { country: loaded.source.countryName });
  return { title, openGraph: { title } };
}

export default async function BriefPage(props: Props) {
  // A brief is in English and its country's own language only.
  const { locale, country } = await props.params;
  const entry = getCountry(country.toLowerCase());
  const english = entry && briefInEnglish(entry, locale, "brief", await props.searchParams);
  if (english) redirect(english);
  const loaded = await load(props);
  if (!loaded) notFound();
  const searchParams = await props.searchParams;
  const selection = parseSelection(searchParams, loaded.source);
  const cur = Array.isArray(searchParams.cur) ? searchParams.cur[0] : searchParams.cur;
  return (
    <BriefApp
      source={loaded.source}
      initialSelection={selection}
      preparedOn={new Date().toISOString()}
      explore={exploreSetup({
        data: loaded.data,
        source: loaded.source,
        docs: selection.docs,
        searchParams,
        locale: loaded.locale,
        berNames: loadBerNames(loaded.source.countryId),
        targetLabels: loaded.targetLabels,
      })}
      contracts={loaded.contracts}
      spending={loaded.spending}
      initialCurrency={cur === "usd" ? "usd" : "mnt"}
    />
  );
}
