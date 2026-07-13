import type {
  AnalyticsEvent,
  AnalyticsSummary,
  RecentEvent,
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

  return {
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
    localeSplit,
    topClicks,
    topTrackEvents,
    sessions,
    durationByRoute,
    last24h,
  };
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
