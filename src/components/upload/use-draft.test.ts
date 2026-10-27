import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Draft } from "@/lib/upload/types";
import { useDraft } from "./use-draft";

const ID = "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13";

const draft = (): Draft => ({
  id: ID,
  createdAt: "",
  updatedAt: "",
  country: "Tonga",
  locale: "en",
  documents: [],
  btr: null,
  ownLens: null,
  footprint: null,
  started: false,
  nextDoc: 1,
});

/** fetch, with each PATCH held until the test answers it. */
function server() {
  const calls: string[] = [];
  const held: ((res: Response) => void)[] = [];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (init?.method === "PATCH") return new Promise<Response>((resolve) => held.push(resolve));
    if (init?.method === "POST") return Promise.resolve(new Response(JSON.stringify({ analysisId: ID }), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify({ draft: draft(), ahead: 0 }), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, answer: (res: Response) => held.shift()?.(res) };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("useDraft", () => {
  it("starts only once the edits on their way are saved, so the analysis starts on what the page shows", async () => {
    const { calls, answer } = server();
    const { result } = renderHook(() => useDraft(draft(), { locale: "en", country: "Tonga" }));
    act(() => result.current.change({ op: "country", value: "Fiji" }));
    let started: Promise<string | null> = Promise.resolve(null);
    act(() => {
      started = result.current.start("client");
    });
    await act(async () => {});
    expect(calls).toEqual([`PATCH /api/upload/${ID}`]);
    await act(async () => answer(new Response(JSON.stringify({ draft: { ...draft(), country: "Fiji" } }), { status: 200 })));
    await expect(started).resolves.toBe(ID);
    expect(calls).toEqual([`PATCH /api/upload/${ID}`, `POST /api/upload/${ID}/start`]);
  });

  it("does not start when an edit on its way could not be saved", async () => {
    const { calls, answer } = server();
    const { result } = renderHook(() => useDraft(draft(), { locale: "en", country: "Tonga" }));
    act(() => result.current.change({ op: "country", value: "Fiji" }));
    let started: Promise<string | null> = Promise.resolve(null);
    act(() => {
      started = result.current.start("client");
    });
    await act(async () => answer(new Response(JSON.stringify({ error: "boom" }), { status: 500 })));
    await expect(started).resolves.toBeNull();
    expect(calls.filter((c) => c.startsWith("POST"))).toEqual([]);
    expect(result.current.error).toEqual({ code: "notSaved" });
  });
});
