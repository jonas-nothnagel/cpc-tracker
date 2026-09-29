import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
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
  it("switches every amount between tugrik and US$ from one plain control, and keeps the choice in the link", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ContractsPage setup={setupFixture()} geo={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "₮250 billion in 40 public contracts since 2024" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "US$" }));
    expect(screen.getByRole("heading", { name: "US$71.4 million in 40 public contracts since 2024" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "US$" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("At ₮3,500 per US$, indicative")).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("cur")).toBe("usd");
  });

  it("opens in US$ when the link asks for it", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ContractsPage setup={setupFixture()} geo={null} initialCurrency="usd" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "US$71.4 million in 40 public contracts since 2024" })).toBeInTheDocument();
  });
});
