"use client";

/**
 * FullPicture — everything below the review visual, folded closed, for the
 * report on screen: coverage by document (the dot-map) for the climate report;
 * for the biodiversity one the pairs that repeat across the rows (the
 * flagged pairs turned round by counterpart), the rating-vs-evidence
 * cross-checks (when the policy-link rows lead the slide) and all NR7
 * indicators. Each is a details/summary block. The national targets themselves are the
 * policy-link rows above (each opens to its full report entry), so a link
 * to a national target from down here asks the rows to open it
 * (`requestRow` in `useNr7FullPicture`); an indicator chip in a row opens
 * the indicators fold at that card (`focusIndicator`).
 */

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import type { ActionPlanAlignmentSummary, ImplementationCoverage } from "@/lib/implementation-coherence";
import { IndicatorsView, type Nr7PairRef, type Nr7ReportModel } from "../../nr7-report";
import { CoverageByDocument } from "./coverage-by-document";
import { Nr7CrossChecks } from "./nr7-cross-checks";
import { Nr7RecurringCounterparts } from "./nr7-recurring-counterparts";
import type { ImplementationReport } from "./report-toggle";
import type { BiodiversityReviewGroup, Nr7RecurringGroup } from "./review-groups";
import type { CountryConfig } from "@/types";

/** A request from below the rows (a cross-check, an indicator card) to open
 *  one policy-link row, with or without its full report entry. The rows
 *  consume it and clear it. */
export interface Nr7RowRequest {
  targetId: string;
  detail: boolean;
}

export interface Nr7FullPictureState {
  coverageOpen: boolean;
  recurringOpen: boolean;
  crossChecksOpen: boolean;
  nr7IndicatorsOpen: boolean;
  focusIndicatorId: string | null;
  rowRequest: Nr7RowRequest | null;
  setCoverageOpen: (open: boolean) => void;
  setRecurringOpen: (open: boolean) => void;
  setCrossChecksOpen: (open: boolean) => void;
  setNr7IndicatorsOpen: (open: boolean) => void;
  /** Ask the policy-link rows to open this national target. */
  requestRow: (targetId: string, detail: boolean) => void;
  clearRowRequest: () => void;
  /** Open the NR7 indicators section scrolled to this card. */
  focusIndicator: (indicatorId: string) => void;
}

export function useNr7FullPicture(): Nr7FullPictureState {
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [crossChecksOpen, setCrossChecksOpen] = useState(false);
  const [nr7IndicatorsOpen, setNr7IndicatorsOpen] = useState(false);
  const [focusIndicatorId, setFocusIndicatorId] = useState<string | null>(null);
  const [rowRequest, setRowRequest] = useState<Nr7RowRequest | null>(null);
  const requestRow = useCallback((targetId: string, detail: boolean) => setRowRequest({ targetId, detail }), []);
  const clearRowRequest = useCallback(() => setRowRequest(null), []);
  const focusIndicator = useCallback((id: string) => {
    setNr7IndicatorsOpen(true);
    setFocusIndicatorId(id);
  }, []);
  return {
    coverageOpen, recurringOpen, crossChecksOpen, nr7IndicatorsOpen, focusIndicatorId, rowRequest,
    setCoverageOpen, setRecurringOpen, setCrossChecksOpen, setNr7IndicatorsOpen, requestRow, clearRowRequest, focusIndicator,
  };
}

