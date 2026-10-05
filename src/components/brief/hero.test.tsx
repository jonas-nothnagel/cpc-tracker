import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { Hero } from "./hero";

const MESSAGES = { en, es } as const;

function hero(locale: "en" | "es", countryId = "panama", countryName = "Panama") {
  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="UTC">
      <Hero
        countryId={countryId}
        countryName={countryName}
        commitments={100}
        documents={4}
        comparisons={3613}
        lines={[]}
        onRead={() => {}}
        onCustomize={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

// jsdom cannot follow links: stop each click once the page's own handlers ran.
const stop = (e: Event) => e.preventDefault();
beforeEach(() => document.addEventListener("click", stop));
afterEach(() => {
  document.removeEventListener("click", stop);
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("Hero", () => {
  it("offers the brief in each language, the current one marked", () => {
    hero("en");
    const nav = screen.getByRole("navigation", { name: "Language" });
    expect(within(nav).getByText("English")).toHaveAttribute("aria-current", "true");
    expect(within(nav).queryByRole("link", { name: "English" })).toBeNull();
    expect(within(nav).getByRole("link", { name: "Español" })).toHaveAttribute("href", "/es/panama/brief");
    expect(within(nav).getByRole("link", { name: "Монгол" })).toHaveAttribute("href", "/mn/panama/brief");
  });

  it("keeps the reader's choices when the language changes", () => {
    window.history.replaceState(null, "", "/es/panama/brief?docs=NP%2CPEG&cur=usd");
    hero("es");
    const english = screen.getByRole("link", { name: "English" });
    fireEvent.click(english);
    expect(english).toHaveAttribute("href", "/panama/brief?docs=NP%2CPEG&cur=usd");
  });

  it("says the interface is machine-translated only where it is", () => {
    hero("es");
    expect(screen.getByText("Traducción automática")).toBeInTheDocument();
    cleanup();
    hero("en");
    expect(screen.queryByText("Machine translation")).toBeNull();
  });

  it("opens the other countries' briefs from the country's name, in the current language", () => {
    hero("es");
    const name = screen.getByRole("button", { name: /Panama/ });
    expect(name).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(name);
    expect(name).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Otros países" });
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Mongolia", "/es/mongolia/brief"],
      ["Sri Lanka", "/es/sri-lanka/brief"],
      ["Côte d'Ivoire", "/es/cote-divoire/brief"],
      ["Country X", "/es/countryx/brief"],
    ]);
  });
});
