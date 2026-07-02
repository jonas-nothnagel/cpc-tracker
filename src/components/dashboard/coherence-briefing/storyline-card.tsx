"use client";

/**
 * StorylineCard — one corpus storyline ("theme") rendered as a clickable
 * card: polarity chip (Recurring alignment / Recurring potential
 * misalignment), the
 * storyline name, the documents it spans, and its pair count. Clicking opens
 * the ThemeDrawer.
 *
 * Shared by the Direction slide's recurring-patterns block (the single
 * home for themes). Kept in one place so the theme presentation stays
 * consistent wherever a storyline is surfaced.
 */

import { useTranslations } from "next-intl";
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
  const t = useTranslations("briefing.storylineCard");
  const isReinforce = storyline.type === "reinforcement";
  const dotColor = isReinforce ? ALIGNED_DOT_COLOR : FRICTION_DOT_COLOR;
  const uniqueDocs = Array.from(new Set(storyline.spans_documents));
  const spansAll =
    totalAvailableDocs > 0 && uniqueDocs.length >= totalAvailableDocs;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full w-full flex-col text-left rounded border border-gray-200 bg-white px-3 py-2.5 hover:border-gray-400 transition-colors"
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
        {isReinforce ? t("eyebrow.reinforce") : t("eyebrow.friction")}
      </p>
      <p
        className="text-[13.5px] text-[var(--undp-black)] leading-snug mb-2"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {storyline.name}
      </p>
      <p className="text-[10.5px] text-[var(--undp-gray)] leading-snug">
        {spansAll ? (
          t("spansAll", { count: totalAvailableDocs })
        ) : (
          <>
            <span className="uppercase tracking-wider text-[9.5px] mr-1">
              {t("across")}
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
        {t("pairCount", { count: storyline.pair_count })}
      </p>
    </button>
  );
}
