import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { buildBriefSource } from "@/lib/brief/source";
import { parseSelection } from "@/lib/brief/selection";
import { parseExploreState, type ExploreGroup } from "@/lib/brief/explore/state";
import { ExploreApp } from "@/components/brief/explore/explore-app";

// Pipeline output lives on the persistent volume and changes at runtime.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string; country: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Lenses the ring can group by. The human rights lens is a draft whose
 *  areas leave most targets unclassified, so it is not offered here. */
const RING_LENSES = new Set(["globe", "ipcc", "gga"]);

async function load(props: Props) {
  const { locale, country } = await props.params;
  const entry = getCountry(country.toLowerCase());
  if (!entry || !entry.visible) return null;
  const result = getCountryDashboardPayload(entry.id, locale, null);
  if (result.kind !== "ok") return null;
  const source = buildBriefSource({
    countryId: entry.id,
    countryName: entry.name,
    data: result.payload.data as unknown as Record<string, unknown>,
    locale,
  });
  return { locale, source };
}

export async function generateMetadata(props: Props) {
  const loaded = await load(props);
  if (!loaded) return {};
  const t = await getTranslations({ locale: loaded.locale, namespace: "brief.explore" });
  return { title: t("metaTitle", { country: loaded.source.countryName }) };
}

export default async function ExplorePreviewPage(props: Props) {
  const loaded = await load(props);
  if (!loaded) notFound();
  const { source } = loaded;
  const searchParams = await props.searchParams;
  const selection = parseSelection(searchParams, source);
  const groups: ExploreGroup[] = ["docs", ...source.lenses.map((l) => l.id).filter((id) => RING_LENSES.has(id))];
  const inScope = new Set(selection.docs);
  const ids = new Set(source.commitments.filter((c) => inScope.has(c.doc)).map((c) => c.id));
  return (
    <ExploreApp
      source={source}
      docs={selection.docs}
      lens={selection.lens}
      groups={groups}
      initialState={parseExploreState(searchParams, ids, groups)}
    />
  );
}
