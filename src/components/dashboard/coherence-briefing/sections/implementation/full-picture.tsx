"use client";

/**
 * FullPicture — everything below the review list, folded closed: coverage by
 * document (the dot-map), the NR7 by national target, and all NR7 indicators.
 * Each is a details/summary block; the review rows can open one at a given
 * target or indicator through `useNr7FullPicture`, and the NR7 sections
 * cross-link the same way (indicator chips in a target row, target chips on an
 * indicator card).
 */

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import type { ActionPlanAlignmentSummary, ImplementationCoverage } from "@/lib/implementation-coherence";
import { IndicatorsView, Nr7TargetsList, type Nr7PairRef, type Nr7ReportModel } from "../../nr7-report";
import { CoverageByDocument } from "./coverage-by-document";
import type { CountryConfig } from "@/types";

export interface Nr7FullPictureState {
  coverageOpen: boolean;
  nr7TargetsOpen: boolean;
  nr7IndicatorsOpen: boolean;
  expandedTargetId: string | null;
  focusIndicatorId: string | null;
  setCoverageOpen: (open: boolean) => void;
  setNr7TargetsOpen: (open: boolean) => void;
  setNr7IndicatorsOpen: (open: boolean) => void;
  toggleTarget: (targetId: string) => void;
  /** Open the NR7 targets section with this target expanded. */
  focusTarget: (targetId: string) => void;
  /** Open the NR7 indicators section scrolled to this card. */
  focusIndicator: (indicatorId: string) => void;
}

export function useNr7FullPicture(): Nr7FullPictureState {
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [nr7TargetsOpen, setNr7TargetsOpen] = useState(false);
  const [nr7IndicatorsOpen, setNr7IndicatorsOpen] = useState(false);
  const [expandedTargetId, setExpandedTargetId] = useState<string | null>(null);
  const [focusIndicatorId, setFocusIndicatorId] = useState<string | null>(null);
  const toggleTarget = useCallback((id: string) => setExpandedTargetId((cur) => (cur === id ? null : id)), []);
  const focusTarget = useCallback((id: string) => {
    setNr7TargetsOpen(true);
    setExpandedTargetId(id);
    setFocusIndicatorId(null);
  }, []);
  const focusIndicator = useCallback((id: string) => {
    setNr7IndicatorsOpen(true);
    setFocusIndicatorId(id);
  }, []);
  return {
    coverageOpen, nr7TargetsOpen, nr7IndicatorsOpen, expandedTargetId, focusIndicatorId,
    setCoverageOpen, setNr7TargetsOpen, setNr7IndicatorsOpen, toggleTarget, focusTarget, focusIndicator,
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
  state,
  coverage,
  summary,
  nr7Status,
  nr7Report,
  nr7PairTargets,
  visibleTargetIds,
  countryConfig,
  onOpenActionPair,
  onOpenTarget,
}: {
  state: Nr7FullPictureState;
  coverage: ImplementationCoverage;
  summary: ActionPlanAlignmentSummary;
  nr7Status: Map<string, string>;
  nr7Report: Nr7ReportModel | null;
  nr7PairTargets: Map<string, Nr7PairRef>;
  visibleTargetIds: ReadonlySet<string>;
  countryConfig: CountryConfig | null;
  onOpenActionPair: (actionId: string, targetId: string) => void;
  onOpenTarget: (targetId: string) => void;
}) {
  const t = useTranslations("briefing.implementation.fullPicture");
  return (
    <div data-tour="full-picture" className="divide-y divide-line-soft">
      {coverage.hasMeasureAlignment && (
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
      {nr7Report && (
        <FullPictureSection
          id="full-picture-nr7-targets"
          tour="full-picture-nr7-targets"
          open={state.nr7TargetsOpen}
          onOpenChange={state.setNr7TargetsOpen}
          label={t("nr7Targets.summary")}
          count={t("nr7Targets.count", { count: nr7Report.totals.targets, onTrack: nr7Report.totals.byStatus.on_track })}
        >
          <Nr7TargetsList
            model={nr7Report}
            expandedTargetId={state.expandedTargetId}
            onToggleTarget={state.toggleTarget}
            onFocusIndicator={state.focusIndicator}
            canOpenNbsap={(id) => visibleTargetIds.has(id)}
            onOpenNbsap={onOpenTarget}
            pairByTarget={nr7PairTargets}
            onOpenPair={onOpenActionPair}
          />
        </FullPictureSection>
      )}
      {nr7Report && (
        <FullPictureSection
          id="full-picture-nr7-indicators"
          tour="full-picture-nr7-indicators"
          open={state.nr7IndicatorsOpen}
          onOpenChange={state.setNr7IndicatorsOpen}
          label={t("nr7Indicators.summary")}
          count={t("nr7Indicators.count", { withValues: nr7Report.totals.indicatorsWithValues, total: nr7Report.totals.indicators })}
        >
          <IndicatorsView model={nr7Report} focusIndicatorId={state.focusIndicatorId} onOpenTarget={state.focusTarget} />
        </FullPictureSection>
      )}
    </div>
  );
}
