"use client";

/**
 * ReviewGroups — what needs a look, first. Two groups, one per self-report:
 *
 *   Climate report (BTR): reported actions that may pull against policy
 *   targets, most flagged pairs first. A row expands inline to the commitments
 *   it may pull against, each with the AI's rationale under a labelled
 *   heading, and the pair drawer is one click further.
 *
 *   Biodiversity report (NR7): the cross-checks between the country's own
 *   rating, questionnaire answers and indicators. A row expands inline to the
 *   report's own evidence behind the sentence.
 *
 * Row faces are factual (status words, counts, the report's words). The only
 * hedged text is the NR7 group's caption, an existing review-surface caption.
 * Row geometry follows the Where to Focus hotspot rows; the top five per group
 * show first, "Show all" reveals the rest.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useManageabilityLabels, useNr7BadgeLabels } from "@/lib/labels";
import { FLAGGED_COLOR, getDocColor, getDocMediumLabel } from "@/lib/utils";
import type { StrainedAction } from "@/lib/implementation-coherence";
import {
  IndicatorCard,
  NR7_COLORS,
  QuestionnaireTable,
  SignalLine,
  type Nr7PairRef,
  type Nr7ReportModel,
  type Nr7Signal,
} from "../../nr7-report";
import { statusWord } from "./coverage-by-document";
import type { BiodiversityReviewGroup, ClimateReviewGroup, ReviewGroups as ReviewGroupsModel } from "./review-groups";
import type { CountryConfig } from "@/types";

export interface ReviewGroupsProps {
  groups: ReviewGroupsModel;
  nr7Report: Nr7ReportModel | null;
  nr7PairTargets: Map<string, Nr7PairRef>;
  /** Policy targets currently in the corpus; gates "Open NBSAP target". */
  visibleTargetIds: ReadonlySet<string>;
  countryConfig: CountryConfig | null;
  onOpenActionPair: (actionId: string, targetId: string) => void;
  onOpenTarget: (targetId: string) => void;
  /** Open the folded "NR7 by national target" section at this target. */
  onFocusNr7Target: (targetId: string) => void;
  /** Open the folded "All NR7 indicators" section at this indicator. */
  onFocusNr7Indicator: (indicatorId: string) => void;
}

export function ReviewGroups(props: ReviewGroupsProps) {
  const { groups } = props;
  return (
    <div className="space-y-6" data-tour="review-groups">
      {groups.climate && <ClimateGroup group={groups.climate} {...props} />}
      {groups.biodiversity && props.nr7Report && (
        <BiodiversityGroup group={groups.biodiversity} model={props.nr7Report} {...props} />
      )}
    </div>
  );
}

// ── Group shell ─────────────────────────────────────────────────────────────

