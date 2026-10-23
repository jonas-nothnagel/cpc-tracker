import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import en from "../../../messages/en.json";
import { AnalysisProgress } from "./analysis-progress";

// next-intl keeps one router per page; the page's own header is not under test.
const { router } = vi.hoisted(() => ({ router: { refresh: vi.fn(), push: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => router,
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/ui/header", () => ({ Header: () => null }));

const ID = "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const run = (status: string) => ({
  status,
  step: 8,
  totalSteps: 8,
  currentStep: "Synthesis",
  message: "",
  startedAt: "2026-10-23T12:00:00+00:00",
  completedAt: status === "completed" ? "2026-10-23T12:20:00+00:00" : null,
  error: null,
  summary: null,
});

function progress() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AnalysisProgress id={ID} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  router.refresh.mockReset();
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
      .mockResolvedValueOnce(json(200, run("completed")));
    vi.stubGlobal("fetch", fetchMock);
    progress();
    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(en.analysis.errorHeading)).toBeNull();
  });

  it("stops and says so where there is no such analysis", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(404, { error: "Analysis not found" }));
    vi.stubGlobal("fetch", fetchMock);
    progress();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(en.analysis.errorHeading)).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
