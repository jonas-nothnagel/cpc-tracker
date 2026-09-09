"use client";

/** The one control on the slide: which self-report is on screen. Pills as on
 *  the Sectors slide; blue marks the current selection. */

import { useTranslations } from "next-intl";

export type ImplementationReport = "btr" | "nr7";

export function ReportToggle({
  report,
  onChange,
}: {
  report: ImplementationReport;
  onChange: (report: ImplementationReport) => void;
}) {
  const t = useTranslations("briefing.implementation.toggle");
  const options: { id: ImplementationReport; label: string }[] = [
    { id: "btr", label: t("climate") },
    { id: "nr7", label: t("biodiversity") },
  ];
  return (
    <div role="group" aria-label={t("aria")} className="flex flex-wrap items-center gap-1.5" data-tour="report-toggle">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={report === o.id}
          className={`text-caption px-2.5 py-1 rounded-full border transition-colors ${
            report === o.id
              ? "bg-[var(--undp-blue)] text-white border-[var(--undp-blue)]"
              : "border-gray-300 text-[var(--undp-gray)] hover:text-[var(--undp-black)] hover:border-gray-400"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
