import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { analysisBrief, analysisFacts, analysisInEnglish } from "@/lib/brief/analysis";
import { parseSelection } from "@/lib/brief/selection";
import { exploreSetup } from "@/lib/brief/explore/setup";
import { spendingSetup } from "@/lib/brief/spending";
import { BriefApp } from "@/components/brief/brief-app";
import { AnalysisProgress } from "@/components/analysis/analysis-progress";

// The run writes its results to the persistent volume while this page is open.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(props: Props) {
  const { locale, id } = await props.params;
  const brief = analysisBrief(id, locale);
  const country = brief.kind === "ready" ? brief.source.countryName : analysisFacts(id)?.country;
  if (!country) return {};
  const t = await getTranslations({ locale, namespace: "brief" });
  const title = t("metaTitle", { country });
  return { title, openGraph: { title } };
}

/** One address for an upload: its progress while the run goes, its brief once
 *  the run is complete. */
export default async function AnalysisPage(props: Props) {
  const { locale, id } = await props.params;
  const brief = analysisBrief(id, locale);
  if (brief.kind === "missing") notFound();
  if (brief.kind !== "ready") {
    return <AnalysisProgress id={id} facts={analysisFacts(id)} unreadable={brief.kind === "unreadable"} />;
  }

  // A brief is in English and the language the upload was started in.
  const searchParams = await props.searchParams;
  const english = analysisInEnglish(id, brief.source.languages ?? [], locale, searchParams);
  if (english) redirect(english);

  const spending = spendingSetup(brief.data, brief.source) ?? undefined;
  const source = { ...brief.source, spending: spending !== undefined };
  const selection = parseSelection(searchParams, source);
  return (
    <BriefApp
      source={source}
      initialSelection={selection}
      preparedOn={new Date().toISOString()}
      explore={exploreSetup({
        data: brief.data,
        source,
        docs: selection.docs,
        searchParams,
        locale,
        berNames: null,
        targetLabels: null,
      })}
      spending={spending}
      initialCurrency="usd"
    />
  );
}
