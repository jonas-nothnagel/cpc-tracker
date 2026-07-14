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
      ? { label: "Run analysis", role: "button", href: null, section: null }
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

  it("splits viewer locations with an unknown bucket for legacy rows", () => {
    const summary = aggregate(
      [
        ev({ type: "page_view", viewerCountry: "MN", clientId: "a" }),
        ev({ type: "page_view", viewerCountry: "MN", clientId: "a" }),
        ev({ type: "page_view", viewerCountry: "PA", clientId: "b" }),
        ev({ type: "page_view", clientId: "c" }), // legacy: no field
      ],
      NOW,
    );
    expect(summary.viewerCountrySplit).toEqual([
      { code: "MN", visitors: 1, views: 2 },
      { code: "PA", visitors: 1, views: 1 },
      { code: "unknown", visitors: 1, views: 1 },
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

describe("sectionUsage", () => {
  const sectionView = (section: string, ts: string, extra = {}) =>
    ev({ type: "track", name: "section_viewed", props: { section }, ts, ...extra });

  it("always returns all sections zero-filled, in page order", () => {
    const summary = aggregate([], NOW);
    expect(summary.sectionUsage).toHaveLength(9);
    expect(summary.sectionUsage.map((s) => s.section)).toEqual([
      "direction",
      "doc-focus",
      "doc-pairs",
      "friction-types",
      "where-to-focus",
      "sectors",
      "financing",
      "implementation",
      "explore",
    ]);
    for (const s of summary.sectionUsage) {
      expect(s).toMatchObject({
        interactions: 0,
        viewers: 0,
        views: 0,
        medianDwellMs: 0,
        shareOfInteractions: 0,
      });
    }
    expect(summary.sectionUsage[6].conditional).toBe(true); // financing
  });

  it("counts attributed clicks and shares sum to 1; unattributed and off-dashboard clicks excluded", () => {
    const summary = aggregate(
      [
        ev({ type: "click", section: "direction", label: "Wheel: document arc" }),
        ev({ type: "click", section: "direction", label: "Wheel: document arc" }),
        ev({ type: "click", section: "sectors", label: "Lens tab" }),
        ev({ type: "click", label: "Header link" }), // no section
        ev({ type: "click", section: "direction", route: "/methodology" }), // off-dashboard
      ],
      NOW,
    );
    const byId = Object.fromEntries(
      summary.sectionUsage.map((s) => [s.section, s]),
    );
    expect(byId.direction.interactions).toBe(2);
    expect(byId.sectors.interactions).toBe(1);
    const shares = summary.sectionUsage.map((s) => s.shareOfInteractions);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(byId.direction.shareOfInteractions).toBeCloseTo(2 / 3);
  });

  it("tolerates legacy click rows without a section field", () => {
    const legacy = ev({ type: "click" }) as unknown as Record<string, unknown>;
    delete legacy.section;
    const summary = aggregate([legacy as unknown as AnalyticsEvent], NOW);
    expect(summary.sectionUsage.every((s) => s.interactions === 0)).toBe(true);
  });

  it("maps unambiguous drawer kinds to sections, excludes target-pair", () => {
    const summary = aggregate(
      [
        ev({ type: "track", name: "drawer_opened", props: { kind: "sector" } }),
        ev({ type: "track", name: "drawer_opened", props: { kind: "theme" } }),
        ev({ type: "track", name: "drawer_opened", props: { kind: "target-pair" } }),
      ],
      NOW,
    );
    const byId = Object.fromEntries(
      summary.sectionUsage.map((s) => [s.section, s]),
    );
    expect(byId.sectors.interactions).toBe(1);
    expect(byId.direction.interactions).toBe(1);
    const total = summary.sectionUsage.reduce((a, s) => a + s.interactions, 0);
    expect(total).toBe(2); // target-pair dropped
    expect(summary.elementsBySection.sectors[0]).toEqual({
      label: "Detail panel: sector",
      count: 1,
    });
  });

  it("collapses scroll bounces, dedups viewers, and derives capped dwell", () => {
    const summary = aggregate(
      [
        sectionView("direction", "2026-07-13T10:00:00Z"),
        sectionView("direction", "2026-07-13T10:00:05Z"), // bounce: collapsed
        sectionView("doc-focus", "2026-07-13T10:00:30Z"), // direction dwell 30s
        sectionView("direction", "2026-07-13T10:01:00Z"), // re-entry: new view
        // second browser, long parked gap → dwell capped at 15 min
        sectionView("direction", "2026-07-13T11:00:00Z", { clientId: "c2", sessionId: "s2" }),
        sectionView("doc-focus", "2026-07-13T11:40:00Z", { clientId: "c2", sessionId: "s2" }),
      ],
      NOW,
    );
    const byId = Object.fromEntries(
      summary.sectionUsage.map((s) => [s.section, s]),
    );
    expect(byId.direction.views).toBe(3); // 2 in s1 (bounce collapsed) + 1 in s2
    expect(byId.direction.viewers).toBe(2); // c1, c2
    // dwell samples: 30s (s1) and 15min cap (s2); s1 re-entry has no successor.
    expect(byId.direction.medianDwellMs).toBe(
      Math.round((30_000 + 15 * 60_000) / 2),
    );
    expect(byId["doc-focus"].views).toBe(2);
    // s1 doc-focus → direction re-entry 30s later; s2 doc-focus has no successor.
    expect(byId["doc-focus"].medianDwellMs).toBe(30_000);
  });

  it("ranks elements per section for the drill-down", () => {
    const summary = aggregate(
      [
        ev({ type: "click", section: "direction", label: "Wheel: document arc" }),
        ev({ type: "click", section: "direction", label: "Wheel: document arc" }),
        ev({ type: "click", section: "direction", label: "Wheel: connection ribbon" }),
      ],
      NOW,
    );
    expect(summary.elementsBySection.direction).toEqual([
      { label: "Wheel: document arc", count: 2 },
      { label: "Wheel: connection ribbon", count: 1 },
    ]);
  });

  it("rolls interactions up into miniature regions", () => {
    const summary = aggregate(
      [
        ev({ type: "click", section: "direction", label: "Wheel: document arc" }),
        ev({ type: "click", section: "direction", label: "Wheel: connection ribbon" }),
        ev({ type: "click", section: "direction", label: "Show an example of strong alignment" }),
        ev({ type: "click", section: "direction", label: "??" }), // -> other
        ev({ type: "track", name: "drawer_opened", props: { kind: "sector" } }),
      ],
      NOW,
    );
    expect(summary.regionsBySection.direction).toEqual([
      { region: "wheel", count: 2 },
      { region: "term-buttons", count: 1 },
      { region: "other", count: 1 },
    ]);
    // Drawer kind sector -> "Detail panel: sector" -> sector-rows region.
    expect(summary.regionsBySection.sectors).toEqual([
      { region: "sector-rows", count: 1 },
    ]);
    // Region counts sum to the section's interactions.
    const byId = Object.fromEntries(
      summary.sectionUsage.map((s) => [s.section, s]),
    );
    const directionRegionSum = summary.regionsBySection.direction.reduce(
      (a, r) => a + r.count,
      0,
    );
    expect(directionRegionSum).toBe(byId.direction.interactions);
    // Inactive sections are absent from the sparse record.
    expect(summary.regionsBySection.financing).toBeUndefined();
  });
});
