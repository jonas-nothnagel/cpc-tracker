import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { track } from "@/lib/analytics/client";
import { BRIEFING_SCOPE_ID, GuidedReadOffer } from "./guided-read-offer";

const SEEN_KEY = "cpc.briefing.guided-read-seen";
const ALL_ANCHORS = [
  "guided-header",
  "guided-corpus",
  "guided-nav",
  "slide-direction",
  "slide-friction-types",
  "slide-financing",
  "slide-implementation",
  "explore-ask",
];

// jsdom implements neither ResizeObserver nor scrollIntoView nor matchMedia.
beforeAll(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(track).mockClear();
});

/** Briefing-like host: the scope container with the guided-read anchors. */
function Host({ anchors = ALL_ANCHORS }: { anchors?: string[] }) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <div id={BRIEFING_SCOPE_ID}>
        {anchors.map((a) => (
          <div key={a} data-tour={a} />
        ))}
        <GuidedReadOffer />
      </div>
    </NextIntlClientProvider>
  );
}

const copy = en.briefing.guidedRead;
const stepTitle = (id: keyof typeof en.briefing.tour.guidedRead.steps) =>
  en.briefing.tour.guidedRead.steps[id].title;

describe("GuidedReadOffer", () => {
  it("offers the guided read on a first visit and tracks the impression", () => {
    render(<Host />);
    expect(screen.getByText(copy.offerBody)).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("guided_read_offer_shown");
  });

  it("shows only the quiet affordance when the seen flag is set", () => {
    window.localStorage.setItem(SEEN_KEY, "1");
    render(<Host />);
    expect(screen.queryByText(copy.offerBody)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: copy.reopen }),
    ).toBeInTheDocument();
    expect(track).not.toHaveBeenCalledWith("guided_read_offer_shown");
  });

  it("starts the tour on the purpose step, writes the flag, collapses to quiet", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: copy.start }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      stepTitle("purpose"),
    );
    expect(screen.getByText("Step 1 of 7")).toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN_KEY)).toBe("1");
    expect(track).toHaveBeenCalledWith("guided_read_started", {
      source: "offer",
    });
    expect(screen.queryByText(copy.offerBody)).not.toBeInTheDocument();
  });

  it("dismisses to the quiet affordance and writes the flag", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: copy.skip }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(copy.offerBody)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: copy.reopen }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN_KEY)).toBe("1");
    expect(track).toHaveBeenCalledWith("guided_read_dismissed", {
      source: "offer",
    });
  });

  it("restarts from the quiet affordance", () => {
    window.localStorage.setItem(SEEN_KEY, "1");
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: copy.reopen }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("guided_read_started", {
      source: "affordance",
    });
  });

  it("tracks completion when Done finishes the last step", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: copy.start }));
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
    expect(screen.getByText("Step 7 of 7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("guided_read_completed", { steps: 7 });
  });

  it("tracks a mid-tour close with the step it happened on", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: copy.start }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("guided_read_dismissed", {
      source: "tour",
      step: 2,
    });
    expect(track).not.toHaveBeenCalledWith(
      "guided_read_completed",
      expect.anything(),
    );
  });

  it("lands the delivery step on implementation when financing is absent", () => {
    render(
      <Host anchors={ALL_ANCHORS.filter((a) => a !== "slide-financing")} />,
    );
    fireEvent.click(screen.getByRole("button", { name: copy.start }));
    expect(screen.getByText("Step 1 of 7")).toBeInTheDocument();
  });

  it("drops the delivery step when neither financing nor implementation renders", () => {
    render(
      <Host
        anchors={ALL_ANCHORS.filter(
          (a) => a !== "slide-financing" && a !== "slide-implementation",
        )}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: copy.start }));
    expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
  });
});
