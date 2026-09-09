"use client";

/**
 * Implementation — the Level 3 slide.
 *
 * FRAMING (hard rule): the self-reported lens (BTR, plus NR7 where run),
 * never "the implementation picture". The footer names what is in the
 * snapshot and what is not yet; further sources slot in as they become
 * available. NR7 reported actions render as the same rows as BTR ones; their
 * status word is the country's self-assessment on the parent target (the
 * NR7 has no per-action lifecycle), localised via the NR7 badge labels.
 *
 * Round-4 design contract (non-technical reader first):
 *   - DOTS ARE BINARY. Filled = the target has at least one strongly aligned
 *     reported action; hollow = none in this report. No stage shading, no
 *     ring overlays — one glance, one meaning. Delivery stage lives in the
 *     body copy and in the drill-down rows.
 *   - The counter-current read appears as a small red "to review" count on
 *     the affected documents plus one short insight line; nothing else
 *     competes on the map.
 *   - The drill-down is a clean, priority-sorted list (to review first, then
 *     no action yet, then addressed), one compact row per target. Clicking a
 *     row opens the SAME PairDrawer used across the briefing — full texts and
 *     the AI rationale live there, never as inline paragraph walls.
 *   - NBSAP rows carry the country's own NR7 self-assessment as a small
 *     right-aligned note (contextual, no separate block).
 *
 * Right column (DeliveryRoster): who is named on the reported actions.
 *
 * The coverage dot-map and its rows live in ./coverage-by-document.tsx.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SlideFrame } from "../../slide-frame";
import { ReadingLine, glossaryTags } from "@/components/ui/glossary";
import { TourButton } from "../../tour/tour-button";
import {
  nr7StatusByNbsapTarget,
  type ReportedActionSource,
  type ActionPlanAlignmentSummary,
  type ImplementationCoverage,
} from "@/lib/implementation-coherence";
import { Nr7ReportLine, type Nr7ReportModel } from "../../nr7-report";
import { CoverageByDocument } from "./coverage-by-document";
import type { CountryConfig, Nr7Data } from "@/types";

export const IMPLEMENTATION_SECTION_ID = "implementation";

export function ImplementationSection({
  coverage,
  summary,
  source,
  onSourceChange,
  nr7Data,
  nr7Report = null,
  onOpenNr7Report,
  countryName,
  countryConfig,
  onOpenActionPair,
}: {
  coverage: ImplementationCoverage;
  summary: ActionPlanAlignmentSummary;
  /** Which report(s) the numbers on this slide draw on. */
  source: ReportedActionSource;
  /** Present only when the country has both reports, so a switch makes sense. */
  onSourceChange?: (source: ReportedActionSource) => void;
  nr7Data: Nr7Data | null;
  /** The NR7 self-report model for the line beside the source switch
   *  (nr7-report/); null hides it. */
  nr7Report?: Nr7ReportModel | null;
  onOpenNr7Report?: () => void;
  countryName: string;
  countryConfig: CountryConfig | null;
  onOpenActionPair: (actionId: string, targetId: string) => void;
}) {
  const t = useTranslations("briefing.implementation");

  const sentence = composeSentence(coverage, countryName, t);
  // Which report(s) the reading line and footer should name: what the slide
  // is currently drawing on, not everything the country has.
  const usesBtr = coverage.btrActions > 0;
  const usesNr7 = coverage.nr7Actions > 0;
  const hasNr7 =
    Boolean(nr7Data && nr7Data.progressItems.length > 0) || usesNr7;
  const readingKey = usesNr7 && usesBtr ? "readingWithNr7" : usesNr7 ? "readingNr7Only" : "reading";
  // With a source selected, the footer names that report alone (the NR7
  // self-assessment notes on NBSAP rows stay, with their own tooltip).
  const footerKey =
    source === "nr7"
      ? "footer.sourcesNr7Only"
      : source === "btr" || !hasNr7
        ? "footer.sources"
        : "footer.sourcesWithNr7";
  const nr7Status = useMemo(
    () => nr7StatusByNbsapTarget(nr7Data?.progressItems ?? []),
    [nr7Data],
  );

  return (
    <SlideFrame
      id={IMPLEMENTATION_SECTION_ID}
      headline={sentence.headline}
      body={sentence.body}
      reading={<ReadingLine>{t.rich(readingKey, glossaryTags())}</ReadingLine>}
      tourButton={
        coverage.hasMeasureAlignment ? (
          <TourButton
            tourId="implementationCoverage"
            scopeId={IMPLEMENTATION_SECTION_ID}
            labelled
          />
        ) : undefined
      }
      evidence={
        coverage.hasMeasureAlignment || onSourceChange || nr7Report ? (
          <div>
            {/* The source switch is the one BTR / NR7 separation on the slide;
                the NR7 line beside it is the only NR7 presence on the face. */}
            {(onSourceChange || (nr7Report && onOpenNr7Report)) && (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 mb-3">
                {onSourceChange && (
                  <SourceToggle source={source} onChange={onSourceChange} />
                )}
                {nr7Report && onOpenNr7Report && source !== "btr" && (
                  <Nr7ReportLine model={nr7Report} onOpenNr7Report={onOpenNr7Report} />
                )}
              </div>
            )}
            {coverage.hasMeasureAlignment && (
              <CoverageByDocument
                coverage={coverage}
                summary={summary}
                nr7Status={nr7Status}
                countryConfig={countryConfig}
                onOpenActionPair={onOpenActionPair}
              />
            )}
          </div>
        ) : undefined
      }
      disclosure={
        <div className="space-y-1.5">
          <p className="text-caption text-[var(--undp-gray)] max-w-prose">
            {t(footerKey, { country: countryName })}
          </p>
          <p className="text-caption text-[var(--undp-gray)] max-w-prose">
            {t("footer.notIncluded")}
          </p>
        </div>
      }
    />
  );
}

