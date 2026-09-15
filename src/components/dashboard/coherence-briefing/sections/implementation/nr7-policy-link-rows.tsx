"use client";

/**
 * Nr7PolicyLinkRows — the biodiversity report's takeaways as rows: every
 * national target in the report, the ones the report itself rates behind
 * schedule first, each block ranked by how many policy targets in OTHER
 * documents the pipeline judged strongly aligned with the NBSAP target it
 * restates. Five rows at first; "Show all N" unfolds the rest and "Show
 * fewer" folds back (decided 2026-09-15: the reader wanted the whole list
 * reachable, and the order explained). A caption marks where the
 * targets not rated behind schedule begin. The closed row shows the target,
 * the country's own rating as a chip, and a bar split by document with the
 * count as text (or "no strongly aligned targets" when there are none), and,
 * when the target has any, a second bar in the flagged colour with its
 * potential misalignments counted in words on the same scale (2026-09-15:
 * the reader wanted to see at a glance when a target that is behind is
 * also contested, not only after opening the row). A
 * row opens inline to the documents involved, the most aligned counterparts
 * (links into the target profile), the potential misalignments, and what
 * the report itself says holds the target back, in its own words. Words
 * carry every colour.
 *
 * The rating and the challenges text are the report's; the links are
 * AI-estimated alignment between target texts (labelled as such, never
 * "delivers" or "funds"). No suggestion is made here: the hedged pointer is
 * the slide's "Where to start" block.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useNr7BadgeLabels } from "@/lib/labels";
import { FLAGGED_COLOR, getDocColor, getDocFullLabel, getDocMediumLabel } from "@/lib/utils";
import { ReviewMark } from "../../centerpiece/nr7-target-links";
import { transitionName, withViewTransition } from "@/lib/view-transition";
import { GbfChip, NR7_COLORS, shortNr7Text, type Nr7PolicyLink } from "../../nr7-report";
import type { Nr7PolicyLinkGroup, Nr7PolicyLinkItem } from "./review-groups";
import type { CountryConfig } from "@/types";

/** Counterpart targets listed in an open row before "+ N more" unfolds the rest. */
export const COUNTERPARTS_SHOWN = 3;

export interface Nr7PolicyLinkRowsProps {
  group: Nr7PolicyLinkGroup;
  countryConfig: CountryConfig | null;
  visibleTargetIds: ReadonlySet<string>;
  onOpenTarget: (targetId: string) => void;
  onFocusNr7Target: (targetId: string) => void;
  /** The open row, when the host owns it (its sticky column follows the
   *  selection). Absent: the rows keep their own. */
  selectedId?: string | null;
  onSelect?: (targetId: string | null) => void;
}

export function Nr7PolicyLinkRows(props: Nr7PolicyLinkRowsProps) {
  const { group, selectedId, onSelect } = props;
  const t = useTranslations("briefing.implementation");
  const tPl = useTranslations("briefing.implementation.biodiversity.policyLinks");
  const [showAll, setShowAll] = useState(false);
  const [localId, setLocalId] = useState<string | null>(null);
  const expandedId = selectedId !== undefined ? selectedId : localId;
  const select = (id: string | null) => {
    setLocalId(id);
    onSelect?.(id);
  };
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
    </div>
  );
}

/** Bar length on the same scale for every row: the group's largest HIGH
 *  count. A non-zero value is never shorter than a visible sliver. */
function barWidth(value: number, max: number): number {
  return max > 0 && value > 0 ? Math.max(6, (value / max) * 100) : 0;
}

/** A bar as long as the target's HIGH links (against the group's largest),
 *  split by document in the document colours. Decorative: the label beside
 *  it carries the count and the open row names the documents. Empty when
 *  the target has no link. */
function LinkBar({ item, countryConfig }: { item: Nr7PolicyLinkItem; countryConfig: CountryConfig | null }) {
  const { evidence } = item;
  return (
    <span className="inline-block w-16 h-1.5 rounded-sm overflow-hidden bg-gray-100 shrink-0" aria-hidden="true">
      <span className="flex h-full" style={{ width: `${barWidth(evidence.count, evidence.max)}%` }}>
        {evidence.byDoc.map((d) => (
          <span key={d.doc} style={{ width: `${(d.high / evidence.count) * 100}%`, backgroundColor: getDocColor(countryConfig, d.doc) }} />
        ))}
      </span>
    </span>
  );
}

/** A second bar under the aligned one, in the flagged colour, as long as
 *  the target's potential misalignments on the SAME scale, so the two
 *  lengths compare at a glance. Decorative: the word beside it carries the
 *  count. Only drawn when there is at least one. */
