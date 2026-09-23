import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { computePulseModel } from "@/lib/pulse/aggregate";
import { strandSignals, strandsByPathway } from "@/lib/pulse/strands";
import type { FindingCandidate } from "@/lib/finding/candidates";
import { buildFindingHeadline } from "@/lib/finding/headline";
import { findingDocName } from "@/lib/finding/doc-name";
import { normalizeTarget } from "@/lib/normalize-target";
import {
  getConfidenceLabels,
  getContradictionTypeDescriptions,
  getContradictionTypeLabels,
  getManageabilityLabels,
} from "@/lib/labels";
import { getDocColor, getDocFullLabel, getDocMediumLabel } from "@/lib/utils";
import type { CountryConfig } from "@/types";
import { CoherenceCanvas } from "@/components/pulse/coherence-canvas";
import type { PulseEdgeView, PulseStrandView } from "@/components/pulse/types";

// Pipeline output lives on the persistent volume and changes at runtime.
export const dynamic = "force-dynamic";

const STRANDS_PER_PATHWAY = 6;

interface Props {
  params: Promise<{ locale: string; country: string }>;
  searchParams: Promise<{ model?: string | string[] }>;
}

async function loadPulse(props: Props) {
  const { locale, country } = await props.params;
  const { model } = await props.searchParams;
  const entry = getCountry(country.toLowerCase());
  if (!entry || !entry.visible) return null;
  const modelParam = Array.isArray(model) ? model[0] : model;
  const result = getCountryDashboardPayload(entry.id, locale, modelParam ?? null);
  if (result.kind !== "ok") return null;
  const data = result.payload.data;
  const countryConfig = (data.countryConfig as CountryConfig | null) ?? null;

  const docOrder = (countryConfig?.documentTypes ?? []).map((d) => d.id);
  const model_ = computePulseModel(data.alignment, data.targets, docOrder);
  const grouped = strandsByPathway(data.alignment, data.targets, docOrder);

  const t = await getTranslations({ locale, namespace: "pulse" });
  const tf = await getTranslations({ locale, namespace: "finding" });
  const tp = await getTranslations({ locale, namespace: "briefing.drawer.pair" });
  const mechanismLabels = await getContradictionTypeLabels(locale);
  const mechanismSentences = await getContradictionTypeDescriptions(locale);
  const confidenceLabels = await getConfidenceLabels(locale);
  const manageabilityLabels = await getManageabilityLabels(locale);
  const nameOpts = { preferNative: locale !== "en" };

  const toStrand = (c: FindingCandidate): PulseStrandView => {
    const a = normalizeTarget(c.targetA as unknown as Record<string, unknown>, locale);
    const b = normalizeTarget(c.targetB as unknown as Record<string, unknown>, locale);
    const docs = tf("headline.docsPair", {
      docA: findingDocName(countryConfig, a.sourceDocument, nameOpts),
      docB: findingDocName(countryConfig, b.sourceDocument, nameOpts),
    });
    const template = buildFindingHeadline({
      level: c.pair.alignment,
      mechanism: c.pair.mechanism,
      contestedResources: c.pair.contestedResources,
      sharedContext: c.pair.sharedContext,
      sameDoc: false,
    });
    const signals = strandSignals(c.pair, {
      confidence: confidenceLabels,
      manageability: manageabilityLabels,
      mechanism: mechanismLabels,
    });
    return {
      pairKey: c.pairKey,
      rowTitle: `${a.sourceLabel} ↔ ${b.sourceLabel}`,
      signals,
      claim: tf(template.key, { ...template.values, docs }),
      aTag: `${getDocMediumLabel(countryConfig, a.sourceDocument)} · ${a.sourceLabel}`,
      aText: a.text,
      bTag: `${getDocMediumLabel(countryConfig, b.sourceDocument)} · ${b.sourceLabel}`,
      bText: b.text,
      mechanismSentence: c.pair.mechanism
        ? mechanismSentences[c.pair.mechanism]
        : undefined,
      rationale: c.pair.description,
    };
  };

  const edges: PulseEdgeView[] = model_.edges.map((e) => {
    const key = `${e.a}~${e.b}`;
    const group = e.inflamed ? (grouped.get(key) ?? []) : [];
    return {
      key,
      a: e.a,
      b: e.b,
      compared: e.compared,
      flagged: e.flagged,
      alignedShare: e.alignedShare,
      rel: e.rel,
      inflamed: e.inflamed,
      pathwayLine: t("pathwayLine", {
        flagged: e.flagged,
        compared: e.compared,
        pct: `${Math.round(e.flaggedShare * 100)}%`,
      }),
      moreLine:
        group.length > STRANDS_PER_PATHWAY
          ? t("moreRanked", { count: group.length - STRANDS_PER_PATHWAY })
          : "",
      strands: group.slice(0, STRANDS_PER_PATHWAY).map(toStrand),
    };
  });

  const docs = model_.docs.map((d) => ({
    id: d.id,
    label: getDocMediumLabel(countryConfig, d.id),
    full: getDocFullLabel(countryConfig, d.id),
    color: getDocColor(countryConfig, d.id),
    targetCount: d.targetCount,
  }));

  const title = t("title", {
    flagged: model_.totalFlagged,
    inflamed: edges.filter((e) => e.inflamed).length,
    pairs: edges.length,
  });
  const subtitle = t("subtitle", {
    docs: docs.length,
    compared: model_.totalCompared,
  });

  return {
    locale,
    entry,
    docs,
    edges,
    title,
    subtitle,
    strings: {
      back: t("back"),
      topStrands: t("topStrands"),
      showRationale: t("showRationale"),
      hideRationale: t("hideRationale"),
      aiDisclaimer: tp("aiRationaleDisclaimer"),
      openPage: tp("openAsPage"),
      targetsWord: t("targetsWord"),
      clickHint: t("clickHint"),
      legendTissue: t("legendTissue"),
      legendNerve: t("legendNerve"),
    },
  };
}

export async function generateMetadata(props: Props) {
  const loaded = await loadPulse(props);
  if (!loaded) return {};
  return { title: loaded.title, openGraph: { title: loaded.title } };
}

export default async function PulsePage(props: Props) {
  const loaded = await loadPulse(props);
  if (!loaded) notFound();
  const { locale, entry, docs, edges, title, subtitle, strings } = loaded;
  const tc = await getTranslations({ locale, namespace: "common" });

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--undp-paper)" }}>
      <div className="mx-auto w-full max-w-6xl px-6 py-4">
        <p className="mb-4 text-caption">
          <Link
            href="/"
            className="font-medium text-[var(--undp-gray)] hover:text-[var(--undp-blue)]"
          >
            {tc("appName")}
          </Link>
          <span className="text-[var(--undp-gray)]"> · {entry.name}</span>
        </p>
        <h1
          className="text-headline font-normal leading-[1.25] text-[var(--undp-black)] [text-wrap:balance] max-w-[56rem]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h1>
        <p className="mt-1 mb-2 text-data text-[var(--undp-gray)]">{subtitle}</p>
        <CoherenceCanvas
          docs={docs}
          edges={edges}
          countryId={entry.id}
          strings={strings}
        />
      </div>
    </div>
  );
}
