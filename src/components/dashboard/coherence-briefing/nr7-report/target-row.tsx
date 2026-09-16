"use client";

/**
 * Nr7TargetRow — one national target: a compact face (rating, questionnaire
 * mix, indicator count, policy reach) and, when expanded, the report's own
 * entry (./target-detail.tsx) with links into the rest of the briefing.
 */

import { useTranslations } from "next-intl";
import { useNr7BadgeLabels } from "@/lib/labels";
import { GbfChip } from "./gbf-chip";
import { ANSWER_COLORS, ANSWER_ORDER, NR7_COLORS } from "./nr7-colors";
import { Nr7TargetDetail } from "./target-detail";
import type { Nr7IndicatorView, Nr7TargetRow as Row } from "./nr7-self-report";

export function Nr7TargetRow({
  row,
  expanded,
  onToggle,
  indicatorsById,
  onFocusIndicator,
  onOpenNbsap,
  onOpenPair,
  gbfChipsFrom = 0,
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
  /** Index of the first GBF target to show as a chip: 1 when the row sits
   *  under a GBF heading that already names the first. */
  gbfChipsFrom?: number;
}) {
  const t = useTranslations("briefing.nr7Report.targets");
  const statusLabels = useNr7BadgeLabels();
  const statusColor = NR7_COLORS[row.status];
  const bodyId = `nr7-target-${row.targetId}`;

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
            {row.gbfTargets.slice(gbfChipsFrom).map((g) => (
              <GbfChip key={g.id} target={g} />
            ))}
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
        <div id={bodyId} className="pb-4 pl-1 pr-1">
          <Nr7TargetDetail row={row} indicatorsById={indicatorsById} onFocusIndicator={onFocusIndicator} links={{ onOpenNbsap, onOpenPair }} />
        </div>
      )}
    </li>
  );
}
