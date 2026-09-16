"use client";

/**
 * Nr7TargetLinks — the sticky column while the biodiversity report (NR7) is
 * on the Implementation slide: for the national target opened on the slide
 * (the top row until one is opened), the policy targets in OTHER documents
 * the pipeline judged strongly aligned with the NBSAP target it restates.
 * One line per document (aligned count, flagged count in the flag colour),
 * then the aligned targets per document, with the potential misalignments
 * marked by colour AND word, and, on each flagged pair whose counterpart
 * repeats across the rows, how many national targets it is on.
 *
 * The column states the counts; the hedged pointer stays in the slide's
 * "Where to start", and the view's one caveat under the slide's rows covers
 * the column too (nothing here repeats it). No bars: the aligned count is
 * context (the Mongolia read showed it does not track how a target is
 * doing), so it is a number beside the document, not a length to compare.
 *
 * Everything drawn here is already on the row model (`Nr7PolicyLinks`):
 * no alignment scan, and the reader's document toggle has already applied.
 * The links are AI-estimated alignment between target texts, never
 * "delivers" or "funds".
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useNr7BadgeLabels } from "@/lib/labels";
import { FLAGGED_COLOR, getDocColor, getDocFullLabel, getDocMediumLabel } from "@/lib/utils";
import { GbfChip, NR7_COLORS, shortNr7Text, stripNr7Deadline, type Nr7PolicyLink, type Nr7TargetRowModel } from "../nr7-report";
import type { Nr7RecurringGroup } from "../sections/implementation/review-groups";
import type { CountryConfig } from "@/types";

/** Counterparts listed per document before "+ N more" unfolds the rest. */
const PER_DOC_SHOWN = 6;

export interface Nr7TargetLinksProps {
  row: Nr7TargetRowModel;
  /** True while nothing is opened on the slide and the top row stands in. */
  isDefault: boolean;
  countryConfig: CountryConfig | null;
  countryName: string;
  visibleTargetIds: ReadonlySet<string>;
  onOpenTarget: (targetId: string) => void;
  /** Where the flagged pairs repeat across the rows: marks the repeating
   *  counterparts in the opened target's lists. */
  recurring?: Nr7RecurringGroup | null;
}

