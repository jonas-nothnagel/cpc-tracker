"use client";

/**
 * Implementation — the Level 3 slide, one report at a time.
 *
 * FRAMING (hard rule): the self-reported lens (the BTR, plus the NR7 where the
 * country has one), never "the implementation picture". The footer names what
 * is in the snapshot and what is not yet.
 *
 * Order of the slide (decided with the product owner, 2026-09-09):
 *   1. The headline is the finding for the report on screen; the body is the
 *      takeaways in one or two sentences, templated from the data, ending
 *      with the caveat. No LLM anywhere on this slide.
 *   2. One control: which report (./report-toggle.tsx), only when both exist.
 *   3. The takeaways as a visual: ranked two-tone bars for the climate report
 *      (./climate-strain-chart.tsx), rating-versus-evidence rows for the
 *      biodiversity report (./nr7-cross-checks.tsx); both ranked by
 *      ./review-groups.ts, top five first, rows open inline.
 *   4. The full picture folds closed below for that report only
 *      (./full-picture.tsx), then the source and not-yet-included captions.
 *
 * Right column (DeliveryRoster): who is named on the BTR actions; the host
 * shows it only while the climate report is on screen.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SlideFrame } from "../../slide-frame";
import { ReadingLine, glossaryTags } from "@/components/ui/glossary";
import { TourButton } from "../../tour/tour-button";
import { getDocMediumLabel } from "@/lib/utils";
import {
  nr7StatusByNbsapTarget,
  type ActionPlanAlignmentSummary,
  type ImplementationCoverage,
} from "@/lib/implementation-coherence";
import type { Nr7PairRef, Nr7ReportModel } from "../../nr7-report";
import { buildReviewGroups, type BiodiversityReviewGroup, type ClimateReviewGroup } from "./review-groups";
import { ReportToggle, type ImplementationReport } from "./report-toggle";
import { ClimateStrainChart } from "./climate-strain-chart";
import { Nr7CrossChecks } from "./nr7-cross-checks";
import { FullPicture, useNr7FullPicture } from "./full-picture";
import type { CountryConfig, Nr7Data } from "@/types";

export const IMPLEMENTATION_SECTION_ID = "implementation";
export type { ImplementationReport } from "./report-toggle";

const EMPTY_PAIRS: Map<string, Nr7PairRef> = new Map();
const EMPTY_IDS: ReadonlySet<string> = new Set();

export function ImplementationSection({
  coverage,
  summary,
  nr7Data,
  nr7Report = null,
  nr7PairTargets = EMPTY_PAIRS,
  visibleTargetIds = EMPTY_IDS,
  report,
  onReportChange,
  countryName,
  countryConfig,
  onOpenActionPair,
  onOpenTarget,
}: {
  coverage: ImplementationCoverage;
  summary: ActionPlanAlignmentSummary;
  nr7Data: Nr7Data | null;
  /** The NR7 self-report model (nr7-report/); null without an NR7. */
  nr7Report?: Nr7ReportModel | null;
  /** Which national targets can open a reported-action pair. */
  nr7PairTargets?: Map<string, Nr7PairRef>;
  /** Policy targets currently in the corpus; gates "Open NBSAP target". */
  visibleTargetIds?: ReadonlySet<string>;
  /** The report on screen. The host owns it (the centerpiece follows it). */
  report: ImplementationReport;
  onReportChange?: (report: ImplementationReport) => void;
  countryName: string;
  countryConfig: CountryConfig | null;
  onOpenActionPair: (actionId: string, targetId: string) => void;
  onOpenTarget: (targetId: string) => void;
}) {
  const t = useTranslations("briefing.implementation");
  const groups = useMemo(
    () => buildReviewGroups({ summary, nr7Report, btrActions: coverage.btrActions }),
    [summary, nr7Report, coverage.btrActions],
  );
  const fullPicture = useNr7FullPicture();
  const nr7Status = useMemo(
    () => nr7StatusByNbsapTarget(nr7Data?.progressItems ?? []),
    [nr7Data],
  );

  const hasBtr = coverage.btrActions > 0;
  const hasNr7 = nr7Report !== null;
  const showToggle = hasBtr && hasNr7 && Boolean(onReportChange);
  // Never show a report the country does not have, whatever the host asked for.
  const shown: ImplementationReport = report === "nr7" && hasNr7 ? "nr7" : hasBtr ? "btr" : hasNr7 ? "nr7" : "btr";
  const showEvidence = shown === "btr" ? coverage.hasMeasureAlignment : hasNr7;

  const sentence =
    shown === "nr7" && groups.biodiversity
      ? biodiversitySentence(groups.biodiversity, countryName, t)
      : climateSentence(groups.climate, coverage, countryName, countryConfig, t);
  const footerKey = shown === "nr7" ? "footer.sourcesNr7Only" : hasNr7 ? "footer.sourcesWithNr7" : "footer.sources";

  return (
    <SlideFrame
      id={IMPLEMENTATION_SECTION_ID}
      headline={sentence.headline}
      body={sentence.body}
      reading={<ReadingLine>{t.rich(shown === "nr7" ? "readingNr7" : "reading", glossaryTags())}</ReadingLine>}
      controls={showToggle ? <ReportToggle report={shown} onChange={onReportChange!} /> : undefined}
      tourButton={
        showEvidence ? (
          <TourButton tourId="implementationCoverage" scopeId={IMPLEMENTATION_SECTION_ID} labelled />
        ) : undefined
      }
      evidence={
        showEvidence && shown === "btr" && groups.climate ? (
          <ClimateStrainChart group={groups.climate} countryConfig={countryConfig} onOpenActionPair={onOpenActionPair} />
        ) : showEvidence && shown === "nr7" && groups.biodiversity && nr7Report ? (
          <Nr7CrossChecks
            group={groups.biodiversity}
            model={nr7Report}
            nr7PairTargets={nr7PairTargets}
            visibleTargetIds={visibleTargetIds}
            onOpenActionPair={onOpenActionPair}
            onOpenTarget={onOpenTarget}
            onFocusNr7Target={fullPicture.focusTarget}
            onFocusNr7Indicator={fullPicture.focusIndicator}
          />
        ) : undefined
      }
      disclosure={
        <div className="space-y-4">
          {showEvidence && (
            <FullPicture
              report={shown}
              state={fullPicture}
              coverage={coverage}
              summary={summary}
              nr7Status={nr7Status}
              nr7Report={nr7Report}
              nr7PairTargets={nr7PairTargets}
              visibleTargetIds={visibleTargetIds}
              countryConfig={countryConfig}
              onOpenActionPair={onOpenActionPair}
              onOpenTarget={onOpenTarget}
            />
          )}
          <div className="space-y-1.5">
            <p className="text-caption text-[var(--undp-gray)] max-w-prose">
              {t(footerKey, { country: countryName })}
            </p>
            <p className="text-caption text-[var(--undp-gray)] max-w-prose">{t("footer.notIncluded")}</p>
          </div>
        </div>
      }
    />
  );
}

