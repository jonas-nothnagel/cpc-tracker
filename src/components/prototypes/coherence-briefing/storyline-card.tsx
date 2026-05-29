"use client";

/**
 * StorylineCard — one corpus storyline ("theme") rendered as a clickable
 * card: polarity chip (Strongly aligned / Potentially misaligned), the
 * storyline name, the documents it spans, and its pair count. Clicking opens
 * the ThemeDrawer.
 *
 * Shared by the Direction slide's recurring-patterns block (the single
 * home for themes). Kept in one place so the theme presentation stays
 * consistent wherever a storyline is surfaced.
 */

import { getDocFullLabel, getDocLabel } from "@/lib/utils";
import type { CorpusStoryline, CountryConfig } from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const ALIGNED_DOT_COLOR = "#196127";
const FRICTION_DOT_COLOR = "#dc2626";

export function StorylineCard({
  storyline,
  countryConfig,
  totalAvailableDocs,
  onOpen,
}: {
  storyline: CorpusStoryline;
  countryConfig: CountryConfig | null;
  totalAvailableDocs: number;
  onOpen: () => void;
}) {
  const isReinforce = storyline.type === "reinforcement";
  const dotColor = isReinforce ? ALIGNED_DOT_COLOR : FRICTION_DOT_COLOR;
  const uniqueDocs = Array.from(new Set(storyline.spans_documents));
  const spansAll =
    totalAvailableDocs > 0 && uniqueDocs.length >= totalAvailableDocs;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded border border-gray-200 bg-white px-3 py-2.5 hover:border-gray-400 transition-colors"
    >
      <p
        className="text-[9.5px] uppercase tracking-wider font-semibold mb-1.5 inline-flex items-center gap-1.5"
        style={{ color: dotColor }}
      >
        <span
          aria-hidden="true"
          className="block h-2 w-2 rounded-full"
          style={
            isReinforce
              ? { backgroundColor: dotColor }
              : { boxShadow: `inset 0 0 0 1px ${dotColor}` }
          }
        />
        {isReinforce ? "Strongly aligned" : "Potentially misaligned"}
      </p>
      <p
        className="text-[13.5px] text-[var(--undp-black)] leading-snug mb-2"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {storyline.name}
      </p>
      <p className="text-[10.5px] text-[var(--undp-gray)] leading-snug">
        {spansAll ? (
          <>
            Spans all{" "}
            <span className="tabular-nums">{totalAvailableDocs}</span> documents
          </>
        ) : (
          <>
            <span className="uppercase tracking-wider text-[9.5px] mr-1">
              Across
            </span>
            {uniqueDocs.map((d, i) => (
              <span key={d}>
                <span
                  className="border-b border-dotted border-[var(--undp-gray)]/50"
                  title={getDocFullLabel(countryConfig, d)}
                >
                  {getDocLabel(countryConfig, d)}
                </span>
                {i < uniqueDocs.length - 1 ? ", " : ""}
              </span>
            ))}
          </>
        )}
      </p>
      <p className="mt-1 text-[10.5px] text-[var(--undp-gray)] tabular-nums">
        {storyline.pair_count.toLocaleString()} pair
        {storyline.pair_count === 1 ? "" : "s"}
      </p>
    </button>
  );
}
