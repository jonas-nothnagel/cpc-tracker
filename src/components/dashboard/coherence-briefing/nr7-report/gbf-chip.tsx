"use client";

/**
 * GbfChip — the Kunming-Montreal Global Biodiversity Framework (GBF) target
 * the country filed a national target under, as a small chip ("GBF T3").
 * The tooltip expands the abbreviation and carries the CBD's own heading
 * for the target, verbatim from the reporting tool.
 */

import { useTranslations } from "next-intl";
import type { Nr7GbfTargetRef } from "@/types";

/** "T03" -> "3". */
export function gbfNumber(id: string): string {
  const m = /^T0*(\d+)$/.exec(id);
  return m ? m[1] : id;
}

export function GbfChip({ target }: { target: Nr7GbfTargetRef }) {
  const t = useTranslations("briefing.nr7Report.gbf");
  const n = gbfNumber(target.id);
  return (
    <span
      className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-caption tabular-nums text-[var(--undp-gray)] whitespace-nowrap"
      title={t("chipTitle", { n, title: target.title })}
    >
      {t("chip", { n })}
    </span>
  );
}
