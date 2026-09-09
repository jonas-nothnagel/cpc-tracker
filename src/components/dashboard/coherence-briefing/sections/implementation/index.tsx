"use client";

/**
 * Implementation — the Level 3 slide, findings first.
 *
 * FRAMING (hard rule): the self-reported lens (the BTR, plus the NR7 where the
 * country has one), never "the implementation picture". The footer names what
 * is in the snapshot and what is not yet.
 *
 * Order of the slide (decided with the product owner, 2026-09-09):
 *   1. The headline is the finding: how many reported actions and how many
 *      self-report cross-checks are worth a closer look.
 *   2. The evidence is the two review groups, one per report, top five each
 *      (./review-list.tsx, ranked by ./review-groups.ts). Rows expand inline;
 *      the pair drawer is one click further.
 *   3. The full picture folds closed below: coverage by document (the
 *      dot-map, ./coverage-by-document.tsx), the NR7 by national target and
 *      all NR7 indicators (./full-picture.tsx).
 *
 * Right column (DeliveryRoster): who is named on the reported actions.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SlideFrame } from "../../slide-frame";
import { ReadingLine, glossaryTags } from "@/components/ui/glossary";
import { TourButton } from "../../tour/tour-button";
import {
  nr7StatusByNbsapTarget,
  type ActionPlanAlignmentSummary,
  type ImplementationCoverage,
} from "@/lib/implementation-coherence";
import type { Nr7PairRef, Nr7ReportModel } from "../../nr7-report";
import { buildReviewGroups, type ReviewGroups as ReviewGroupsModel } from "./review-groups";
import { ReviewGroups } from "./review-list";
import { FullPicture, useNr7FullPicture } from "./full-picture";
import type { CountryConfig, Nr7Data } from "@/types";

export const IMPLEMENTATION_SECTION_ID = "implementation";

const EMPTY_PAIRS: Map<string, Nr7PairRef> = new Map();
const EMPTY_IDS: ReadonlySet<string> = new Set();

export function ImplementationSection({
  coverage,
  summary,
  nr7Data,
  nr7Report = null,
  nr7PairTargets = EMPTY_PAIRS,
  visibleTargetIds = EMPTY_IDS,
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
  countryName: string;
  countryConfig: CountryConfig | null;
  onOpenActionPair: (actionId: string, targetId: string) => void;
  onOpenTarget: (targetId: string) => void;
}) {
  const t = useTranslations("briefing.implementation");
  const tNr7 = useTranslations("briefing.nr7Report");
  const groups = useMemo(
    () => buildReviewGroups({ summary, nr7Report, btrActions: coverage.btrActions }),
    [summary, nr7Report, coverage.btrActions],
  );
  const fullPicture = useNr7FullPicture();
  const nr7Status = useMemo(
    () => nr7StatusByNbsapTarget(nr7Data?.progressItems ?? []),
    [nr7Data],
  );

  const usesBtr = coverage.btrActions > 0;
  const usesNr7 = coverage.nr7Actions > 0 || nr7Report !== null;
  const hasNr7 = Boolean(nr7Data && nr7Data.progressItems.length > 0) || usesNr7;
  const readingKey = usesNr7 && usesBtr ? "readingWithNr7" : usesNr7 ? "readingNr7Only" : "reading";
  const footerKey = !usesBtr && hasNr7 ? "footer.sourcesNr7Only" : hasNr7 ? "footer.sourcesWithNr7" : "footer.sources";
  const sentence = composeSentence(coverage, groups, countryName, t);
  const showEvidence = coverage.hasMeasureAlignment || nr7Report !== null;

  return (
    <SlideFrame
      id={IMPLEMENTATION_SECTION_ID}
      headline={sentence.headline}
      body={sentence.body}
      reading={<ReadingLine>{t.rich(readingKey, glossaryTags())}</ReadingLine>}
      tourButton={
        showEvidence ? (
          <TourButton tourId="implementationCoverage" scopeId={IMPLEMENTATION_SECTION_ID} labelled />
        ) : undefined
      }
      evidence={
        showEvidence ? (
          <ReviewGroups
            groups={groups}
            nr7Report={nr7Report}
            nr7PairTargets={nr7PairTargets}
            visibleTargetIds={visibleTargetIds}
            countryConfig={countryConfig}
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
            {nr7Report && (
              <p className="text-caption text-[var(--undp-gray)] max-w-prose">
                {tNr7("sourceNote", { country: countryName })}
              </p>
            )}
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

/** Headline = the review finding; body = the coverage counts of the report(s)
 *  present, ending with the AI caveat. Neither depends on a switch. */
function composeSentence(
  coverage: ImplementationCoverage,
  groups: ReviewGroupsModel,
  countryName: string,
  t: ReturnType<typeof useTranslations<"briefing.implementation">>,
): Sentence {
  // Action-to-target matching not computed for this corpus (possible on the
  // upload path). Name the report; do not headline a number.
  if (!coverage.hasMeasureAlignment) {
    return {
      headline: t("headline.noCoverage", { country: countryName, count: coverage.totalActions }),
      body: t("body.noCoverage"),
    };
  }
  const actions = groups.climate?.total ?? 0;
  const checks = groups.biodiversity?.total ?? 0;
  // Interim until the per-report sentences land: name the sentence by what is flagged.
  const sentenceKey = actions > 0 && checks > 0 ? "reviewBoth" : actions > 0 ? "reviewClimate" : checks > 0 ? "reviewBiodiversity" : "nothingFlagged";
  const headline = t(`headline.${sentenceKey}`, { actions, checks, country: countryName });
  const counts = {
    btrActions: coverage.btrActions,
    nr7Actions: coverage.nr7Actions,
    actions: coverage.btrActions,
    reached: coverage.reached,
    total: coverage.total,
    underWay: coverage.reachedUnderWay,
    outsideReach: coverage.outsideReach,
  };
  const bodyKey =
    coverage.btrActions > 0 && coverage.nr7Actions > 0
      ? "body.reviewBoth"
      : coverage.btrActions > 0
        ? "body.reviewClimate"
        : "body.reviewBiodiversity";
  return { headline, body: t(bodyKey, counts) };
}
