"use client";

import { useTranslations } from "next-intl";
import { getDocColor, getDocFriendlyName, getDocFullLabel } from "@/lib/utils";
import {
  formatBudgetValue,
  type CategoryBudgetSummary,
} from "@/lib/coherence-budget";
import type { CountryConfig } from "@/types";

type GroupMode = "document" | "sector" | "globe" | "gga" | "hr";
type AlignFilter =
  | "all"
  | "high_medium"
  | "high_contra"
  | "high"
  | "contradictions";
type ViewMode = "coherence" | "finance";
type ScaleMode = "targets" | "spend";

// House label grammar (redesign 4792fa7): plain sentence-case captions, no
// uppercase-tracked eyebrows. The design handoff specified tracked all-caps
// labels, but that predates the institutional type system; house grammar wins.
const EYEBROW = "text-caption font-medium text-[var(--undp-gray)]";

// Cycle order for the "Show" control, mirroring the handoff: strong + potential
// misalignment → potential misalignments only → strong alignments only.
const FILTER_CYCLE: AlignFilter[] = ["high_contra", "contradictions", "high"];

/**
 * Left "lens" rail for the Explorer flagship workbench. It carries the
 * group-by control, a contextual block (a cycling alignment filter in
 * Coherence; tagged-spend tiles in Finance), and the grouping-aware legend.
 * The Coherence / Finance view switch now lives in the workbench top bar, so
 * it is no longer rendered here. Purely presentational: labels come from the
 * explorer i18n namespace and every action drives the parent's state.
 *
 * The legend reflects the active grouping. Grouping by documents, each row is a
 * hide toggle (click removes the document; the wheel redistributes, with a
 * floor of two visible). In every grouping, hovering a row traces that group's
 * threads on the wheel via `onPreviewGroup`.
 */
