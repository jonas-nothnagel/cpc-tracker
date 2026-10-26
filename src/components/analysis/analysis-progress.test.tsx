import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import en from "../../../messages/en.json";
import { AnalysisProgress } from "./analysis-progress";

// next-intl keeps one router per page.
const { router } = vi.hoisted(() => ({ router: { refresh: vi.fn(), push: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => router,
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const ID = "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13";
const FACTS = { country: "Sri Lanka", documents: 3, targets: 93, pairs: 2142, hasDraft: true };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const run = (status: string, more: Record<string, unknown> = {}) => ({
  status,
  step: 8,
  totalSteps: 8,
  currentStep: "Synthesis",
  message: "",
  startedAt: "2026-10-23T12:00:00+00:00",
  completedAt: status === "completed" ? "2026-10-23T12:20:00+00:00" : null,
  error: null,
  summary: null,
  ...more,
});

function progress(facts: typeof FACTS | null = FACTS) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AnalysisProgress id={ID} facts={facts} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  router.refresh.mockReset();
  router.push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AnalysisProgress", () => {
  it("keeps waiting through a status caught mid-write, then opens the brief", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(503, { error: "Status is being written" }))
      .mockResolvedValueOnce(json(200, run("completed", { state: "completed" })));
    vi.stubGlobal("fetch", fetchMock);
    progress();
    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(en.analysis.missing)).toBeNull();
  });

  it("stops and says so where there is no such analysis", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(404, { error: "Analysis not found" }));
    vi.stubGlobal("fetch", fetchMock);
    progress();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(en.analysis.missing)).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("names the analysis and counts the target pairs compared so far", async () => {
    const progressed = run("running", {
      step: 5,
      state: "running",
      progress: { pairsDone: 1380, pairsTotal: 2142, startedAt: new Date().toISOString() },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, progressed)));
    progress();
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByText("Sri Lanka · Policy coherence brief")).toBeInTheDocument();
    expect(screen.getByText("3 policy documents.")).toBeInTheDocument();
    expect(screen.getByText("1,380 of 2,142 target pairs compared")).toBeInTheDocument();
    expect(screen.getByText(/^Comparing target pairs\./)).toBeInTheDocument();
    expect(screen.getByText("This page can be closed. This address opens the brief when it is ready.")).toBeInTheDocument();
  });

  it("says how many analyses are ahead in line", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, run("queued", { step: 0, state: "queued", ahead: 1 }))));
    progress();
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByText("Waiting for 1 analysis ahead.")).toBeInTheDocument();
  });

  it("sorts the finished pairs into the brief's inks, then opens the brief", async () => {
    const done = run("completed", {
      state: "completed",
      summary: { totalPairs: 20, alignmentLevels: { high: 10, medium: 5, low: 4, flagged: 1 } },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, done)));
    progress();
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByText("20 target pairs by rating")).toBeInTheDocument();
    expect(screen.getByText("aligned")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(3300));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("offers to continue a run that stopped, or to go back to its documents", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, run("interrupted", { state: "interrupted" })))
      .mockResolvedValue(json(202, { state: "queued", ahead: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    progress();
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByText("The analysis stopped before it finished.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the documents" })).toHaveAttribute("href", `/upload/${ID}`);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(fetchMock).toHaveBeenCalledWith(`/api/analyze/${ID}/continue`, expect.objectContaining({ method: "POST" }));
  });
});
