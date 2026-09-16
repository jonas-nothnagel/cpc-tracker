import type { Nr7Status } from "./nr7-self-report";

/** The country's own progress ratings, as a sequential ramp (green, amber,
 *  dark amber, grey): a rating is ordinal, so the hues step within one
 *  family and never reach the alignment red (`ALIGNMENT_COLORS.flagged`),
 *  which marks a pair flagged for review, a different thing that sits beside
 *  a rating on the Implementation slide. The one map for every NR7 surface
 *  (the coverage rows, the NR7 progress view, the sticky column); every use
 *  pairs the colour with the rating word. */
export const NR7_STATUS_ORDER: Nr7Status[] = ["on_track", "limited", "no_progress", "unknown"];

export const NR7_COLORS: Record<Nr7Status, string> = {
  on_track: "#16a34a",
  limited: "#d97706",
  no_progress: "#92400e",
  unknown: "#9ca3af",
};

export type AnswerKey = "yes" | "partially" | "underDevelopment" | "no";

export const ANSWER_ORDER: AnswerKey[] = ["yes", "partially", "underDevelopment", "no"];

/** Questionnaire answers. "No" is slate, not red: the answer bar renders
 *  inside an open policy-link row beside the flagged-pairs box, and red there
 *  means a pair to review. Every segment carries its word. */
export const ANSWER_COLORS: Record<AnswerKey, string> = {
  yes: "#16a34a",
  partially: "#d97706",
  underDevelopment: "#64748b",
  no: "#334155",
};

/** Biodiversity series colour (`--chart-nbt`). */
export const NR7_SERIES_COLOR = "#0d9488";
