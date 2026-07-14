import { getFeedbackClientId } from "@/lib/feedback/client-id";

import { getSessionId } from "./session";
import {
  ANALYTICS_BATCH_MAX_EVENTS,
  ANALYTICS_DURATION_MAX_MS,
  ANALYTICS_HREF_MAX,
  type AnalyticsPostEvent,
  type ClickRole,
  type TrackProps,
  type ViewportBucket,
} from "./types";

/**
 * Client-side event queue: batches events and flushes them to
 * POST /api/analytics via sendBeacon (with keepalive-fetch fallback), so
 * tracking never blocks interaction or navigation. Fire-and-forget: failed
 * sends drop events silently.
 *
 * All entry points no-op when disabled (server render, DNT/GPC, or
 * NEXT_PUBLIC_ANALYTICS_DISABLED=1) — components can call track()
 * unconditionally.
 *
 * REMOVABLE SYSTEM: see src/lib/analytics/README.md.
 */

const ENDPOINT = "/api/analytics";
const FLUSH_AT = 20;
const FLUSH_INTERVAL_MS = 15_000;

/** Where events are attributed to; set by the AnalyticsProvider on route change. */
export interface PageContext {
  route: string;
  country: string | null;
  locale: string;
}

interface CurrentView {
  viewId: string;
  /** Visible time accumulated across hide/show cycles. */
  accumulatedMs: number;
  /** When the current visible stretch started; null while hidden. */
  visibleSince: number | null;
}

let context: PageContext = { route: "/other", country: null, locale: "en" };
let currentView: CurrentView | null = null;
const queue: AnalyticsPostEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_ANALYTICS_DISABLED === "1") return false;
  if (navigator.doNotTrack === "1") return false;
  if (
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl
  ) {
    return false;
  }
  return true;
}

/** Start a page view (ending the previous one). Called by the provider. */
export function beginPageView(
  next: PageContext & { analysisId: string | null },
): void {
  if (!isEnabled()) return;
  const referrerRoute = currentView ? context.route : null;
  endPageView();
  context = { route: next.route, country: next.country, locale: next.locale };
  currentView = {
    viewId: newViewId(),
    accumulatedMs: 0,
    visibleSince: document.visibilityState === "visible" ? Date.now() : null,
  };
  enqueue({
    ...envelope(),
    type: "page_view",
    viewId: currentView.viewId,
    analysisId: next.analysisId,
    referrerRoute,
  });
}

/** Update attribution without starting a new view (e.g. locale switch). */
export function updatePageContext(partial: Partial<PageContext>): void {
  context = { ...context, ...partial };
}

/** Report the current view's visible duration (repeatable; max wins). */
export function reportPageLeave(): void {
  if (!isEnabled() || !currentView) return;
  pauseViewClock();
  enqueue({
    ...envelope(),
    type: "page_leave",
    viewId: currentView.viewId,
    durationMs: Math.min(currentView.accumulatedMs, ANALYTICS_DURATION_MAX_MS),
  });
}

/** Called by the provider when the tab becomes visible again. */
export function resumeViewClock(): void {
  if (currentView && currentView.visibleSince === null) {
    currentView.visibleSince = Date.now();
  }
}

function pauseViewClock(): void {
  if (currentView && currentView.visibleSince !== null) {
    currentView.accumulatedMs += Date.now() - currentView.visibleSince;
    currentView.visibleSince = null;
  }
}

function endPageView(): void {
  if (!currentView) return;
  reportPageLeave();
  currentView = null;
}

export function recordClick(click: {
  label: string;
  role: ClickRole;
  href: string | null;
  /** data-section-id ancestor at click time; null off-dashboard. */
  section: string | null;
}): void {
  if (!isEnabled()) return;
  enqueue({
    ...envelope(),
    type: "click",
    label: click.label,
    role: click.role,
    href: click.href ? click.href.slice(0, ANALYTICS_HREF_MAX) : click.href,
    section: click.section,
  });
}

/** Explicit domain-event API: track("drawer_opened", { kind: "theme" }). */
export function track(name: string, props: TrackProps = {}): void {
  if (!isEnabled()) return;
  enqueue({ ...envelope(), type: "track", name, props });
}

/** Flush the queue now; sendBeacon survives page unload. */
export function flushQueue(): void {
  if (queue.length === 0) return;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  while (queue.length > 0) {
    const batch = queue.splice(0, ANALYTICS_BATCH_MAX_EVENTS);
    const body = JSON.stringify({ events: batch });
    try {
      const sent =
        typeof navigator.sendBeacon === "function" &&
        navigator.sendBeacon(
          ENDPOINT,
          new Blob([body], { type: "application/json" }),
        );
      if (!sent) {
        void fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Telemetry is best-effort; drop the batch.
    }
  }
}

function enqueue(event: AnalyticsPostEvent): void {
  queue.push(event);
  if (queue.length >= FLUSH_AT) {
    flushQueue();
  } else if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushQueue();
    }, FLUSH_INTERVAL_MS);
  }
}

let cachedTz: string | undefined;

function envelope() {
  if (cachedTz === undefined) {
    try {
      cachedTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      cachedTz = "";
    }
  }
  return {
    ts: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    clientId: getFeedbackClientId(),
    sessionId: getSessionId(),
    locale: context.locale,
    route: context.route,
    country: context.country,
    viewport: viewportBucket(window.innerWidth),
    ua: uaFamily(navigator.userAgent),
    // The server derives viewerCountry from this and discards the timezone.
    tz: cachedTz,
  };
}

export function viewportBucket(width: number): ViewportBucket {
  if (width < 640) return "xs";
  if (width < 768) return "sm";
  if (width < 1024) return "md";
  if (width < 1280) return "lg";
  return "xl";
}

/** Coarse "browser/os" family; the raw UA string never leaves the browser. */
export function uaFamily(ua: string): string {
  const browser = /edg(e|a|ios)?\//i.test(ua)
    ? "edge"
    : /firefox\//i.test(ua)
      ? "firefox"
      : /chrome|crios\//i.test(ua)
        ? "chrome"
        : /safari\//i.test(ua)
          ? "safari"
          : "other";
  const os = /windows/i.test(ua)
    ? "windows"
    : /android/i.test(ua)
      ? "android"
      : /iphone|ipad|ipod/i.test(ua)
        ? "ios"
        : /mac os/i.test(ua)
          ? "mac"
          : /linux/i.test(ua)
            ? "linux"
            : "other";
  return `${browser}/${os}`;
}

function newViewId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % 36]).join("");
}
