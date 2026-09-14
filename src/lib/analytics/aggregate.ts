import { regionForLabel } from "./miniature-regions";
import { DRAWER_KIND_SECTION, SECTION_IDS, SECTION_REGISTRY } from "./sections";
import type {
  AnalyticsEvent,
  AnalyticsSummary,
  RecentEvent,
  SectionUsage,
} from "./types";

/**
 * Fold raw ledger events into the dashboard summary. Pure functions over
 * AnalyticsEvent[]; the server page calls aggregate() and passes ONLY the
 * summary to the client — clientId/sessionId never leave the server.
 *
 * Sessions are derived, not stored: a session is all events sharing a
 * sessionId; its duration is last ts − first ts. View durations take the
 * max durationMs per viewId because page_leave can repeat per view.
 */

const DAY_MS = 24 * 60 * 60_000;
/** Dwell samples above this are parked tabs, not reading (cap, not drop). */
const SECTION_DWELL_MAX_MS = 15 * 60_000;
/** Routes where the coherence dashboard (and its sections) renders. */
const DASHBOARD_ROUTES = new Set(["/dashboard", "/[country]", "/[country]/explore"]);

export function aggregate(
  events: AnalyticsEvent[],
  now: Date = new Date(),
): AnalyticsSummary {
  const views = events.filter((e) => e.type === "page_view");
  const clicks = events.filter((e) => e.type === "click");
  const tracks = events.filter((e) => e.type === "track");

  // Max visible duration per viewId, joined back to the view's route.
  const durationByViewId = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "page_leave") continue;
    const prev = durationByViewId.get(e.viewId) ?? 0;
    durationByViewId.set(e.viewId, Math.max(prev, e.durationMs));
  }

  // Daily uniques.
  const byDay = new Map<string, { visitors: Set<string>; views: number }>();
  for (const v of views) {
    const date = v.ts.slice(0, 10);
    const day = byDay.get(date) ?? { visitors: new Set(), views: 0 };
    day.visitors.add(v.clientId);
    day.views += 1;
    byDay.set(date, day);
  }
  const dailyUniques = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, visitors: d.visitors.size, views: d.views }));

  // Views by route (+ per-route visitor uniques and durations).
  const byRoute = new Map<
    string,
    { views: number; visitors: Set<string>; durations: number[] }
  >();
  for (const v of views) {
    const entry =
      byRoute.get(v.route) ??
      ({ views: 0, visitors: new Set(), durations: [] } as {
        views: number;
        visitors: Set<string>;
        durations: number[];
      });
    entry.views += 1;
    entry.visitors.add(v.clientId);
    const duration = durationByViewId.get(v.viewId);
    if (duration !== undefined) entry.durations.push(duration);
    byRoute.set(v.route, entry);
  }
  const viewsByRoute = [...byRoute.entries()]
    .map(([route, r]) => ({ route, views: r.views, visitors: r.visitors.size }))
    .sort((a, b) => b.views - a.views);
  const durationByRoute = [...byRoute.entries()]
    .filter(([, r]) => r.durations.length > 0)
    .map(([route, r]) => ({
      route,
      medianMs: median(r.durations),
      views: r.durations.length,
    }))
    .sort((a, b) => b.views - a.views);

  // Country / locale splits (page views only, so one interaction = one vote).
  const countrySplit = countBy(
    views.filter((v) => v.country !== null),
    (v) => v.country as string,
  ).map(([country, views]) => ({ country, views }));

  // Viewer locations (timezone-derived at ingest; legacy rows lack the
  // field → "unknown" bucket so totals stay honest).
  const byViewerCountry = new Map<
    string,
    { visitors: Set<string>; views: number }
  >();
  for (const v of views) {
    const code = v.viewerCountry ?? "unknown";
    const entry =
      byViewerCountry.get(code) ?? { visitors: new Set<string>(), views: 0 };
    entry.visitors.add(v.clientId);
    entry.views += 1;
    byViewerCountry.set(code, entry);
  }
  const viewerCountrySplit = [...byViewerCountry.entries()]
    .map(([code, d]) => ({ code, visitors: d.visitors.size, views: d.views }))
    .sort((a, b) => b.views - a.views);
  const localeSplit = countBy(views, (v) => v.locale).map(
    ([locale, views]) => ({ locale, views }),
  );

  // Top clicks per route + top named events.
  const topClicks = countBy(clicks, (c) =>
    c.type === "click" ? `${c.route}\u0000${c.label}` : "",
  )
    .slice(0, 30)
    .map(([key, count]) => {
      const [route, label] = key.split("\u0000");
      return { route, label, count };
    });
  const topTrackEvents = countBy(tracks, (t) =>
    t.type === "track" ? t.name : "",
  ).map(([name, count]) => ({ name, count }));

  // Sessions.
  const bySession = new Map<
    string,
    { first: number; last: number; pages: number }
  >();
  for (const e of events) {
    const t = Date.parse(e.ts);
    if (Number.isNaN(t)) continue;
    const s = bySession.get(e.sessionId) ?? { first: t, last: t, pages: 0 };
    s.first = Math.min(s.first, t);
    s.last = Math.max(s.last, t);
    if (e.type === "page_view") s.pages += 1;
    bySession.set(e.sessionId, s);
  }
  const sessionList = [...bySession.values()];
  const sessions = {
    count: sessionList.length,
    medianDurationMs: median(sessionList.map((s) => s.last - s.first)),
    medianPagesPerSession: median(sessionList.map((s) => s.pages)),
  };

  // Last 24 h.
  const cutoff = now.getTime() - DAY_MS;
  const recentEvents = events.filter((e) => {
    const t = Date.parse(e.ts);
    return !Number.isNaN(t) && t >= cutoff;
  });
  const last24h = {
    views: recentEvents.filter((e) => e.type === "page_view").length,
    visitors: new Set(
      recentEvents
        .filter((e) => e.type === "page_view")
        .map((e) => e.clientId),
    ).size,
    recent: recentEvents
      .slice(-50)
      .reverse()
      .map(toRecentEvent),
  };

  const timestamps = events
    .map((e) => e.ts)
    .filter((ts) => !Number.isNaN(Date.parse(ts)))
    .sort();

  const { sectionUsage, elementsBySection, regionsBySection } =
    aggregateSections(events);

  return {
    sectionUsage,
    elementsBySection,
    regionsBySection,
    range: {
      from: timestamps[0] ?? "",
      to: timestamps[timestamps.length - 1] ?? "",
    },
    totals: {
      views: views.length,
      visitors: new Set(views.map((v) => v.clientId)).size,
      events: events.length,
    },
    dailyUniques,
    viewsByRoute,
    countrySplit,
    viewerCountrySplit,
    localeSplit,
    topClicks,
    topTrackEvents,
    sessions,
    durationByRoute,
    last24h,
  };
}

