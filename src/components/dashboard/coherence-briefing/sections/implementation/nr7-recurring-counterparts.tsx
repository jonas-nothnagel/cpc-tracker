"use client";

/**
 * Nr7RecurringCounterparts — the flagged pairs across the policy-link rows,
 * turned round, as a fold under the rows: per target in another plan that
 * is flagged against two or more national targets, how many, and those
 * national targets by name (rated behind schedule first). One review of a
 * counterpart settles the same question on every row it appears in
 * (Mongolia: eight expansion targets carry nearly half of 168 pairs).
 *
 * The counterpart opens its target profile; a national target opens its
 * row on the slide. Factual surface: no suggestion, no cause, no actor.
 * The view's one caveat (under the rows) covers this fold too.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useNr7BadgeLabels } from "@/lib/labels";
import { FLAGGED_COLOR, getDocColor, getDocFullLabel, getDocMediumLabel } from "@/lib/utils";
import { NR7_COLORS, shortNr7Text, stripNr7Deadline } from "../../nr7-report";
import type { Nr7RecurringCounterpart, Nr7RecurringGroup } from "./review-groups";
import type { CountryConfig } from "@/types";

/** The words of a national target as a hit: its number and a short text. */
const HIT_TEXT_MAX = 44;

export interface Nr7RecurringCounterpartsProps {
  group: Nr7RecurringGroup;
  countryConfig: CountryConfig | null;
  visibleTargetIds: ReadonlySet<string>;
  onOpenTarget: (targetId: string) => void;
  /** Opens the policy-link row of a national target; absent, the names are text. */
  onSelectRow?: (targetId: string) => void;
}

export function Nr7RecurringCounterparts({ group, countryConfig, visibleTargetIds, onOpenTarget, onSelectRow }: Nr7RecurringCounterpartsProps) {
  const t = useTranslations("briefing.implementation.fullPicture.nr7Recurring");
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? group.items : group.top;
  return (
    <div className="space-y-4" data-testid="recurring-counterparts">
      <ol className="space-y-3">
        {shown.map((item) => (
          <CounterpartRow key={item.targetId} item={item} targets={group.targets} countryConfig={countryConfig} visibleTargetIds={visibleTargetIds} onOpenTarget={onOpenTarget} onSelectRow={onSelectRow} />
        ))}
      </ol>
      {group.hidden > 0 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums">
          {showAll ? t("showFewer") : t("showAll", { count: group.total })}
        </button>
      )}
    </div>
  );
}

function CounterpartRow({
  item,
  targets,
  countryConfig,
  visibleTargetIds,
  onOpenTarget,
  onSelectRow,
}: { item: Nr7RecurringCounterpart; targets: number } & Omit<Nr7RecurringCounterpartsProps, "group">) {
  const t = useTranslations("briefing.implementation.fullPicture.nr7Recurring");
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
      <p className="flex items-start gap-1.5 text-data leading-snug text-[var(--undp-black)]" title={getDocFullLabel(countryConfig, item.doc)}>
        <span aria-hidden="true" className="mt-1.5 inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getDocColor(countryConfig, item.doc) }} />
        {name}
      </p>
      <p className="text-caption font-medium leading-snug mt-0.5 pl-3.5" style={{ color: FLAGGED_COLOR }} data-testid="recurring-count">
        {t("pairCount", { count: item.count, targets, behind: item.behindCount })}
      </p>
      <ul className="mt-1 pl-3.5 space-y-0.5 sm:grid sm:grid-cols-2 sm:gap-x-4 sm:space-y-0" aria-label={t("hitsLabel")}>
        {item.hits.map((h) => {
          const title = t("hit", { n: h.number, rating: ratingLabels[h.status] });
          const face = (
            <>
              <span aria-hidden="true" className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: NR7_COLORS[h.status] }} />
              <span className={`min-w-0 ${h.behind ? "text-[var(--undp-black)]" : "text-[var(--undp-gray)]"}`}>
                <span className="tabular-nums">{h.number}</span> · {shortNr7Text(stripNr7Deadline(h.text), HIT_TEXT_MAX)}{" "}
                <span className="text-[var(--undp-gray)]">({ratingLabels[h.status]})</span>
              </span>
            </>
          );
          return (
            <li key={h.targetId} className="text-caption leading-snug">
              {onSelectRow ? (
                <button type="button" onClick={() => onSelectRow(h.targetId)} title={title} aria-label={title} className="flex items-start gap-1.5 text-left hover:underline">
                  {face}
                </button>
              ) : (
                <span title={title} aria-label={title} className="flex items-start gap-1.5">
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
