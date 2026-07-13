import { describe, expect, it } from "vitest";

import { aggregate, median } from "./aggregate";
import { ANALYTICS_SCHEMA, type AnalyticsEvent } from "./types";

const NOW = new Date("2026-07-13T12:00:00Z");

function ev(overrides: Partial<AnalyticsEvent> & { type: AnalyticsEvent["type"] }): AnalyticsEvent {
  return {
    schema: ANALYTICS_SCHEMA,
    ts: "2026-07-13T10:00:00Z",
    clientId: "c1",
    sessionId: "s1",
    locale: "en",
    route: "/dashboard",
    country: "mongolia",
    viewport: "lg",
    ua: "chrome/linux",
    ...(overrides.type === "page_view"
      ? { viewId: "v0000001", analysisId: null, referrerRoute: null }
      : {}),
    ...(overrides.type === "page_leave" ? { viewId: "v0000001", durationMs: 0 } : {}),
    ...(overrides.type === "click"
      ? { label: "Run analysis", role: "button", href: null }
      : {}),
    ...(overrides.type === "track" ? { name: "drawer_opened", props: {} } : {}),
    ...overrides,
  } as AnalyticsEvent;
}

describe("median", () => {
  it("handles odd, even, and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3); // rounded (2+3)/2 = 2.5 -> 3
    expect(median([])).toBe(0);
  });
});

describe("aggregate", () => {
  it("computes daily uniques from page views", () => {
    const summary = aggregate(
      [
        ev({ type: "page_view", clientId: "a", ts: "2026-07-12T09:00:00Z" }),
        ev({ type: "page_view", clientId: "a", ts: "2026-07-12T10:00:00Z" }),
        ev({ type: "page_view", clientId: "b", ts: "2026-07-13T10:00:00Z" }),
      ],
      NOW,
    );
    expect(summary.dailyUniques).toEqual([
      { date: "2026-07-12", visitors: 1, views: 2 },
      { date: "2026-07-13", visitors: 1, views: 1 },
    ]);
    expect(summary.totals).toMatchObject({ views: 3, visitors: 2 });
  });

  it("takes the max page_leave duration per viewId", () => {
    const summary = aggregate(
      [
        ev({ type: "page_view", viewId: "v0000001" }),
        ev({ type: "page_leave", viewId: "v0000001", durationMs: 5_000 }),
        ev({ type: "page_leave", viewId: "v0000001", durationMs: 30_000 }),
      ],
      NOW,
    );
    expect(summary.durationByRoute).toEqual([
      { route: "/dashboard", medianMs: 30_000, views: 1 },
    ]);
  });

  it("derives sessions with median duration and pages", () => {
    const summary = aggregate(
      [
        ev({ type: "page_view", sessionId: "s1", ts: "2026-07-13T10:00:00Z" }),
        ev({ type: "page_view", sessionId: "s1", ts: "2026-07-13T10:10:00Z" }),
        ev({ type: "page_view", sessionId: "s2", ts: "2026-07-13T11:00:00Z" }),
      ],
      NOW,
    );
    expect(summary.sessions.count).toBe(2);
    expect(summary.sessions.medianDurationMs).toBe(5 * 60_000); // (10m + 0m) / 2
    expect(summary.sessions.medianPagesPerSession).toBe(2); // rounded 1.5
  });

  it("splits by country and locale, counting page views only", () => {
    const summary = aggregate(
      [
        ev({ type: "page_view", country: "mongolia" }),
        ev({ type: "page_view", country: "panama", locale: "es" }),
        ev({ type: "click", country: "panama" }),
      ],
      NOW,
    );
    expect(summary.countrySplit).toEqual([
      { country: "mongolia", views: 1 },
      { country: "panama", views: 1 },
    ]);
    expect(summary.localeSplit).toEqual([
      { locale: "en", views: 1 },
      { locale: "es", views: 1 },
    ]);
  });

  it("folds top clicks preserving labels with spaces", () => {
    const summary = aggregate(
      [
        ev({ type: "click", label: "Run analysis now" }),
        ev({ type: "click", label: "Run analysis now" }),
        ev({ type: "click", label: "Close" }),
      ],
      NOW,
    );
    expect(summary.topClicks[0]).toEqual({
      route: "/dashboard",
      label: "Run analysis now",
      count: 2,
    });
  });

  it("restricts last24h to the window and strips identifiers", () => {
    const summary = aggregate(
      [
        ev({ type: "page_view", ts: "2026-07-01T10:00:00Z", clientId: "old" }),
        ev({ type: "page_view", ts: "2026-07-13T11:30:00Z", clientId: "new" }),
      ],
      NOW,
    );
    expect(summary.last24h.views).toBe(1);
    expect(summary.last24h.visitors).toBe(1);
    expect(summary.last24h.recent).toHaveLength(1);
    expect(JSON.stringify(summary.last24h.recent)).not.toContain("new");
  });
});
