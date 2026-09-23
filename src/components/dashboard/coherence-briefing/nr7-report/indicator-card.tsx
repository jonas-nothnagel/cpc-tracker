"use client";

/**
 * IndicatorCard — one NR7 indicator as reported: its series (one sparkline
 * per disaggregation, small multiples when there are several), a single
 * value when that is all there is, or the country's note when no values
 * were reported. Names, units and disaggregations are verbatim from the
 * reporting tool.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkline } from "@/components/ui/sparkline";
import { NR7_SERIES_COLOR } from "./nr7-colors";
import { indicatorLabel, targetNumber, type Nr7IndicatorView, type Nr7SeriesRead } from "./nr7-self-report";
import type { Nr7IndicatorSeries } from "@/types";

const SERIES_SHOWN = 8;

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

export function IndicatorCard({
  indicator,
  focused = false,
  onOpenTarget,
}: {
  indicator: Nr7IndicatorView;
  /** Scrolled to and outlined after a chip click from the targets view. */
  focused?: boolean;
  /** When given, the target chips are buttons that jump to that target. */
  onOpenTarget?: (targetId: string) => void;
}) {
  const t = useTranslations("briefing.nr7Report.indicators");
  const [showAll, setShowAll] = useState(false);
  const series = indicator.series;
  const shown = showAll ? series : series.slice(0, SERIES_SHOWN);
  const hidden = series.length - shown.length;
  const footnotes = [...new Set(series.flatMap((s) => s.points.map((p) => p.footnote)).filter(Boolean))] as string[];

  return (
    <article
      id={`nr7-ind-${indicator.id}`}
      className={`rounded-md border p-3 ${
        focused ? "border-[var(--undp-blue)] ring-1 ring-[var(--undp-blue)]" : "border-line"
      }`}
    >
      <p className="text-data text-[var(--undp-black)] font-medium leading-snug">
        {indicatorLabel(indicator)}
      </p>
      <p className="mt-1 text-caption text-[var(--undp-gray)] flex flex-wrap items-center gap-1">
        {indicator.targetIds.length === 0 ? (
          t("card.noTargets")
        ) : (
          <>
            <span>{t("card.targets")}</span>
            {indicator.targetIds.map((id) =>
              onOpenTarget ? (
                <button
                  key={id}
                  type="button"
                  onClick={() => onOpenTarget(id)}
                  className="rounded border border-gray-300 px-1.5 py-0.5 text-caption text-[var(--undp-blue)] hover:border-[var(--undp-blue)]"
                  aria-label={t("card.targetChipAria", { n: targetNumber(id) })}
                >
                  {id}
                </button>
              ) : (
                <span key={id} className="rounded border border-gray-200 px-1.5 py-0.5 text-caption">
                  {id}
                </span>
              ),
            )}
          </>
        )}
      </p>

      {series.length === 0 ? (
        <div className="mt-2">
          <p className="text-caption text-[var(--undp-gray)]">{t("card.noValues")}</p>
          {indicator.comments && (
            <blockquote className="mt-1.5 border-l border-line-strong pl-3 text-caption text-[var(--undp-black)] leading-relaxed">
              <span className="block font-medium text-[var(--undp-gray)] mb-0.5">{t("card.countryNote")}</span>
              {indicator.comments}
            </blockquote>
          )}
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {shown.map((s, i) => (
            <SeriesRow key={s.disaggregation ?? "__total"} series={s} read={indicator.reads[i]} multiple={series.length > 1} />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-1.5 text-caption text-[var(--undp-blue)] hover:underline"
        >
          {t("card.moreSeries", { count: hidden })}
        </button>
      )}
      {showAll && series.length > SERIES_SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mt-1.5 text-caption text-[var(--undp-blue)] hover:underline"
        >
          {t("card.lessSeries")}
        </button>
      )}
      {footnotes.length > 0 && (
        <p className="mt-2 text-caption text-[var(--undp-gray)] leading-snug">
          <span className="font-medium">{t("card.footnote")} </span>
          {footnotes.join(" ")}
        </p>
      )}
      {series.length > 0 && indicator.comments && (
        <p className="mt-2 text-caption text-[var(--undp-gray)] leading-snug">
          <span className="font-medium">{t("card.countryNote")} </span>
          {indicator.comments}
        </p>
      )}
    </article>
  );
}

function SeriesRow({
  series,
  read,
  multiple,
}: {
  series: Nr7IndicatorSeries;
  read: Nr7SeriesRead | undefined;
  multiple: boolean;
}) {
  const t = useTranslations("briefing.nr7Report.indicators");
  const numeric = series.points.filter((p): p is typeof p & { value: number } => p.value !== null);
  const unit = series.unit ?? "";
  const textOnly = series.points.filter((p) => p.value === null && p.valueText);
  const direction = read?.direction;
  const directionWord =
    direction === "up" || direction === "down" || direction === "flat" ? t(`direction.${direction}`) : null;

  let summary: string;
  if (numeric.length >= 2) {
    const first = numeric[0];
    const last = numeric[numeric.length - 1];
    summary = t("card.range", { first: fmt(first.value), last: fmt(last.value), unit, from: String(first.year), to: String(last.year) });
  } else if (numeric.length === 1) {
    summary = t("card.single", { value: fmt(numeric[0].value), unit, year: String(numeric[0].year) });
  } else if (textOnly.length > 0) {
    summary = t("card.textValue", { value: textOnly[textOnly.length - 1].valueText ?? "", year: String(textOnly[textOnly.length - 1].year) });
  } else {
    summary = t("card.noValues");
  }

  // A lone series gets room to read (the small multiples stay small) and
  // its first and last year printed under the line's ends, so the reader
  // does not have to find them in the text.
  const width = multiple ? 64 : 160;
  const height = multiple ? 18 : 36;
  const years = !multiple && numeric.length >= 2 ? [String(numeric[0].year), String(numeric[numeric.length - 1].year)] : null;
  return (
    <li className="flex items-center gap-2 text-caption">
      {multiple && (
        <span className="w-32 shrink-0 truncate text-[var(--undp-gray)]" title={series.disaggregation ?? ""}>
          {series.disaggregation ?? t("card.total")}
        </span>
      )}
      <span className="inline-flex flex-col shrink-0">
        <Sparkline
          data={numeric.map((p) => ({ year: String(p.year), value: p.value }))}
          color={NR7_SERIES_COLOR}
          width={width}
          height={height}
          title={directionWord ? `${directionWord}: ${summary}` : undefined}
        />
        {years && (
          <span className="flex justify-between text-[10px] leading-none text-[var(--undp-gray)] tabular-nums" style={{ width }} aria-hidden="true">
            <span>{years[0]}</span>
            <span>{years[1]}</span>
          </span>
        )}
      </span>
      <span className="text-[var(--undp-black)] tabular-nums leading-snug">
        {summary}
        {directionWord && <span className="sr-only"> ({directionWord})</span>}
      </span>
    </li>
  );
}
