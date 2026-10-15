import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { briefFixture } from "@/lib/brief/test-fixture";
import { initialExploreState } from "@/lib/brief/explore/state";
import { ExplorePage } from "./explore-page";

const SOURCE = briefFixture();
const saved = { ctx: HTMLCanvasElement.prototype.getContext, fetch: globalThis.fetch };

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as never;
  window.history.replaceState(null, "", "/testland/brief/explore");
});

afterEach(() => {
  cleanup();
  HTMLCanvasElement.prototype.getContext = saved.ctx;
  globalThis.fetch = saved.fetch;
});

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ExplorePage
        source={SOURCE}
        docs={["A", "B", "C"]}
        lens={null}
        setup={{ layers: null, groups: ["docs", "globe"], initialState: initialExploreState(), initialPair: null }}
      />
    </NextIntlClientProvider>,
  );
}

describe("ExplorePage", () => {
  it("shows the explorer on a page of its own, under the country's name", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Explore the targets" })).toBeInTheDocument();
    expect(screen.getByText(SOURCE.countryName)).toBeInTheDocument();
    expect(screen.getByRole("application", { name: /18 targets on a ring/ })).toBeInTheDocument();
  });

  it("keeps the grouping in the link but not the target in the centre", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Biodiversity" }));
    expect(new URLSearchParams(window.location.search).get("group")).toBe("globe");
    fireEvent.click(within(screen.getAllByTestId("explore-review-row")[0]).getByRole("button"));
    expect(window.location.pathname).toBe("/testland/brief/explore");
    expect(new URLSearchParams(window.location.search).has("focus")).toBe(false);
  });
});
