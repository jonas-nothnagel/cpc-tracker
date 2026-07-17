"use client";

/**
 * Implementation — the Level 3 slide.
 *
 * FRAMING (hard rule): the BTR lens, never "the implementation picture". See
 * `feedback_btr_one_lens_framing`. The footer names what is in the snapshot
 * and what is not yet; further sources slot in as they become available.
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
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SlideFrame } from "../slide-frame";
import {
  nr7StatusByNbsapTarget,
  type ActionCoverageDoc,
  type ActionPlanAlignmentSummary,
  type ImplementationCoverage,
  type TargetMisalignmentLink,
} from "@/lib/implementation-coherence";
import { useNr7BadgeLabels } from "@/lib/labels";
import { FLAGGED_COLOR, getDocColor, getDocMediumLabel } from "@/lib/utils";
import type { CountryConfig, Nr7Data } from "@/types";

export const IMPLEMENTATION_SECTION_ID = "implementation";

// Canonical potential-misalignment red (matches the wheel / matrix encoding).
const FLAG_RED = FLAGGED_COLOR;

// Country self-assessment statuses (NR7), the country's own judgement colours.
const NR7_COLORS: Record<string, string> = {
  on_track: "#16a34a",
  limited: "#d97706",
  no_progress: "#dc2626",
  unknown: "#9ca3af",
};

const STATUS_KEYS = ["planned", "adopted", "ongoing", "implemented"];

export function ImplementationSection({
  coverage,
  summary,
  nr7Data,
  countryName,
  countryConfig,
  onOpenActionPair,
}: {
  coverage: ImplementationCoverage;
  summary: ActionPlanAlignmentSummary;
  nr7Data: Nr7Data | null;
  countryName: string;
  countryConfig: CountryConfig | null;
  onOpenActionPair: (actionId: string, targetId: string) => void;
}) {
  const t = useTranslations("briefing.implementation");

  const sentence = composeSentence(coverage, countryName, t);
  const hasNr7 = Boolean(nr7Data && nr7Data.progressItems.length > 0);
  const nr7Status = useMemo(
    () => nr7StatusByNbsapTarget(nr7Data?.progressItems ?? []),
    [nr7Data],
  );

  return (
    <SlideFrame
      id={IMPLEMENTATION_SECTION_ID}
      headline={sentence.headline}
      body={sentence.body}
      evidence={
        coverage.hasMeasureAlignment ? (
          <CoverageByDocument
            coverage={coverage}
            summary={summary}
            nr7Status={nr7Status}
            countryConfig={countryConfig}
            onOpenActionPair={onOpenActionPair}
          />
        ) : undefined
      }
      disclosure={
        <div className="space-y-1.5">
          <p className="text-caption text-[var(--undp-gray)] max-w-prose">
            {hasNr7
              ? t("footer.sourcesWithNr7", { country: countryName })
              : t("footer.sources", { country: countryName })}
          </p>
          <p className="text-caption text-[var(--undp-gray)] max-w-prose">
            {t("footer.notIncluded")}
          </p>
        </div>
      }
    />
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
  return {
    headline: t("headline.coverage", {
      country: countryName,
      share: coverageWord(share, t),
    }),
    body: t("body.coverage", {
      actions: coverage.totalActions,
      total: coverage.total,
      docCount: coverage.byDocument.length,
      reached: coverage.reached,
      underWay: coverage.reachedUnderWay,
      outsideReach: coverage.outsideReach,
    }),
  };
}

function CoverageByDocument({
  coverage,
  summary,
  nr7Status,
  countryConfig,
  onOpenActionPair,
}: {
  coverage: ImplementationCoverage;
  summary: ActionPlanAlignmentSummary;
  nr7Status: Map<string, string>;
  countryConfig: CountryConfig | null;
  onOpenActionPair: (actionId: string, targetId: string) => void;
}) {
  const t = useTranslations("briefing.implementation");
  const hasFlags = summary.totalFlaggedPairs > 0;
  return (
    <div>
      <ul className="space-y-3">
        {coverage.byDocument.map((d) => (
          <DocCoverageRow
            key={d.doc}
            doc={d}
            nr7Status={nr7Status}
            countryConfig={countryConfig}
            onOpenActionPair={onOpenActionPair}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-caption text-[var(--undp-gray)]">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--undp-gray)]"
          />
          {t("legend.matched")}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full border border-[var(--undp-gray)]"
          />
          {t("legend.unmatched")}
        </span>
        {hasFlags && (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block w-3.5 h-[5px] rounded-full"
              style={{ backgroundColor: FLAG_RED }}
            />
            {t("legend.pull")}
          </span>
        )}
      </div>

      {/* The counter-current read: one short insight line; the affected
          documents carry a red "to review" count; the detail sits inside
          each document, top of the list. */}
      {hasFlags && (
        <p className="mt-3 text-data leading-relaxed text-[var(--undp-black)] max-w-prose">
          {t("misalignment.lead", {
            actions: summary.actionsWithPotentialMisalignment,
            commitments: summary.flaggedCommitments,
            underWay: summary.actionsUnderWayWithMisalignment,
          })}
        </p>
      )}

      <p className="mt-3 text-caption text-[var(--undp-gray)] max-w-prose">
        {t("dotMap.disclaimer")}
      </p>
    </div>
  );
}

