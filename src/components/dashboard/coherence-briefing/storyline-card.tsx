"use client";

/**
 * ThemeBox — one corpus theme as a compact box in the Direction section's
 * side-by-side columns (coherent themes left, potentially misaligned themes
 * right). Leads with the noun-phrase theme name, a short clamped description
 * of what recurs, and the live pair count worded to say what it counts
 * (pairs grouped under this theme / pairs across the documents it links).
 * Clicking opens the ThemeDrawer; hovering spotlights the theme's documents
 * on the adjacent wheel.
 *
 * The spotlight fires through a short hover-intent delay so sweeping the
 * cursor across a column toward the other one does not strobe the wheel
 * with transient filter flips.
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
  onOpen,
  onSpotlight,
}: {
  storyline: CorpusStoryline;
  stats: StorylineLiveStats;
  onOpen: () => void;
  onSpotlight?: (spotlight: ThemeSpotlight | null) => void;
}) {
  const t = useTranslations("briefing.storylineCard");
  const isReinforce = storyline.type === "reinforcement";
  const docs = [...stats.docCounts.keys()];

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
        className="text-[13.5px] text-[var(--undp-black)] leading-snug"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {storyline.name}
      </p>
      <p
        className="mt-1.5 text-[11.5px] text-[var(--undp-gray)] leading-snug overflow-hidden"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {storyline.description}
      </p>
      <p className="mt-2 text-[10.5px] text-[var(--undp-gray)] tabular-nums">
        {isReinforce
          ? t("boxAligned", { count: stats.liveCount })
          : t("boxMisaligned", { count: stats.liveCount })}
      </p>
    </button>
  );
}
