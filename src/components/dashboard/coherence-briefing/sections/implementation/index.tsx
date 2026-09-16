"use client";

/**
 * Implementation — the Level 3 slide, one report at a time.
 *
 * FRAMING (hard rule): the self-reported lens (the BTR, plus the NR7 where the
 * country has one), never "the implementation picture". The footer names what
 * is in the snapshot and what is not yet.
 *
 * Order of the slide (decided with the product owner, 2026-09-09):
 *   1. The headline is the finding for the report on screen, with its
 *      denominator, one sentence; the body says what was found in two plain
 *      sentences; a "Where to start" block says what to do with the visual
 *      below, one line. All templated from the data. No LLM anywhere on this
 *      slide. The biodiversity view carries ONE caveat, under its rows
 *      (the climate view keeps its own under "Where to start").
 *   2. One control: which report (./report-toggle.tsx), only when both exist,
 *      as tabs above the headline (the headline is about the chosen report).
 *   3. The takeaways as a visual: ranked two-tone bars for the climate report
 *      (./climate-strain-chart.tsx); for the biodiversity report every
 *      national target, the ones rated behind schedule first, ranked by their
 *      links to other plans, one line each, five at a time
 *      (./nr7-policy-link-rows.tsx, decided 2026-09-11 and 2026-09-15), or, when no target behind
 *      schedule has a link, the rating-versus-evidence rows
 *      (./nr7-cross-checks.tsx); all ranked by ./review-groups.ts, rows open
 *      inline.
 *   4. The full picture folds closed below for that report only
 *      (./full-picture.tsx; the cross-checks fold here when the policy-link
 *      rows lead), then the source and not-yet-included captions.
 *
 * Right column (DeliveryRoster): who is named on the BTR actions; the host
 * shows it only while the climate report is on screen.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SlideFrame } from "../../slide-frame";
import { TourButton } from "../../tour/tour-button";
import { getDocFullLabel, getDocMediumLabel } from "@/lib/utils";
import {
  nr7StatusByNbsapTarget,
  type ActionPlanAlignmentSummary,
  type ImplementationCoverage,
} from "@/lib/implementation-coherence";
import type { Nr7PairRef, Nr7ReportModel } from "../../nr7-report";
import type { Nr7Status } from "../../nr7-report/nr7-self-report";
import { buildReviewGroups, POLICY_LINK_STATUSES, type BiodiversityReviewGroup, type ClimateReviewGroup } from "./review-groups";
import { ReportToggle, type ImplementationReport } from "./report-toggle";
import { ClimateStrainChart } from "./climate-strain-chart";
import { Nr7CrossChecks } from "./nr7-cross-checks";
import { Nr7PolicyLinkRows } from "./nr7-policy-link-rows";
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
  focusedNr7TargetId,
  onFocusNr7Target,
}: {
  coverage: ImplementationCoverage;
  summary: ActionPlanAlignmentSummary;
  nr7Data: Nr7Data | null;
  /** The open policy-link row, when the host owns it so its sticky column
   *  can show that target's links. */
  focusedNr7TargetId?: string | null;
  onFocusNr7Target?: (targetId: string | null) => void;
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

  // The policy-link rows lead the biodiversity view; the cross-checks fold
  // below them. Without a linked target behind schedule (no policy
  // alignment, or none visible) the cross-checks are the view, as before.
  const policyLinks = groups.biodiversity?.policyLinks ?? null;
  const sentence =
    shown === "nr7" && groups.biodiversity
      ? biodiversitySentence(groups.biodiversity, nr7Report?.totals ?? null, countryName, countryConfig, t)
      : climateSentence(groups.climate, coverage, countryName, countryConfig, t);
  const footerKey = shown === "nr7" ? "footer.sourcesNr7Only" : hasNr7 ? "footer.sourcesWithNr7" : "footer.sources";

  return (
    <SlideFrame
      id={IMPLEMENTATION_SECTION_ID}
      headline={sentence.headline}
      body={sentence.body}
      reading={sentence.start ? <WhereToStart heading={t("startHeading")} text={sentence.start} caveat={sentence.startCaveat} /> : undefined}
      controlsFirst={showToggle ? <ReportToggle report={shown} onChange={onReportChange!} /> : undefined}
      tourButton={
        showEvidence ? (
          <TourButton tourId="implementationCoverage" scopeId={IMPLEMENTATION_SECTION_ID} labelled />
        ) : undefined
      }
      evidence={
        showEvidence && shown === "btr" && groups.climate ? (
          <ClimateStrainChart group={groups.climate} countryConfig={countryConfig} onOpenActionPair={onOpenActionPair} />
        ) : showEvidence && shown === "nr7" && policyLinks ? (
          <Nr7PolicyLinkRows
            group={policyLinks}
            countryConfig={countryConfig}
            visibleTargetIds={visibleTargetIds}
            onOpenTarget={onOpenTarget}
            onFocusNr7Target={fullPicture.focusTarget}
            selectedId={focusedNr7TargetId}
            onSelect={onFocusNr7Target}
          />
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
              crossChecks={policyLinks ? groups.biodiversity : null}
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
  /** What to do with the visual below and how; absent when there is nothing to open. */
  start?: string;
  startCaveat?: string;
}

/** The slide's one process pointer: how to use the visual, in the same
 *  left-ruled shape as the theme drawer's "AI-suggested starting point". */
function WhereToStart({ heading, text, caveat }: { heading: string; text: string; caveat?: string }) {
  return (
    <section className="flex gap-2.5 border-l border-line-strong pl-3 max-w-prose mb-6" data-tour="where-to-start">
      <span aria-hidden="true" className="mt-px text-body leading-none text-[var(--undp-gray)]">↳</span>
      <div>
        <p className="text-caption font-medium text-[var(--undp-gray)] mb-1.5">{heading}</p>
        <p className="text-data text-[var(--undp-black)] leading-relaxed">{text}</p>
        {caveat && <p className="mt-1.5 text-caption text-[var(--undp-gray)] leading-relaxed">{caveat}</p>}
      </div>
    </section>
  );
}

/** A document named in running text: the full name with its short form in
 *  brackets, so the abbreviation is expanded on first use. A full label's own
 *  bracketed suffix (resolution numbers, years) is dropped for the sentence. */
function docInProse(countryConfig: CountryConfig | null, docId: string): string {
  const medium = getDocMediumLabel(countryConfig, docId);
  const full = getDocFullLabel(countryConfig, docId).replace(/\s*\(.*\)\s*$/, "").trim();
  return full && full !== medium ? `${full} (${medium})` : medium;
}

type T = ReturnType<typeof useTranslations<"briefing.implementation">>;

/** Climate report: headline = flagged actions over all reported actions;
 *  body = how many are under way and which documents the targets sit in;
 *  start = the bars that hold half of the concerns and what opening one shows. */
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
  const docs = group.topDocs.slice(0, 2).map((d) => docInProse(countryConfig, d));
  return {
    headline: t("climate.headline", { actions: group.total, totalActions: group.totalActions, country: countryName }),
    body: t("climate.body", {
      actions: group.total,
      underWay: group.underWay,
      docs: docs.length === 2 ? t("climate.docsPair", { a: docs[0], b: docs[1] }) : docs[0] ?? "",
    }),
    start: t("climate.start", { half: group.actionsToHalf }),
    startCaveat: t("climate.startCaveat"),
  };
}

/** Biodiversity report. With policy-link rows: headline = how many targets
 *  the report rates behind schedule, one number; body = what a row shows,
 *  and the one document most flagged pairs are with (said here once, not
 *  on every row); start = one hedged line on the top row (what the report
 *  says holds it back, then whether the linked plans bear on it). The
 *  caveat is the rows' own single line, not part of the sentence.
 *  Without them (no policy alignment visible): headline = the cross-check
 *  count; body = what the report gives per target and that these are the
 *  places it does not agree; start = open a row, then settle which side is
 *  right. */
export function biodiversitySentence(
  group: BiodiversityReviewGroup,
  totals: { targets: number; byStatus: Record<Nr7Status, number> } | null,
  countryName: string,
  countryConfig: CountryConfig | null,
  t: T,
): Sentence {
  const links = group.policyLinks;
  if (links && totals) {
    const behind = [...POLICY_LINK_STATUSES].reduce((n, s) => n + (totals.byStatus[s] ?? 0), 0);
    return {
      headline: t("biodiversity.policyLinks.headline", { country: countryName, behind, targets: totals.targets }),
      body: links.topFlaggedDoc
        ? t("biodiversity.policyLinks.body", { doc: docInProse(countryConfig, links.topFlaggedDoc.doc) })
        : t("biodiversity.policyLinks.bodyNoFlagged"),
      start: t("biodiversity.policyLinks.start"),
    };
  }
  if (group.total === 0) {
    return { headline: t("biodiversity.headlineNone", { country: countryName }), body: t("biodiversity.startCaveat") };
  }
  return {
    headline: t("biodiversity.headline", { checks: group.total, country: countryName }),
    body: t("biodiversity.body", { targets: totals?.targets ?? 0, checks: group.total }),
    start: t("biodiversity.start"),
    startCaveat: t("biodiversity.startCaveat"),
  };
}
