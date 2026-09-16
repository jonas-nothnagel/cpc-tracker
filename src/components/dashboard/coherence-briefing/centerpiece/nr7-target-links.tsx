"use client";

/**
 * Nr7TargetLinks — the sticky column while the biodiversity report (NR7) is
 * on the Implementation slide. Until a row is opened it shows where the
 * flagged pairs repeat across the rows (./nr7-recurring-counterparts.tsx;
 * the top-ranked target stands in only when nothing repeats). For the
 * national target the reader opened: the policy targets in OTHER documents
 * the pipeline judged strongly aligned with the NBSAP target it restates,
 * one bar per document, then the aligned targets themselves, with the
 * potential misalignments marked by colour AND word, and, on each flagged
 * pair whose counterpart repeats, how many national targets it is on.
 *
 * The reading it supports: these are the targets the report rates behind
 * schedule that the most other plans line up with, so movement there could
 * matter beyond the biodiversity plan. The column states the counts; the
 * hedged pointer stays in the slide's "Where to start".
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
import { GbfChip, NR7_COLORS, shortNr7Text, type Nr7PolicyLink, type Nr7TargetRowModel } from "../nr7-report";
import { Nr7RecurringCounterparts } from "../sections/implementation/nr7-recurring-counterparts";
import type { Nr7RecurringGroup } from "../sections/implementation/review-groups";
import type { CountryConfig } from "@/types";

/** Counterparts listed per document before "+ N more" unfolds the rest. */
const PER_DOC_SHOWN = 6;

export interface Nr7TargetLinksProps {
  row: Nr7TargetRowModel;
  /** True while nothing is opened on the slide and the top-ranked target stands in. */
  isDefault: boolean;
  countryConfig: CountryConfig | null;
  countryName: string;
  visibleTargetIds: ReadonlySet<string>;
  onOpenTarget: (targetId: string) => void;
  /** Where the flagged pairs repeat; shown while no row is opened, and
   *  marks the repeating counterparts in an opened target's list. */
  recurring?: Nr7RecurringGroup | null;
  /** Opens a policy-link row on the slide (the chips of the default view). */
  onOpenRow?: (targetId: string) => void;
}

