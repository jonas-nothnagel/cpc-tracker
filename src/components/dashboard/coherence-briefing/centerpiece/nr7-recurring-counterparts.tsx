"use client";

/**
 * Nr7RecurringCounterparts — the sticky column's default while the
 * biodiversity report (NR7) is on the Implementation slide and no row is
 * opened: the flagged pairs of the rows, turned round. Each policy target
 * in OTHER documents that the pipeline flagged against several national
 * targets' NBSAP counterparts, most first, with the national targets it is
 * flagged against as chips that open the matching row.
 *
 * Why it exists (2026-09-15, from the Mongolia read): the flag count on a
 * row tracks how much land a biodiversity target touches, not how it is
 * doing, and a handful of expansion targets (new cropland, fodder,
 * irrigation, a dam) account for nearly half of every pair. Read per row,
 * the same pairs come round twenty times; read per counterpart, they are
 * six or eight review items, each covering every national target listed
 * beside it. It sits in the column, not under the rows, so the slide keeps
 * one list (2026-09-15: the two lists together were too much).
 *
 * Factual surface: no suggestion, no cause, no actor. The links are
 * AI-estimated alignment between target texts (labelled as such).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useNr7BadgeLabels } from "@/lib/labels";
import { FLAGGED_COLOR, getDocColor, getDocFullLabel, getDocMediumLabel } from "@/lib/utils";
import { NR7_COLORS } from "../nr7-report";
import type { Nr7RecurringCounterpart, Nr7RecurringGroup } from "../sections/implementation/review-groups";
import type { CountryConfig } from "@/types";

export interface Nr7RecurringCounterpartsProps {
  group: Nr7RecurringGroup;
  countryConfig: CountryConfig | null;
  countryName: string;
  visibleTargetIds: ReadonlySet<string>;
  onOpenTarget: (targetId: string) => void;
  /** Opens the policy-link row of a national target; absent, the chips are text. */
  onOpenRow?: (targetId: string) => void;
}

export function Nr7RecurringCounterparts({ group, countryConfig, countryName, visibleTargetIds, onOpenTarget, onOpenRow }: Nr7RecurringCounterpartsProps) {
  const t = useTranslations("briefing.implementationCenter.nr7Links");
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? group.items : group.top;
  return (
    <div className="px-1 space-y-5" data-testid="recurring-counterparts">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)]">{t("recurring.eyebrow")}</p>
        <p className="text-[15px] font-semibold text-[var(--undp-black)] leading-tight mt-0.5">{t("recurring.title")}</p>
        <p className="text-[11.5px] text-[var(--undp-gray)] mt-0.5">{t("header.subtitle", { country: countryName })}</p>
        <p className="text-[12px] text-[var(--undp-black)] leading-snug mt-1.5">
          {group.toHalf > 0 ? t("recurring.intro", { toHalf: group.toHalf, pairs: group.totalPairs }) : t("recurring.introNoHalf", { pairs: group.totalPairs })}
        </p>
        <p className="text-[11px] text-[var(--undp-gray)] mt-1" data-testid="nr7-links-default">{t("recurring.note")}</p>
      </div>
      <ol className="space-y-2.5" data-tour="nr7-links-recurring">
        {shown.map((item) => (
          <CounterpartRow key={item.targetId} item={item} targets={group.targets} countryConfig={countryConfig} visibleTargetIds={visibleTargetIds} onOpenTarget={onOpenTarget} onOpenRow={onOpenRow} />
        ))}
      </ol>
      {group.hidden > 0 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums">
          {showAll ? t("targets.fewer") : t("recurring.showAll", { count: group.total })}
        </button>
      )}
      <p className="text-[11px] text-[var(--undp-gray)] leading-snug" data-tour="nr7-links-caveat">{t("caveat")}</p>
    </div>
  );
}

function CounterpartRow({
  item,
  targets,
  countryConfig,
  visibleTargetIds,
  onOpenTarget,
  onOpenRow,
}: { item: Nr7RecurringCounterpart; targets: number } & Omit<Nr7RecurringCounterpartsProps, "group" | "countryName">) {
  const t = useTranslations("briefing.implementationCenter.nr7Links");
  const ratingLabels = useNr7BadgeLabels();
  const label = `${getDocMediumLabel(countryConfig, item.doc)} · ${item.label}`;
  const name = visibleTargetIds.has(item.targetId) ? (
    <button type="button" onClick={() => onOpenTarget(item.targetId)} title={item.text} className="text-[var(--undp-blue)] hover:underline text-left min-w-0">
      {label}
    </button>
  ) : (
    <span title={item.text} className="min-w-0">{label}</span>
  );
  return (
    <li data-testid="recurring-counterpart">
      <p className="flex items-start gap-1.5 text-[12px] leading-snug text-[var(--undp-black)]" title={getDocFullLabel(countryConfig, item.doc)}>
        <span aria-hidden="true" className="mt-1.5 inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getDocColor(countryConfig, item.doc) }} />
        {name}
      </p>
      <p className="text-[11.5px] font-medium leading-snug mt-0.5 pl-3.5" style={{ color: FLAGGED_COLOR }} data-testid="recurring-count">
        {t("recurring.count", { count: item.count, targets, behind: item.behindCount })}
      </p>
      <ul className="mt-1 pl-3.5 flex flex-wrap gap-1" aria-label={t("recurring.hitsLabel")}>
        {item.hits.map((h) => {
          const title = t("recurring.hit", { n: h.number, rating: ratingLabels[h.status] });
          const face = (
            <>
              <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: NR7_COLORS[h.status] }} />
              <span className="tabular-nums">{h.number}</span>
            </>
          );
          const cls = `inline-flex items-center gap-1 rounded-full border px-1.5 leading-4 text-[10.5px] ${h.behind ? "border-line-strong text-[var(--undp-black)] font-medium" : "border-line-soft text-[var(--undp-gray)]"}`;
          return (
            <li key={h.targetId}>
              {onOpenRow ? (
                <button type="button" onClick={() => onOpenRow(h.targetId)} title={title} aria-label={title} className={`${cls} hover:bg-black/[0.03]`}>
                  {face}
                </button>
              ) : (
                <span title={title} aria-label={title} className={cls}>
                  {face}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