export function FullPictureSection({
  id,
  tour,
  open,
  onOpenChange,
  label,
  count,
  children,
}: {
  id: string;
  tour: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  count: string;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      data-tour={tour}
      className="group"
      open={open}
      onToggle={(e) => onOpenChange((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none flex flex-wrap items-baseline gap-x-2 py-2">
        <span aria-hidden="true" className="inline-block text-[var(--undp-gray)] transition-transform group-open:rotate-90">
          ›
        </span>
        <span className="text-data font-medium text-[var(--undp-black)]">{label}</span>
        <span className="text-caption text-[var(--undp-gray)] tabular-nums">{count}</span>
      </summary>
      <div className="pb-4 pl-4">{children}</div>
    </details>
  );
}

export function FullPicture({
  report,
  state,
  coverage,
  summary,
  nr7Status,
  nr7Report,
  nr7PairTargets,
  crossChecks = null,
  recurring = null,
  visibleTargetIds,
  countryConfig,
  onOpenActionPair,
  onOpenTarget,
  onOpenRowDetail,
  onSelectRow,
}: {
  /** Which report is on screen; each section belongs to one of them. */
  report: ImplementationReport;
  state: Nr7FullPictureState;
  coverage: ImplementationCoverage;
  summary: ActionPlanAlignmentSummary;
  nr7Status: Map<string, string>;
  nr7Report: Nr7ReportModel | null;
  nr7PairTargets: Map<string, Nr7PairRef>;
  /** The rating-vs-evidence cross-checks, folded here when the policy-link
   *  rows lead the slide; null when they are the slide's visual instead. */
  crossChecks?: BiodiversityReviewGroup | null;
  /** The flagged pairs turned round by counterpart; null when none repeats
   *  or the rows are not on the slide. */
  recurring?: Nr7RecurringGroup | null;
  visibleTargetIds: ReadonlySet<string>;
  countryConfig: CountryConfig | null;
  onOpenActionPair: (actionId: string, targetId: string) => void;
  onOpenTarget: (targetId: string) => void;
  /** Open a national target's policy-link row with its full entry; absent
   *  when the rows are not on the slide (the links then render as text). */
  onOpenRowDetail?: (targetId: string) => void;
  /** Open a national target's policy-link row (without its full entry). */
  onSelectRow?: (targetId: string) => void;
}) {
  const t = useTranslations("briefing.implementation.fullPicture");
  return (
    <div data-tour="full-picture" className="divide-y divide-line-soft">
      {report === "btr" && coverage.hasMeasureAlignment && (
        <FullPictureSection
          id="full-picture-coverage"
          tour="full-picture-coverage"
          open={state.coverageOpen}
          onOpenChange={state.setCoverageOpen}
          label={t("coverage.summary")}
          count={t("coverage.count", { reached: coverage.reached, total: coverage.total })}
        >
          <CoverageByDocument
            coverage={coverage}
            summary={summary}
            nr7Status={nr7Status}
            countryConfig={countryConfig}
            onOpenActionPair={onOpenActionPair}
          />
        </FullPictureSection>
      )}
      {report === "nr7" && recurring && (
        <FullPictureSection
          id="full-picture-nr7-recurring"
          tour="full-picture-nr7-recurring"
          open={state.recurringOpen}
          onOpenChange={state.setRecurringOpen}
          label={t("nr7Recurring.summary")}
          count={t("nr7Recurring.count", { count: recurring.total })}
        >
          <Nr7RecurringCounterparts group={recurring} countryConfig={countryConfig} visibleTargetIds={visibleTargetIds} onOpenTarget={onOpenTarget} onSelectRow={onSelectRow} />
        </FullPictureSection>
      )}
      {report === "nr7" && nr7Report && crossChecks && crossChecks.total > 0 && (
        <FullPictureSection
          id="full-picture-nr7-cross-checks"
          tour="full-picture-nr7-cross-checks"
          open={state.crossChecksOpen}
          onOpenChange={state.setCrossChecksOpen}
          label={t("nr7CrossChecks.summary")}
          count={t("nr7CrossChecks.count", { count: crossChecks.total })}
        >
          <Nr7CrossChecks
            group={crossChecks}
            model={nr7Report}
            nr7PairTargets={nr7PairTargets}
            visibleTargetIds={visibleTargetIds}
            onOpenActionPair={onOpenActionPair}
            onOpenTarget={onOpenTarget}
            onFocusNr7Target={onOpenRowDetail}
            onFocusNr7Indicator={state.focusIndicator}
            folded
          />
        </FullPictureSection>
      )}
      {report === "nr7" && nr7Report && (
        <FullPictureSection
          id="full-picture-nr7-indicators"
          tour="full-picture-nr7-indicators"
          open={state.nr7IndicatorsOpen}
          onOpenChange={state.setNr7IndicatorsOpen}
          label={t("nr7Indicators.summary")}
          count={t("nr7Indicators.count", { withValues: nr7Report.totals.indicatorsWithValues, total: nr7Report.totals.indicators })}
        >
          <IndicatorsView model={nr7Report} focusIndicatorId={state.focusIndicatorId} onOpenTarget={onOpenRowDetail} />
        </FullPictureSection>
      )}
    </div>
  );
}
