"use client";

/**
 * TargetsView — the "By national target" view of the NR7 drawer: the rating
 * mix, every "worth a closer look" signal, then the twenty targets.
 */

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useNr7BadgeLabels } from "@/lib/labels";
import { MixBar } from "./mix-bar";
import { NR7_COLORS, NR7_STATUS_ORDER } from "./nr7-colors";
import { Nr7TargetRow } from "./target-row";
import type { Nr7ReportModel } from "./nr7-self-report";
import { SignalLine } from "./signal-line";

export { SignalLine };
import type { Nr7ReportView } from "./view";

export function TargetsView({
  model,
  view,
  onViewChange,
  canOpenNbsap,
  canOpenPair,
  onOpenNbsap,
  onOpenPair,
}: {
  model: Nr7ReportModel;
  view: Nr7ReportView;
  onViewChange: (next: Nr7ReportView) => void;
  canOpenNbsap: (nbsapTargetId: string) => boolean;
  canOpenPair: (targetId: string) => boolean;
  onOpenNbsap: (nbsapTargetId: string) => void;
  onOpenPair: (targetId: string) => void;
}) {
  const t = useTranslations("briefing.nr7Report");
  const statusLabels = useNr7BadgeLabels();
  const indicatorsById = useMemo(() => new Map(model.indicators.map((i) => [i.id, i])), [model.indicators]);

  // Land on the target a signal or a chip pointed at.
  useEffect(() => {
    if (!view.expandedTargetId) return;
    document.getElementById(`nr7-row-${view.expandedTargetId}`)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [view.expandedTargetId]);

  const expand = (targetId: string) =>
    onViewChange({ ...view, tab: "targets", expandedTargetId: view.expandedTargetId === targetId ? null : targetId });
  const focusIndicator = (indicatorId: string) =>
    onViewChange({ ...view, tab: "indicators", focusIndicatorId: indicatorId });

  return (
    <div className="space-y-6">
      <section>
        <MixBar
          ariaLabel={t("rating.legendAria", { count: model.totals.targets })}
          height="h-4"
          segments={NR7_STATUS_ORDER.map((s) => ({
            key: s,
            label: statusLabels[s],
            count: model.totals.byStatus[s],
            color: NR7_COLORS[s],
          }))}
        />
      </section>

      {model.signals.length > 0 && (
        <section className="border-l border-line-strong pl-3" data-tour="nr7-signals">
          <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">{t("closerLook.heading")}</p>
          <p className="text-caption text-[var(--undp-gray)] leading-relaxed mb-2">{t("closerLook.lead")}</p>
          <ul className="space-y-1.5">
            {model.signals.map((s, i) => (
              <li key={`${s.rule}-${s.targetId ?? s.indicatorId ?? i}`}>
                <button
                  type="button"
                  onClick={() => (s.targetId ? expand(s.targetId) : s.indicatorId ? focusIndicator(s.indicatorId) : undefined)}
                  className="text-left text-data text-[var(--undp-black)] leading-snug hover:underline"
                >
                  <SignalLine signal={s} />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-[var(--undp-gray)]">{t("closerLook.caption")}</p>
        </section>
      )}

      <section>
        <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">
          {t("targets.heading", { count: model.totals.targets })}
        </p>
        <ul>
          {model.targets.map((row) => (
            <Nr7TargetRow
              key={row.targetId}
              row={row}
              expanded={view.expandedTargetId === row.targetId}
              onToggle={() => expand(row.targetId)}
              indicatorsById={indicatorsById}
              onFocusIndicator={focusIndicator}
              onOpenNbsap={row.nbsapTargetId && canOpenNbsap(row.nbsapTargetId) ? () => onOpenNbsap(row.nbsapTargetId!) : undefined}
              onOpenPair={canOpenPair(row.targetId) ? () => onOpenPair(row.targetId) : undefined}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
