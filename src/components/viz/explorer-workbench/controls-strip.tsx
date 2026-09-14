"use client";

import { useTranslations } from "next-intl";
import { getDocColor, getDocFriendlyName, getDocFullLabel } from "@/lib/utils";
import type { CategoryBudgetSummary } from "@/lib/coherence-budget";
import type { CountryConfig } from "@/types";
import { EYEBROW, pillClass, SEGMENT_CLASS } from "./pill";

type GroupMode = "document" | "sector" | "globe" | "gga" | "hr";
type AlignFilter =
  | "all"
  | "high_medium"
  | "high_contra"
  | "high"
  | "contradictions";
type ViewMode = "coherence" | "finance";
type ScaleMode = "targets" | "spend";

// Cycle order for the "Show" control: strong + potential misalignment ->
// potential misalignments only -> strong alignments only.
const FILTER_CYCLE: AlignFilter[] = ["high_contra", "contradictions", "high"];

const OUTLINE_PILL =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-caption text-[var(--undp-black)] transition-colors hover:border-[var(--undp-black)]";
function Divider() {
  return <span aria-hidden="true" className="hidden h-4 w-px bg-line lg:block" />;
}

/**
 * The workbench's controls strip: one wrapping row under the top bar with the
 * group-by segmented control, a contextual group (the cycling alignment filter
 * and, where the grouping leaves targets unplaced, a hide toggle; in Finance,
 * the reporting period and the GLOBE-only arc-scale control), and the
 * grouping-aware legend. Replaces the former left rail so the wheel and the
 * right rail get the full stage width. Purely presentational: labels come from
 * the explorer i18n namespace and every action drives the parent's state.
 *
 * The legend reflects the active grouping. Grouping by documents, each row is a
 * hide toggle (click removes the document; the wheel redistributes, with a
 * floor of two visible). In every grouping, hovering a row traces that group's
 * threads on the wheel via `onPreviewGroup`. The legend is last in the row so
 * it alone wraps onto a second line for document-heavy corpora.
 */
