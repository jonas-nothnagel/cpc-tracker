import { describe, expect, it } from "vitest";

import {
  ANALYTICS_BATCH_MAX_EVENTS,
  ANALYTICS_DURATION_MAX_MS,
  ANALYTICS_LABEL_MAX,
} from "./types";
import { parseAnalyticsBatch } from "./validate";

const NOW = new Date("2026-07-13T12:00:00Z");

const base = {
  ts: "2026-07-13T11:59:30Z",
  clientId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  locale: "en",
  route: "/dashboard",
  country: "mongolia",
  viewport: "lg",
  ua: "chrome/linux",
};

const pageView = {
  ...base,
  type: "page_view",
  viewId: "abcd1234",
  analysisId: null,
  referrerRoute: "/",
};

function parse(events: unknown[]) {
  return parseAnalyticsBatch({ events }, NOW);
}

describe("parseAnalyticsBatch", () => {
  it("accepts a valid page_view and keeps the client ts", () => {
    const result = parse([pageView]);
    if (!result.ok) throw new Error(result.error);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      schema: 1,
      ts: "2026-07-13T11:59:30Z",
      type: "page_view",
      route: "/dashboard",
      country: "mongolia",
    });
  });

  it("re-stamps timestamps skewed beyond 10 minutes", () => {
    const result = parse([{ ...pageView, ts: "2026-07-13T09:00:00Z" }]);
    if (!result.ok) throw new Error(result.error);
    expect(result.events[0].ts).toBe("2026-07-13T12:00:00Z");
  });

  it("rejects non-object bodies and empty/oversized batches", () => {
    expect(parseAnalyticsBatch([], NOW).ok).toBe(false);
    expect(parseAnalyticsBatch({ events: [] }, NOW).ok).toBe(false);
    const many = Array.from(
      { length: ANALYTICS_BATCH_MAX_EVENTS + 1 },
      () => pageView,
    );
    expect(parse(many).ok).toBe(false);
  });

  it("skips invalid events but keeps valid ones", () => {
    const result = parse([{ junk: true }, pageView]);
    if (!result.ok) throw new Error(result.error);
    expect(result.events).toHaveLength(1);
  });

  it("errors when no event in the batch is valid", () => {
    expect(parse([{ ...pageView, clientId: "not-a-uuid" }]).ok).toBe(false);
    expect(parse([{ ...pageView, route: "/etc/passwd" }]).ok).toBe(false);
    expect(parse([{ ...pageView, ua: "Mozilla/5.0 (X11; Linux x86_64)" }]).ok).toBe(
      false,
    );
    expect(parse([{ ...pageView, country: "../mongolia" }]).ok).toBe(false);
  });

  it("whitelist-constructs rows: hostile extra fields never persist", () => {
    const hostile = {
      ...pageView,
      email: "someone@example.com",
      ip: "10.0.0.1",
      value: "hunter2",
      userAgent: "Mozilla/5.0 full string",
    };
    const result = parse([hostile]);
    if (!result.ok) throw new Error(result.error);
    const serialized = JSON.stringify(result.events[0]);
    expect(serialized).not.toContain("example.com");
    expect(serialized).not.toContain("10.0.0.1");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("Mozilla");
    expect(Object.keys(result.events[0]).sort()).toEqual(
      [
        "schema",
        "ts",
        "type",
        "clientId",
        "sessionId",
        "locale",
        "route",
        "country",
        "viewport",
        "ua",
        "viewId",
        "analysisId",
        "referrerRoute",
      ].sort(),
    );
  });

  it("nullifies invalid referrerRoute/analysisId instead of rejecting", () => {
    const result = parse([
      {
        ...pageView,
        referrerRoute: "https://evil.example",
        analysisId: "run id with spaces",
      },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.events[0]).toMatchObject({
      referrerRoute: null,
      analysisId: null,
    });
  });

  it("clamps page_leave durations into [0, 4h]", () => {
    const leave = { ...base, type: "page_leave", viewId: "abcd1234" };
    const result = parse([
      { ...leave, durationMs: -50 },
      { ...leave, durationMs: 99 * 60 * 60_000 },
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.events.map((e) => "durationMs" in e && e.durationMs)).toEqual([
      0,
      ANALYTICS_DURATION_MAX_MS,
    ]);
    expect(parse([{ ...leave, durationMs: "NaN" }]).ok).toBe(false);
  });

  it("truncates long click labels and normalizes hrefs", () => {
    const click = { ...base, type: "click", role: "button" };
    const result = parse([
      { ...click, label: "x".repeat(500), href: "/dashboard?country=mongolia" },
      { ...click, label: "External docs", href: "external" },
      { ...click, label: "Weird href", href: "javascript:alert(1)" },
    ]);
    if (!result.ok) throw new Error(result.error);
    const [long, external, weird] = result.events;
    expect("label" in long && long.label.length).toBe(ANALYTICS_LABEL_MAX);
    expect("href" in external && external.href).toBe("external");
    expect("href" in weird && weird.href).toBeNull();
  });

  it("enforces track name/prop shapes and caps", () => {
    const track = { ...base, type: "track" };
    expect(parse([{ ...track, name: "Bad Name!" }]).ok).toBe(false);
    const result = parse([
      {
        ...track,
        name: "drawer_opened",
        props: {
          kind: "theme",
          count: 3,
          open: true,
          "Bad Key": "dropped",
          nested: { obj: 1 },
          long: "y".repeat(500),
        },
      },
    ]);
    if (!result.ok) throw new Error(result.error);
    const event = result.events[0];
    if (event.type !== "track") throw new Error("expected track");
    expect(event.props.kind).toBe("theme");
    expect(event.props.count).toBe(3);
    expect(event.props.open).toBe(true);
    expect(event.props["Bad Key"]).toBeUndefined();
    expect(event.props.nested).toBeUndefined();
    expect((event.props.long as string).length).toBe(120);
  });
});