function DocCoverageRow({
  doc,
  nr7Status,
  countryConfig,
  onOpenActionPair,
}: {
  doc: ActionCoverageDoc;
  nr7Status: Map<string, string>;
  countryConfig: CountryConfig | null;
  onOpenActionPair: (actionId: string, targetId: string) => void;
}) {
  const t = useTranslations("briefing.implementation");
  const label = getDocMediumLabel(countryConfig, doc.doc);
  const color = getDocColor(countryConfig, doc.doc);

  // Priority-sorted drill-down groups: to review first (the reason most
  // people open a document with a red count), then the gap, then the bulk.
  const toReview = useMemo(
    () =>
      [...doc.links, ...doc.uncovered]
        .filter((e) => e.misalignments.length > 0)
        .sort(
          (a, b) =>
            Number(b.misalignments.some((m) => m.actionUnderWay)) -
              Number(a.misalignments.some((m) => m.actionUnderWay)) ||
            a.targetLabel.localeCompare(b.targetLabel, undefined, {
              numeric: true,
            }),
        ),
    [doc.links, doc.uncovered],
  );

  return (
    <li>
      <details className="group">
        <summary className="cursor-pointer list-none">
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                aria-hidden="true"
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-data text-[var(--undp-black)] truncate">
                {label}
              </span>
              <span
                aria-hidden="true"
                className="text-[var(--undp-gray)]/50 text-caption"
              >
                +
              </span>
            </span>
            <span className="text-caption tabular-nums text-[var(--undp-gray)] shrink-0 text-right inline-flex items-baseline gap-1">
              {t.rich("matchedCount", {
                reached: doc.reached,
                total: doc.total,
                strong: (c) => (
                  <span className="text-[var(--undp-black)] font-medium">
                    {c}
                  </span>
                ),
              })}
              {/* The counter-current lane: a small red bar scaled by the
                  SHARE of this document's targets a reported action may pull
                  against, plus the count. Its own lane, so it never reads as
                  a remainder of "addressed". */}
              {doc.flaggedTargets > 0 && (
                <span
                  className="inline-flex items-center gap-1 ml-2"
                  title={t("legend.pull")}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-[5px] rounded-full"
                    style={{
                      width: `${Math.max(4, Math.round((doc.flaggedTargets / doc.total) * 36))}px`,
                      backgroundColor: FLAG_RED,
                    }}
                  />
                  <span style={{ color: FLAG_RED }}>{doc.flaggedTargets}</span>
                </span>
              )}
            </span>
          </div>
          {/* Dot-map: one uniform dot per target. Filled = has a strongly
              aligned reported action; hollow = none. Binary on purpose. */}
          <div className="flex flex-wrap gap-1">
            {doc.links.map((link) => (
              <span
                key={link.targetId}
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: color }}
                title={link.targetLabel}
              />
            ))}
            {doc.uncovered.map((a) => (
              <span
                key={a.targetId}
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-full border"
                style={{ borderColor: color }}
                title={a.targetLabel}
              />
            ))}
          </div>
        </summary>
        <div className="mt-2.5 ml-3.5 space-y-3.5">
          {toReview.length > 0 && (
            <TargetGroup
              heading={t("misalignment.pullHeading")}
              headingColor={FLAG_RED}
              count={toReview.length}
            >
              {toReview.map((e) => (
                <ReviewRow
                  key={e.targetId}
                  targetId={e.targetId}
                  targetLabel={e.targetLabel}
                  targetText={e.targetText}
                  misalignments={e.misalignments}
                  nr7Status={nr7Status}
                  onOpenActionPair={onOpenActionPair}
                />
              ))}
            </TargetGroup>
          )}
          {doc.uncovered.length > 0 && (
            <TargetGroup
              heading={t("unmatchedHeading")}
              count={doc.uncovered.length}
            >
              {doc.uncovered.map((e) => (
                <TargetRow
                  key={e.targetId}
                  marker={
                    <span
                      aria-hidden="true"
                      className="inline-block w-2 h-2 rounded-full border shrink-0"
                      style={{ borderColor: color }}
                    />
                  }
                  label={e.targetLabel}
                  secondary={e.targetText}
                  title={e.targetText}
                  nr7Note={<Nr7Note targetId={e.targetId} nr7Status={nr7Status} />}
                />
              ))}
            </TargetGroup>
          )}
          {doc.links.length > 0 && (
            <TargetGroup
              heading={t("matchedHeading")}
              count={doc.links.length}
            >
              {doc.links.map((e) => (
                <TargetRow
                  key={e.targetId}
                  marker={
                    <span
                      aria-hidden="true"
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                  }
                  label={e.targetLabel}
                  secondary={`${e.actionName} · ${statusWord(e.actionStatus, t)}`}
                  title={e.targetText}
                  nr7Note={<Nr7Note targetId={e.targetId} nr7Status={nr7Status} />}
                  onClick={() => onOpenActionPair(e.actionId, e.targetId)}
                />
              ))}
            </TargetGroup>
          )}
        </div>
      </details>
    </li>
  );
}

