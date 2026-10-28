import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import mn from "../../../../messages/mn.json";
import { setupFixture } from "@/lib/brief/contracts/test-fixture";
import { ContractsPage } from "./contracts-page";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
// next-intl's createNavigation imports next/navigation in a way vitest cannot
// resolve; the panels only need an anchor here (as in finding-card.test).
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("ContractsPage", () => {
  it("states every amount in US$ alone, with no tugrik anywhere, on a page not in the country's language", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ContractsPage setup={setupFixture()} geo={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "US$71.4 million in 40 public contracts since 2024" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Amounts in" })).toBeNull();
    expect(document.body.textContent).not.toContain("₮");
  });

  it("opens the country's own-language page in tugrik, switching to US$ from one plain control and keeping the choice in the link", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ContractsPage setup={setupFixture()} geo={null} localCurrency />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "₮250 billion in 40 public contracts since 2024" })).toBeInTheDocument();
    expect(screen.getByText(/^About US\$71\.4 million\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "US$" }));
    expect(screen.getByRole("heading", { name: "US$71.4 million in 40 public contracts since 2024" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "US$" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("At ₮3,500 per US$, indicative")).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("cur")).toBe("usd");
  });

  it("opens the contract the link names in its panel, once the page has loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    window.history.replaceState(null, "", "/mongolia/brief/contracts?contract=p1");
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ContractsPage setup={setupFixture()} geo={null} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining("contract=p1")));
    vi.unstubAllGlobals();
  });

  it("opens no panel for a contract the page does not list", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    window.history.replaceState(null, "", "/mongolia/brief/contracts?contract=elsewhere");
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ContractsPage setup={setupFixture()} geo={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("opens the country's own-language page in US$ when the link asks for it", () => {
    window.history.replaceState(null, "", "/mn/mongolia/brief/contracts?cur=usd");
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ContractsPage setup={setupFixture()} geo={null} localCurrency />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "US$71.4 million in 40 public contracts since 2024" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "US$" })).toHaveAttribute("aria-pressed", "true");
  });

  it("spells the record's month in Mongolian itself, so every browser draws what the server sent", () => {
    render(
      <NextIntlClientProvider locale="mn" messages={mn} timeZone="UTC">
        <ContractsPage setup={setupFixture()} geo={null} localCurrency />
      </NextIntlClientProvider>,
    );
    // Intl's own spelling ("2025 оны арван хоёрдугаар сар") is missing from
    // browsers without Mongolian date data, which write the month in their
    // own interface language instead.
    expect(document.body.textContent).toContain("2025 оны 12-р сар");
  });

  it("carries a policy area chosen in the overview to the focus line and to where to look closer", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ContractsPage setup={setupFixture()} geo={null} />
      </NextIntlClientProvider>,
    );
    const areas = document.querySelector<HTMLElement>('[data-step="areas"]')!;
    fireEvent.click(within(areas).getByRole("button", { name: /^Sustainable use/ }));
    expect(screen.getByRole("group", { name: "Focus" }).textContent).toContain("Sustainable use");
    const closer = document.querySelector<HTMLElement>('[data-deep="closer"]')!;
    expect(within(closer).getByRole("heading", { level: 2 }).textContent).toBe(
      "1 tender is potentially misaligned with Sustainable use targets; for 100% of them, the target is in C",
    );
  });

  it("states the new figures in US$ too", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ContractsPage setup={setupFixture()} geo={null} />
      </NextIntlClientProvider>,
    );
    const purpose = document.querySelector<HTMLElement>('[data-step="purpose"]')!;
    const list = within(purpose).getByRole("list", { name: "By policy area" });
    expect(within(list).getAllByRole("button")[0].textContent).toContain("US$2.9 million");
    expect(document.body.textContent).not.toMatch(/₮10 billion/);
  });
});

