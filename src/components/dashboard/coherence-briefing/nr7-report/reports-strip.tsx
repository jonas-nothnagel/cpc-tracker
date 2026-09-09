"use client";

/**
 * Nr7ReportsStrip — the top of the Implementation slide: the country's two
 * self-reports side by side, each with its headline numbers. Static faces
 * are factual (counts, the country's own ratings). The NR7 card ends with up
 * to three computed "worth a closer look" lines and the one button that
 * opens the NR7 drawer. Renders nothing without an NR7 model, so countries
 * without the report see the slide exactly as before.
 */

import { useTranslations } from "next-intl";
import { GlossaryTerm } from "@/components/ui/glossary";
import { FLAGGED_COLOR } from "@/lib/utils";
import { useNr7BadgeLabels } from "@/lib/labels";
import type { ImplementationCoverage } from "@/lib/implementation-coherence";
import { MixBar } from "./mix-bar";
import { NR7_COLORS, NR7_STATUS_ORDER } from "./nr7-colors";
import { SignalLine } from "./targets-view";
import type { Nr7ReportModel } from "./nr7-self-report";

export function Nr7ReportsStrip({
  model,
  btrCoverage,
  onOpenNr7Report,
}: {
  model: Nr7ReportModel | null;
  /** Coverage computed on the BTR alone; null when the country has no BTR. */
  btrCoverage: ImplementationCoverage | null;
  onOpenNr7Report: () => void;
}) {
  const t = useTranslations("briefing.nr7Report");
  const statusLabels = useNr7BadgeLabels();
  if (!model) return null;
  const hasBtr = Boolean(btrCoverage && btrCoverage.btrActions > 0);
  const hidden = model.signals.filter((s) => s.cardEligible).length - model.cardSignals.length;

  return (
    <section data-tour="coverage-reports" className="mb-4">
      <p className="text-caption font-medium text-[var(--undp-gray)] mb-2">{t("strip.eyebrow")}</p>
      <div className={`grid gap-3 ${hasBtr ? "md:grid-cols-2" : ""}`}>
        {hasBtr && btrCoverage && (
          <article className="rounded-md border border-line p-4">
            <p className="text-data font-medium text-[var(--undp-black)]">
              {t.rich("strip.btr.title", { btr: (c) => <GlossaryTerm id="btr">{c}</GlossaryTerm> })}
            </p>
            <ul className="mt-2 space-y-1 text-data text-[var(--undp-black)] tabular-nums">
              <li>{t("strip.btr.actions", { count: btrCoverage.btrActions })}</li>
              <li>{t("strip.btr.addressed", { reached: btrCoverage.reached, total: btrCoverage.total })}</li>
              <li style={{ color: btrCoverage.targetsWithMisalignment > 0 ? FLAGGED_COLOR : undefined }}>
                {t("strip.btr.toReview", { count: btrCoverage.targetsWithMisalignment })}
              </li>
            </ul>
            <p className="mt-2 text-caption text-[var(--undp-gray)]">{t("strip.btr.detailNote")}</p>
          </article>
        )}

        <article className="rounded-md border border-line p-4">
          <p className="text-data font-medium text-[var(--undp-black)]">
            {t.rich("strip.nr7.title", { nr7: (c) => <GlossaryTerm id="nr7">{c}</GlossaryTerm> })}
            {model.publishedOn && (
              <span className="ml-2 text-caption font-normal text-[var(--undp-gray)]">
                {t("strip.nr7.published", { date: model.publishedOn })}
              </span>
            )}
          </p>
          <div className="mt-2">
            <p className="text-caption text-[var(--undp-gray)] mb-1">
              {t("strip.nr7.targets", { count: model.totals.targets })}
            </p>
            <MixBar
              ariaLabel={t("rating.legendAria", { count: model.totals.targets })}
              segments={NR7_STATUS_ORDER.map((s) => ({
                key: s,
                label: statusLabels[s],
                count: model.totals.byStatus[s],
                color: NR7_COLORS[s],
              }))}
            />
          </div>
          <ul className="mt-2 space-y-1 text-data text-[var(--undp-black)] tabular-nums">
            <li>
              {t("strip.nr7.questionnaire", {
                answered: model.totals.answers,
                targets: model.totals.targetsWithAnswers,
                total: model.totals.targets,
              })}
            </li>
            <li>{t("strip.nr7.indicators", { withValues: model.totals.indicatorsWithValues, total: model.totals.indicators })}</li>
          </ul>

          {model.cardSignals.length > 0 && (
            <div className="mt-3 border-l border-line-strong pl-3" data-tour="nr7-closer-look">
              <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">{t("closerLook.heading")}</p>
              <ul className="space-y-1">
                {model.cardSignals.map((s) => (
                  <li key={`${s.rule}-${s.targetId ?? s.indicatorId}`} className="text-data text-[var(--undp-black)] leading-snug">
                    <SignalLine signal={s} />
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-caption text-[var(--undp-gray)]">
                {t("closerLook.caption")}
                {hidden > 0 && <> {t("closerLook.more", { count: hidden })}</>}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenNr7Report}
            className="mt-3 inline-flex items-center gap-1 rounded-md bg-[var(--undp-blue)] px-3 py-1.5 text-data font-medium text-white hover:bg-[var(--undp-blue-dark)]"
          >
            {t("strip.nr7.open")} <span aria-hidden="true">›</span>
          </button>
        </article>
      </div>
    </section>
  );
}
