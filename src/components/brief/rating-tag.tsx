"use client";

import { useTranslations } from "next-intl";
import type { Nr7Status } from "@/lib/labels";

/** A rating's word in `labels.nr7`. */
export const RATING_KEY: Record<Nr7Status, "onTrack" | "limited" | "noProgress" | "unknown"> = {
  on_track: "onTrack",
  limited: "limited",
  no_progress: "noProgress",
  unknown: "unknown",
};

/**
 * A target's rating in its country's 7th National Report: a mark and a word.
 * A rating is the country's own statement, not an alignment reading, so it
 * stays in ink (green and red belong to alignment, blue to money), and it
 * never rests on its mark alone. The marks are drawn in brief.css.
 */
export function RatingWord({ status }: { status: Nr7Status }) {
  const tl = useTranslations("labels.nr7");
  return (
    <span className="n7-word">
      <span className="n7-mark" data-status={status} aria-hidden="true" />
      {tl(RATING_KEY[status])}
    </span>
  );
}

/** The rating where the explorer shows a target: "7th National Report:
 *  Limited progress", the report named as the Implementation section names it. */
export function RatingTag({ status }: { status: Nr7Status }) {
  const t = useTranslations("brief.explore");
  return <span className="brief-rating-tag">{t.rich("rating", { word: () => <RatingWord status={status} /> })}</span>;
}
