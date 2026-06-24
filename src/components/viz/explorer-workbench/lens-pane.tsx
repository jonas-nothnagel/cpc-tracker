"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { getDocColor, getDocFriendlyName, getDocFullLabel } from "@/lib/utils";
import {
  formatBudgetValue,
  type CategoryBudgetSummary,
} from "@/lib/coherence-budget";
import type { CountryConfig } from "@/types";

type GroupMode = "document" | "sector" | "globe";
type AlignFilter =
  | "all"
  | "high_medium"
  | "high_contra"
  | "high"
  | "contradictions";
type ViewMode = "coherence" | "finance";
type ScaleMode = "targets" | "spend";

const EYEBROW =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--undp-gray)]";

/**
 * Floating left "lens" pane for the Explorer B workbench. Carries the
 * Coherence / Finance view switch (which maps onto the existing budget
 * overlay), the group-by control, a contextual block (alignment filter in
 * Coherence; tagged-spend tiles in Finance), and the toggleable document
 * legend. Purely presentational: it reads its labels from the explorer i18n
 * namespace and drives the parent's existing state through the handlers.
 */
export function LensPane({
  view,
  onViewChange,
  showViewSwitch,
  groupMode,
  onGroupChange,
  filter,
  onFilter,
  budgetSummary,
  budgetScale,
  onBudgetScaleChange,
  availableDocs,
  hiddenDocs,
  onToggleDoc,
  countryConfig,
  targetSearch,
}: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  showViewSwitch: boolean;
  groupMode: GroupMode;
  onGroupChange: (mode: GroupMode) => void;
  filter: AlignFilter;
  onFilter: (filter: AlignFilter) => void;
  budgetSummary: CategoryBudgetSummary | null;
  budgetScale: ScaleMode;
  onBudgetScaleChange: (scale: ScaleMode) => void;
  availableDocs: string[];
  hiddenDocs: Set<string>;
  onToggleDoc: (doc: string) => void;
  countryConfig: CountryConfig | null | undefined;
  targetSearch?: ReactNode;
}) {
  const t = useTranslations("explorer");
  const shown = availableDocs.filter((d) => !hiddenDocs.has(d)).length;
  const fundedCount =
    budgetSummary?.entries.filter((e) => e.totalBudget > 0).length ?? 0;

  const seg =
    "flex-1 whitespace-nowrap rounded-md py-1.5 text-[11.5px] font-medium transition-colors";

  return (
    <div className="rounded-xl border border-gray-200/80 bg-white/95 p-4 shadow-[0_6px_24px_rgba(0,0,0,0.06)] backdrop-blur">
      {showViewSwitch && (
        <>
          <div className={`${EYEBROW} mb-2`}>{t("workbench.viewLabel")}</div>
          <div className="mb-4 flex w-full gap-1 rounded-full border border-gray-300 p-[3px]">
            <button
              type="button"
              onClick={() => onViewChange("coherence")}
              aria-pressed={view === "coherence"}
              className={`flex-1 whitespace-nowrap rounded-full py-1.5 text-[12.5px] font-medium transition-colors ${
                view === "coherence"
                  ? "bg-[var(--undp-black)] text-white"
                  : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
              }`}
            >
              {t("workbench.viewCoherence")}
            </button>
            <button
              type="button"
              onClick={() => onViewChange("finance")}
              aria-pressed={view === "finance"}
              className={`flex-1 whitespace-nowrap rounded-full py-1.5 text-[12.5px] font-medium transition-colors ${
                view === "finance"
                  ? "bg-[#0e7490] text-white"
                  : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
              }`}
            >
              {t("workbench.viewFinance")}
            </button>
          </div>
          <div className="-mx-4 mb-4 h-px bg-gray-100" />
        </>
      )}

      {/* Group by */}
      <div className={`${EYEBROW} mb-2`}>{t("workbench.groupByLabel")}</div>
      <div className="mb-4 flex w-full gap-1 rounded-lg border border-gray-300 p-[2px]">
        {(
          [
            ["document", t("controls.groupDocuments")],
            ["globe", t("controls.groupGlobe")],
            ["sector", t("workbench.groupSectors")],
          ] as [GroupMode, string][]
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onGroupChange(mode)}
            aria-pressed={groupMode === mode}
            className={`${seg} ${
              groupMode === mode
                ? "bg-[var(--undp-black)] text-white"
                : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Contextual block: Coherence shows the alignment filter; Finance shows
          the tagged-spend summary tiles. */}
      {view === "coherence" || !budgetSummary ? (
        <div className="mb-4">
          <div className={`${EYEBROW} mb-2`}>{t("workbench.showLabel")}</div>
          <select
            value={filter}
            onChange={(e) => onFilter(e.target.value as AlignFilter)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[11.5px] text-[var(--undp-black)] focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]/20"
          >
            <option value="high_contra">{t("controls.filterHighContra")}</option>
            <option value="high">{t("controls.filterHigh")}</option>
            <option value="contradictions">
              {t("controls.filterContradictions")}
            </option>
          </select>
        </div>
      ) : (
        <div className="mb-4">
          <div className={`${EYEBROW} mb-2`}>
            {t("workbench.finance.budgetLabel")}
          </div>
          <div className="mb-2 rounded-lg border border-gray-300 px-3 py-2 text-[11.5px] text-[var(--undp-black)]">
            {t("workbench.finance.periodLabel", {
              start: budgetSummary.period.start,
              end: budgetSummary.period.end,
            })}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg border border-gray-200 bg-[var(--undp-paper-alt,#fbfaf7)] px-2.5 py-2">
              <div className="text-[15px] font-semibold tabular-nums text-[#0e7490]">
                {formatBudgetValue(
                  budgetSummary.totalBudget,
                  budgetSummary.currency,
                )}
              </div>
              <div className="mt-0.5 text-[8.5px] uppercase tracking-[0.1em] text-[var(--undp-gray)]">
                {t("workbench.finance.tileTaggedSpend")}
              </div>
            </div>
            <div className="flex-1 rounded-lg border border-gray-200 bg-[var(--undp-paper-alt,#fbfaf7)] px-2.5 py-2">
              <div className="text-[15px] font-semibold tabular-nums text-[#0e7490]">
                {t("workbench.finance.tileFundedValue", {
                  funded: fundedCount,
                  total: budgetSummary.entries.length,
                })}
              </div>
              <div className="mt-0.5 text-[8.5px] uppercase tracking-[0.1em] text-[var(--undp-gray)]">
                {t("workbench.finance.tileFundedCategories")}
              </div>
            </div>
          </div>
          {/* Arc-scaling toggle: size wedges by target count or by spend.
              Only on the GLOBE lens, where per-category spend is defined. */}
          {groupMode === "globe" && (
            <div className="mt-3">
              <div className={`${EYEBROW} mb-2`}>
                {t("workbench.finance.scaleLabel")}
              </div>
              <div className="flex w-full gap-1 rounded-lg border border-gray-300 p-[2px]">
                {(
                  [
                    ["targets", t("workbench.finance.scaleByTargets")],
                    ["spend", t("workbench.finance.scaleBySpend")],
                  ] as [ScaleMode, string][]
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onBudgetScaleChange(mode)}
                    aria-pressed={budgetScale === mode}
                    className={`${seg} ${
                      budgetScale === mode
                        ? "bg-[#0e7490] text-white"
                        : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Documents legend — toggleable. */}
      <div className="mb-2 flex items-center justify-between">
        <span className={EYEBROW}>{t("workbench.documentsLabel")}</span>
        <span className="text-[9.5px] text-[var(--undp-gray)]">
          {t("workbench.documentsShown", {
            shown,
            total: availableDocs.length,
          })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
        {availableDocs.map((doc) => {
          const active = !hiddenDocs.has(doc);
          const color = getDocColor(countryConfig, doc);
          return (
            <button
              key={doc}
              type="button"
              onClick={() => onToggleDoc(doc)}
              title={getDocFullLabel(countryConfig, doc)}
              className={`flex items-center gap-1.5 text-left text-[11.5px] transition-colors ${
                active
                  ? "text-[var(--undp-black)]"
                  : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={
                  active
                    ? { backgroundColor: color }
                    : {
                        backgroundColor: "transparent",
                        border: `1.5px solid ${color}66`,
                      }
                }
              />
              <span className="truncate">
                {getDocFriendlyName(countryConfig, doc)}
              </span>
            </button>
          );
        })}
      </div>

      {targetSearch && <div className="mt-4">{targetSearch}</div>}
    </div>
  );
}
