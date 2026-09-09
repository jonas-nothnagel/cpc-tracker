"use client";

/**
 * Nr7ReportLine — one caption line beside the source switch: the country's
 * self-rating counts, how many cross-checks are worth a closer look, and
 * the link that opens the NR7 drawer. Nothing else about the NR7 sits on
 * the slide face; the drawer carries the detail. Renders nothing without an
 * NR7 model, so countries without the report see the slide exactly as before.
 */

import { useTranslations } from "next-intl";
import { useNr7BadgeLabels } from "@/lib/labels";
import { NR7_COLORS, NR7_STATUS_ORDER } from "./nr7-colors";
import type { Nr7ReportModel } from "./nr7-self-report";

export function Nr7ReportLine({
  model,
  onOpenNr7Report,
}: {
  model: Nr7ReportModel | null;
  onOpenNr7Report: () => void;
}) {
  const t = useTranslations("briefing.nr7Report.line");
  const statusLabels = useNr7BadgeLabels();
  if (!model) return null;
  const signals = model.signals.length;

  return (
    <p
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-[var(--undp-gray)]"
      data-tour="nr7-line"
    >
      <span className="font-medium">{t("prefix")}</span>
      {NR7_STATUS_ORDER.filter((s) => model.totals.byStatus[s] > 0).map((s) => (
        <span key={s} className="whitespace-nowrap">
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-sm align-middle mr-1"
            style={{ backgroundColor: NR7_COLORS[s] }}
          />
          <span className="text-[var(--undp-black)] tabular-nums">{model.totals.byStatus[s]}</span>{" "}
          {statusLabels[s].toLowerCase()}
        </span>
      ))}
      {signals > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onOpenNr7Report}
            className="text-[var(--undp-blue)] hover:underline"
          >
            {t("closerLook", { count: signals })} <span aria-hidden="true">›</span>
          </button>
        </>
      )}
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={onOpenNr7Report}
        className="text-[var(--undp-blue)] hover:underline"
      >
        {t("open")} <span aria-hidden="true">›</span>
      </button>
    </p>
  );
}
