"use client";

/**
 * Coverage by document — the Implementation slide's full picture: one dot per
 * policy target per document, filled when a strongly aligned reported action
 * exists, hollow when none, with a red "to review" lane for targets a reported
 * action may pull against. Moved verbatim out of the slide file when the slide
 * was restructured to lead with what needs a look; the map now sits in a
 * collapsed section below the review list.
 *
 *   - DOTS ARE BINARY. Filled = the target has at least one strongly aligned
 *     reported action; hollow = none in this report.
 *   - The drill-down is a clean, priority-sorted list (to review first, then
 *     no action yet, then addressed), one compact row per target. Clicking a
 *     row opens the SAME PairDrawer used across the briefing.
 *   - NBSAP rows carry the country's own NR7 self-assessment as a small
 *     right-aligned note (contextual, no separate block).
 */

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import type {
  ActionCoverageDoc,
  ActionPlanAlignmentSummary,
  ImplementationCoverage,
  TargetMisalignmentLink,
} from "@/lib/implementation-coherence";
import { useNr7BadgeLabels } from "@/lib/labels";
import { FLAGGED_COLOR, getDocColor, getDocMediumLabel } from "@/lib/utils";
import type { CountryConfig, ReportedActionType } from "@/types";

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

export function CoverageByDocument({
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

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-caption text-[var(--undp-gray)]"
        data-tour="coverage-legend"
      >
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
          {t(coverage.nr7Actions > 0 ? "misalignment.leadWithNr7" : "misalignment.lead", {
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
  const statusFor = useActionStatusWord();
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
                  data-tour="coverage-review"
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
              aligned reported action; hollow = none. Binary on purpose.
              data-tour: guided-tour anchor, first document's map wins. */}
          <div className="flex flex-wrap gap-1" data-tour="coverage-dots">
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
                  secondary={`${e.actionName} · ${statusFor(e.actionType, e.actionStatus)}`}
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
export function statusWord(
  status: string,
  t: ReturnType<typeof useTranslations<"briefing.implementation">>,
): string {
  const key = status.trim().toLowerCase();
  return STATUS_KEYS.includes(key)
    ? t(`status.${key as "planned" | "adopted" | "ongoing" | "implemented"}`)
    : status;
}

/** The status word for a reported action, by source vocabulary: a BTR
 *  lifecycle stage, or for NR7 the country's self-assessment on the parent
 *  target ("NR7: Limited progress"), so the two never read as one scale. */
export function useActionStatusWord(): (
  actionType: ReportedActionType,
  status: string,
) => string {
  const t = useTranslations("briefing.implementation");
  const nr7Labels = useNr7BadgeLabels();
  return useCallback(
    (actionType, status) => {
      if (actionType === "nr7") {
        const key = status.trim().toLowerCase() as keyof typeof nr7Labels;
        return t("nr7.short", { status: nr7Labels[key] ?? status });
      }
      return statusWord(status, t);
    },
    [t, nr7Labels],
  );
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
  const statusFor = useActionStatusWord();
  const first = misalignments[0];
  const moreCount = misalignments.length - 1;
  const secondary =
    `${first.actionName} · ${statusFor(first.actionType, first.actionStatus)}` +
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
