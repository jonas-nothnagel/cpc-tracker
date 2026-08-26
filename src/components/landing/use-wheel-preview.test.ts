import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWheelPreview } from "./use-wheel-preview";

const COUNTRIES = ["mongolia", "panama", "sri-lanka"];

function slice(id: string) {
  return {
    targets: [{ id: `${id}-t1`, sourceDocument: "NDC" }],
    alignment: [{ targetAId: `${id}-t1`, targetBId: `${id}-t2`, alignment: "high" }],
    classifications: [],
    countryConfig: { id },
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
    return { ok: true, status: 200, json: async () => slice(id) };
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

describe("useWheelPreview", () => {
  it("exposes nothing until the selected country's slice lands, then the slice", async () => {
    const { result } = renderHook(() =>
      useWheelPreview({ countries: COUNTRIES, selected: "mongolia", locale: "en", prefetch: false }),
    );
    expect(result.current.data).toBeNull();
    expect(result.current.failed).toBe(false);
    await waitFor(() => expect(result.current.data?.targets[0]?.id).toBe("mongolia-t1"));
    expect(result.current.data?.alignments).toHaveLength(1);
    expect(result.current.data?.countryConfig).toEqual({ id: "mongolia" });
  });

  it("requests the slim wheel slice, adding the locale only when it is not English", async () => {
    renderHook(() =>
      useWheelPreview({ countries: COUNTRIES, selected: "mongolia", locale: "es", prefetch: false }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/dashboard?country=mongolia&slice=wheel&locale=es");

    fetchMock.mockClear();
    renderHook(() =>
      useWheelPreview({ countries: COUNTRIES, selected: "sri-lanka", locale: "en", prefetch: false }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/dashboard?country=sri-lanka&slice=wheel");
  });

  it("drops the previous country's wheel the moment the selection changes", async () => {
    const { result, rerender } = renderHook(
      (p: { selected: string }) =>
        useWheelPreview({ countries: COUNTRIES, selected: p.selected, locale: "en", prefetch: false }),
      { initialProps: { selected: "mongolia" } },
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    rerender({ selected: "sri-lanka" });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.targets[0]?.id).toBe("sri-lanka-t1"));
  });

  it("serves a country it already loaded from memory without a second request", async () => {
    const { result, rerender } = renderHook(
      (p: { selected: string }) =>
        useWheelPreview({ countries: COUNTRIES, selected: p.selected, locale: "en", prefetch: false }),
      { initialProps: { selected: "mongolia" } },
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    rerender({ selected: "sri-lanka" });
    await waitFor(() => expect(result.current.data?.targets[0]?.id).toBe("sri-lanka-t1"));
    rerender({ selected: "mongolia" });
    expect(result.current.data?.targets[0]?.id).toBe("mongolia-t1");
    expect(callsFor("mongolia")).toBe(1);
  });

  it("marks only the failing country as unavailable", async () => {
    const { result, rerender } = renderHook(
      (p: { selected: string }) =>
        useWheelPreview({ countries: COUNTRIES, selected: p.selected, locale: "en", prefetch: false }),
      { initialProps: { selected: "panama" } },
    );
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.data).toBeNull();
    rerender({ selected: "mongolia" });
    expect(result.current.failed).toBe(false);
    await waitFor(() => expect(result.current.data?.targets[0]?.id).toBe("mongolia-t1"));
  });

  it("prefetches the other countries once the first wheel is on screen", async () => {
    const { result } = renderHook(() =>
      useWheelPreview({ countries: COUNTRIES, selected: "mongolia", locale: "en" }),
    );
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
    const { result } = renderHook(() =>
      useWheelPreview({ countries: COUNTRIES, selected: "mongolia", locale: "en" }),
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
