import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSessionId, SESSION_IDLE_MS } from "./session";

describe("getSessionId", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("mints a UUID and reuses it within the idle window", () => {
    const first = getSessionId(1_000);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(getSessionId(1_000 + SESSION_IDLE_MS - 1)).toBe(first);
  });

  it("rotates after the idle window elapses", () => {
    const first = getSessionId(1_000);
    const second = getSessionId(1_000 + SESSION_IDLE_MS + 1);
    expect(second).not.toBe(first);
  });

  it("activity extends the session (sliding window)", () => {
    const first = getSessionId(1_000);
    const mid = 1_000 + SESSION_IDLE_MS - 1;
    getSessionId(mid);
    expect(getSessionId(mid + SESSION_IDLE_MS - 1)).toBe(first);
  });

  it("recovers from corrupt storage and falls back when storage throws", () => {
    sessionStorage.setItem("cpc-analytics-session", "not json{");
    const fromCorrupt = getSessionId(1_000);
    expect(fromCorrupt).toMatch(/^[0-9a-f-]{36}$/);

    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const fallback = getSessionId(2_000);
    expect(fallback).toMatch(/^[0-9a-f-]{36}$/);
    expect(getSessionId(2_500)).toBe(fallback);
    spy.mockRestore();
  });
});
