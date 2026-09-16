/**
 * NR7 self-report module. Everything the rest of the briefing imports from
 * this feature comes through here; see README.md for the removal recipe.
 */
export {
  buildNr7Report,
  NR7_POLICY_LINK_DOC,
  shortText as shortNr7Text,
  stripDeadlinePrefix as stripNr7Deadline,
  type Nr7PolicyLink,
  type Nr7PolicyLinks,
  type Nr7ReportModel,
  type Nr7Signal,
  type Nr7TargetRow as Nr7TargetRowModel,
} from "./nr7-self-report";
export { nr7PairByTarget, type Nr7PairRef } from "./pair-by-target";
export { SignalLine } from "./signal-line";
export { Nr7TargetsList } from "./targets-list";
export { Nr7TargetDetail } from "./target-detail";
export { IndicatorsView } from "./indicators-view";
export { IndicatorCard } from "./indicator-card";
export { QuestionnaireTable } from "./questionnaire-table";
export { NR7_COLORS, NR7_STATUS_ORDER } from "./nr7-colors";
export { GbfChip, gbfNumber } from "./gbf-chip";
export { groupRowsByGbfTarget, GBF_TARGET_COUNT, type GbfGroup } from "./gbf-groups";
