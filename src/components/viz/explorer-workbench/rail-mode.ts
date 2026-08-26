/**
 * What the workbench's right rail shows.
 *
 * - `summary`: the corpus at a glance (stat tiles, strongest alignments, most
 *   conflicted targets, the rotating insight). The idle state.
 * - `answer`: a chat reply, an error, or a question still in flight.
 * - `detail`: a selected target or category; a live reply still stacks above
 *   it, matching the pre-rail "answers + detail" pairing.
 *
 * Selection wins over an answer. A question in flight counts as an answer so
 * the rail flips at once and a follow-up does not flicker back to the summary.
 * `dismissed` is the existing "answers collapsed" state: the user closed the
 * answer, the reply is kept and reachable through the top bar's Answers
 * control.
 */

export type RailMode = "summary" | "answer" | "detail";

export interface RailSignals {
  hasSelection: boolean;
  hasReply: boolean;
  hasError: boolean;
  loading: boolean;
  dismissed: boolean;
}

export function resolveRailMode(s: RailSignals): RailMode {
  if (s.hasSelection) return "detail";
  if (!s.dismissed && (s.hasReply || s.hasError || s.loading)) return "answer";
  return "summary";
}
