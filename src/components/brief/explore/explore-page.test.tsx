import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { briefFixture } from "@/lib/brief/test-fixture";
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

function renderPage(search = "") {
  if (search) window.history.replaceState(null, "", `/testland/brief/explore${search}`);
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ExplorePage source={SOURCE} setup={{ layers: null, groups: ["docs", "globe"] }} />
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

  it("opens with the documents and grouping a shared link names, once the page has loaded", () => {
    renderPage("?docs=A%2CB&group=globe");
    expect(screen.getByRole("button", { name: "Biodiversity" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("application", { name: /6 targets on a ring/ })).toBeInTheDocument();
    expect(window.location.search).toBe("?docs=A%2CB&group=globe");
  });

  it("opens the centre and comparison a shared link names, and keeps them in the link", async () => {
    renderPage("?focus=A1&pair=A1~B1");
    expect(await screen.findByTestId("explore-pair")).toBeInTheDocument();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("focus")).toBe("A1");
    expect(params.get("pair")).toBe("A1~B1");
  });
});
