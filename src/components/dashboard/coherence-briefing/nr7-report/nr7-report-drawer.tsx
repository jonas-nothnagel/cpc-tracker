"use client";

/**
 * Nr7ReportDrawer — the country's 7th National Report in full: by national
 * target, or every indicator. Chrome (scrim, keys, focus) belongs to
 * DrawerShell; this renders a DrawerHeader with the view switch and a body.
 */

import { useTranslations } from "next-intl";
import { DrawerHeader } from "@/components/ui/drawer-shell";
import { IndicatorsView } from "./indicators-view";
import { TargetsView } from "./targets-view";
import type { Nr7ReportModel } from "./nr7-self-report";
import type { Nr7ReportView } from "./view";

const HEADLINE_SERIF = "var(--font-display)";

export function Nr7ReportDrawer({
  model,
  view,
  onViewChange,
  countryName,
  canOpenNbsap,
  canOpenPair,
  onOpenNbsap,
  onOpenPair,
}: {
  model: Nr7ReportModel;
  view: Nr7ReportView;
  onViewChange: (next: Nr7ReportView) => void;
  countryName: string;
  canOpenNbsap: (nbsapTargetId: string) => boolean;
  canOpenPair: (targetId: string) => boolean;
  onOpenNbsap: (nbsapTargetId: string) => void;
  onOpenPair: (targetId: string) => void;
}) {
  const t = useTranslations("briefing.nr7Report.drawer");
  const tabs: { id: Nr7ReportView["tab"]; label: string }[] = [
    { id: "targets", label: t("view.targets", { count: model.totals.targets }) },
    { id: "indicators", label: t("view.indicators", { count: model.totals.indicators }) },
  ];

  return (
    <>
      <DrawerHeader
        toolbar={
          <div role="group" aria-label={t("viewGroupAria")} className="flex flex-wrap items-center gap-1.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onViewChange({ ...view, tab: tab.id })}
                aria-pressed={view.tab === tab.id}
                className={`text-caption px-2.5 py-0.5 rounded-full border transition-colors ${
                  view.tab === tab.id
                    ? "bg-[var(--undp-blue)] text-white border-[var(--undp-blue)]"
                    : "text-[var(--undp-gray)] border-gray-300 hover:text-[var(--undp-black)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="min-w-0">
          <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">{t("eyebrow")}</p>
          <h3 className="text-xl text-[var(--undp-black)] font-medium leading-snug" style={{ fontFamily: HEADLINE_SERIF }}>
            {t("title", { country: countryName })}
          </h3>
          <p className="mt-1 text-caption text-[var(--undp-gray)]">
            {model.publishedOn ? t("subtitle", { date: model.publishedOn }) : t("subtitleUndated")}
          </p>
        </div>
      </DrawerHeader>

      <div className="px-6 py-6 space-y-6">
        {view.tab === "targets" ? (
          <TargetsView
            model={model}
            view={view}
            onViewChange={onViewChange}
            canOpenNbsap={canOpenNbsap}
            canOpenPair={canOpenPair}
            onOpenNbsap={onOpenNbsap}
            onOpenPair={onOpenPair}
          />
        ) : (
          <IndicatorsView model={model} view={view} onViewChange={onViewChange} />
        )}
        <p className="border-t border-line-soft pt-4 text-caption text-[var(--undp-gray)] leading-relaxed">
          {t("footer", { country: countryName })}
        </p>
      </div>
    </>
  );
}