export function ControlsStrip({
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
  /** Legend rows for the non-document groupings (GLOBE / sectors / GGA / HR). */
  categoryLegend: { id: string; label: string; color: string }[];
  hiddenDocs: Set<string>;
  onToggleDoc: (doc: string) => void;
  /** Focus-highlight a group's threads on the wheel while hovered; null clears. */
  onPreviewGroup: (id: string | null) => void;
  countryConfig: CountryConfig | null | undefined;
  /** Whether the data carries any primary GGA (climate-resilience) classification. */
  hasGga?: boolean;
  /** Whether the data carries any primary human rights classification. */
  hasHr?: boolean;
}) {
  const t = useTranslations("explorer");
  const isDocGroup = groupMode === "document";
  const shownDocs = availableDocs.filter((d) => !hiddenDocs.has(d)).length;

  const filterLabels: Record<string, string> = {
    high_contra: t("controls.filterHighContra"),
    contradictions: t("controls.filterContradictions"),
    high: t("controls.filterHigh"),
  };
  const cycleFilter = () => {
    const i = FILTER_CYCLE.indexOf(filter);
    onFilter(FILTER_CYCLE[(i + 1) % FILTER_CYCLE.length] ?? "high_contra");
  };

  const financeMode = view === "finance" && !!budgetSummary;
  // Finance: tagged spend exists for the GLOBE (biodiversity) lens only, so
  // the other groupings are not offered there.
  const groupOptions = (
    financeMode
      ? [["globe", t("controls.groupGlobe"), t("controls.groupGlobeTitle")]]
      : [
          ["document", t("controls.groupDocuments"), t("controls.groupDocumentsTitle")],
          ["globe", t("controls.groupGlobe"), t("controls.groupGlobeTitle")],
          ["sector", t("controls.groupSectors"), t("controls.groupSectorsTitle")],
          ...(hasGga ? [["gga", t("controls.groupGga"), t("controls.groupGgaTitle")]] : []),
          ...(hasHr ? [["hr", t("controls.groupHr"), t("controls.groupHrTitle")]] : []),
        ]
  ) as [GroupMode, string, string][];

  const legendHeading = isDocGroup
    ? t("workbench.documentsLabel")
    : groupMode === "globe"
      ? t("controls.groupGlobe")
      : groupMode === "gga"
        ? t("controls.groupGga")
        : groupMode === "hr"
          ? t("controls.groupHr")
          : t("controls.groupSectors");
  const legendCount = isDocGroup
    ? t("workbench.documentsShown", { shown: shownDocs, total: availableDocs.length })
    : t("workbench.groupsShown", { count: categoryLegend.length });
  const legendHint = isDocGroup
    ? t("workbench.legendHintDocuments")
    : t("workbench.legendHintGroups");

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-5 py-2 sm:px-6">
      {/* Group by */}
      <div className="flex items-center gap-2.5">
        <span className={EYEBROW}>{t("workbench.groupByLabel")}</span>
        <div className={SEGMENT_CLASS} role="group" aria-label={t("workbench.groupByLabel")}>
          {groupOptions.map(([mode, label, title]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onGroupChange(mode)}
              aria-pressed={groupMode === mode}
              title={title}
              className={pillClass(groupMode === mode, "bg-[var(--undp-black)]")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Divider />

      {/* Contextual: Coherence cycles the alignment filter; Finance shows the
          period and the GLOBE-only arc-scale control. */}
      {!financeMode ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className={EYEBROW}>{t("workbench.showLabel")}</span>
          <button type="button" onClick={cycleFilter} className={OUTLINE_PILL}>
            <span>{filterLabels[filter] ?? filterLabels.high_contra}</span>
            <span aria-hidden="true" className="text-[var(--undp-gray)]">
              ⇄
            </span>
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className={EYEBROW}>{t("workbench.finance.budgetLabel")}</span>
          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-caption text-[var(--undp-black)]">
            {t("workbench.finance.periodLabel", {
              start: budgetSummary.period.start,
              end: budgetSummary.period.end,
            })}
          </span>
          {/* Arc-scaling toggle: size wedges by target count or by spend.
              Only on the GLOBE lens, where per-category spend is defined. */}
          {groupMode === "globe" && (
            <>
              <span className={EYEBROW}>{t("workbench.finance.scaleLabel")}</span>
              <div className={SEGMENT_CLASS} role="group" aria-label={t("workbench.finance.scaleLabel")}>
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
                    className={pillClass(budgetScale === mode, "bg-[#0e7490]")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <Divider />

      {/* Legend, last so it alone wraps. Hidden on phones, where the wheel
          needs the height. */}
      <div className="hidden min-w-0 items-center gap-x-3 gap-y-1 sm:flex sm:flex-wrap lg:ml-auto">
        <span className={EYEBROW} title={legendHint}>
          {legendHeading}{" "}
          <span className="font-normal">{legendCount}</span>
          <span className="sr-only"> {legendHint}</span>
        </span>
        {isDocGroup
          ? availableDocs.map((doc) => {
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
                  className={`flex min-w-0 items-center gap-1.5 text-left text-caption transition-colors ${
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
                  <span className="max-w-[10rem] truncate">
                    {getDocFriendlyName(countryConfig, doc)}
                  </span>
                </button>
              );
            })
          : categoryLegend.map((c) => (
              <div
                key={c.id}
                onMouseEnter={() => onPreviewGroup(c.id)}
                onMouseLeave={() => onPreviewGroup(null)}
                className="flex min-w-0 cursor-default items-center gap-1.5 text-left text-caption text-[var(--undp-black)]"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                <span className="max-w-[10rem] truncate">{c.label}</span>
              </div>
            ))}
      </div>
    </div>
  );
}
