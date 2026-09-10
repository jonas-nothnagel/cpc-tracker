"use client";

/**
 * ClimateStrainChart — the climate report's takeaway as a chart: one bar per
 * reported action that may pull against policy targets, most flagged pairs
 * first, split into design-level (darker) and coordination-level pairs.
 * A bar opens inline to the commitments it may pull against, each with the
 * AI rationale under a labelled heading, and the pair drawer is one click
 * further. Words carry every colour (legend, counts, manageability words).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useManageabilityLabels } from "@/lib/labels";
import { FLAGGED_COLOR, MECHANISM_COLORS, getDocColor } from "@/lib/utils";
import type { StrainedAction } from "@/lib/implementation-coherence";
import { statusWord } from "./coverage-by-document";
import type { ClimateReviewGroup } from "./review-groups";
import type { CountryConfig } from "@/types";

const DESIGN_COLOR = FLAGGED_COLOR;
const COORDINATION_COLOR = MECHANISM_COLORS.delivery_friction;

export function ClimateStrainChart({
  group,
  countryConfig,
  onOpenActionPair,
}: {
  group: ClimateReviewGroup;
  countryConfig: CountryConfig | null;
  onOpenActionPair: (actionId: string, targetId: string) => void;
}) {
  const t = useTranslations("briefing.implementation");
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (group.total === 0) return null;
  const rows = showAll ? group.items : group.top;

  return (
    <div data-tour="review-visual">
      <ol className="border-b border-line-soft">
        {rows.map((action, i) => (
          <StrainBar
            key={action.actionId}
            action={action}
            maxCount={group.maxCount}
            countryConfig={countryConfig}
            expanded={expandedId === action.actionId}
            onToggle={() => setExpandedId((cur) => (cur === action.actionId ? null : action.actionId))}
            onOpenActionPair={onOpenActionPair}
            first={i === 0}
          />
        ))}
      </ol>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-[var(--undp-gray)]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: DESIGN_COLOR }} />
          {t("climate.legend.design")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COORDINATION_COLOR }} />
          {t("climate.legend.coordination")}
        </span>
        {group.hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="ml-auto text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums"
          >
            {showAll ? t("showFewer") : t("showAll", { count: group.total })}
          </button>
        )}
      </p>
    </div>
  );
}

function StrainBar({
  action,
  maxCount,
  countryConfig,
  expanded,
  onToggle,
  onOpenActionPair,
  first,
}: {
  action: StrainedAction;
  maxCount: number;
  countryConfig: CountryConfig | null;
  expanded: boolean;
  onToggle: () => void;
  onOpenActionPair: (actionId: string, targetId: string) => void;
  first: boolean;
}) {
  const t = useTranslations("briefing.implementation");
  const manageability = useManageabilityLabels();
  const bodyId = `strain-${action.actionId}`;
  const scale = maxCount > 0 ? 100 / maxCount : 0;
  const total = Math.max(6, action.potentialMisalignmentCount * scale);
  const design = action.fundamentalCount * scale;
  const status = statusWord(action.status, t);

  return (
    <li className="border-t border-line-soft">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={t("climate.bar.aria", { name: action.actionName, count: action.potentialMisalignmentCount, design: action.fundamentalCount })}
        data-tour={first ? "review-row" : undefined}
        className="w-full text-left grid grid-cols-[minmax(0,14rem)_1fr_3rem] items-center gap-3 px-1 py-2 rounded hover:bg-black/[0.03]"
      >
        <span className="text-data text-[var(--undp-black)] leading-snug line-clamp-2" title={action.actionName}>
          {action.actionName}
        </span>
        <span className="block h-2 rounded-full overflow-hidden bg-[var(--color-line)]" aria-hidden="true">
          <span className="flex h-full" style={{ width: `${total}%` }}>
            {design > 0 && <span className="h-full" style={{ width: `${(design / total) * 100}%`, backgroundColor: DESIGN_COLOR }} />}
            <span className="h-full flex-1" style={{ backgroundColor: COORDINATION_COLOR }} />
          </span>
        </span>
        <span className="text-caption tabular-nums text-[var(--undp-black)] text-right">{action.potentialMisalignmentCount}</span>
      </button>
      {expanded && (
        <div id={bodyId} className="pb-4 pl-1 pr-1 space-y-3 disclosure-enter">
          <p className="text-caption text-[var(--undp-gray)]">
            {status}
            {action.actionType === "adaptation" && (
              <>
                <span aria-hidden="true"> · </span>
                {t("row.climate.adaptation")}
              </>
            )}
          </p>
          <ul className="space-y-2.5">
            {action.commitments.map((c) => (
              <li key={c.targetId} className="text-caption">
                <p className="flex flex-wrap items-center gap-x-2 text-[var(--undp-black)]">
                  <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: getDocColor(countryConfig, c.doc) }} />
                  <span className="font-medium">{c.targetLabel}</span>
                  {c.manageability && <span className="text-[var(--undp-gray)]">{manageability[c.manageability]}</span>}
                </p>
                <p className="mt-0.5 text-[var(--undp-gray)] line-clamp-2" title={c.targetText}>{c.targetText}</p>
                {c.rationale && (
                  <p className="mt-1 leading-snug">
                    <span className="block font-medium text-[var(--undp-gray)]">{t("row.climate.rationaleHeading")}</span>
                    <span className="block text-[var(--undp-black)] line-clamp-3" title={c.rationale}>{c.rationale}</span>
                  </p>
                )}
                <button type="button" onClick={() => onOpenActionPair(action.actionId, c.targetId)} className="mt-1 text-[var(--undp-blue)] hover:underline">
                  {t("row.climate.openPair")} <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
          {action.institutionLabels.length > 0 && (
            <p className="text-caption text-[var(--undp-gray)]">
              {t("row.climate.namedOn")} <span className="text-[var(--undp-black)]">{action.institutionLabels.join(", ")}</span>
            </p>
          )}
        </div>
      )}
    </li>
  );
}
