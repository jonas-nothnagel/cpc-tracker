import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { SLOW_BRIEF_MS, SlowBriefStatus } from "./slow-brief-status";

const status = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", () => ({ useLinkStatus: () => status }));

// A fresh element each time, so a rerender is a real render.
const tree = () => (
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <SlowBriefStatus name="Mongolia" />
  </NextIntlClientProvider>
);
const renderStatus = () => render(tree());

beforeEach(() => {
  vi.useFakeTimers();
  status.pending = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SlowBriefStatus", () => {
  it("says nothing while a brief opens at its usual pace", () => {
    status.pending = true;
    renderStatus();
    act(() => vi.advanceTimersByTime(SLOW_BRIEF_MS - 100));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says the brief is loading once the open runs past two seconds", () => {
    status.pending = true;
    renderStatus();
    act(() => vi.advanceTimersByTime(SLOW_BRIEF_MS));
    expect(screen.getByRole("status")).toHaveTextContent("Loading the Mongolia brief…");
  });

  it("goes when the open finishes, and waits afresh on the next click", () => {
    status.pending = true;
    const { rerender } = renderStatus();
    act(() => vi.advanceTimersByTime(SLOW_BRIEF_MS));
    status.pending = false;
    rerender(tree());
    expect(screen.queryByRole("status")).toBeNull();
    status.pending = true;
    rerender(tree());
    expect(screen.queryByRole("status")).toBeNull();
    act(() => vi.advanceTimersByTime(SLOW_BRIEF_MS));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("says nothing when no brief is opening", () => {
    renderStatus();
    act(() => vi.advanceTimersByTime(SLOW_BRIEF_MS * 3));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
