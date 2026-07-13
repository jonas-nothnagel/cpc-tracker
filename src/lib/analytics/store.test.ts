import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyticsPath, currentMonth, lastMonths } from "./paths";
import {
  appendAnalyticsEvents,
  listAnalyticsMonths,
  readAnalyticsEvents,
} from "./store";
import { ANALYTICS_SCHEMA, type PageViewEvent } from "./types";

function view(overrides: Partial<PageViewEvent> = {}): PageViewEvent {
  return {
    schema: ANALYTICS_SCHEMA,
    ts: "2026-07-13T12:00:00Z",
    type: "page_view",
    clientId: "11111111-1111-4111-8111-111111111111",
    sessionId: "22222222-2222-4222-8222-222222222222",
    locale: "en",
    route: "/dashboard",
    country: "mongolia",
    viewport: "lg",
    ua: "chrome/linux",
    viewId: "abcd1234",
    analysisId: null,
    referrerRoute: null,
    ...overrides,
  };
}

let dir: string;
const prev = process.env.CPC_LEDGER_DIR;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cpc-analytics-"));
  process.env.CPC_LEDGER_DIR = dir;
});

afterEach(() => {
  if (prev === undefined) delete process.env.CPC_LEDGER_DIR;
  else process.env.CPC_LEDGER_DIR = prev;
  rmSync(dir, { recursive: true, force: true });
});

describe("analytics paths", () => {
  it("honours CPC_LEDGER_DIR and rotates by month", () => {
    expect(analyticsPath("2026-07")).toBe(
      join(dir, "analytics", "events-2026-07.jsonl"),
    );
  });

  it("rejects month strings that are not YYYY-MM", () => {
    for (const bad of ["../x", "2026-7", "2026-07-01", "", "latest"]) {
      expect(() => analyticsPath(bad)).toThrow(/invalid month/);
    }
  });

  it("derives the current UTC month", () => {
    expect(currentMonth(new Date("2026-07-13T23:59:59Z"))).toBe("2026-07");
  });

  it("lists trailing months oldest-first across year boundaries", () => {
    expect(lastMonths(3, new Date("2026-01-15T00:00:00Z"))).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
  });
});

describe("analytics store", () => {
  it("appends a batch as one line per event and reads it back", () => {
    appendAnalyticsEvents([view(), view({ viewId: "efgh5678" })]);
    const month = currentMonth();
    const raw = readFileSync(analyticsPath(month), "utf-8");
    expect(raw.trimEnd().split("\n")).toHaveLength(2);
    const events = readAnalyticsEvents([month]);
    expect(events).toHaveLength(2);
    expect(events[0].schema).toBe(ANALYTICS_SCHEMA);
  });

  it("skips malformed lines without throwing", () => {
    appendAnalyticsEvents([view()]);
    const path = analyticsPath(currentMonth());
    writeFileSync(path, readFileSync(path, "utf-8") + "not json\n");
    appendAnalyticsEvents([view({ viewId: "efgh5678" })]);
    expect(readAnalyticsEvents([currentMonth()])).toHaveLength(2);
  });

  it("skips missing months and returns [] when nothing exists", () => {
    expect(readAnalyticsEvents(["2020-01", currentMonth()])).toEqual([]);
  });

  it("never throws when the ledger dir cannot be created", () => {
    // A file where the base dir should be makes mkdirSync fail (ENOTDIR).
    writeFileSync(join(dir, "blocker"), "");
    process.env.CPC_LEDGER_DIR = join(dir, "blocker", "sub");
    expect(() => appendAnalyticsEvents([view()])).not.toThrow();
  });

  it("lists ledger months ascending, ignoring foreign files", () => {
    appendAnalyticsEvents([view()]);
    const analytics = join(dir, "analytics");
    mkdirSync(analytics, { recursive: true });
    writeFileSync(join(analytics, "events-2025-12.jsonl"), "");
    writeFileSync(join(analytics, "notes.txt"), "");
    expect(listAnalyticsMonths()).toEqual(["2025-12", currentMonth()]);
  });
});
