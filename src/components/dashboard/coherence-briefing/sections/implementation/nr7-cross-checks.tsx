"use client";

/**
 * Nr7CrossChecks — the biodiversity report's takeaways as rows: the national
 * target, the country's own rating as a chip, and the evidence that disagrees
 * with it as a small glyph with a short label (an answer-mix bar, a
 * sparkline, a reach bar, or a value count). A row opens inline to the
 * report's own evidence and links onward. Words carry every colour.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkline } from "@/components/ui/sparkline";
import { useNr7BadgeLabels } from "@/lib/labels";
import { IndicatorCard, NR7_COLORS, QuestionnaireTable, type Nr7PairRef, type Nr7ReportModel } from "../../nr7-report";
import { ANSWER_COLORS, ANSWER_ORDER, NR7_SERIES_COLOR } from "../../nr7-report/nr7-colors";
import type { BiodiversityReviewGroup, Nr7Evidence, Nr7ReviewItem } from "./review-groups";

const fmt = (n: number | null) => (n === null ? "" : n.toLocaleString(undefined, { maximumFractionDigits: 3 }));

function shortText(text: string, max = 44): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 20 ? cut.slice(0, space) : cut).replace(/[,.;:]$/, "")}…`;
}

export interface Nr7CrossChecksProps {
  group: BiodiversityReviewGroup;
  model: Nr7ReportModel;
  nr7PairTargets: Map<string, Nr7PairRef>;
  visibleTargetIds: ReadonlySet<string>;
  onOpenActionPair: (actionId: string, targetId: string) => void;
  onOpenTarget: (targetId: string) => void;
  onFocusNr7Target: (targetId: string) => void;
  onFocusNr7Indicator: (indicatorId: string) => void;
}

export function Nr7CrossChecks(props: Nr7CrossChecksProps) {
  const { group } = props;
  const t = useTranslations("briefing.implementation");
  const [showAll, setShowAll] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  if (group.total === 0) return null;
  const rows = showAll ? group.items : group.top;
  return (
    <div data-tour="review-visual">
      <ol className="border-b border-line-soft">
        {rows.map((item, i) => {
          const key = `${item.signal.rule}-${item.signal.targetId ?? item.signal.indicatorId}`;
          return (
            <CrossCheckRow
              key={key}
              item={item}
              expanded={expandedKey === key}
              onToggle={() => setExpandedKey((cur) => (cur === key ? null : key))}
              first={i === 0}
              {...props}
            />
          );
        })}
      </ol>
      {group.hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums"
        >
          {showAll ? t("showFewer") : t("showAll", { count: group.total })}
        </button>
      )}
    </div>
  );
}

function EvidenceGlyph({ evidence }: { evidence: Nr7Evidence | null }) {
  const t = useTranslations("briefing.implementation.biodiversity.evidence");
  const tDir = useTranslations("briefing.nr7Report.indicators.direction");
  if (!evidence) return null;
  switch (evidence.kind) {
    case "answers": {
      const total = evidence.mix.answered || 1;
      return (
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="inline-flex w-16 h-1.5 rounded-sm overflow-hidden bg-gray-100 shrink-0" aria-hidden="true">
            {ANSWER_ORDER.map((k) => (
              <span key={k} style={{ width: `${(evidence.mix[k] / total) * 100}%`, backgroundColor: ANSWER_COLORS[k] }} />
            ))}
          </span>
          <span className="truncate">{t("answers", { notInPlace: evidence.notInPlace, answered: evidence.answered })}</span>
        </span>
      );
    }
    case "series":
      return (
        <span className="inline-flex items-center gap-2 min-w-0">
          <Sparkline data={evidence.points} color={NR7_SERIES_COLOR} width={64} height={18} title={tDir(evidence.direction)} />
          <span className="truncate">
            {evidence.direction === "flat"
              ? t("flat", { from: evidence.from })
              : t("falling", { first: fmt(evidence.first), last: fmt(evidence.last), unit: evidence.unit })}
          </span>
        </span>
      );
    case "values":
      return <span className="truncate">{t("values", { count: evidence.count })}</span>;
    case "reach": {
      const width = evidence.max > 0 ? Math.max(6, (evidence.count / evidence.max) * 100) : 0;
      return (
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="inline-block w-16 h-1.5 rounded-sm overflow-hidden bg-gray-100 shrink-0" aria-hidden="true">
            <span className="block h-full" style={{ width: `${width}%`, backgroundColor: "var(--undp-gray)" }} />
          </span>
          <span className="truncate">{t("reach", { count: evidence.count })}</span>
        </span>
      );
    }
  }
}

type EvidenceT = ReturnType<typeof useTranslations<"briefing.implementation.biodiversity.evidence">>;

function evidenceText(evidence: Nr7Evidence | null, t: EvidenceT): string {
  if (!evidence) return "";
  switch (evidence.kind) {
    case "answers": return t("answers", { notInPlace: evidence.notInPlace, answered: evidence.answered });
    case "series": return evidence.direction === "flat" ? t("flat", { from: evidence.from }) : t("falling", { first: fmt(evidence.first), last: fmt(evidence.last), unit: evidence.unit });
    case "values": return t("values", { count: evidence.count });
    case "reach": return t("reach", { count: evidence.count });
  }
}

function CrossCheckRow({
  item,
  expanded,
  onToggle,
  first,
  nr7PairTargets,
  visibleTargetIds,
  onOpenActionPair,
  onOpenTarget,
  onFocusNr7Target,
  onFocusNr7Indicator,
}: { item: Nr7ReviewItem; expanded: boolean; onToggle: () => void; first: boolean } & Omit<Nr7CrossChecksProps, "group" | "model">) {
  const t = useTranslations("briefing.implementation");
  const tEv = useTranslations("briefing.implementation.biodiversity.evidence");
  const tNr7 = useTranslations("briefing.nr7Report");
  const ratingLabels = useNr7BadgeLabels();
  const { signal, row, indicator, evidence } = item;
  const bodyId = `cross-check-${signal.rule}-${signal.targetId ?? signal.indicatorId}`;
  const pair = row ? nr7PairTargets.get(row.targetId) : undefined;
  const subject = row ? `${row.number} · ${shortText(row.targetText)}` : indicator ? indicator.title : "";
  const rating = row ? ratingLabels[row.status] : "";

  return (
    <li className="border-t border-line-soft">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={t("biodiversity.row.aria", { target: subject, rating, evidence: evidenceText(evidence, tEv) })}
        data-tour={first ? "review-row" : undefined}
        className="w-full text-left grid grid-cols-[minmax(0,12rem)_6.5rem_1fr] items-center gap-3 px-1 py-2 rounded hover:bg-black/[0.03] text-caption"
      >
        {/* Once the row is open the subject is stated in full below, so the
            truncated face copy steps back to grey (colour transition only). */}
        <span
          className={`text-data leading-snug truncate transition-colors duration-150 ${expanded ? "text-[var(--undp-gray)]" : "text-[var(--undp-black)]"}`}
          title={row?.targetText ?? indicator?.title}
        >
          {subject}
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {row ? (
            <>
              <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: NR7_COLORS[row.status] }} />
              <span className="font-medium" style={{ color: NR7_COLORS[row.status] }}>{rating}</span>
            </>
          ) : (
            <span className="text-[var(--undp-gray)]">{indicator ? t("row.nr7.sharedAcross", { count: indicator.targetIds.length }) : ""}</span>
          )}
        </span>
        <span className="text-[var(--undp-black)] min-w-0">
          <EvidenceGlyph evidence={evidence} />
        </span>
      </button>
      {expanded && (
        <div id={bodyId} className="pb-4 pl-1 pr-1 space-y-3 disclosure-enter">
          {/* The face truncates the target; the open row leads with it in
              full, in the same title style the indicator card uses for its
              own heading (indicator rows get that card, so no line here). */}
          {row && (
            <p className="text-data text-[var(--undp-black)] font-medium leading-snug max-w-prose" data-testid="cross-check-subject">
              {row.targetText.replace(/\s+/g, " ").trim()}
            </p>
          )}
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
            <p className="text-caption text-[var(--undp-black)]">{tNr7("targets.row.reach", { count: row.policyReach, n: row.nbsapNumber })}</p>
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
