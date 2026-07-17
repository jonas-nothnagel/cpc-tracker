import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";
import { TourButton } from "./tour-button";

// jsdom implements neither ResizeObserver nor scrollIntoView.
beforeAll(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
});

// Without vitest globals, testing-library's auto-cleanup does not run.
afterEach(cleanup);

/** Briefing-like host: a wheel tour scope with all four targets rendered. */
function Host() {
  const scopeRef = useRef<HTMLDivElement | null>(null);
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <div ref={scopeRef}>
        <div data-tour="wheel-arcs" />
        <div data-tour="wheel-ribbons" />
        <div data-tour="wheel-labels" />
        <div data-tour="doc-toggle" />
        <TourButton tourId="wheel" scopeRef={scopeRef} />
      </div>
    </NextIntlClientProvider>
  );
}

const stepTitle = (id: string) =>
  (en.briefing.tour.wheel.steps as Record<string, { title: string }>)[id].title;

function openTour() {
  render(<Host />);
  const trigger = screen.getByRole("button", { name: "How to read this chart" });
  // jsdom does not focus on click; real browsers do, and focus restoration
  // depends on it.
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe("TourButton + TourOverlay", () => {
  it("opens the walkthrough on the first step", () => {
    openTour();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(stepTitle("arcs"));
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  it("advances with the Next button and finishes with Done", () => {
    openTour();
    const next = screen.getByRole("button", { name: "Next" });
    fireEvent.click(next);
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("navigates with arrow keys and closes on Escape, restoring focus", () => {
    const trigger = openTour();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("shows Back only after the first step", () => {
    openTour();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  it("closes when the backdrop is clicked", () => {
    openTour();
    fireEvent.click(screen.getByRole("presentation"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
