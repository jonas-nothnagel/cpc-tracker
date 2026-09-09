"use client";

/**
 * Nr7TargetRow — one national target: a compact face (rating, questionnaire
 * mix, indicator count, policy reach) and, when expanded, the report's own
 * detail: the six-level rating wording, the progress narrative verbatim, the
 * questionnaire, the target-specific indicators, chips for the shared ones,
 * and links into the rest of the briefing.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useNr7BadgeLabels } from "@/lib/labels";
import { IndicatorCard } from "./indicator-card";
import { MixBar } from "./mix-bar";
import { ANSWER_COLORS, ANSWER_ORDER, NR7_COLORS } from "./nr7-colors";
import { QuestionnaireTable, useAnswerLabels } from "./questionnaire-table";
import type { Nr7IndicatorView, Nr7TargetRow as Row } from "./nr7-self-report";

export function Nr7TargetRow({
  row,
  expanded,
  onToggle,
  indicatorsById,
  onFocusIndicator,
  onOpenNbsap,
  onOpenPair,
}: {
  row: Row;
  expanded: boolean;
  onToggle: () => void;
  indicatorsById: Map<string, Nr7IndicatorView>;
  onFocusIndicator: (indicatorId: string) => void;
  /** Absent when the NBSAP target is not in the visible corpus. */
  onOpenNbsap?: () => void;
  /** Absent when no reported-action pair exists for this target. */
  onOpenPair?: () => void;
}) {
  const t = useTranslations("briefing.nr7Report.targets");
  const statusLabels = useNr7BadgeLabels();
  const answerLabels = useAnswerLabels();
  const [readMore, setReadMore] = useState(false);
  const statusColor = NR7_COLORS[row.status];
  const bodyId = `nr7-target-${row.targetId}`;
  const specific = row.specificIndicatorIds.map((id) => indicatorsById.get(id)).filter(Boolean) as Nr7IndicatorView[];

  return (
    <li id={`nr7-row-${row.targetId}`} className="border-t border-line-soft">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="w-full text-left flex items-start gap-3 py-2.5 px-1 rounded hover:bg-black/[0.03]"
      >
        <span className="mt-0.5 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-caption tabular-nums text-[var(--undp-gray)]">
          {row.targetId}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-data text-[var(--undp-black)] leading-snug line-clamp-2">
            {row.targetText}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-[var(--undp-gray)]">
            {row.answers.answered > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex w-12 h-1.5 rounded-sm overflow-hidden bg-gray-100" aria-hidden="true">
                  {ANSWER_ORDER.map((k) => (
                    <span
                      key={k}
                      style={{
                        width: `${(row.answers[k] / row.answers.answered) * 100}%`,
                        backgroundColor: ANSWER_COLORS[k],
                      }}
                    />
                  ))}
                </span>
                {t("row.questionnaire", {
                  yes: row.answers.yes,
                  partially: row.answers.partially,
                  underDevelopment: row.answers.underDevelopment,
                  no: row.answers.no,
                })}
              </span>
            ) : (
              <span>{t("row.noQuestionnaire")}</span>
            )}
            <span>{t("row.indicators", { count: row.specificIndicatorIds.length + row.sharedIndicatorIds.length })}</span>
            <span>
              {row.nbsapNumber !== null && row.policyReach !== null
                ? t("row.reach", { count: row.policyReach, n: row.nbsapNumber })
                : t("row.reachNone")}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-caption font-medium whitespace-nowrap" style={{ color: statusColor }}>
          {statusLabels[row.status]}
        </span>
      </button>

      {expanded && (
        <div id={bodyId} className="pb-4 pl-1 pr-1 space-y-4">
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
      )}
    </li>
  );
}