/** Reader's switch between the two self-reported sources. Pills, like the
 *  roster / flow switch in the centerpiece column; the abbreviations carry
 *  their full names as tooltips. Every number on the slide follows it. */
function SourceToggle({
  source,
  onChange,
}: {
  source: ReportedActionSource;
  onChange: (source: ReportedActionSource) => void;
}) {
  const t = useTranslations("briefing.implementation");
  const options: { value: ReportedActionSource; label: string; title?: string }[] = [
    { value: "both", label: t("source.both") },
    { value: "btr", label: t("source.btr"), title: t("source.btrTitle") },
    { value: "nr7", label: t("source.nr7"), title: t("source.nr7Title") },
  ];
  return (
    <div
      role="group"
      aria-label={t("source.label")}
      className="flex flex-wrap items-center gap-1.5"
      data-tour="coverage-source"
    >
      <span className="text-caption text-[var(--undp-gray)] mr-1">
        {t("source.label")}
      </span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={source === o.value}
          title={o.title}
          className={`text-caption px-2.5 py-0.5 rounded-full border transition-colors ${
            source === o.value
              ? "bg-[var(--undp-blue)] text-white border-[var(--undp-blue)]"
              : "text-[var(--undp-gray)] border-gray-300 hover:text-[var(--undp-black)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface Sentence {
  headline: string;
  body: string;
}

// "most of" / "about half" / "under half of" / "few of" — same share buckets as
// the Financing slide so L2 and L3 headlines read alike. The body carries the
// exact counts plus the delivery stage (the stage is copy, not dot shading).
function coverageWord(
  share: number,
  t: ReturnType<typeof useTranslations<"briefing.implementation">>,
): string {
  if (share >= 0.6) return t("share.most");
  if (share >= 0.4) return t("share.aboutHalf");
  if (share >= 0.2) return t("share.underHalf");
  return t("share.few");
}

function composeSentence(
  coverage: ImplementationCoverage,
  countryName: string,
  t: ReturnType<typeof useTranslations<"briefing.implementation">>,
): Sentence {
  // Action-to-target matching not computed for this corpus (possible on the
  // upload path). Name the report; do not headline a number.
  if (!coverage.hasMeasureAlignment) {
    return {
      headline: t("headline.noCoverage", {
        country: countryName,
        count: coverage.totalActions,
      }),
      body: t("body.noCoverage"),
    };
  }

  const share = coverage.total > 0 ? coverage.reached / coverage.total : 0;
  // Name the report(s) the actions come from: BTR only, both, or NR7 only.
  const bodyKey =
    coverage.nr7Actions === 0
      ? "body.coverage"
      : coverage.btrActions === 0
        ? "body.coverageNr7Only"
        : "body.coverageWithNr7";
  return {
    headline: t("headline.coverage", {
      country: countryName,
      share: coverageWord(share, t),
    }),
    body: t(bodyKey, {
      actions: coverage.totalActions,
      btrActions: coverage.btrActions,
      nr7Actions: coverage.nr7Actions,
      total: coverage.total,
      docCount: coverage.byDocument.length,
      reached: coverage.reached,
      underWay: coverage.reachedUnderWay,
      outsideReach: coverage.outsideReach,
    }),
  };
}
