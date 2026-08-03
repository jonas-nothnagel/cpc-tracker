import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCountry } from "@/config/countries";
import { getCountryDashboardPayload, loadRatings } from "@/lib/dashboard-data";
import { resolveFindingPair } from "@/lib/finding/resolve";
import { buildFindingHeadline } from "@/lib/finding/headline";
import { findingDocName } from "@/lib/finding/doc-name";
import { loadConsensusCounts } from "@/lib/finding/consensus";
import { computeSignificanceFacts } from "@/lib/finding/significance";
import { getAlignmentLabels, getContradictionTypeLabels } from "@/lib/labels";
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

  // "Why this pair stands out": every line computed from stored data.
  const consensus = loadConsensusCounts(entry.id);
  const facts = computeSignificanceFacts(data.alignment, data.targets, found.pair, {
    consensusCounts: consensus?.counts,
    modelsTotal: consensus?.modelsTotal,
    ratings: loadRatings(entry.id),
  });
  const significance: string[] = [];
  if (facts.modelsFlagging) {
    significance.push(
      t("card.modelAgreement", {
        count: facts.modelsFlagging.count,
        total: facts.modelsFlagging.total,
      }),
    );
  }
  if (facts.typeRarity) {
    const mechanismLabels = await getContradictionTypeLabels(locale);
    significance.push(
      t("card.typeRarity", {
        mechanism: mechanismLabels[facts.typeRarity.mechanism],
        count: facts.typeRarity.count,
        comparisons: facts.typeRarity.totalComparisons,
      }),
    );
  }
  if (facts.concentration) {
    significance.push(
      t("card.concentration", {
        target: facts.concentration.sourceLabel,
        count: facts.concentration.count,
        flaggedTotal: facts.concentration.flaggedTotal,
      }),
    );
  }
  if (facts.review !== undefined) {
    if (facts.review) {
      const alignmentLabels = await getAlignmentLabels(locale);
      significance.push(
        t("card.reviewed", {
          rating: alignmentLabels[facts.review.rating],
          date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
            new Date(facts.review.ts),
          ),
        }),
      );
    } else {
      significance.push(t("card.notReviewed"));
    }
  }

  return { locale, entry, countryConfig, found, headline, significance };
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
  const { locale, entry, countryConfig, found, headline, significance } = loaded;
  const tc = await getTranslations({ locale, namespace: "common" });

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--undp-paper)" }}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-4">
        <p className="mb-4 text-caption">
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
          significance={significance}
        />
      </div>
    </div>
  );
}
