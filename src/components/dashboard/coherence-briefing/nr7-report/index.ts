/**
 * NR7 self-report module. Everything the rest of the briefing imports from
 * this feature comes through here; see README.md for the removal recipe.
 */
export { buildNr7Report, type Nr7ReportModel, type Nr7Signal } from "./nr7-self-report";
export { Nr7ReportDrawer } from "./nr7-report-drawer";
export { Nr7ReportsStrip } from "./reports-strip";
export { DEFAULT_NR7_REPORT_VIEW, type Nr7ReportView } from "./view";
