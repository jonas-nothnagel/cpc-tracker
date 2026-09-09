/** What the reader has set up in the NR7 drawer. Held by the panel host so
 *  stepping back from a target profile returns to the same view. */
export interface Nr7ReportView {
  tab: "targets" | "indicators";
  /** One national target open at a time. */
  expandedTargetId: string | null;
  /** Indicator card to scroll to and outline after a chip or signal click. */
  focusIndicatorId: string | null;
}

export const DEFAULT_NR7_REPORT_VIEW: Nr7ReportView = {
  tab: "targets",
  expandedTargetId: null,
  focusIndicatorId: null,
};