function FlaggedBar({ item }: { item: Nr7PolicyLinkItem }) {
  const { evidence } = item;
  return (
    <span className="inline-block w-16 h-1.5 rounded-sm overflow-hidden bg-gray-100 shrink-0" aria-hidden="true" data-testid="policy-link-flagged-bar">
      <span className="block h-full" style={{ width: `${barWidth(evidence.flagged, evidence.max)}%`, backgroundColor: FLAGGED_COLOR }} />
    </span>
  );
}

/** The most aligned counterparts, the first few then "+ N more" unfolding
 *  the rest (and folding back). Mounted only while the row is open, so it
 *  starts folded each time. */
function CounterpartList({
  links,
  docLabel,
  visibleTargetIds,
  onOpenTarget,
  moreLabel,
  fewerLabel,
  flaggedWord,
}: {
  links: Nr7PolicyLink[];
  docLabel: (doc: string) => string;
  visibleTargetIds: ReadonlySet<string>;
  onOpenTarget: (targetId: string) => void;
  moreLabel: (n: number) => string;
  fewerLabel: string;
  /** Given for the flagged list: every entry is marked as a pair to review. */
  flaggedWord?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? links : links.slice(0, COUNTERPARTS_SHOWN);
  const more = links.length - shown.length;
  return (
    <ul className={`text-caption ${flaggedWord ? "space-y-1" : "flex flex-wrap gap-x-4 gap-y-1"}`}>
      {shown.map((l) => {
        const label = `${docLabel(l.doc)} · ${l.label}`;
        const link = visibleTargetIds.has(l.targetId) ? (
          <button type="button" onClick={() => onOpenTarget(l.targetId)} title={l.text} className="text-[var(--undp-blue)] hover:underline text-left">
            {label} <span aria-hidden="true">›</span>
          </button>
        ) : (
          <span title={l.text}>{label}</span>
        );
        return (
          <li key={l.targetId}>
            {flaggedWord ? <ReviewMark flagged word={flaggedWord}>{link}</ReviewMark> : link}
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
  countryConfig,
  visibleTargetIds,
  onOpenTarget,
  onFocusNr7Target,
}: { item: Nr7PolicyLinkItem; expanded: boolean; onToggle: () => void; first: boolean; caption?: string } & Omit<Nr7PolicyLinkRowsProps, "group" | "selectedId" | "onSelect">) {
  const t = useTranslations("briefing.implementation");
  const tPl = useTranslations("briefing.implementation.biodiversity.policyLinks");
  const tNr7 = useTranslations("briefing.nr7Report");
  const ratingLabels = useNr7BadgeLabels();
  const [readMore, setReadMore] = useState(false);
  const { row, links, evidence } = item;
  const bodyId = `policy-link-${row.targetId}`;
  const fullText = row.targetText.replace(/\s+/g, " ").trim();
  const subject = `${row.number} · ${expanded ? fullText : shortNr7Text(row.targetText, 44)}`;
  const rating = ratingLabels[row.status];
  const alignedLabel = evidence.count > 0 ? tPl("evidence", { count: evidence.count, docs: evidence.docs }) : tPl("noLinks");
  const flaggedLabel = evidence.flagged > 0 ? tPl("flaggedShort", { count: evidence.flagged }) : null;
  const evidenceLabel = flaggedLabel ? `${alignedLabel}; ${flaggedLabel}` : alignedLabel;
  const name = transitionName("pl", row.targetId);
  const docLabel = (doc: string) => getDocMediumLabel(countryConfig, doc);
  const docTitle = (doc: string) => getDocFullLabel(countryConfig, doc);
  const mostFlaggedDoc = [...links.byDoc].sort((a, b) => b.flagged - a.flagged || a.doc.localeCompare(b.doc))[0];
  const challenges = row.keyChallengesSummary ?? row.progressSummary;

  return (
    <li className="border-t border-line-soft" style={{ viewTransitionName: name }}>
      {caption && (
        <p className="pt-3 pb-1 px-1 text-caption font-medium text-[var(--undp-gray)]" data-testid="policy-link-rest-heading">
          {caption}
        </p>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={t("biodiversity.row.aria", { target: subject, rating, evidence: evidenceLabel })}
        data-tour={first ? "review-row" : undefined}
        className="w-full text-left grid grid-cols-[minmax(0,12rem)_6.5rem_1fr] items-center gap-x-3 gap-y-1.5 px-1 py-2 rounded hover:bg-black/[0.03] text-caption"
      >
        <span
          className={`flex items-center gap-1.5 min-w-0 ${expanded ? "col-span-3 flex-wrap max-w-prose" : ""}`}
          style={{ viewTransitionName: `${name}-subject` }}
          data-testid="policy-link-subject"
        >
          <span
            className={`text-data text-[var(--undp-black)] leading-snug min-w-0 ${expanded ? "whitespace-normal font-medium" : "truncate"}`}
            title={expanded ? undefined : fullText}
          >
            {subject}
          </span>
          {row.gbfTargets.map((g) => (
            <GbfChip key={g.id} target={g} />
          ))}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 whitespace-nowrap ${expanded ? "col-start-2" : ""}`}
          style={{ viewTransitionName: `${name}-rating` }}
        >
          <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: NR7_COLORS[row.status] }} />
          <span className="font-medium" style={{ color: NR7_COLORS[row.status] }}>{rating}</span>
        </span>
        {/* The labels wrap rather than truncate: the counts are the point,
            and the slide column is narrow. The potential misalignments get
            their own line, bar and word, so a target that is behind AND
            contested reads as such without opening the row. */}
        <span className="flex flex-col gap-0.5 min-w-0 text-[var(--undp-black)]" style={{ viewTransitionName: `${name}-evidence` }}>
          <span className="inline-flex items-center gap-2 min-w-0">
            <LinkBar item={item} countryConfig={countryConfig} />
            <span className="leading-snug">{alignedLabel}</span>
          </span>
          {flaggedLabel && (
            <span className="inline-flex items-center gap-2 min-w-0" data-testid="policy-link-flagged-face">
              <FlaggedBar item={item} />
              <span className="leading-snug font-medium" style={{ color: FLAGGED_COLOR }}>
                {flaggedLabel}
              </span>
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <div id={bodyId} className="pb-4 pl-1 pr-1 space-y-3 disclosure-enter">
          {evidence.count > 0 && (
            <>
              <section>
                <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">{tPl("byDocument")}</p>
                <p className="text-caption text-[var(--undp-black)] flex flex-wrap gap-x-3 gap-y-1">
                  {evidence.byDoc.map((d) => (
                    <span key={d.doc} className="inline-flex items-center gap-1.5 whitespace-nowrap" title={docTitle(d.doc)}>
                      <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: getDocColor(countryConfig, d.doc) }} />
                      <span>
                        {docLabel(d.doc)} <span className="tabular-nums">{d.high}</span>
                      </span>
                    </span>
                  ))}
                </p>
              </section>
              <section>
                <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">{tPl("counterparts")}</p>
                <CounterpartList links={links.high} docLabel={docLabel} visibleTargetIds={visibleTargetIds} onOpenTarget={onOpenTarget} moreLabel={(n) => tPl("more", { count: n })} fewerLabel={tPl("fewer")} />
              </section>
            </>
          )}
          {links.flagged.length > 0 && mostFlaggedDoc && (
            <section className="rounded-r px-2.5 py-2 -ml-0.5" style={{ backgroundColor: `${FLAGGED_COLOR}14`, borderLeft: `2px solid ${FLAGGED_COLOR}` }} data-testid="policy-link-review">
              <p className="text-caption font-medium mb-1" style={{ color: FLAGGED_COLOR }}>
                {tPl("flagged", { count: links.flagged.length, doc: docLabel(mostFlaggedDoc.doc) })}
              </p>
              <CounterpartList links={links.flagged} docLabel={docLabel} visibleTargetIds={visibleTargetIds} onOpenTarget={onOpenTarget} moreLabel={(n) => tPl("more", { count: n })} fewerLabel={tPl("fewer")} flaggedWord={tPl("reviewWord")} />
            </section>
          )}
          <section>
            <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">{tPl("challengesHeading")}</p>
            {challenges ? (
              <>
                <p className={`text-data text-[var(--undp-black)] leading-relaxed whitespace-pre-line max-w-prose ${readMore ? "" : "line-clamp-6"}`}>
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
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
            <button type="button" onClick={() => onFocusNr7Target(row.targetId)} className="text-[var(--undp-blue)] hover:underline">
              {t("row.nr7.seeTarget")} <span aria-hidden="true">›</span>
            </button>
            {row.nbsapTargetId && row.nbsapNumber !== null && visibleTargetIds.has(row.nbsapTargetId) && (
              <button type="button" onClick={() => onOpenTarget(row.nbsapTargetId!)} className="text-[var(--undp-blue)] hover:underline">
                {tNr7("targets.expand.openNbsap", { n: row.nbsapNumber })} <span aria-hidden="true">›</span>
              </button>
            )}
          </p>
        </div>
      )}
    </li>
  );
}
