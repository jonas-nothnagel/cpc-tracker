/**
 * Canonical registry of the coherence dashboard's sections, plus the
 * plain-English display names the analytics dashboard uses for routes and
 * tracked events. Pure and client-safe.
 *
 * The section ids are DELIBERATELY duplicated from the dashboard's
 * SECTION_ORDER (src/components/dashboard/coherence-briefing/index.tsx):
 * importing them would drag the whole dashboard module graph into the
 * analytics lib and break the removability containment. sections.test.ts
 * locks the two lists together.
 *
 * REMOVABLE SYSTEM: see src/lib/analytics/README.md.
 */

export interface SectionInfo {
  /** Matches the dashboard's data-section-id / *_SECTION_ID constants. */
  id: string;
  /** 1-based position on the page, top to bottom. */
  order: number;
  /** Plain-English name for non-technical readers. */
  name: string;
  /** One-line description of what the section shows. */
  blurb: string;
  /** Rendered only for countries with the relevant data (BER / BTR). */
  conditional?: boolean;
}

export const SECTION_REGISTRY: SectionInfo[] = [
  { id: "direction", order: 1, name: "Direction", blurb: "Overall coherence verdict and the wheel" },
  { id: "doc-focus", order: 2, name: "Document in focus", blurb: "One plan examined against the others" },
  { id: "doc-pairs", order: 3, name: "Document pairs", blurb: "How each pair of plans gets along" },
  { id: "friction-types", order: 4, name: "Types of friction", blurb: "What kinds of conflicts appear" },
  { id: "where-to-focus", order: 5, name: "Where to focus", blurb: "Targets that concentrate the issues" },
  { id: "sectors", order: 6, name: "Sectors", blurb: "Coherence broken down by sector" },
  { id: "financing", order: 7, name: "Financing", blurb: "Budget reach of the plans", conditional: true },
  { id: "implementation", order: 8, name: "Implementation", blurb: "Delivery and reporting status", conditional: true },
  { id: "explore", order: 9, name: "Explore", blurb: "Free-form interactive workbench and chat" },
];

export const SECTION_IDS: ReadonlySet<string> = new Set(
  SECTION_REGISTRY.map((s) => s.id),
);

/**
 * drawer_opened kinds that unambiguously belong to one section.
 * "target-pair" is deliberately absent: those drawers open from many
 * sections (wheel ribbons, sector drawer, theme drawer, explore), so
 * attributing them to any single section would be dishonest.
 */
export const DRAWER_KIND_SECTION: Record<string, string> = {
  sector: "sectors",
  theme: "direction",
  storylines: "direction",
  "doc-pair": "doc-pairs",
};

/** Plain-English page names for the analytics UI (route pattern → name). */
export const ROUTE_NAMES: Record<string, string> = {
  "/": "Home page",
  "/dashboard": "Demo dashboard",
  "/[country]": "Country dashboard",
  "/[country]/upload": "Country upload wizard",
  "/upload": "Upload wizard",
  "/analysis/[id]": "Analysis results",
  "/methodology": "Methodology page",
  "/sustainability": "Sustainability page",
  "/prototypes": "Prototypes",
  "/[country]/model-comparison": "Model comparison",
  "/[country]/model-evaluation": "Model evaluation",
  "/[country]/explore": "Country explorer",
  "/other": "Other pages",
};

/** Plain-English descriptions of tracked events for the analytics UI. */
export const TRACK_EVENT_NAMES: Record<string, string> = {
  drawer_opened: "Opened a detail panel",
  panel_drilled: "Drilled deeper in a detail panel",
  chat_message_sent: "Sent a chat message",
  analysis_run_started: "Started an analysis",
  upload_step: "Moved through the upload steps",
  model_switched: "Switched AI model",
  section_viewed: "Scrolled to a dashboard section",
};
