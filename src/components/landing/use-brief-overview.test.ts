import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useBriefOverview } from "./use-brief-overview";

const COUNTRIES = ["mongolia", "panama", "sri-lanka"];
const TARGETS: Record<string, number> = { mongolia: 178, panama: 100, "sri-lanka": 404 };

function overview(id: string) {
  return {
    documents: 4,
    targets: TARGETS[id],
    counts: { reinforce: 30, partial: 6, apart: 3, none: 1, total: 40 },
    lead: "aligned",
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function countryOf(url: unknown): string {
  return new URL(String(url), "http://localhost").searchParams.get("country") ?? "";
}
function callsFor(country: string): number {
  return fetchMock.mock.calls.filter((c) => countryOf(c[0]) === country).length;
}

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    const id = countryOf(url);
    if (id === "panama") {
      return { ok: false, status: 404, json: async () => ({ error: "missing" }) };
    }
    return { ok: true, status: 200, json: async () => overview(id) };
  });
  vi.stubGlobal("fetch", fetchMock);
  // Run idle work at once so prefetch behaviour is observable without timers.
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
    cb();
    return 1;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (navigator as { connection?: unknown }).connection;
});

describe("useBriefOverview", () => {
  it("exposes nothing until the selected country's figures land, then the figures", async () => {
    const { result } = renderHook(() =>
      useBriefOverview({ countries: COUNTRIES, selected: "mongolia", prefetch: false }),
    );
    expect(result.current.data).toBeNull();
    expect(result.current.failed).toBe(false);
    await waitFor(() => expect(result.current.data?.targets).toBe(178));
    expect(result.current.data?.counts.total).toBe(40);
    expect(result.current.data?.lead).toBe("aligned");
  });

  it("requests the country's overview, the same in every language", async () => {
    renderHook(() => useBriefOverview({ countries: COUNTRIES, selected: "sri-lanka", prefetch: false }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/brief/overview?country=sri-lanka");
  });

  it("drops the previous country's figures the moment the selection changes", async () => {
    const { result, rerender } = renderHook(
      (p: { selected: string }) =>
        useBriefOverview({ countries: COUNTRIES, selected: p.selected, prefetch: false }),
      { initialProps: { selected: "mongolia" } },
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    rerender({ selected: "sri-lanka" });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.targets).toBe(404));
  });

  it("serves a country it already loaded from memory without a second request", async () => {
    const { result, rerender } = renderHook(
      (p: { selected: string }) =>
        useBriefOverview({ countries: COUNTRIES, selected: p.selected, prefetch: false }),
      { initialProps: { selected: "mongolia" } },
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    rerender({ selected: "sri-lanka" });
    await waitFor(() => expect(result.current.data?.targets).toBe(404));
    rerender({ selected: "mongolia" });
    expect(result.current.data?.targets).toBe(178);
    expect(callsFor("mongolia")).toBe(1);
  });

  it("marks only the failing country as unavailable", async () => {
    const { result, rerender } = renderHook(
      (p: { selected: string }) =>
        useBriefOverview({ countries: COUNTRIES, selected: p.selected, prefetch: false }),
      { initialProps: { selected: "panama" } },
    );
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.data).toBeNull();
    rerender({ selected: "mongolia" });
    expect(result.current.failed).toBe(false);
    await waitFor(() => expect(result.current.data?.targets).toBe(178));
  });

  it("treats an answer without the figures as unavailable", async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ error: "x" }) }));
    const { result } = renderHook(() =>
      useBriefOverview({ countries: COUNTRIES, selected: "mongolia", prefetch: false }),
    );
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("retries a country whose earlier attempt failed when it is selected again", async () => {
    const { result, rerender } = renderHook(
      (p: { selected: string }) =>
        useBriefOverview({ countries: COUNTRIES, selected: p.selected, prefetch: false }),
      { initialProps: { selected: "panama" } },
    );
    await waitFor(() => expect(result.current.failed).toBe(true));
    rerender({ selected: "mongolia" });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    // The server has recovered by the time the user comes back to Panama.
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => overview(countryOf(url)),
    }));
    rerender({ selected: "panama" });
    await waitFor(() => expect(result.current.failed).toBe(false));
    await waitFor(() => expect(result.current.data?.targets).toBe(100));
    expect(callsFor("panama")).toBe(2);
  });

  it("prefetches the other countries once the first figures are on screen", async () => {
    const { result } = renderHook(() => useBriefOverview({ countries: COUNTRIES, selected: "mongolia" }));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await waitFor(() => {
      expect(callsFor("sri-lanka")).toBe(1);
      expect(callsFor("panama")).toBe(1);
    });
    expect(countryOf(fetchMock.mock.calls[0][0])).toBe("mongolia");
    expect(callsFor("mongolia")).toBe(1);
  });

  it("does not prefetch when the browser asks to save data", async () => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
      configurable: true,
    });
    const { result } = renderHook(() => useBriefOverview({ countries: COUNTRIES, selected: "mongolia" }));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