export function Nr7TargetLinks({ row, isDefault, countryConfig, countryName, visibleTargetIds, onOpenTarget, recurring = null, onOpenRow }: Nr7TargetLinksProps) {
  const t = useTranslations("briefing.implementationCenter.nr7Links");
  if (isDefault && recurring) {
    return <Nr7RecurringCounterparts group={recurring} countryConfig={countryConfig} visibleTargetIds={visibleTargetIds} onOpenTarget={onOpenTarget} onSelectRow={onOpenRow} />;
  }
  const repeats = new Map((recurring?.items ?? []).map((c) => [c.targetId, c.count]));
  const links = row.policyLinks;
  const hasLinks = Boolean(links && (links.high.length > 0 || links.flagged.length > 0));
  // A target without links (nothing in the corpus restates it, or nothing
  // aligns) keeps the header and says so; the bars and lists need links.
  if (!links || !hasLinks) {
    return (
      <div className="px-1 space-y-6" data-testid="nr7-target-links">
        <TargetHeader row={row} isDefault={isDefault} countryName={countryName} />
        <p className="text-[11.5px] text-[var(--undp-black)] leading-snug" data-testid="nr7-links-none">{t("noLinks")}</p>
        <p className="text-[11px] text-[var(--undp-gray)] leading-snug" data-tour="nr7-links-caveat">{t("caveat")}</p>
      </div>
    );
  }
  const docs = links.byDoc.filter((d) => d.high > 0 || d.flagged > 0);
  // Bars count strong alignment only; a document with nothing but flagged
  // pairs keeps its place in the misalignment line and the target list.
  const barDocs = docs.filter((d) => d.high > 0);
  const maxHigh = barDocs.reduce((m, d) => Math.max(m, d.high), 0);
  const flaggedDocs = docs.filter((d) => d.flagged > 0).sort((a, b) => b.flagged - a.flagged || a.doc.localeCompare(b.doc));
  const label = (doc: string) => getDocMediumLabel(countryConfig, doc);
  const title = (doc: string) => getDocFullLabel(countryConfig, doc);
  // Per document, the pairs to review first, then the aligned ones.
  const byDoc = new Map<string, Nr7PolicyLink[]>();
  for (const l of [...links.flagged, ...links.high]) byDoc.set(l.doc, [...(byDoc.get(l.doc) ?? []), l]);

  return (
    <div className="px-1 space-y-6" data-testid="nr7-target-links">
      <TargetHeader row={row} isDefault={isDefault} countryName={countryName}>
        <p className="text-[11.5px] text-[var(--undp-black)] mt-1.5">
          {t("mixLine", { count: links.high.length, docs: links.docs, flagged: links.flagged.length })}
        </p>
      </TargetHeader>

      {/* One bar per document: how many of its targets align strongly. */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2">{t("bars.heading")}</p>
        <ul className="space-y-1.5" data-tour="nr7-links-bars">
          {barDocs.map((d) => (
            <li key={d.doc} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-x-2">
              <span className="inline-flex items-center gap-1.5 min-w-0" title={title(d.doc)}>
                <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getDocColor(countryConfig, d.doc) }} />
                <span className="text-[12px] text-[var(--undp-black)] truncate">{label(d.doc)}</span>
              </span>
              <span className="block h-2 rounded-sm bg-gray-100 overflow-hidden" aria-hidden="true">
                <span className="block h-full rounded-sm" style={{ width: `${maxHigh > 0 ? Math.max(3, (d.high / maxHigh) * 100) : 0}%`, backgroundColor: getDocColor(countryConfig, d.doc) }} />
              </span>
              <span className="text-[11px] tabular-nums text-[var(--undp-gray)] text-right">{d.high}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-[var(--undp-gray)] mt-2 leading-snug">{t("bars.note", { n: row.number })}</p>
        {flaggedDocs.length > 0 && (
          <p className="text-[11.5px] mt-1.5 leading-snug" data-testid="nr7-links-flagged">
            <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: FLAGGED_COLOR }} />
            <span style={{ color: FLAGGED_COLOR }} className="font-medium">{t("flagged.heading", { count: links.flagged.length })}</span>
            <span className="text-[var(--undp-black)]">
              {" "}
              {flaggedDocs.map((d) => `${label(d.doc)} ${d.flagged}`).join(" · ")}
            </span>
          </p>
        )}
      </div>

      {/* The aligned targets, per document, explorable one by one. */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2">{t("targets.heading")}</p>
        <ul className="space-y-2" data-tour="nr7-links-docs">
          {docs.map((d) => {
            const list = byDoc.get(d.doc) ?? [];
            return (
              <li key={d.doc}>
                <details className="group">
                  <summary className="cursor-pointer list-none flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[12px] text-[var(--undp-black)] truncate" title={title(d.doc)}>{label(d.doc)}</span>
                      <span aria-hidden="true" className="text-[var(--undp-gray)]/50 text-[11px] group-open:hidden">+</span>
                      <span aria-hidden="true" className="text-[var(--undp-gray)]/50 text-[11px] hidden group-open:inline">−</span>
                    </span>
                    <span className="text-[11px] tabular-nums text-[var(--undp-gray)] shrink-0">
                      {d.high}
                      {d.flagged > 0 && (
                        <span className="font-medium" style={{ color: FLAGGED_COLOR }}>
                          {" "}
                          {t("targets.toReview", { count: d.flagged })}
                        </span>
                      )}
                    </span>
                  </summary>
                  <TargetList list={list} visibleTargetIds={visibleTargetIds} onOpenTarget={onOpenTarget} flaggedWord={t("flagged.word")} moreLabel={(n) => t("targets.more", { count: n })} fewerLabel={t("targets.fewer")} repeats={repeats} repeatsLabel={(n) => t("targets.repeats", { count: n })} />
                </details>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-[11px] text-[var(--undp-gray)] leading-snug" data-tour="nr7-links-caveat">{t("caveat")}</p>
    </div>
  );
}

/** Which national target, as the report rates it; the link count line (when
 *  there are links) slots in before the default note. */
function TargetHeader({ row, isDefault, countryName, children }: { row: Nr7TargetRowModel; isDefault: boolean; countryName: string; children?: React.ReactNode }) {
  const t = useTranslations("briefing.implementationCenter.nr7Links");
  const ratingLabels = useNr7BadgeLabels();
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)]">{t("header.eyebrow")}</p>
      <p className="text-[15px] font-semibold text-[var(--undp-black)] leading-tight mt-0.5">{t("header.title", { n: row.number })}</p>
      <p className="text-[11.5px] text-[var(--undp-gray)] mt-0.5">{t("header.subtitle", { country: countryName })}</p>
      <p className="text-[12px] text-[var(--undp-black)] leading-snug mt-1.5" title={row.targetText}>
        {shortNr7Text(row.targetText, 110)}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: NR7_COLORS[row.status] }} />
          <span className="font-medium" style={{ color: NR7_COLORS[row.status] }}>{ratingLabels[row.status]}</span>
        </span>
        {row.gbfTargets.map((g) => (
          <GbfChip key={g.id} target={g} />
        ))}
      </p>
      {children}
      {isDefault && <p className="text-[11px] text-[var(--undp-gray)] mt-1" data-testid="nr7-links-default">{t("defaultNote")}</p>}
    </div>
  );
}

/** A pair to review stands out: a tinted, left-ruled line in the flagged
 *  colour with the word beside the target; an aligned pair is a plain line
 *  with a grey dot. Colour is never the only channel. */
export function ReviewMark({ flagged, word, children }: { flagged: boolean; word: string; children: React.ReactNode }) {
  if (!flagged) {
    return (
      <span className="flex items-start gap-1.5 text-[11.5px] leading-snug">
        <span aria-hidden="true" className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--undp-gray)]" />
        {children}
      </span>
    );
  }
  return (
    <span
      className="flex items-start gap-1.5 text-[11.5px] leading-snug rounded-r px-1.5 py-0.5 -ml-0.5"
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
              <span className="text-[10.5px] text-[var(--undp-gray)] whitespace-nowrap" data-testid="nr7-links-repeats">
                {repeatsLabel(repeats.get(l.targetId)!)}
              </span>
            )}
          </ReviewMark>
        </li>
      ))}
      {(more > 0 || showAll) && (
        <li>
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline underline-offset-2 tabular-nums">
            {showAll ? fewerLabel : moreLabel(more)}
          </button>
        </li>
      )}
    </ul>
  );
}
