"use client";

/**
 * Nr7TargetDetail — the report's own entry for one national target: the
 * six-level rating wording, the progress narrative verbatim, the
 * questionnaire, the target-specific indicators and chips for the shared
 * ones. One body, rendered wherever a national target opens (the policy-link
 * rows on the Implementation slide; any list of report entries). Links
 * onward render only when the caller passes them.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { IndicatorCard } from "./indicator-card";
import { MixBar } from "./mix-bar";
import { ANSWER_COLORS, ANSWER_ORDER } from "./nr7-colors";
import { QuestionnaireTable, useAnswerLabels } from "./questionnaire-table";
import type { Nr7IndicatorView, Nr7TargetRow as Row } from "./nr7-self-report";

export function Nr7TargetDetail({
  row,
  indicatorsById,
  onFocusIndicator,
  links,
}: {
  row: Row;
  indicatorsById: Map<string, Nr7IndicatorView>;
  onFocusIndicator: (indicatorId: string) => void;
  /** Links onward; each absent when its destination is not available. */
  links?: { onOpenNbsap?: () => void; onOpenPair?: () => void };
}) {
  const t = useTranslations("briefing.nr7Report.targets");
  const answerLabels = useAnswerLabels();
  const [readMore, setReadMore] = useState(false);
  const specific = row.specificIndicatorIds.map((id) => indicatorsById.get(id)).filter(Boolean) as Nr7IndicatorView[];
  const onOpenNbsap = links?.onOpenNbsap;
  const onOpenPair = links?.onOpenPair;

  return (
    <div className="space-y-4" data-testid="nr7-target-detail">
      {row.levelOfProgress && (
        <p className="text-caption text-[var(--undp-gray)]">
          {t("expand.level", { level: row.levelOfProgress })}
        </p>
      )}

      {row.progressSummary && (
        <section>
          <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">{t("expand.progress")}</p>
          <p className={`text-data text-[var(--undp-black)] leading-relaxed whitespace-pre-line ${readMore ? "" : "line-clamp-4"}`}>
            {row.progressSummary}
          </p>
          <button
            type="button"
            onClick={() => setReadMore((v) => !v)}
            className="mt-1 text-caption text-[var(--undp-blue)] hover:underline"
          >
            {readMore ? t("expand.readLess") : t("expand.readMore")}
          </button>
        </section>
      )}

      <section>
        <p className="text-caption font-medium text-[var(--undp-gray)] mb-1.5">{t("expand.questionnaire")}</p>
        {row.answers.answered > 0 && (
          <div className="mb-2 max-w-sm">
            <MixBar
              ariaLabel={t("expand.answersAria", { count: row.answers.answered })}
              segments={ANSWER_ORDER.map((k) => ({ key: k, label: answerLabels[k], count: row.answers[k], color: ANSWER_COLORS[k] }))}
            />
          </div>
        )}
        {row.scaleAnswers.length + row.otherAnswers.length > 0 ? (
          <QuestionnaireTable scale={row.scaleAnswers} other={row.otherAnswers} />
        ) : (
          <p className="text-caption text-[var(--undp-gray)]">{t("row.noQuestionnaire")}</p>
        )}
      </section>

      <section>
        <p className="text-caption font-medium text-[var(--undp-gray)] mb-1.5">{t("expand.indicators")}</p>
        {specific.length > 0 ? (
          <div className="space-y-2">
            {specific.map((ind) => (
              <IndicatorCard key={ind.id} indicator={ind} />
            ))}
          </div>
        ) : (
          <p className="text-caption text-[var(--undp-gray)]">{t("expand.noIndicators")}</p>
        )}
        {row.sharedIndicatorIds.length > 0 && (
          <p className="mt-2 text-caption text-[var(--undp-gray)] flex flex-wrap items-center gap-1">
            <span>{t("expand.sharedIndicators")}</span>
            {row.sharedIndicatorIds.map((id) => {
              const ind = indicatorsById.get(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onFocusIndicator(id)}
                  title={ind ? `${ind.title} · ${t("expand.sharedAcross", { count: ind.targetIds.length })}` : id}
                  className="rounded border border-gray-300 px-1.5 py-0.5 text-caption text-[var(--undp-blue)] hover:border-[var(--undp-blue)]"
                >
                  {ind?.code ?? id}
                </button>
              );
            })}
          </p>
        )}
        <p className="mt-2 text-caption text-[var(--undp-gray)] leading-snug">{t("expand.vsNarrative")}</p>
      </section>

      {(onOpenNbsap || onOpenPair) && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
          {onOpenNbsap && row.nbsapNumber !== null && (
            <button type="button" onClick={onOpenNbsap} className="text-[var(--undp-blue)] hover:underline">
              {t("expand.openNbsap", { n: row.nbsapNumber })} ›
            </button>
          )}
          {onOpenPair && (
            <button type="button" onClick={onOpenPair} className="text-[var(--undp-blue)] hover:underline">
              {t("expand.openPair")} ›
            </button>
          )}
        </p>
      )}
    </div>
  );
}