/**
 * Section-level usage for the coherence dashboard ("what gets used most vs
 * least"). Considers only events on dashboard routes. Interactions = clicks
 * carrying a section (rows written before 2026-07 lack the field → `?? null`)
 * plus drawer_opened tracks whose kind maps unambiguously to one section.
 * Views/viewers come from section_viewed tracks, with consecutive
 * same-session same-section events collapsed (scroll bounce). Dwell is
 * DERIVED: the gap from a section_viewed to the session's next event
 * (section change or page view/leave), capped; approximate by design.
 * Always returns all registry sections, zero-filled, in page order.
 */
function aggregateSections(events: AnalyticsEvent[]): {
  sectionUsage: SectionUsage[];
  elementsBySection: Record<string, { label: string; count: number }[]>;
  regionsBySection: Record<string, { region: string; count: number }[]>;
} {
  const onDashboard = events.filter((e) => DASHBOARD_ROUTES.has(e.route));

  // Interactions + element ranking + miniature-region rollup. Region counts
  // sum exactly to `interactions` per section: every label lands somewhere
  // (the registry's catch-all region guarantees it).
  const interactionsBySection = new Map<string, number>();
  const elementCounts = new Map<string, Map<string, number>>();
  const regionCounts = new Map<string, Map<string, number>>();
  const bump = (section: string, label: string) => {
    interactionsBySection.set(
      section,
      (interactionsBySection.get(section) ?? 0) + 1,
    );
    const labels = elementCounts.get(section) ?? new Map<string, number>();
    labels.set(label, (labels.get(label) ?? 0) + 1);
    elementCounts.set(section, labels);
    const regions = regionCounts.get(section) ?? new Map<string, number>();
    const region = regionForLabel(section, label);
    regions.set(region, (regions.get(region) ?? 0) + 1);
    regionCounts.set(section, regions);
  };
  for (const e of onDashboard) {
    if (e.type === "click") {
      const section = e.section ?? null;
      if (section !== null && SECTION_IDS.has(section)) bump(section, e.label);
    } else if (e.type === "track" && e.name === "drawer_opened") {
      const kind = typeof e.props.kind === "string" ? e.props.kind : "";
      const section = DRAWER_KIND_SECTION[kind];
      if (section) bump(section, `Detail panel: ${kind}`);
    }
  }
  const totalInteractions = [...interactionsBySection.values()].reduce(
    (a, b) => a + b,
    0,
  );

  // section_viewed per session, in ts order, scroll bounces collapsed.
  // `section: null` entries are page views/leaves: they end a dwell sample
  // and break a "same section" run without counting as a section view.
  const bySession = new Map<
    string,
    { ts: number; section: string | null; clientId: string }[]
  >();
  for (const e of onDashboard) {
    const t = Date.parse(e.ts);
    if (Number.isNaN(t)) continue;
    let section: string | null = null;
    if (e.type === "track" && e.name === "section_viewed") {
      const raw = e.props.section;
      if (typeof raw !== "string" || !SECTION_IDS.has(raw)) continue;
      section = raw;
    } else if (e.type !== "page_view" && e.type !== "page_leave") {
      continue;
    }
    const list = bySession.get(e.sessionId) ?? [];
    list.push({ ts: t, section, clientId: e.clientId });
    bySession.set(e.sessionId, list);
  }

  const viewsBySection = new Map<string, number>();
  const viewersBySection = new Map<string, Set<string>>();
  const dwellBySection = new Map<string, number[]>();
  for (const list of bySession.values()) {
    list.sort((a, b) => a.ts - b.ts);
    let prevSection: string | null = null;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item.section === null) {
        prevSection = null;
        continue;
      }
      if (item.section === prevSection) continue; // collapsed scroll bounce
      prevSection = item.section;
      viewsBySection.set(
        item.section,
        (viewsBySection.get(item.section) ?? 0) + 1,
      );
      const viewers = viewersBySection.get(item.section) ?? new Set<string>();
      viewers.add(item.clientId);
      viewersBySection.set(item.section, viewers);
      // Dwell ends at the next DIFFERENT section (or page view/leave) —
      // collapsed same-section bounces extend the stay, they don't end it.
      const next = list
        .slice(i + 1)
        .find((n) => n.section !== item.section);
      if (next) {
        const dwell = Math.min(next.ts - item.ts, SECTION_DWELL_MAX_MS);
        const samples = dwellBySection.get(item.section) ?? [];
        samples.push(dwell);
        dwellBySection.set(item.section, samples);
      }
    }
  }

  const sectionUsage: SectionUsage[] = SECTION_REGISTRY.map((s) => {
    const interactions = interactionsBySection.get(s.id) ?? 0;
    return {
      section: s.id,
      name: s.name,
      blurb: s.blurb,
      order: s.order,
      conditional: s.conditional ?? false,
      interactions,
      viewers: viewersBySection.get(s.id)?.size ?? 0,
      views: viewsBySection.get(s.id) ?? 0,
      medianDwellMs: median(dwellBySection.get(s.id) ?? []),
      shareOfInteractions:
        totalInteractions > 0 ? interactions / totalInteractions : 0,
    };
  });

  const elementsBySection: Record<string, { label: string; count: number }[]> =
    {};
  for (const [section, labels] of elementCounts) {
    elementsBySection[section] = [...labels.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([label, count]) => ({ label, count }));
  }

  const regionsBySection: Record<string, { region: string; count: number }[]> =
    {};
  for (const [section, regions] of regionCounts) {
    regionsBySection[section] = [...regions.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([region, count]) => ({ region, count }));
  }

  return { sectionUsage, elementsBySection, regionsBySection };
}

/** Strip identifying fields for the activity feed. */
function toRecentEvent(e: AnalyticsEvent): RecentEvent {
  let detail = "";
  switch (e.type) {
    case "page_view":
      detail = e.referrerRoute ? `from ${e.referrerRoute}` : "";
      break;
    case "page_leave":
      detail = `${Math.round(e.durationMs / 1000)}s on page`;
      break;
    case "click":
      detail = e.label;
      break;
    case "track":
      detail = e.name;
      break;
  }
  return {
    ts: e.ts,
    type: e.type,
    route: e.route,
    country: e.country,
    detail,
  };
}

function countBy<T>(items: T[], key: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
