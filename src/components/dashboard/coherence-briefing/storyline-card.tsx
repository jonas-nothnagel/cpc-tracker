"use client";

/**
 * ThemeBox — one corpus theme as a compact box in the Direction section's
 * side-by-side columns (coherent themes left, potentially misaligned themes
 * right). Fixed skeleton so every box in both columns has the same height:
 * a two-line slot for the noun-phrase name, a two-line clamped description,
 * and a one-line stat row where the live pair count leads as the ranking
 * score, with a thin polarity-colored bar scaled to the column's maximum so
 * the count-descending order is visibly the sorting criterion.
 *
 * Clicking opens the ThemeDrawer; hovering spotlights the theme's documents
 * on the adjacent wheel, behind a short hover-intent delay so sweeping the
 * cursor across a column toward the other one does not strobe the wheel.
 *
 * Counts come from the caller's live stats (recomputed from the visible
 * alignment), never from the persisted pair_count, so the box stays exact
 * under document toggling and honest on old-format payloads.
 */

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { StorylineLiveStats } from "@/lib/coherence-briefing";
import type { CorpusStoryline } from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";

const ALIGNED_BAR_COLOR = "#196127";
const FRICTION_BAR_COLOR = "#dc2626";

/** Hover-intent delay before the wheel spotlight engages. */
const SPOTLIGHT_DELAY_MS = 140;

/** Hover payload for the wheel spotlight (live docs + polarity). */
export interface ThemeSpotlight {
  docs: string[];
  polarity: "reinforcement" | "friction";
}

export function ThemeBox({
  storyline,
  stats,
  maxCount,
  onOpen,
  onSpotlight,
}: {
  storyline: CorpusStoryline;
  stats: StorylineLiveStats;
  /** Largest live count in this column; scales the score bar. */
  maxCount: number;
  onOpen: () => void;
  onSpotlight?: (spotlight: ThemeSpotlight | null) => void;
}) {
  const t = useTranslations("briefing.storylineCard");
  const isReinforce = storyline.type === "reinforcement";
  const barColor = isReinforce ? ALIGNED_BAR_COLOR : FRICTION_BAR_COLOR;
  const docs = [...stats.docCounts.keys()];
  const barPct =
    maxCount > 0 ? Math.max(2, (stats.liveCount / maxCount) * 100) : 0;

  const spotlightTimer = useRef<number | null>(null);
  const clearTimer = () => {
    if (spotlightTimer.current !== null) {
      window.clearTimeout(spotlightTimer.current);
      spotlightTimer.current = null;
    }
  };
  useEffect(() => clearTimer, []);
  const show = () => {
    if (!onSpotlight || docs.length === 0) return;
    clearTimer();
    spotlightTimer.current = window.setTimeout(() => {
      onSpotlight({ docs, polarity: storyline.type });
    }, SPOTLIGHT_DELAY_MS);
  };
  const hide = () => {
    clearTimer();
    onSpotlight?.(null);
  };

  return (
    <button
      type="button"
      // Guided-tour anchor; the tour spotlights the first rendered box.
      data-tour="theme-card"
      onClick={() => {
        hide();
        onOpen();
      }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className="flex h-full w-full flex-col text-left rounded border border-gray-200 bg-white px-3.5 py-3 hover:border-gray-400 transition-colors"
    >
      <p
        className="min-h-[2.75em] text-[13px] text-[var(--undp-black)] leading-snug overflow-hidden"
        style={{
          fontFamily: HEADLINE_SERIF,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
        title={storyline.name}
      >
        {storyline.name}
      </p>
      <p
        className="mt-1.5 min-h-[2.75em] text-[11.5px] text-[var(--undp-gray)] leading-snug overflow-hidden"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {storyline.description}
      </p>
      <p className="mt-auto flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap pt-2.5">
        <span className="text-[15px] font-semibold tabular-nums text-[var(--undp-black)]">
          {stats.liveCount.toLocaleString()}
        </span>
        <span className="truncate text-[11px] text-[var(--undp-gray)]">
          {isReinforce
            ? t("boxAlignedLabel", { count: stats.liveCount })
            : t("boxMisalignedLabel", { count: stats.liveCount })}
        </span>
      </p>
      <span
        aria-hidden="true"
        className="mt-1.5 block h-1 w-full rounded-full bg-gray-200"
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${barPct}%`,
            backgroundColor: barColor,
            opacity: 0.75,
          }}
        />
      </span>
    </button>
  );
}