export function Nr7TargetLinks({ row, isDefault, countryConfig, countryName, visibleTargetIds, onOpenTarget, recurring = null }: Nr7TargetLinksProps) {
  const t = useTranslations("briefing.implementationCenter.nr7Links");
  const repeats = new Map((recurring?.items ?? []).map((c) => [c.targetId, c.count]));
  const links = row.policyLinks;
  const hasLinks = Boolean(links && (links.high.length > 0 || links.flagged.length > 0));
  // A target without links (nothing in the corpus restates it, or nothing
  // aligns) keeps the header and says so; the lists need links.
  if (!links || !hasLinks) {
    return (
      <div className="px-1 space-y-6" data-testid="nr7-target-links">
        <TargetHeader row={row} isDefault={isDefault} countryName={countryName} />
        <p className="text-caption text-[var(--undp-black)] leading-snug" data-testid="nr7-links-none">{t("noLinks")}</p>
      </div>
    );
  }
  const docs = links.byDoc.filter((d) => d.high > 0 || d.flagged > 0);
  const label = (doc: string) => getDocMediumLabel(countryConfig, doc);
  const title = (doc: string) => getDocFullLabel(countryConfig, doc);
  // Per document, the pairs to review first, then the aligned ones.
  const byDoc = new Map<string, Nr7PolicyLink[]>();
  for (const l of [...links.flagged, ...links.high]) byDoc.set(l.doc, [...(byDoc.get(l.doc) ?? []), l]);

  return (
    <div className="px-1 space-y-6" data-testid="nr7-target-links">
      <TargetHeader row={row} isDefault={isDefault} countryName={countryName} />

      {/* One line per document: how many of its targets align strongly, and
          how many pairs are flagged for review. */}
      <div>
        <p className="text-caption uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2">{t("list.heading")}</p>
        <ul className="space-y-1.5" data-tour="nr7-links-list">
          {docs.map((d) => (
            <li key={d.doc} className="flex items-baseline gap-x-3 text-caption">
              <span className="inline-flex items-center gap-1.5 min-w-0 flex-1" title={title(d.doc)}>
                <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getDocColor(countryConfig, d.doc) }} />
                <span className="text-[var(--undp-black)] truncate">{label(d.doc)}</span>
              </span>
              <span className="tabular-nums text-[var(--undp-gray)] whitespace-nowrap">{t("list.aligned", { count: d.high })}</span>
              {d.flagged > 0 && (
                <span className="tabular-nums font-medium whitespace-nowrap" style={{ color: FLAGGED_COLOR }}>
                  {t("list.flagged", { count: d.flagged })}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* The aligned targets, per document, explorable one by one. */}
      <div>
        <p className="text-caption uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2">{t("targets.heading")}</p>
        <ul className="space-y-2" data-tour="nr7-links-docs">
          {docs.map((d) => {
            const list = byDoc.get(d.doc) ?? [];
            return (
              <li key={d.doc}>
                <details className="group">
                  <summary className="cursor-pointer list-none flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-caption text-[var(--undp-black)] truncate" title={title(d.doc)}>{label(d.doc)}</span>
                      <span aria-hidden="true" className="text-[var(--undp-gray)]/50 text-caption group-open:hidden">+</span>
                      <span aria-hidden="true" className="text-[var(--undp-gray)]/50 text-caption hidden group-open:inline">−</span>
                    </span>
                    <span className="text-caption tabular-nums text-[var(--undp-gray)] shrink-0">{d.high + d.flagged}</span>
                  </summary>
                  <TargetList list={list} visibleTargetIds={visibleTargetIds} onOpenTarget={onOpenTarget} flaggedWord={t("flagged.word")} moreLabel={(n) => t("targets.more", { count: n })} fewerLabel={t("targets.fewer")} repeats={repeats} repeatsLabel={(n) => t("targets.repeats", { count: n })} />
                </details>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Which national target, as the report rates it. */
function TargetHeader({ row, isDefault, countryName }: { row: Nr7TargetRowModel; isDefault: boolean; countryName: string }) {
  const t = useTranslations("briefing.implementationCenter.nr7Links");
  const ratingLabels = useNr7BadgeLabels();
  return (
    <div>
      <p className="text-caption uppercase tracking-[0.18em] text-[var(--undp-gray)]">{t("header.eyebrow")}</p>
      <p className="text-body font-semibold text-[var(--undp-black)] leading-tight mt-0.5">{t("header.title", { n: row.number })}</p>
      <p className="text-caption text-[var(--undp-gray)] mt-0.5">{t("header.subtitle", { country: countryName })}</p>
      <p className="text-caption text-[var(--undp-black)] leading-snug mt-1.5" title={row.targetText}>
        {shortNr7Text(stripNr7Deadline(row.targetText), 110)}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: NR7_COLORS[row.status] }} />
          <span className="font-medium" style={{ color: NR7_COLORS[row.status] }}>{ratingLabels[row.status]}</span>
        </span>
        {row.gbfTargets.map((g) => (
          <GbfChip key={g.id} target={g} />
        ))}
      </p>
      {isDefault && <p className="text-caption text-[var(--undp-gray)] mt-1" data-testid="nr7-links-default">{t("defaultNote")}</p>}
    </div>
  );
}

/** A pair to review stands out: a tinted, left-ruled line in the flagged
 *  colour with the word beside the target; an aligned pair is a plain line
 *  with a grey dot. Colour is never the only channel. */
export function ReviewMark({ flagged, word, children }: { flagged: boolean; word: string; children: React.ReactNode }) {
  if (!flagged) {
    return (
      <span className="flex items-start gap-1.5 text-caption leading-snug">
        <span aria-hidden="true" className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--undp-gray)]" />
        {children}
      </span>
    );
  }
  return (
    <span
      className="flex items-start gap-1.5 text-caption leading-snug rounded-r px-1.5 py-0.5 -ml-0.5"
      style={{ backgroundColor: `${FLAGGED_COLOR}14`, borderLeft: `2px solid ${FLAGGED_COLOR}` }}
      data-review="true"
    >
      {children}
      <span className="shrink-0 rounded-full px-1.5 text-[10px] font-medium leading-4 text-white" style={{ backgroundColor: FLAGGED_COLOR }}>
        {word}
      </span>
    </span>
  );
}

function TargetList({
  list,
  visibleTargetIds,
  onOpenTarget,
  flaggedWord,
  moreLabel,
  fewerLabel,
  repeats,
  repeatsLabel,
}: {
  list: Nr7PolicyLink[];
  visibleTargetIds: ReadonlySet<string>;
  onOpenTarget: (targetId: string) => void;
  flaggedWord: string;
  moreLabel: (n: number) => string;
  fewerLabel: string;
  /** Counterpart id -> national targets it is flagged against, for the
   *  repeating ones. */
  repeats: Map<string, number>;
  repeatsLabel: (n: number) => string;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? list : list.slice(0, PER_DOC_SHOWN);
  const more = list.length - shown.length;
  return (
    <ul className="mt-1.5 space-y-0.5 max-h-44 overflow-y-auto pr-1">
      {shown.map((l) => (
        <li key={`${l.level}-${l.targetId}`}>
          <ReviewMark flagged={l.level === "flagged"} word={flaggedWord}>
            {visibleTargetIds.has(l.targetId) ? (
              <button type="button" onClick={() => onOpenTarget(l.targetId)} title={l.text} className="text-left text-[var(--undp-blue)] hover:underline min-w-0">
                {l.label}
              </button>
            ) : (
              <span title={l.text} className="min-w-0">{l.label}</span>
            )}
            {l.level === "flagged" && (repeats.get(l.targetId) ?? 0) > 1 && (
              <span className="text-caption text-[var(--undp-gray)] whitespace-nowrap" data-testid="nr7-links-repeats">
                {repeatsLabel(repeats.get(l.targetId)!)}
              </span>
            )}
          </ReviewMark>
        </li>
      ))}
      {(more > 0 || showAll) && (
        <li>
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums">
            {showAll ? fewerLabel : moreLabel(more)}
          </button>
        </li>
      )}
    </ul>
  );
}
