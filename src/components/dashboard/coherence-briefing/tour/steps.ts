import type { Placement } from "./geometry";

/**
 * Declarative step registry for the "How to read this chart" guided tours.
 *
 * `target` names a `data-tour="…"` attribute rendered by the centerpiece.
 * Targets are resolved inside a scope root at tour start; steps whose target
 * is not currently rendered (conditional UI, hidden documents, missing data)
 * are silently dropped, so tours degrade gracefully.
 *
 * Step copy lives in the `briefing.tour.{tourId}.steps.{stepId}` i18n
 * namespace — never here — so all three locales stay in lockstep.
 */

export type BriefingTourId =
  | "wheel"
  | "docMatrix"
  | "financing"
  | "fundingGrid"
  | "deliveryRoster"
  | "institutionFlow"
  | "frictionTypes"
  | "directionThemes"
  | "docFocus"
  | "docPairs"
  | "sectors"
  | "whereToFocus"
  | "implementationCoverage";

export interface TourStep {
  /** i18n key segment under `briefing.tour.{tourId}.steps`. */
  id: string;
  /** Value of the `data-tour` attribute to spotlight. */
  target: string;
  /** Preferred tooltip side; the engine flips/falls back when cramped. */
  placement?: Placement;
}

export const TOUR_STEPS: Record<BriefingTourId, TourStep[]> = {
  wheel: [
    { id: "arcs", target: "wheel-arcs" },
    { id: "ribbons", target: "wheel-ribbons" },
    { id: "labels", target: "wheel-labels" },
    { id: "docToggle", target: "doc-toggle", placement: "bottom" },
  ],
  docMatrix: [
    { id: "grid", target: "matrix-grid", placement: "left" },
    { id: "diagonal", target: "matrix-diagonal", placement: "bottom" },
    { id: "colours", target: "matrix-legend-colours", placement: "top" },
    { id: "intensity", target: "matrix-legend-intensity", placement: "top" },
  ],
  financing: [
    { id: "source", target: "financing-source", placement: "bottom" },
    { id: "concentration", target: "financing-concentration", placement: "left" },
    { id: "execution", target: "financing-execution", placement: "top" },
  ],
  // The funding-target-grid layout (Panama-style slides). The centerpiece
  // "financing" tour above stays for countries that render it.
  fundingGrid: [
    { id: "kpis", target: "grid-kpis", placement: "bottom" },
    { id: "dots", target: "grid-dots", placement: "bottom" },
    { id: "globe", target: "grid-globe", placement: "top" },
    { id: "method", target: "grid-method", placement: "top" },
  ],
  deliveryRoster: [
    { id: "statusKey", target: "roster-status-key", placement: "bottom" },
    { id: "rows", target: "roster-rows", placement: "left" },
    { id: "caveat", target: "roster-caveat", placement: "top" },
  ],
  institutionFlow: [
    { id: "institutions", target: "flow-institutions", placement: "right" },
    { id: "ribbons", target: "flow-ribbons" },
    { id: "documents", target: "flow-documents", placement: "left" },
    { id: "drilldown", target: "flow-drilldown", placement: "top" },
  ],
  frictionTypes: [
    { id: "bar", target: "friction-bar", placement: "bottom" },
    { id: "mechanisms", target: "friction-mechanisms", placement: "bottom" },
    { id: "total", target: "friction-total", placement: "bottom" },
  ],
  directionThemes: [
    { id: "columns", target: "themes-columns", placement: "top" },
    { id: "card", target: "theme-card", placement: "bottom" },
    { id: "interact", target: "theme-card", placement: "bottom" },
  ],
  docFocus: [
    { id: "switcher", target: "doc-switcher", placement: "bottom" },
    { id: "pairs", target: "flagged-pairs", placement: "top" },
  ],
  docPairs: [
    { id: "list", target: "pair-list", placement: "top" },
    { id: "balance", target: "pair-balance", placement: "bottom" },
    { id: "sync", target: "pair-list", placement: "top" },
  ],
  sectors: [
    { id: "lenses", target: "sector-lenses", placement: "bottom" },
    { id: "columns", target: "sector-columns", placement: "bottom" },
    { id: "rows", target: "sector-rows", placement: "top" },
    { id: "flagShare", target: "sector-flag-share", placement: "bottom" },
  ],
  whereToFocus: [
    { id: "bar", target: "concentration-bar", placement: "bottom" },
    { id: "legend", target: "concentration-legend", placement: "bottom" },
    { id: "list", target: "hotspot-list", placement: "top" },
  ],
  implementationCoverage: [
    { id: "legend", target: "coverage-legend", placement: "bottom" },
    { id: "dots", target: "coverage-dots", placement: "bottom" },
    { id: "review", target: "coverage-review", placement: "bottom" },
  ],
};
