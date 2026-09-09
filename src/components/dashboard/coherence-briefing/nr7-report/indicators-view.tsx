"use client";

/**
 * IndicatorsView — every NR7 indicator, grouped: headline indicators with
 * values, component and national ones with values, then those the country
 * reported no values for (with its note where it gave one).
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { IndicatorCard } from "./indicator-card";
import type { Nr7IndicatorGroup, Nr7ReportModel } from "./nr7-self-report";

const GROUPS: Nr7IndicatorGroup[] = ["headline", "other", "noValues"];

export function IndicatorsView({
  model,
  focusIndicatorId,
  onOpenTarget,
}: {
  model: Nr7ReportModel;
  /** Card to scroll to and outline after a chip or signal click. */
  focusIndicatorId: string | null;
  /** A target chip on a card: jump to that national target. */
  onOpenTarget: (targetId: string) => void;
}) {
  const t = useTranslations("briefing.nr7Report.indicators");

  useEffect(() => {
    if (!focusIndicatorId) return;
    document.getElementById(`nr7-ind-${focusIndicatorId}`)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [focusIndicatorId]);

  return (
    <div className="space-y-6">
      <p className="text-caption text-[var(--undp-gray)]">
        {t("summary", {
          total: model.totals.indicators,
          withValues: model.totals.indicatorsWithValues,
          without: model.totals.indicators - model.totals.indicatorsWithValues,
          withNote: model.totals.indicatorsWithNote,
        })}
      </p>
      {GROUPS.map((group) => {
        const items = model.indicators.filter((i) => i.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group}>
            <p className="text-caption font-medium text-[var(--undp-gray)] mb-2">
              {t(`group.${group}`)} <span className="text-[var(--undp-gray)]/60">· {items.length}</span>
            </p>
            <div className="space-y-2">
              {items.map((ind) => (
                <IndicatorCard
                  key={ind.id}
                  indicator={ind}
                  focused={focusIndicatorId === ind.id}
                  onOpenTarget={onOpenTarget}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
