"use client";

/**
 * Nr7PolicyLinkRows — the biodiversity report's takeaways as rows: every
 * national target in the report, the ones the report itself rates behind
 * schedule first, each block ranked by how many policy targets in OTHER
 * documents the pipeline judged strongly aligned with the NBSAP target it
 * restates. Five rows at first; "Show all N" unfolds the rest and "Show
 * fewer" folds back (decided 2026-09-15: the reader wanted the whole list
 * reachable, and the order explained). A caption marks where the targets
 * not rated behind schedule begin.
 *
 * One line per row (2026-09-15, after the slide grew too dense): the
 * target, the country's own rating as a chip, and the potential
 * misalignments in words with the document most of them come from, or "no
 * potential misalignments". No bar and no count of aligned targets on the
 * face: the Mongolia read showed neither number tracks how a target is
 * doing, so they are context, not a finding. The aligned count moves into
 * the open row as one line; the per-document bars and the aligned
 * counterparts live in the sticky column and the target profile.
 *
 * A row opens inline to what the report itself says holds the target back,
 * in its own words, FIRST (the country's reason leads), then the aligned
 * count, then the potential misalignments listed after the report's words
 * so they read as pairs to review beside that reason, never as the reason.
 * Words carry every colour.
 *
 * The rating and the challenges text are the report's; the links are
 * AI-estimated alignment between target texts (labelled as such, never
 * "delivers" or "funds"). No suggestion is made here: the hedged pointer is
 * the slide's "Where to start" block.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useNr7BadgeLabels } from "@/lib/labels";
import { FLAGGED_COLOR, getDocMediumLabel } from "@/lib/utils";
import { ReviewMark } from "../../centerpiece/nr7-target-links";
import { transitionName, withViewTransition } from "@/lib/view-transition";
import { GbfChip, NR7_COLORS, shortNr7Text, type Nr7PolicyLink } from "../../nr7-report";
import type { Nr7PolicyLinkGroup, Nr7PolicyLinkItem } from "./review-groups";
import type { CountryConfig } from "@/types";

/** Counterpart targets listed in an open row before "+ N more" unfolds the rest. */
export const COUNTERPARTS_SHOWN = 3;

/** The words for a row's potential misalignments: the count and the
 *  document most of them come from ("mostly with" when several documents
 *  are involved, "with" when one), or none. Keyed under
 *  `briefing.implementation.biodiversity.policyLinks`; the slide's "Where
 *  to start" says the same words for the top target. */
export function flaggedLine(item: Nr7PolicyLinkItem, countryConfig: CountryConfig | null): { key: "flaggedFace" | "flaggedFaceOne" | "noneFlagged"; values: Record<string, string | number> } {
  const docs = item.links.byDoc.filter((d) => d.flagged > 0).sort((a, b) => b.flagged - a.flagged || a.doc.localeCompare(b.doc));
  if (item.evidence.flagged === 0 || !docs[0]) return { key: "noneFlagged", values: {} };
  return { key: docs.length > 1 ? "flaggedFace" : "flaggedFaceOne", values: { count: item.evidence.flagged, doc: getDocMediumLabel(countryConfig, docs[0].doc) } };
}

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
      {/* The view's one caveat: the ratings are the report's, the links are
          AI-estimated. Nowhere else on this view repeats it. */}
      <p className="mt-3 text-caption text-[var(--undp-gray)] max-w-prose leading-relaxed" data-testid="policy-link-caveat">
        {tPl("caveat")}
      </p>
    </div>
  );
}

/** The flagged counterparts, the first few then "+ N more" unfolding the
 *  rest (and folding back). Mounted only while the row is open, so it
 *  starts folded each time. Every entry is marked as a pair to review. */
function FlaggedList({
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
  flaggedWord: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? links : links.slice(0, COUNTERPARTS_SHOWN);
  const more = links.length - shown.length;
  return (
    <ul className="text-caption space-y-1">
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
            <ReviewMark flagged word={flaggedWord}>{link}</ReviewMark>
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
  const docLabel = (doc: string) => getDocMediumLabel(countryConfig, doc);
  const flagged = flaggedLine(item, countryConfig);
  const flaggedLabel = tPl(flagged.key, flagged.values);
  const hasFlags = flagged.key !== "noneFlagged";
  const name = transitionName("pl", row.targetId);
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
        aria-label={t("biodiversity.row.aria", { target: subject, rating, evidence: flaggedLabel })}
        data-tour={first ? "review-row" : undefined}
        className="w-full text-left grid grid-cols-[minmax(0,12rem)_6.5rem_1fr] items-center gap-x-3 gap-y-1.5 px-1 py-2 rounded hover:bg-black/[0.03] text-caption"
      >
        <span
          className={`text-data text-[var(--undp-black)] leading-snug min-w-0 ${expanded ? "col-span-3 whitespace-normal font-medium max-w-prose" : "truncate"}`}
          style={{ viewTransitionName: `${name}-subject` }}
          title={expanded ? undefined : fullText}
          data-testid="policy-link-subject"
        >
          {subject}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 whitespace-nowrap ${expanded ? "col-start-2" : ""}`}
          style={{ viewTransitionName: `${name}-rating` }}
        >
          <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: NR7_COLORS[row.status] }} />
          <span className="font-medium" style={{ color: NR7_COLORS[row.status] }}>{rating}</span>
        </span>
        {/* The words wrap rather than truncate: the count and the document
            are the point. A mark in the flagged colour, the same for one
            pair or forty (presence, not magnitude), when there are any. */}
        <span className="inline-flex items-center gap-2 min-w-0 leading-snug" style={{ viewTransitionName: `${name}-evidence` }} data-testid="policy-link-flagged-face">
          {hasFlags && <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: FLAGGED_COLOR }} data-testid="policy-link-flagged-mark" />}
          <span className={hasFlags ? "font-medium" : "text-[var(--undp-gray)]"} style={hasFlags ? { color: FLAGGED_COLOR } : undefined}>
            {flaggedLabel}
          </span>
        </span>
      </button>
      {expanded && (
        <div id={bodyId} className="pb-4 pl-1 pr-1 space-y-3 disclosure-enter">
          {row.gbfTargets.length > 0 && (
            <p className="flex flex-wrap gap-1.5">
              {row.gbfTargets.map((g) => (
                <GbfChip key={g.id} target={g} />
              ))}
            </p>
          )}
          {/* The report's own reason leads; the AI-estimated links follow it. */}
          <section>
            <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">{tPl("challengesHeading")}</p>
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
              <p className="text-caption font-medium mb-0.5" style={{ color: FLAGGED_COLOR }}>
                {tPl("flaggedHeading")}
              </p>
              <p className="text-caption text-[var(--undp-black)] mb-1">{flaggedLabel}</p>
              <FlaggedList links={links.flagged} docLabel={docLabel} visibleTargetIds={visibleTargetIds} onOpenTarget={onOpenTarget} moreLabel={(n) => tPl("more", { count: n })} fewerLabel={tPl("fewer")} flaggedWord={tPl("reviewWord")} />
            </section>
          )}
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
