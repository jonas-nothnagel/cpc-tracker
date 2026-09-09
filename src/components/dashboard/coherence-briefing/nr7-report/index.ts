/**
 * NR7 self-report module. Everything the rest of the briefing imports from
 * this feature comes through here; see README.md for the removal recipe.
 */
export { buildNr7Report, type Nr7ReportModel, type Nr7Signal, type Nr7TargetRow as Nr7TargetRowModel } from "./nr7-self-report";
export { nr7PairByTarget, type Nr7PairRef } from "./pair-by-target";
export { SignalLine } from "./signal-line";
export { Nr7TargetsList } from "./targets-list";
export { IndicatorsView } from "./indicators-view";
export { IndicatorCard } from "./indicator-card";
export { QuestionnaireTable } from "./questionnaire-table";
export { NR7_COLORS, NR7_STATUS_ORDER } from "./nr7-colors";
