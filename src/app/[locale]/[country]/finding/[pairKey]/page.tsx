import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { resolveFindingPair } from "@/lib/finding/resolve";
import { buildFindingHeadline } from "@/lib/finding/headline";
import { findingDocName } from "@/lib/finding/doc-name";
import type { CountryConfig } from "@/types";
import { FindingCard } from "@/components/finding/finding-card";

// Pair data lives in pipeline output on the persistent volume and changes at
// runtime (re-runs, model switches); never bake it in at build time.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string; country: string; pairKey: string }>;
  searchParams: Promise<{ model?: string | string[] }>;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Shared by generateMetadata and the page; the payload call hits the
 *  per-(country, model, locale) cache, so resolving twice is cheap. */
async function loadFinding(props: Props) {
  const { locale, country, pairKey } = await props.params;
  const { model } = await props.searchParams;
  const entry = getCountry(country.toLowerCase());
  if (!entry || !entry.visible) return null;

  const modelParam = Array.isArray(model) ? model[0] : model;
  const result = getCountryDashboardPayload(entry.id, locale, modelParam ?? null);
  if (result.kind !== "ok") return null;
  const data = result.payload.data;

  const found = resolveFindingPair(
    data.alignment,
    data.targets,
    safeDecode(pairKey),
  );
  if (!found) return null;

  const countryConfig = (data.countryConfig as CountryConfig | null) ?? null;
  const sameDoc = found.targetA.sourceDocument === found.targetB.sourceDocument;
  const t = await getTranslations({ locale, namespace: "finding" });
  // Headline names are the compact human ones; the untrimmed full names
  // appear in the card's source lines, keeping expansion on the same page.
  const nameOpts = { preferNative: locale !== "en" };
  const docs = sameDoc
    ? t("headline.docsSame", {
        doc: findingDocName(countryConfig, found.targetA.sourceDocument, nameOpts),
      })
    : t("headline.docsPair", {
        docA: findingDocName(countryConfig, found.targetA.sourceDocument, nameOpts),
        docB: findingDocName(countryConfig, found.targetB.sourceDocument, nameOpts),
      });
  const template = buildFindingHeadline({
    level: found.pair.alignment,
    mechanism: found.pair.mechanism,
    contestedResources: found.pair.contestedResources,
    sharedContext: found.pair.sharedContext,
    sameDoc,
  });
  const headline = t(template.key, { ...template.values, docs });

  return { locale, entry, countryConfig, found, headline };
}

export async function generateMetadata(props: Props) {
  const loaded = await loadFinding(props);
  if (!loaded) return {};
  return {
    title: loaded.headline,
    openGraph: { title: loaded.headline },
  };
}

export default async function FindingPage(props: Props) {
  const loaded = await loadFinding(props);
  if (!loaded) notFound();
  const { locale, entry, countryConfig, found, headline } = loaded;
  const tc = await getTranslations({ locale, namespace: "common" });

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--undp-paper)" }}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        <p className="mb-5 text-caption">
          <Link
            href="/"
            className="font-medium text-[var(--undp-gray)] hover:text-[var(--undp-blue)]"
          >
            {tc("appName")}
          </Link>
        </p>
        <FindingCard
          pair={found.pair}
          targetA={found.targetA}
          targetB={found.targetB}
          countryConfig={countryConfig}
          countryId={entry.id}
          countryName={entry.name}
          headline={headline}
        />
      </div>
    </div>
  );
}
