"use client";

/**
 * Nr7PolicyLinkRows — the biodiversity report's takeaways as rows: every
 * national target in the report, the ones the report itself rates behind
 * schedule first, each block ranked by how many policy targets in OTHER
 * documents the pipeline judged strongly aligned with the NBSAP target it
 * restates. Five rows at first; "Show all N" unfolds the rest and "Show
 * fewer" folds back. A caption marks where the targets not rated behind
 * schedule begin.
 *
 * One line per row: the target (its deadline prefix dropped so the words
 * that tell targets apart show; two lines at most), the country's own
 * rating as a chip, and how many linked pairs are flagged for review
 * ("11 to review", or "none to review"). The document most flagged pairs
 * are with is the slide body's business, said once; a count with no
 * document is the row's.
 *
 * A row opens inline, in this order: what the report itself says holds the
 * target back, in its own words, FIRST (the country's reason leads); one
 * line with the aligned count; the flagged pairs as a plain list, each
 * opening that pair (why it was flagged, with this national target as the
 * context) when the host offers `onOpenPair`, else the counterpart's
 * profile; the GBF target the country filed it under, expanded; the full
 * report entry (questionnaire, indicators, narrative) behind one disclosure;
 * one link to the target in the biodiversity plan. Words carry every colour.
 *
 * The rating and the report's words are the report's; the links are
 * AI-estimated alignment between target texts. The view's one caveat sits
 * under the list; nothing inside a row repeats it. No suggestion is made
 * here: the hedged pointer is the slide's "Where to start" block.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useNr7BadgeLabels } from "@/lib/labels";
import { FLAGGED_COLOR, getDocMediumLabel } from "@/lib/utils";
import { transitionName, withViewTransition } from "@/lib/view-transition";
import { GbfChip, NR7_COLORS, Nr7TargetDetail, stripNr7Deadline, type Nr7PolicyLink, type Nr7ReportModel } from "../../nr7-report";
import type { Nr7RowRequest } from "./full-picture";
import type { Nr7PolicyLinkGroup, Nr7PolicyLinkItem } from "./review-groups";
import type { CountryConfig } from "@/types";

/** Counterpart targets listed in an open row before "+ N more" unfolds the rest. */
export const COUNTERPARTS_SHOWN = 3;

export interface Nr7PolicyLinkRowsProps {
  group: Nr7PolicyLinkGroup;
  /** The report model, for the full entry an open row can unfold. */
  model: Nr7ReportModel;
  countryConfig: CountryConfig | null;
  visibleTargetIds: ReadonlySet<string>;
  onOpenTarget: (targetId: string) => void;
  /** A flagged pair in an open row opens that pair, with the national target
   *  as its context. Absent: the pair's counterpart opens as a target. */
  onOpenPair?: (nationalTargetId: string, counterpartId: string) => void;
  /** A shared-indicator chip in the full entry points at that indicator. */
  onFocusIndicator: (indicatorId: string) => void;
  /** The open row, when the host owns it (its sticky column follows the
   *  selection). Absent: the rows keep their own. */
  selectedId?: string | null;
  onSelect?: (targetId: string | null) => void;
  /** A request from below the rows (a cross-check, an indicator card) to
   *  open one row, unfolding "Show all" when it is hidden, with its full
   *  entry when asked; answered once, then handed back. */
  rowRequest?: Nr7RowRequest | null;
  onRowRequestHandled?: () => void;
}

