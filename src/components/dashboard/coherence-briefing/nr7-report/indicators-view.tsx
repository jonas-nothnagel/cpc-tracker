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
import type { Nr7ReportView } from "./view";

const GROUPS: Nr7IndicatorGroup[] = ["headline", "other", "noValues"];

export function IndicatorsView({
  model,
  view,
  onViewChange,
}: {
  model: Nr7ReportModel;
  view: Nr7ReportView;
  onViewChange: (next: Nr7ReportView) => void;
}) {
  const t = useTranslations("briefing.nr7Report.indicators");

  useEffect(() => {
    if (!view.focusIndicatorId) return;
    document.getElementById(`nr7-ind-${view.focusIndicatorId}`)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [view.focusIndicatorId]);

  const openTarget = (targetId: string) =>
    onViewChange({ ...view, tab: "targets", expandedTargetId: targetId, focusIndicatorId: null });

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
                  focused={view.focusIndicatorId === ind.id}
                  onOpenTarget={openTarget}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
