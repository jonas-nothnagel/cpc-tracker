"use client";

/**
 * SectorDrawer — opens when the user clicks a sector tile on the Q2 grid.
 * Phase A2 MVP of what the plan calls "Phase C: per-sector briefing".
 *
 * Renders the top tensions and top alignments touching the sector. No LLM
 * narrative, no pathway hints yet; that arrives in the full Phase C drawer.
 */

import { useEffect } from "react";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  getDocMediumLabel,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import type { FaultLine, SectorBriefing } from "@/lib/coherence-briefing";
import type { CountryConfig } from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";

export function SectorDrawer({
  briefing,
  countryConfig,
  onClose,
}: {
  briefing: SectorBriefing | null;
  countryConfig: CountryConfig | null;
  onClose: () => void;
}) {
  // Close on Escape — standard drawer affordance.
  useEffect(() => {
    if (!briefing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [briefing, onClose]);

  // Lock body scroll while the drawer is open so background scroll doesn't
  // sneak through on touch devices.
  useEffect(() => {
    if (!briefing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [briefing]);

  if (!briefing) return null;
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        type="button"
        aria-label="Close sector briefing"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--undp-black)]/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Sector briefing: ${briefing.categoryName}`}
        className="relative h-full w-full sm:w-[520px] md:w-[600px] bg-white shadow-2xl overflow-y-auto"
        style={{ backgroundColor: "#fbfaf7" }}
      >
        <header className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4 bg-white/90 backdrop-blur">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
              Sector briefing
            </p>
            <h3
              className="text-xl text-[var(--undp-black)] font-medium leading-tight"
              style={{ fontFamily: HEADLINE_SERIF }}
            >
              {briefing.categoryName}
            </h3>
            <p className="mt-1 text-xs text-[var(--undp-gray)]">
              {briefing.targetCount} targets · {briefing.signalCount}{" "}
              scored pairs touch this sector
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-2xl leading-none"
          >
            ×
          </button>
        </header>

        <div className="px-6 py-6 space-y-8">
          <DrawerList
            heading="What's pulling against the rest"
            subhead="Top flagged tensions touching this sector, severity-sorted."
            empty="No tensions flagged in this sector."
            entries={briefing.topTensions}
            countryConfig={countryConfig}
          />

          <DrawerList
            heading="What's pulling together"
            subhead="Strongest alignments touching this sector."
            empty="No medium-or-strong alignments touch this sector."
            entries={briefing.topAlignments}
            countryConfig={countryConfig}
          />

          <p className="text-[11px] text-[var(--undp-gray)] leading-relaxed border-t border-gray-200 pt-4">
            Phase C will add a hedged pathway hint and the budget angle when
            BER data is available for the country.
          </p>
        </div>
      </aside>
    </div>
  );
}

function DrawerList({
  heading,
  subhead,
  empty,
  entries,
  countryConfig,
}: {
  heading: string;
  subhead: string;
  empty: string;
  entries: FaultLine[];
  countryConfig: CountryConfig | null;
}) {
  return (
    <section>
      <h4 className="text-sm font-medium text-[var(--undp-black)] mb-1">
        {heading}
      </h4>
      <p className="text-xs text-[var(--undp-gray)] mb-4">{subhead}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-[var(--undp-gray)] italic">{empty}</p>
      ) : (
        <ol className="space-y-4">
          {entries.map((line) => (
            <DrawerRow
              key={`${line.pair.targetAId}__${line.pair.targetBId}`}
              line={line}
              countryConfig={countryConfig}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function DrawerRow({
  line,
  countryConfig,
}: {
  line: FaultLine;
  countryConfig: CountryConfig | null;
}) {
  const { targetA, targetB, pair } = line;
  const color = ALIGNMENT_COLORS[pair.alignment];
  const isContra = isContradiction(pair.alignment);
  const docA = getDocMediumLabel(countryConfig, targetA.sourceDocument);
  const docB = getDocMediumLabel(countryConfig, targetB.sourceDocument);
  return (
    <li className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span
          className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${color}20`,
            color,
            border: `1px solid ${color}40`,
          }}
        >
          {ALIGNMENT_LABELS[pair.alignment]}
        </span>
        <span className="text-[10px] text-[var(--undp-gray)]">
          {docA} {targetA.sourceLabel} {isContra ? "↮" : "↔"} {docB}{" "}
          {targetB.sourceLabel}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <p
          className="text-[13px] text-[var(--undp-black)] leading-snug overflow-hidden"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {targetA.text}
        </p>
        <p
          className="text-[13px] text-[var(--undp-black)] leading-snug overflow-hidden"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {targetB.text}
        </p>
      </div>
      {pair.description && (
        <p className="mt-2 text-[11px] text-[var(--undp-gray)] italic leading-relaxed line-clamp-3">
          <span className="not-italic font-medium mr-1 uppercase tracking-wider">
            AI rationale:
          </span>
          {pair.description}
        </p>
      )}
    </li>
  );
}
