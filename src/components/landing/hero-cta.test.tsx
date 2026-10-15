import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { HeroCta } from "./hero-cta";

// next-intl's createNavigation imports next/navigation in a way vitest cannot
// resolve; the menu only needs an anchor here (as in finding-card.test).
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, locale, children, ...rest }: ComponentProps<"a"> & { locale?: string }) => (
    <a href={typeof href === "string" ? href : "#"} data-locale={locale} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("HeroCta", () => {
  it("opens each pilot country's brief from the country menu", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <HeroCta
          countries={[
            { id: "mongolia", name: "Mongolia" },
            { id: "panama", name: "Panama" },
          ]}
          comingSoon={[]}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Explore a pilot country/ }));
    expect(screen.getByRole("link", { name: "Mongolia" })).toHaveAttribute("href", "/mongolia/brief");
    expect(screen.getByRole("link", { name: "Panama" })).toHaveAttribute("href", "/panama/brief");
  });

  it("opens a brief in the reader's language where its country offers it, else in English", () => {
    render(
      <NextIntlClientProvider locale="es" messages={es} timeZone="UTC">
        <HeroCta
          countries={[
            { id: "mongolia", name: "Mongolia" },
            { id: "panama", name: "Panama" },
          ]}
          comingSoon={[]}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Explorar un país piloto/ }));
    expect(screen.getByRole("link", { name: "Mongolia" })).toHaveAttribute("data-locale", "en");
    expect(screen.getByRole("link", { name: "Panama" })).not.toHaveAttribute("data-locale");
  });
});
