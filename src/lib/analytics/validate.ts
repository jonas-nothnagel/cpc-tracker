import { isValidCountryId } from "@/config/countries";

import { ROUTE_PATTERNS } from "./route-pattern";
import { SECTION_IDS } from "./sections";
import {
  ANALYTICS_BATCH_MAX_EVENTS,
  ANALYTICS_DURATION_MAX_MS,
  ANALYTICS_HREF_MAX,
  ANALYTICS_LABEL_MAX,
  ANALYTICS_SCHEMA,
  ANALYTICS_TS_SKEW_MS,
  TRACK_NAME_RE,
  TRACK_PROP_KEY_RE,
  TRACK_PROP_VALUE_MAX,
  TRACK_PROPS_MAX_KEYS,
  type AnalyticsEvent,
  type ClickRole,
  type TrackProps,
  type ViewportBucket,
} from "./types";

/**
 * Validate an untrusted POST /api/analytics body into ledger-ready rows.
 * Pure function so every rule is unit-testable without the route.
 *
 * PII guardrail: each stored row is CONSTRUCTED field-by-field from
 * whitelisted, shape-checked values — extra fields on the wire (emails,
 * IPs, raw UAs, input values) are structurally impossible to persist.
 * Invalid events are skipped, not fatal; a batch with zero valid events
 * is an error so garbage traffic surfaces as 400 rather than silent 204s.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIEW_ID = /^[a-z0-9]{8}$/;
/** Analysis run ids as minted by the pipeline; never free-form text. */
const ANALYSIS_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const LOCALES = new Set(["en", "es", "mn"]);
const VIEWPORTS = new Set<ViewportBucket>(["xs", "sm", "md", "lg", "xl"]);
const CLICK_ROLES = new Set<ClickRole>(["button", "link", "tab", "other"]);
/** "browser/os" coarse families only (client.ts derives; this re-checks). */
const UA_FAMILY = /^[a-z]{2,12}\/[a-z]{2,12}$/;
/** Internal pathname or the literal "external" marker. */
const INTERNAL_HREF = /^\/[\x21-\x7e]*$/;

export type ParsedAnalytics =
  | { ok: true; events: AnalyticsEvent[] }
  | { ok: false; error: string };

export function parseAnalyticsBatch(
  raw: unknown,
  now: Date = new Date(),
): ParsedAnalytics {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const events = (raw as Record<string, unknown>).events;
  if (!Array.isArray(events) || events.length === 0) {
    return { ok: false, error: "events must be a non-empty array" };
  }
  if (events.length > ANALYTICS_BATCH_MAX_EVENTS) {
    return { ok: false, error: "Too many events in batch" };
  }

  const rows: AnalyticsEvent[] = [];
  for (const item of events) {
    const row = parseEvent(item, now);
    if (row) rows.push(row);
  }
  if (rows.length === 0) {
    return { ok: false, error: "No valid events in batch" };
  }
  return { ok: true, events: rows };
}

function parseEvent(item: unknown, now: Date): AnalyticsEvent | null {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return null;
  }
  const e = item as Record<string, unknown>;

  const clientId = str(e.clientId);
  const sessionId = str(e.sessionId);
  if (!clientId || !UUID.test(clientId)) return null;
  if (!sessionId || !UUID.test(sessionId)) return null;

  const route = str(e.route);
  if (!route || !ROUTE_PATTERNS.has(route)) return null;

  const locale = str(e.locale);
  const viewport = str(e.viewport);
  const ua = str(e.ua);
  if (!locale || !LOCALES.has(locale)) return null;
  if (!viewport || !VIEWPORTS.has(viewport as ViewportBucket)) return null;
  if (!ua || !UA_FAMILY.test(ua)) return null;

  let country: string | null = null;
  if (typeof e.country === "string") {
    const lowered = e.country.toLowerCase();
    if (!isValidCountryId(lowered)) return null;
    country = lowered;
  }

  const envelope = {
    schema: ANALYTICS_SCHEMA,
    ts: clampTs(str(e.ts), now),
    clientId,
    sessionId,
    locale,
    route,
    country,
    viewport: viewport as ViewportBucket,
    ua,
  };

  switch (e.type) {
    case "page_view": {
      const viewId = str(e.viewId);
      if (!viewId || !VIEW_ID.test(viewId)) return null;
      const analysisId = str(e.analysisId);
      const referrerRoute = str(e.referrerRoute);
      return {
        ...envelope,
        type: "page_view",
        viewId,
        analysisId:
          analysisId && ANALYSIS_ID.test(analysisId) ? analysisId : null,
        referrerRoute:
          referrerRoute && ROUTE_PATTERNS.has(referrerRoute)
            ? referrerRoute
            : null,
      };
    }
    case "page_leave": {
      const viewId = str(e.viewId);
      if (!viewId || !VIEW_ID.test(viewId)) return null;
      if (typeof e.durationMs !== "number" || !Number.isFinite(e.durationMs)) {
        return null;
      }
      const durationMs = Math.min(
        Math.max(0, Math.round(e.durationMs)),
        ANALYTICS_DURATION_MAX_MS,
      );
      return { ...envelope, type: "page_leave", viewId, durationMs };
    }
    case "click": {
      const label = str(e.label);
      if (!label) return null;
      const role = str(e.role);
      if (!role || !CLICK_ROLES.has(role as ClickRole)) return null;
      let href: string | null = null;
      const rawHref = str(e.href);
      if (rawHref === "external") {
        href = "external";
      } else if (rawHref && INTERNAL_HREF.test(rawHref)) {
        href = rawHref.slice(0, ANALYTICS_HREF_MAX);
      }
      // Unknown/foreign sections degrade to null; never reject the click.
      const rawSection = str(e.section);
      return {
        ...envelope,
        type: "click",
        // Truncate-don't-reject: a long label is a UI quirk, not an attack.
        label: label.slice(0, ANALYTICS_LABEL_MAX),
        role: role as ClickRole,
        href,
        section:
          rawSection && SECTION_IDS.has(rawSection) ? rawSection : null,
      };
    }
    case "track": {
      const name = str(e.name);
      if (!name || !TRACK_NAME_RE.test(name)) return null;
      const props: TrackProps = {};
      if (typeof e.props === "object" && e.props !== null) {
        for (const [key, value] of Object.entries(e.props)) {
          if (Object.keys(props).length >= TRACK_PROPS_MAX_KEYS) break;
          if (!TRACK_PROP_KEY_RE.test(key)) continue;
          if (typeof value === "boolean") props[key] = value;
          else if (typeof value === "number" && Number.isFinite(value)) {
            props[key] = value;
          } else if (typeof value === "string") {
            props[key] = value.slice(0, TRACK_PROP_VALUE_MAX);
          }
        }
      }
      return { ...envelope, type: "track", name, props };
    }
    default:
      return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Accept the client clock within ±10 min; otherwise stamp server time. */
function clampTs(ts: string | null, now: Date): string {
  const serverTs = now.toISOString().replace(/\.\d+Z$/, "Z");
  if (!ts) return serverTs;
  const parsed = Date.parse(ts);
  if (Number.isNaN(parsed)) return serverTs;
  if (Math.abs(parsed - now.getTime()) > ANALYTICS_TS_SKEW_MS) return serverTs;
  return new Date(parsed).toISOString().replace(/\.\d+Z$/, "Z");
}
