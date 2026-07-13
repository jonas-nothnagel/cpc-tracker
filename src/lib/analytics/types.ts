/**
 * First-party usage analytics: append-only event ledger over app usage.
 *
 * Anonymous by construction: events carry the same pseudonymous per-browser
 * UUID as the feedback ledgers (src/lib/feedback/client-id.ts) and never
 * IPs, raw user agents, input values, or free-form URLs. The server rebuilds
 * every stored row field-by-field from a whitelist (validate.ts), so fields
 * outside these types are structurally impossible to persist.
 *
 * REMOVABLE SYSTEM: see src/lib/analytics/README.md before adding imports of
 * this module outside the four analytics roots.
 *
 * Pure types and constants; safe to import from client components.
 */

export const ANALYTICS_SCHEMA = 1;

export type AnalyticsEventType = "page_view" | "page_leave" | "click" | "track";

/** Viewport width bucket: <640, <768, <1024, <1280, >=1280 (Tailwind-ish). */
export type ViewportBucket = "xs" | "sm" | "md" | "lg" | "xl";

export type ClickRole = "button" | "link" | "tab" | "other";

export type TrackProps = Record<string, string | number | boolean>;

/** Fields shared by every event row. */
export interface AnalyticsEnvelope {
  schema: number;
  /** "YYYY-MM-DDTHH:MM:SSZ" (same format as the other ledgers). Client-stamped;
   *  the server replaces it when skewed more than ANALYTICS_TS_SKEW_MS. */
  ts: string;
  type: AnalyticsEventType;
  /** Pseudonymous per-browser UUID (shared with the feedback ledgers). */
  clientId: string;
  /** Per-tab UUID, rotated after 30 min idle (session.ts). */
  sessionId: string;
  locale: string;
  /** Route PATTERN (e.g. "/[country]"), never a raw path (route-pattern.ts). */
  route: string;
  /** Canonical country id when the route carries one, else null. */
  country: string | null;
  viewport: ViewportBucket;
  /** Coarse family only, "browser/os" (e.g. "chrome/windows"); never raw UA. */
  ua: string;
}

export interface PageViewEvent extends AnalyticsEnvelope {
  type: "page_view";
  /** Random 8-char id joining this view to its page_leave events. */
  viewId: string;
  /** Analysis run id when on /analysis/[id] or ?analysisId=; not PII. */
  analysisId: string | null;
  /** Previous in-app route pattern; never document.referrer. */
  referrerRoute: string | null;
}

export interface PageLeaveEvent extends AnalyticsEnvelope {
  type: "page_leave";
  viewId: string;
  /** Accumulated VISIBLE time on the view. May be reported more than once
   *  per viewId (tab re-shown); aggregation takes the max. */
  durationMs: number;
}

export interface ClickEvent extends AnalyticsEnvelope {
  type: "click";
  /** Sanitized element label (labels.ts); <= ANALYTICS_LABEL_MAX chars. */
  label: string;
  role: ClickRole;
  /** Internal pathname for links; external targets stored as "external". */
  href: string | null;
  /**
   * Dashboard section (data-section-id ancestor at click time; whitelisted
   * against SECTION_IDS in sections.ts). Added 2026-07 without a schema
   * bump: rows written earlier lack the field — readers must `?? null`.
   */
  section: string | null;
}

export interface TrackEvent extends AnalyticsEnvelope {
  type: "track";
  name: string;
  props: TrackProps;
}

export type AnalyticsEvent =
  | PageViewEvent
  | PageLeaveEvent
  | ClickEvent
  | TrackEvent;

/** POST /api/analytics body: client-stamped events minus the server-stamped schema. */
export type AnalyticsPostEvent = DistributiveOmit<AnalyticsEvent, "schema">;
export interface AnalyticsPostBody {
  events: AnalyticsPostEvent[];
}

/** Omit that distributes over union members (plain Omit collapses the union). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

// --- Caps (mirrored client-side and enforced server-side) -----------------

export const ANALYTICS_LABEL_MAX = 80;
export const ANALYTICS_HREF_MAX = 120;
export const ANALYTICS_BATCH_MAX_EVENTS = 50;
/** Client-side batch cap; safely under sendBeacon's 64 KB limit. */
export const ANALYTICS_BATCH_MAX_BYTES = 32_768;
/** Accepted client-clock skew before the server re-stamps ts. */
export const ANALYTICS_TS_SKEW_MS = 10 * 60_000;
/** durationMs cap: a view "watched" longer than 4 h is a parked tab. */
export const ANALYTICS_DURATION_MAX_MS = 4 * 60 * 60_000;

export const TRACK_NAME_RE = /^[a-z0-9_.:-]{1,64}$/;
export const TRACK_PROP_KEY_RE = /^[a-z0-9_]{1,32}$/;
export const TRACK_PROP_VALUE_MAX = 120;
export const TRACK_PROPS_MAX_KEYS = 10;

// --- Dashboard aggregation output (server → dashboard client) -------------

export interface AnalyticsSummary {
  range: { from: string; to: string };
  totals: { views: number; visitors: number; events: number };
  dailyUniques: { date: string; visitors: number; views: number }[];
  viewsByRoute: { route: string; views: number; visitors: number }[];
  countrySplit: { country: string; views: number }[];
  localeSplit: { locale: string; views: number }[];
  topClicks: { route: string; label: string; count: number }[];
  topTrackEvents: { name: string; count: number }[];
  sessions: {
    count: number;
    medianDurationMs: number;
    medianPagesPerSession: number;
  };
  durationByRoute: { route: string; medianMs: number; views: number }[];
  last24h: { views: number; visitors: number; recent: RecentEvent[] };
  /** "What gets used": all coherence-dashboard sections, page order, zero-filled. */
  sectionUsage: SectionUsage[];
  /** Ranked controls per section (top 10), for the usage-map drill-down. */
  elementsBySection: Record<string, { label: string; count: number }[]>;
}

/** One row of the "what gets used" usage map. */
export interface SectionUsage {
  section: string;
  name: string;
  blurb: string;
  /** 1-based position on the dashboard page. */
  order: number;
  /** Only rendered for countries with the relevant data (BER/BTR). */
  conditional: boolean;
  /** Attributed clicks + unambiguous drawer opens. */
  interactions: number;
  /** Unique browsers that scrolled the section into view. */
  viewers: number;
  /** Times the section was scrolled into view (bounces collapsed). */
  views: number;
  /** Approximate: derived from event gaps, capped; 0 when unknown. */
  medianDwellMs: number;
  /** interactions / all attributed interactions; 0..1. */
  shareOfInteractions: number;
}

/** Sanitized activity-feed row; never carries clientId/sessionId. */
export interface RecentEvent {
  ts: string;
  type: AnalyticsEventType;
  route: string;
  country: string | null;
  detail: string;
}