function GroupShell({
  heading,
  caption,
  empty,
  total,
  hidden,
  showAll,
  onToggleShowAll,
  children,
}: {
  heading: React.ReactNode;
  caption: React.ReactNode;
  empty: string;
  total: number;
  hidden: number;
  showAll: boolean;
  onToggleShowAll: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("briefing.implementation");
  return (
    <section>
      <h3 className="text-data font-medium text-[var(--undp-black)]">{heading}</h3>
      <p className="mt-0.5 text-caption text-[var(--undp-gray)] leading-relaxed max-w-prose">{caption}</p>
      {total === 0 ? (
        <p className="mt-2 text-caption text-[var(--undp-gray)]">{empty}</p>
      ) : (
        <>
          <ol className="mt-2 border-b border-line-soft">{children}</ol>
          {hidden > 0 && (
            <button
              type="button"
              onClick={onToggleShowAll}
              className="mt-2 text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums"
            >
              {showAll ? t("showFewer") : t("showAll", { count: total })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Shared face geometry: text left, magnitude or status right, one row = one button. */
function RowFace({
  expanded,
  bodyId,
  onToggle,
  ariaLabel,
  left,
  right,
  tour,
}: {
  expanded: boolean;
  bodyId: string;
  onToggle: () => void;
  ariaLabel: string;
  left: React.ReactNode;
  right: React.ReactNode;
  tour?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={bodyId}
      aria-label={ariaLabel}
      data-tour={tour}
      className="w-full text-left grid grid-cols-[1fr_5.5rem] items-center gap-4 px-1 py-3 rounded hover:bg-black/[0.03]"
    >
      <span className="min-w-0">{left}</span>
      <span className="text-right">{right}</span>
    </button>
  );
}

// ── Climate report (BTR) ────────────────────────────────────────────────────

function ClimateGroup({
  group,
  countryConfig,
  onOpenActionPair,
}: { group: ClimateReviewGroup } & Pick<ReviewGroupsProps, "countryConfig" | "onOpenActionPair">) {
  const t = useTranslations("briefing.implementation");
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rows = showAll ? group.items : group.top;
  return (
    <GroupShell
      heading={t("group.climate.heading")}
      caption={t("group.climate.caption", { flagged: group.total, total: group.totalActions, underWay: group.underWay })}
      empty={t("group.climate.empty")}
      total={group.total}
      hidden={group.hidden}
      showAll={showAll}
      onToggleShowAll={() => setShowAll((v) => !v)}
    >
      {rows.map((action, i) => (
        <ClimateReviewRow
          key={action.actionId}
          action={action}
          maxCount={group.maxCount}
          countryConfig={countryConfig}
          expanded={expandedId === action.actionId}
          onToggle={() => setExpandedId((cur) => (cur === action.actionId ? null : action.actionId))}
          onOpenActionPair={onOpenActionPair}
          first={i === 0}
        />
      ))}
    </GroupShell>
  );
}

function ClimateReviewRow({
  action,
  maxCount,
  countryConfig,
  expanded,
  onToggle,
  onOpenActionPair,
  first,
}: {
  action: StrainedAction;
  maxCount: number;
  countryConfig: CountryConfig | null;
  expanded: boolean;
  onToggle: () => void;
  onOpenActionPair: (actionId: string, targetId: string) => void;
  first: boolean;
}) {
  const t = useTranslations("briefing.implementation");
  const manageability = useManageabilityLabels();
  const status = statusWord(action.status, t);
  const docs = [...new Set(action.commitments.map((c) => getDocMediumLabel(countryConfig, c.doc)))].join(", ");
  const bodyId = `review-climate-${action.actionId}`;
  const fill = maxCount > 0 ? Math.max(6, (action.potentialMisalignmentCount / maxCount) * 100) : 0;
  return (
    <li className="border-t border-line-soft">
      <RowFace
        expanded={expanded}
        bodyId={bodyId}
        onToggle={onToggle}
        ariaLabel={t("row.climate.ariaLabel", { name: action.actionName, status, count: action.potentialMisalignmentCount })}
        tour={first ? "review-row" : undefined}
        left={
          <>
            <span className="block text-caption text-[var(--undp-gray)]">
              {status}
              {action.fundamentalCount > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span style={{ color: FLAGGED_COLOR }}>{t("row.climate.designLevel", { count: action.fundamentalCount })}</span>
                </>
              )}
              {action.actionType === "adaptation" && (
                <>
                  <span aria-hidden="true"> · </span>
                  {t("row.climate.adaptation")}
                </>
              )}
            </span>
            <span className="block text-data text-[var(--undp-black)] leading-snug truncate" title={action.actionName}>
              {action.actionName}
            </span>
            <span className="block text-caption text-[var(--undp-gray)] truncate" title={docs}>
              {t("row.climate.commitments", { count: action.commitments.length, docs })}
            </span>
          </>
        }
        right={
          <>
            <span className="block h-1.5 w-full rounded-full bg-[var(--color-line)] overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full" style={{ width: `${fill}%`, backgroundColor: FLAGGED_COLOR }} />
            </span>
            <span className="mt-1 block text-caption tabular-nums text-[var(--undp-black)]">
              {action.potentialMisalignmentCount} {t("row.climate.pairsSuffix")}
            </span>
          </>
        }
      />
      {expanded && (
        <div id={bodyId} className="pb-4 pl-1 pr-1 space-y-3">
          <ul className="space-y-2.5">
            {action.commitments.map((c) => (
              <li key={c.targetId} className="text-caption">
                <p className="flex flex-wrap items-center gap-x-2 text-[var(--undp-black)]">
                  <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: getDocColor(countryConfig, c.doc) }} />
                  <span className="font-medium">{c.targetLabel}</span>
                  {c.manageability && <span className="text-[var(--undp-gray)]">{manageability[c.manageability]}</span>}
                </p>
                <p className="mt-0.5 text-[var(--undp-gray)] line-clamp-2" title={c.targetText}>{c.targetText}</p>
                {c.rationale && (
                  <p className="mt-1 leading-snug">
                    <span className="block font-medium text-[var(--undp-gray)]">{t("row.climate.rationaleHeading")}</span>
                    <span className="block text-[var(--undp-black)] line-clamp-3" title={c.rationale}>{c.rationale}</span>
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onOpenActionPair(action.actionId, c.targetId)}
                  className="mt-1 text-[var(--undp-blue)] hover:underline"
                >
                  {t("row.climate.openPair")} <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
          {action.institutionLabels.length > 0 && (
            <p className="text-caption text-[var(--undp-gray)]">
              {t("row.climate.namedOn")} <span className="text-[var(--undp-black)]">{action.institutionLabels.join(", ")}</span>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

// ── Biodiversity report (NR7) ───────────────────────────────────────────────

function BiodiversityGroup({
  group,
  model,
  ...rest
}: { group: BiodiversityReviewGroup; model: Nr7ReportModel } & ReviewGroupsProps) {
  const t = useTranslations("briefing.implementation");
  const tNr7 = useTranslations("briefing.nr7Report.closerLook");
  const [showAll, setShowAll] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const rows = showAll ? group.items : group.top;
  return (
    <GroupShell
      heading={t("group.biodiversity.heading")}
      caption={
        <>
          {tNr7("lead")} {tNr7("caption")}
        </>
      }
      empty={t("group.biodiversity.empty")}
      total={group.total}
      hidden={group.hidden}
      showAll={showAll}
      onToggleShowAll={() => setShowAll((v) => !v)}
    >
      {rows.map(({ signal }) => {
        const key = `${signal.rule}-${signal.targetId ?? signal.indicatorId}`;
        return (
          <Nr7ReviewRow
            key={key}
            signal={signal}
            model={model}
            expanded={expandedKey === key}
            onToggle={() => setExpandedKey((cur) => (cur === key ? null : key))}
            {...rest}
          />
        );
      })}
    </GroupShell>
  );
}

function Nr7ReviewRow({
  signal,
  model,
  expanded,
  onToggle,
  nr7PairTargets,
  visibleTargetIds,
  onOpenActionPair,
  onOpenTarget,
  onFocusNr7Target,
  onFocusNr7Indicator,
}: {
  signal: Nr7Signal;
  model: Nr7ReportModel;
  expanded: boolean;
  onToggle: () => void;
} & Pick<ReviewGroupsProps, "nr7PairTargets" | "visibleTargetIds" | "onOpenActionPair" | "onOpenTarget" | "onFocusNr7Target" | "onFocusNr7Indicator">) {
  const t = useTranslations("briefing.implementation");
  const tNr7 = useTranslations("briefing.nr7Report");
  const ratingLabels = useNr7BadgeLabels();
  const row = signal.targetId ? model.targets.find((r) => r.targetId === signal.targetId) : undefined;
  const indicator = signal.indicatorId ? model.indicators.find((i) => i.id === signal.indicatorId) : undefined;
  const bodyId = `review-nr7-${signal.rule}-${signal.targetId ?? signal.indicatorId}`;
  const pair = row ? nr7PairTargets.get(row.targetId) : undefined;
  const sentence = <SignalLine signal={signal} />;

  return (
    <li className="border-t border-line-soft">
      <RowFace
        expanded={expanded}
        bodyId={bodyId}
        onToggle={onToggle}
        ariaLabel={String(signal.params.text ?? signal.params.indicator ?? signal.rule)}
        left={
          // The sentence names its own target or indicator; no caption above it.
          <span className="block text-data text-[var(--undp-black)] leading-snug line-clamp-2">{sentence}</span>
        }
        right={
          row ? (
            <span className="text-caption font-medium" style={{ color: NR7_COLORS[row.status] }}>
              {ratingLabels[row.status]}
            </span>
          ) : indicator ? (
            <span className="text-caption text-[var(--undp-gray)] tabular-nums">
              {t("row.nr7.sharedAcross", { count: indicator.targetIds.length })}
            </span>
          ) : null
        }
      />
      {expanded && (
        <div id={bodyId} className="pb-4 pl-1 pr-1 space-y-3">
          {signal.rule === "ratingVsAnswers" && row && (
            <div>
              <p className="text-caption font-medium text-[var(--undp-gray)] mb-1.5">
                {t("row.nr7.evidence.answers", { notInPlace: row.notInPlace.length, answered: row.answers.answered })}
              </p>
              <QuestionnaireTable scale={row.notInPlace} other={[]} />
            </div>
          )}
          {(signal.rule === "flatWhileOnTrack" || signal.rule === "unknownWithData" || signal.rule === "sharedIndicatorDeclining") && indicator && (
            <>
              <IndicatorCard indicator={indicator} />
              {signal.rule === "flatWhileOnTrack" && (
                <p className="text-caption text-[var(--undp-gray)] leading-snug">{tNr7("targets.expand.vsNarrative")}</p>
              )}
            </>
          )}
          {signal.rule === "reachWhileNoChange" && row && row.nbsapNumber !== null && row.policyReach !== null && (
            <p className="text-caption text-[var(--undp-black)]">
              {tNr7("targets.row.reach", { count: row.policyReach, n: row.nbsapNumber })}
            </p>
          )}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
            {row && (
              <button type="button" onClick={() => onFocusNr7Target(row.targetId)} className="text-[var(--undp-blue)] hover:underline">
                {t("row.nr7.seeTarget")} <span aria-hidden="true">›</span>
              </button>
            )}
            {!row && indicator && (
              <button type="button" onClick={() => onFocusNr7Indicator(indicator.id)} className="text-[var(--undp-blue)] hover:underline">
                {t("row.nr7.seeIndicator")} <span aria-hidden="true">›</span>
              </button>
            )}
            {row?.nbsapTargetId && row.nbsapNumber !== null && visibleTargetIds.has(row.nbsapTargetId) && (
              <button type="button" onClick={() => onOpenTarget(row.nbsapTargetId!)} className="text-[var(--undp-blue)] hover:underline">
                {tNr7("targets.expand.openNbsap", { n: row.nbsapNumber })} <span aria-hidden="true">›</span>
              </button>
            )}
            {pair && (
              <button type="button" onClick={() => onOpenActionPair(pair.actionId, pair.nbsapId)} className="text-[var(--undp-blue)] hover:underline">
                {tNr7("targets.expand.openPair")} <span aria-hidden="true">›</span>
              </button>
            )}
          </p>
        </div>
      )}
    </li>
  );
}
