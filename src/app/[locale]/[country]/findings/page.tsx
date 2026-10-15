import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCountry } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { loadConsensusCounts } from "@/lib/finding/consensus";
import { selectFindingCandidates } from "@/lib/finding/candidates";
import {
  getAlignmentLabels,
  getConfidenceLabels,
  getContradictionTypeLabels,
  getManageabilityLabels,
} from "@/lib/labels";
import { getDocMediumLabel } from "@/lib/utils";
import type { CountryConfig } from "@/types";

// Internal curation harness: the full candidate shortlist, ordered by the
// signals the pipeline already carries, so a human can pick the findings
// worth promoting. Deliberately plain; not a product surface.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string; country: string }>;
  searchParams: Promise<{ model?: string | string[] }>;
}

export async function generateMetadata(props: Props) {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "finding" });
  return { title: `${t("index.title")} | CPC Analyzer` };
}

export default async function FindingsIndexPage(props: Props) {
  const { locale, country } = await props.params;
  const { model } = await props.searchParams;
  const entry = getCountry(country.toLowerCase());
  if (!entry || !entry.visible) notFound();

  const modelParam = Array.isArray(model) ? model[0] : model;
  const result = getCountryDashboardPayload(entry.id, locale, modelParam ?? null);
  if (result.kind !== "ok") notFound();
  const data = result.payload.data;
  const countryConfig = (data.countryConfig as CountryConfig | null) ?? null;

  // Cross-model consensus, only where several models have run.
  const consensus = loadConsensusCounts(entry.id);

  const candidates = selectFindingCandidates(data.alignment, data.targets, {
    consensusCounts: consensus?.counts,
  });

  const t = await getTranslations({ locale, namespace: "finding" });
  const alignmentLabels = await getAlignmentLabels(locale);
  const mechanismLabels = await getContradictionTypeLabels(locale);
  const confidenceLabels = await getConfidenceLabels(locale);
  const manageabilityLabels = await getManageabilityLabels(locale);

  const modelSuffix = modelParam ? `?model=${encodeURIComponent(modelParam)}` : "";

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--undp-paper)" }}
    >
      <div className="mx-auto w-full max-w-[44rem] px-6 py-10">
        <p className="mb-8 text-caption">
          <Link
            href={`/${entry.id}`}
            className="font-medium text-[var(--undp-gray)] hover:text-[var(--undp-blue)]"
          >
            {entry.name}
          </Link>
        </p>
        <h1
          className="text-headline font-medium text-[var(--undp-black)] [text-wrap:balance]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("index.title")}
        </h1>
        <p className="mt-1 text-data font-medium text-[var(--undp-gray)]">
          {t("index.count", { count: candidates.length })}
          {" · "}
          {t("index.internalNote")}
        </p>
        <p className="mt-3 mb-8 max-w-prose text-caption text-[var(--undp-gray)] leading-relaxed">
          {t("index.intro")}
        </p>

        {candidates.length === 0 ? (
          <p className="text-body text-[var(--undp-gray)]">{t("index.empty")}</p>
        ) : (
          <ol className="border-t border-line">
            {candidates.map((c) => {
              const signals = [
                consensus
                  ? t("index.modelsFlagging", {
                      count: c.modelsFlagging ?? 1,
                      total: consensus.modelsTotal,
                    })
                  : null,
                c.pair.confidence ? confidenceLabels[c.pair.confidence] : null,
                c.pair.manageability
                  ? manageabilityLabels[c.pair.manageability]
                  : null,
                c.pair.mechanism ? mechanismLabels[c.pair.mechanism] : null,
              ].filter(Boolean);
              return (
                <li key={c.pairKey} className="border-b border-line">
                  <Link
                    href={`/${entry.id}/finding/${c.pairKey}${modelSuffix}`}
                    className="group block py-3"
                  >
                    <p className="text-body text-[var(--undp-black)] group-hover:text-[var(--undp-blue)]">
                      {getDocMediumLabel(countryConfig, c.targetA.sourceDocument)}{" "}
                      {c.targetA.sourceLabel}
                      <span className="text-[var(--undp-gray)]"> ↔ </span>
                      {getDocMediumLabel(countryConfig, c.targetB.sourceDocument)}{" "}
                      {c.targetB.sourceLabel}
                    </p>
                    <p className="mt-0.5 text-caption text-[var(--undp-gray)]">
                      {alignmentLabels[c.pair.alignment]}
                      {signals.length > 0 ? ` · ${signals.join(" · ")}` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
