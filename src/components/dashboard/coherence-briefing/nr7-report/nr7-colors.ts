import type { Nr7Status } from "./nr7-self-report";

/** The country's own progress ratings. Same swatches as the NR7 notes on
 *  the coverage rows (sections/implementation.tsx); every use pairs the
 *  colour with the rating word. */
export const NR7_STATUS_ORDER: Nr7Status[] = ["on_track", "limited", "no_progress", "unknown"];

export const NR7_COLORS: Record<Nr7Status, string> = {
  on_track: "#16a34a",
  limited: "#d97706",
  no_progress: "#dc2626",
  unknown: "#9ca3af",
};

export type AnswerKey = "yes" | "partially" | "underDevelopment" | "no";

export const ANSWER_ORDER: AnswerKey[] = ["yes", "partially", "underDevelopment", "no"];

export const ANSWER_COLORS: Record<AnswerKey, string> = {
  yes: "#16a34a",
  partially: "#d97706",
  underDevelopment: "#64748b",
  no: "#dc2626",
};

/** Biodiversity series colour (`--chart-nbt`). */
export const NR7_SERIES_COLOR = "#0d9488";