interface Sentence {
  headline: string;
  body: string;
}

type T = ReturnType<typeof useTranslations<"briefing.implementation">>;

/** Climate report: headline = the flagged-action count; body = concentration,
 *  status and the documents most flags fall on, then the AI caveat. */
export function climateSentence(
  group: ClimateReviewGroup | null,
  coverage: ImplementationCoverage,
  countryName: string,
  countryConfig: CountryConfig | null,
  t: T,
): Sentence {
  // Action-to-target matching not computed for this corpus (possible on the
  // upload path). Name the report; do not headline a number.
  if (!coverage.hasMeasureAlignment) {
    return {
      headline: t("headline.noCoverage", { country: countryName, count: coverage.totalActions }),
      body: t("body.noCoverage"),
    };
  }
  if (!group || group.total === 0) {
    return {
      headline: t("climate.headlineNone"),
      body: t("climate.bodyNone", { reached: coverage.reached, total: coverage.total, outsideReach: coverage.outsideReach }),
    };
  }
  const docs = group.topDocs.slice(0, 2).map((d) => getDocMediumLabel(countryConfig, d));
  return {
    headline: t("climate.headline", { actions: group.total, commitments: group.flaggedCommitments }),
    body: t("climate.body", {
      half: group.actionsToHalf,
      underWay: group.underWay,
      docs: docs.length === 2 ? t("climate.docsPair", { a: docs[0], b: docs[1] }) : docs[0] ?? "",
    }),
  };
}

/** Biodiversity report: headline = the cross-check count; body = one clause
 *  per rule present (at most three), then the computed-not-written caveat. */
export function biodiversitySentence(group: BiodiversityReviewGroup, countryName: string, t: T): Sentence {
  if (group.total === 0) {
    return { headline: t("biodiversity.headlineNone", { country: countryName }), body: t("biodiversity.caveat") };
  }
  const clauses = group.fragments.map((f) => t(`frag.${f.rule}`, f.params));
  const joined = clauses.join(t("biodiversity.join"));
  const body = joined ? `${joined.charAt(0).toUpperCase()}${joined.slice(1)}. ${t("biodiversity.caveat")}` : t("biodiversity.caveat");
  return { headline: t("biodiversity.headline", { checks: group.total, country: countryName }), body };
}