export function Nr7PolicyLinkRows(props: Nr7PolicyLinkRowsProps) {
  const { group, model, selectedId, onSelect, rowRequest, onRowRequestHandled } = props;
  const t = useTranslations("briefing.implementation");
  const tPl = useTranslations("briefing.implementation.biodiversity.policyLinks");
  const [showAll, setShowAll] = useState(false);
  const [localId, setLocalId] = useState<string | null>(null);
  // Which open row has its full entry unfolded; closes with the row.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const indicatorsById = useMemo(() => new Map(model.indicators.map((i) => [i.id, i])), [model.indicators]);
  const expandedId = selectedId !== undefined ? selectedId : localId;
  const select = (id: string | null) => {
    setLocalId(id);
    setDetailId(null);
    onSelect?.(id);
  };
  useEffect(() => {
    if (!rowRequest) return;
    const { targetId, detail } = rowRequest;
    if (!group.items.some((i) => i.row.targetId === targetId)) {
      onRowRequestHandled?.();
      return;
    }
    if (group.rest.some((i) => i.row.targetId === targetId)) setShowAll(true);
    setLocalId(targetId);
    onSelect?.(targetId);
    setDetailId(detail ? targetId : null);
    setScrollToId(targetId);
    onRowRequestHandled?.();
  }, [rowRequest, group, onSelect, onRowRequestHandled]);
  useEffect(() => {
    if (!scrollToId) return;
    document.getElementById(`policy-link-row-${scrollToId}`)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    setScrollToId(null);
  }, [scrollToId]);
  if (group.total === 0) return null;
  const rows = showAll ? group.items : group.top;
  // The caption sits before the first row not rated behind schedule.
  const restStart = rows.findIndex((item) => !item.behind);
  return (
    <div data-tour="review-visual" data-testid="policy-link-rows">
      <ol className="border-b border-line-soft">
        {rows.map((item, i) => (
          <PolicyLinkRow
            key={item.row.targetId}
            item={item}
            expanded={expandedId === item.row.targetId}
            onToggle={() => withViewTransition(() => select(expandedId === item.row.targetId ? null : item.row.targetId))}
            first={i === 0}
            caption={i === restStart ? tPl("restHeading") : undefined}
            indicatorsById={indicatorsById}
            detailOpen={detailId === item.row.targetId}
            onToggleDetail={() => setDetailId((cur) => (cur === item.row.targetId ? null : item.row.targetId))}
            {...props}
          />
        ))}
      </ol>
      {group.hidden > 0 && (
        <button
          type="button"
          onClick={() => withViewTransition(() => setShowAll((v) => !v))}
          className="mt-2 text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums"
        >
          {showAll ? t("showFewer") : t("showAll", { count: group.total })}
        </button>
      )}
      {/* The view's one caveat: the ratings are the report's, the links are
          AI-estimated. Nowhere else on this view repeats it. */}
      <p className="mt-3 text-caption text-[var(--undp-gray)] max-w-prose leading-relaxed" data-testid="policy-link-caveat">
        {tPl("caveat")}
      </p>
    </div>
  );
}

/** The flagged counterparts as a plain list (the box they sit in already
 *  says what they are), the first few then "+ N more" unfolding the rest
 *  (and folding back). Each opens the pair (the counterpart alone when the
 *  host offers no pair opener). Mounted only while the row is open, so it
 *  starts folded each time. */
function FlaggedList({
  links,
  docLabel,
  visibleTargetIds,
  onOpen,
  moreLabel,
  fewerLabel,
}: {
  links: Nr7PolicyLink[];
  docLabel: (doc: string) => string;
  visibleTargetIds: ReadonlySet<string>;
  onOpen: (counterpartId: string) => void;
  moreLabel: (n: number) => string;
  fewerLabel: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? links : links.slice(0, COUNTERPARTS_SHOWN);
  const more = links.length - shown.length;
  return (
    <ul className="text-caption space-y-1">
      {shown.map((l) => {
        const label = `${docLabel(l.doc)} · ${l.label}`;
        return (
          <li key={l.targetId} className="flex items-start gap-1.5">
            <span aria-hidden="true" className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: FLAGGED_COLOR }} />
            {visibleTargetIds.has(l.targetId) ? (
              <button type="button" onClick={() => onOpen(l.targetId)} title={l.text} className="text-[var(--undp-blue)] hover:underline text-left">
                {label} <span aria-hidden="true">›</span>
              </button>
            ) : (
              <span title={l.text}>{label}</span>
            )}
          </li>
        );
      })}
      {(more > 0 || showAll) && (
        <li>
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums">
            {showAll ? fewerLabel : moreLabel(more)}
          </button>
        </li>
      )}
    </ul>
  );
}

