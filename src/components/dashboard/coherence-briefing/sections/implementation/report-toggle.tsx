"use client";

/** The one control on the slide: which self-report is on screen. Two tabs
 *  above the headline (the headline is about the report chosen here, so the
 *  choice comes first); the current one is marked by a blue underline, the
 *  darker weight and `aria-pressed`, never by colour alone. */

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
    <div role="group" aria-label={t("aria")} className="flex flex-wrap items-end gap-x-5 border-b border-line" data-tour="report-toggle">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={report === o.id}
          className={`-mb-px pb-2 pt-1 text-data border-b-2 transition-colors ${
            report === o.id
              ? "border-[var(--undp-blue)] text-[var(--undp-black)] font-medium"
              : "border-transparent text-[var(--undp-gray)] hover:text-[var(--undp-black)] hover:border-gray-300"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