/** Country-reported status word; raw string when it is not one of the four
 *  known stages. */
function statusWord(
  status: string,
  t: ReturnType<typeof useTranslations<"briefing.implementation">>,
): string {
  const key = status.trim().toLowerCase();
  return STATUS_KEYS.includes(key)
    ? t(`status.${key as "planned" | "adopted" | "ongoing" | "implemented"}`)
    : status;
}

function TargetGroup({
  heading,
  headingColor,
  count,
  children,
}: {
  heading: string;
  headingColor?: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className="text-caption font-medium mb-1"
        style={{ color: headingColor ?? "var(--undp-gray)" }}
      >
        {heading} <span className="text-[var(--undp-gray)]/60">· {count}</span>
      </p>
      <ul className="max-h-56 overflow-y-auto pr-1 -ml-1.5">{children}</ul>
    </div>
  );
}

/** One compact target row: marker + label + one secondary line, optional NR7
 *  note, click opens the PairDrawer when a pair exists. No inline paragraphs;
 *  the rationale and full texts live in the drawer. */
function TargetRow({
  marker,
  label,
  secondary,
  title,
  nr7Note,
  onClick,
}: {
  marker: React.ReactNode;
  label: string;
  secondary: string;
  title?: string;
  nr7Note?: React.ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="mt-[5px]">{marker}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-data text-[var(--undp-black)] leading-snug truncate">
          {label}
        </span>
        <span className="block text-caption text-[var(--undp-gray)] leading-snug truncate">
          {secondary}
        </span>
      </span>
      {nr7Note}
      {onClick && (
        <span
          aria-hidden="true"
          className="shrink-0 self-center text-[var(--undp-gray)]/50 text-data"
        >
          ›
        </span>
      )}
    </>
  );
  return (
    <li>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          title={title}
          className="w-full text-left flex items-start gap-2 rounded px-1.5 py-1 hover:bg-black/[0.04] cursor-pointer"
        >
          {body}
        </button>
      ) : (
        <div
          title={title}
          className="flex items-start gap-2 px-1.5 py-1"
        >
          {body}
        </div>
      )}
    </li>
  );
}

/** A target a reported action may pull against: same compact row, red marker,
 *  the pulling action as the secondary line. Click opens the flagged pair. */
function ReviewRow({
  targetId,
  targetLabel,
  targetText,
  misalignments,
  nr7Status,
  onOpenActionPair,
}: {
  targetId: string;
  targetLabel: string;
  targetText: string;
  misalignments: TargetMisalignmentLink[];
  nr7Status: Map<string, string>;
  onOpenActionPair: (actionId: string, targetId: string) => void;
}) {
  const t = useTranslations("briefing.implementation");
  const first = misalignments[0];
  const moreCount = misalignments.length - 1;
  const secondary =
    `${first.actionName} · ${statusWord(first.actionStatus, t)}` +
    (moreCount > 0 ? ` · +${moreCount}` : "");
  return (
    <TargetRow
      marker={
        <span
          aria-hidden="true"
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: FLAG_RED }}
        />
      }
      label={targetLabel}
      secondary={secondary}
      title={
        moreCount > 0
          ? `${targetText}\n${misalignments.map((m) => m.actionName).join("\n")}`
          : targetText
      }
      nr7Note={<Nr7Note targetId={targetId} nr7Status={nr7Status} />}
      onClick={() => onOpenActionPair(first.actionId, targetId)}
    />
  );
}

// The country's own NR7 self-assessment as a small right-aligned note on the
// matching NBSAP rows. Contextual; no separate block to decode.
function Nr7Note({
  targetId,
  nr7Status,
}: {
  targetId: string;
  nr7Status: Map<string, string>;
}) {
  const t = useTranslations("briefing.implementation");
  const badgeLabels = useNr7BadgeLabels();
  const status = nr7Status.get(targetId);
  if (!status) return null;
  const color = NR7_COLORS[status] ?? NR7_COLORS.unknown;
  const label = badgeLabels[status as keyof typeof badgeLabels] ?? status;
  return (
    <span
      className="shrink-0 self-center text-caption leading-none"
      style={{ color }}
      title={`${t("nr7.selfAssessment")} ${label}`}
    >
      {t("nr7.short", { status: label })}
    </span>
  );
}