function PolicyLinkRow({
  item,
  expanded,
  onToggle,
  first,
  caption,
  indicatorsById,
  detailOpen,
  onToggleDetail,
  countryConfig,
  visibleTargetIds,
  onOpenTarget,
  onOpenPair,
  onFocusIndicator,
}: {
  item: Nr7PolicyLinkItem;
  expanded: boolean;
  onToggle: () => void;
  first: boolean;
  caption?: string;
  indicatorsById: Map<string, Nr7ReportModel["indicators"][number]>;
  detailOpen: boolean;
  onToggleDetail: () => void;
} & Omit<Nr7PolicyLinkRowsProps, "group" | "model" | "selectedId" | "onSelect" | "rowRequest" | "onRowRequestHandled">) {
  const t = useTranslations("briefing.implementation");
  const tPl = useTranslations("briefing.implementation.biodiversity.policyLinks");
  const tNr7 = useTranslations("briefing.nr7Report");
  const ratingLabels = useNr7BadgeLabels();
  const [readMore, setReadMore] = useState(false);
  const { row, links, evidence } = item;
  const bodyId = `policy-link-${row.targetId}`;
  const fullText = stripNr7Deadline(row.targetText);
  const subject = `${row.number} · ${fullText}`;
  const rating = ratingLabels[row.status];
  const docLabel = (doc: string) => getDocMediumLabel(countryConfig, doc);
  const hasFlags = evidence.flagged > 0;
  const flaggedLabel = hasFlags ? tPl("flaggedFaceCount", { count: evidence.flagged }) : tPl("noneFlagged");
  const name = transitionName("pl", row.targetId);
  const challenges = row.keyChallengesSummary ?? row.progressSummary;
  // The pair needs the NBSAP match to exist; without it (or a pair opener)
  // the counterpart opens on its own.
  const openFlagged = (counterpartId: string) =>
    onOpenPair && row.nbsapTargetId ? onOpenPair(row.targetId, counterpartId) : onOpenTarget(counterpartId);

  return (
    <li id={`policy-link-row-${row.targetId}`} className="border-t border-line-soft" style={{ viewTransitionName: name }}>
      {caption && (
        <p className="pt-3 pb-1 px-1 text-caption font-medium text-[var(--undp-gray)]" data-testid="policy-link-rest-heading">
          {caption}
        </p>
      )}
      {/* One column on a phone (subject, then rating and count on a line);
          three at sm+, the subject taking the room. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={t("biodiversity.row.aria", { target: subject, rating, evidence: flaggedLabel })}
        data-tour={first ? "review-row" : undefined}
        className="w-full text-left grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1 px-1 py-2 rounded hover:bg-black/[0.03] text-caption"
      >
        <span
          className={`text-data text-[var(--undp-black)] leading-snug min-w-0 col-span-2 sm:col-span-1 ${expanded ? "sm:col-span-3 font-medium max-w-prose" : "line-clamp-2"}`}
          style={{ viewTransitionName: `${name}-subject` }}
          title={expanded ? undefined : row.targetText}
          data-testid="policy-link-subject"
        >
          {subject}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 whitespace-nowrap ${expanded ? "sm:col-start-2" : ""}`}
          style={{ viewTransitionName: `${name}-rating` }}
        >
          <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: NR7_COLORS[row.status] }} />
          <span className="font-medium" style={{ color: NR7_COLORS[row.status] }}>{rating}</span>
        </span>
        {/* A mark in the flagged colour, the same for one pair or forty
            (presence, not magnitude), with the count; grey when none. */}
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums justify-self-end sm:justify-self-auto" style={{ viewTransitionName: `${name}-evidence` }} data-testid="policy-link-flagged-face">
          {hasFlags && <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: FLAGGED_COLOR }} data-testid="policy-link-flagged-mark" />}
          <span className={hasFlags ? "font-medium" : "text-[var(--undp-gray)]"} style={hasFlags ? { color: FLAGGED_COLOR } : undefined}>
            {flaggedLabel}
          </span>
        </span>
      </button>
      {expanded && (
        <div id={bodyId} className="pb-4 pl-1 pr-1 space-y-3 disclosure-enter">
          {/* The report's own reason leads; the AI-estimated links follow it. */}
          <section>
            <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">
              {tPl("challengesHeading")} <span className="font-normal">({tPl("reportWordsLabel")})</span>
            </p>
            {challenges ? (
              <>
                <p className={`text-data text-[var(--undp-black)] leading-relaxed whitespace-pre-line max-w-prose ${readMore ? "" : "line-clamp-3"}`}>
                  {challenges}
                </p>
                <button type="button" onClick={() => setReadMore((v) => !v)} className="mt-1 text-caption text-[var(--undp-blue)] hover:underline">
                  {readMore ? tNr7("targets.expand.readLess") : tNr7("targets.expand.readMore")}
                </button>
              </>
            ) : (
              <p className="text-caption text-[var(--undp-gray)]">{tPl("noChallenges")}</p>
            )}
          </section>
          <p className="text-caption text-[var(--undp-black)]" data-testid="policy-link-reach">
            {evidence.count > 0 ? tPl("reach", { count: evidence.count, docs: evidence.docs }) : tPl("noLinks")}
          </p>
          {links.flagged.length > 0 && hasFlags && (
            <section className="rounded-r px-2.5 py-2 -ml-0.5" style={{ backgroundColor: `${FLAGGED_COLOR}14`, borderLeft: `2px solid ${FLAGGED_COLOR}` }} data-testid="policy-link-review">
              <p className="text-caption font-medium mb-1" style={{ color: FLAGGED_COLOR }}>
                {tPl("flaggedHeading", { count: links.flagged.length })}
              </p>
              <FlaggedList links={links.flagged} docLabel={docLabel} visibleTargetIds={visibleTargetIds} onOpen={openFlagged} moreLabel={(n) => tPl("more", { count: n })} fewerLabel={tPl("fewer")} />
            </section>
          )}
          {row.gbfTargets.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-caption text-[var(--undp-gray)]" data-testid="policy-link-gbf">
              <span>{tPl("gbfLeadIn", { count: row.gbfTargets.length })}</span>
              {row.gbfTargets.map((g) => (
                <GbfChip key={g.id} target={g} />
              ))}
            </p>
          )}
          {/* The report's entry for this target, folded: the rows are the
              list of national targets; this is where each one's questionnaire
              and indicators live. */}
          <div data-testid="policy-link-detail">
            <button
              type="button"
              onClick={onToggleDetail}
              aria-expanded={detailOpen}
              aria-controls={`${bodyId}-detail`}
              className="inline-flex items-baseline gap-1.5 text-caption text-[var(--undp-blue)] hover:underline"
            >
              <span aria-hidden="true" className={`inline-block transition-transform ${detailOpen ? "rotate-90" : ""}`}>›</span>
              {tPl("fullEntry")}
            </button>
            {detailOpen && (
              <div id={`${bodyId}-detail`} className="mt-2 pl-3 border-l border-line-soft">
                <Nr7TargetDetail row={row} indicatorsById={indicatorsById} onFocusIndicator={onFocusIndicator} />
              </div>
            )}
          </div>
          {row.nbsapTargetId && row.nbsapNumber !== null && visibleTargetIds.has(row.nbsapTargetId) && (
            <p className="text-caption">
              <button type="button" onClick={() => onOpenTarget(row.nbsapTargetId!)} className="text-[var(--undp-blue)] hover:underline">
                {tPl("openNbsap", { n: row.nbsapNumber })} <span aria-hidden="true">›</span>
              </button>
            </p>
          )}
        </div>
      )}
    </li>
  );
}