export function LensPane({
  view,
  groupMode,
  onGroupChange,
  filter,
  onFilter,
  budgetSummary,
  budgetScale,
  onBudgetScaleChange,
  availableDocs,
  categoryLegend,
  hiddenDocs,
  onToggleDoc,
  onPreviewGroup,
  countryConfig,
  hasGga,
  hasHr,
  canHideUnclassified,
  hideUnclassified,
  onHideUnclassifiedChange,
  unclassifiedCount,
}: {
  view: ViewMode;
  groupMode: GroupMode;
  onGroupChange: (mode: GroupMode) => void;
  filter: AlignFilter;
  onFilter: (filter: AlignFilter) => void;
  budgetSummary: CategoryBudgetSummary | null;
  budgetScale: ScaleMode;
  onBudgetScaleChange: (scale: ScaleMode) => void;
  availableDocs: string[];
  /** Legend rows for the non-document groupings (GLOBE / sectors / GGA). */
  categoryLegend: { id: string; label: string; color: string }[];
  hiddenDocs: Set<string>;
  onToggleDoc: (doc: string) => void;
  /** Focus-highlight a group's threads on the wheel while hovered; null clears. */
  onPreviewGroup: (id: string | null) => void;
  countryConfig: CountryConfig | null | undefined;
  /** Whether the data carries any primary GGA (climate-resilience) classification.
   *  Gates the fourth group-by option so it only appears where it has content. */
  hasGga?: boolean;
  /** Whether the data carries any primary human rights classification. Gates the
   *  human rights group-by option so it only appears where it has content. */
  hasHr?: boolean;
  /** True when the active grouping has targets it could not place in any theme. */
  canHideUnclassified?: boolean;
  hideUnclassified?: boolean;
  onHideUnclassifiedChange?: (next: boolean) => void;
  unclassifiedCount?: number;
}) {
  const t = useTranslations("explorer");
  const isDocGroup = groupMode === "document";
  const shownDocs = availableDocs.filter((d) => !hiddenDocs.has(d)).length;
  const fundedCount =
    budgetSummary?.entries.filter((e) => e.totalBudget > 0).length ?? 0;

  const filterLabels: Record<string, string> = {
    high_contra: t("controls.filterHighContra"),
    contradictions: t("controls.filterContradictions"),
    high: t("controls.filterHigh"),
  };
  const cycleFilter = () => {
    const i = FILTER_CYCLE.indexOf(filter);
    onFilter(FILTER_CYCLE[(i + 1) % FILTER_CYCLE.length] ?? "high_contra");
  };

  const legendHeading = isDocGroup
    ? t("workbench.documentsLabel")
    : groupMode === "globe"
      ? t("controls.groupGlobe")
      : groupMode === "gga"
        ? t("controls.groupGga")
        : t("controls.groupSectors");
  const legendCount = isDocGroup
    ? t("workbench.documentsShown", { shown: shownDocs, total: availableDocs.length })
    : t("workbench.groupsShown", { count: categoryLegend.length });
  const legendHint = isDocGroup
    ? t("workbench.legendHintDocuments")
    : t("workbench.legendHintGroups");

  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      {/* Group by. Two columns, not one segmented row: the plain taxonomy names
          ("Mitigation sectors", "Climate adaptation") overflow a single row at
          rail width. Matches the house control vocabulary. */}
      <div className={`${EYEBROW} mb-2`}>{t("workbench.groupByLabel")}</div>
      <div className="mb-4 grid grid-cols-2 gap-1.5">
        {(
          [
            ["document", t("controls.groupDocuments"), t("controls.groupDocumentsTitle")],
            ["globe", t("controls.groupGlobe"), t("controls.groupGlobeTitle")],
            ["sector", t("controls.groupSectors"), t("controls.groupSectorsTitle")],
            ...(hasGga
              ? [["gga", t("controls.groupGga"), t("controls.groupGgaTitle")] as [GroupMode, string, string]]
              : []),
            ...(hasHr
              ? [["hr", t("controls.groupHr"), t("controls.groupHrTitle")]]
              : []),
          ] as [GroupMode, string, string][]
        ).map(([mode, label, title]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onGroupChange(mode)}
            aria-pressed={groupMode === mode}
            title={title}
            className={`rounded-lg border px-3 py-1.5 text-center text-caption font-medium leading-tight transition-colors ${
              groupMode === mode
                ? "border-[var(--undp-black)] bg-[var(--undp-black)] text-white"
                : "border-line-strong bg-white text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {canHideUnclassified && onHideUnclassifiedChange && (
        <label className="mb-4 -mt-2 flex items-center gap-2 text-caption text-[var(--undp-gray)] cursor-pointer">
          <input
            type="checkbox"
            checked={hideUnclassified ?? false}
            onChange={(e) => onHideUnclassifiedChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--undp-blue)] cursor-pointer"
          />
          {t("controls.hideUnclassified", { count: unclassifiedCount ?? 0 })}
        </label>
      )}

      {/* Contextual block: Coherence cycles the alignment filter; Finance shows
          the tagged-spend summary tiles. */}
      {view === "coherence" || !budgetSummary ? (
        <div className="mb-4">
          <div className={`${EYEBROW} mb-2`}>{t("workbench.showLabel")}</div>
          <button
            type="button"
            onClick={cycleFilter}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-line-strong bg-white px-3 py-2 text-left text-caption text-[var(--undp-black)] transition-colors hover:border-[var(--undp-black)]"
          >
            <span className="min-w-0">
              {filterLabels[filter] ?? filterLabels.high_contra}
            </span>
            <span aria-hidden="true" className="shrink-0 text-[var(--undp-gray)]">
              ⇄
            </span>
          </button>
        </div>
      ) : (
        <div className="mb-4">
          <div className={`${EYEBROW} mb-2`}>
            {t("workbench.finance.budgetLabel")}
          </div>
          <div className="mb-2 rounded-lg border border-line-strong px-3 py-2 text-caption text-[var(--undp-black)]">
            {t("workbench.finance.periodLabel", {
              start: budgetSummary.period.start,
              end: budgetSummary.period.end,
            })}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg border border-line bg-[var(--undp-light)] px-2.5 py-2">
              <div className="text-body font-semibold tabular-nums text-[#0e7490]">
                {formatBudgetValue(
                  budgetSummary.totalBudget,
                  budgetSummary.currency,
                )}
              </div>
              <div className={`${EYEBROW} mt-1`}>
                {t("workbench.finance.tileTaggedSpend")}
              </div>
            </div>
            <div className="flex-1 rounded-lg border border-line bg-[var(--undp-light)] px-2.5 py-2">
              <div className="text-body font-semibold tabular-nums text-[#0e7490]">
                {t("workbench.finance.tileFundedValue", {
                  funded: fundedCount,
                  total: budgetSummary.entries.length,
                })}
              </div>
              <div className={`${EYEBROW} mt-1`}>
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
              <div className="flex w-full gap-0.5 rounded-lg border border-line-strong p-0.5">
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
                    className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-caption font-medium transition-colors ${
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

      <div className="mb-3 h-px bg-line" />

      {/* Legend — reflects the active grouping. */}
      <div className="mb-2 flex items-center justify-between">
        <span className={EYEBROW}>{legendHeading}</span>
        <span className="text-caption text-[var(--undp-gray)]">
          {legendCount}
        </span>
      </div>

      {isDocGroup ? (
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
          {availableDocs.map((doc) => {
            const active = !hiddenDocs.has(doc);
            const color = getDocColor(countryConfig, doc);
            return (
              <button
                key={doc}
                type="button"
                onClick={() => onToggleDoc(doc)}
                onMouseEnter={() => active && onPreviewGroup(doc)}
                onMouseLeave={() => onPreviewGroup(null)}
                title={getDocFullLabel(countryConfig, doc)}
                className={`flex items-center gap-1.5 text-left text-caption transition-colors ${
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
      ) : (
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
          {categoryLegend.map((c) => (
            <div
              key={c.id}
              onMouseEnter={() => onPreviewGroup(c.id)}
              onMouseLeave={() => onPreviewGroup(null)}
              className="flex cursor-default items-center gap-1.5 text-left text-caption text-[var(--undp-black)]"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="truncate">{c.label}</span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-caption leading-relaxed text-[var(--undp-gray)]">
        {legendHint}
      </p>
    </div>
  );
}
