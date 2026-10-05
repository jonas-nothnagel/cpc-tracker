import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import mn from "../../../messages/mn.json";
import { Hero } from "./hero";

const MESSAGES = { en, es, mn } as const;

function hero(locale: "en" | "es" | "mn", countryId = "panama", countryName = "Panama") {
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
  it("offers the brief in English and the country's own language, the current one marked", () => {
    hero("en");
    const nav = screen.getByRole("navigation", { name: "Language" });
    expect(within(nav).getByText("English")).toHaveAttribute("aria-current", "true");
    expect(within(nav).queryByRole("link", { name: "English" })).toBeNull();
    expect(within(nav).getByRole("link", { name: "Español" })).toHaveAttribute("href", "/es/panama/brief");
    expect(within(nav).queryByText("Монгол")).toBeNull();
  });

  it("names English in its link, so the switch back sticks", () => {
    hero("mn", "mongolia", "Mongolia");
    const nav = screen.getByRole("navigation", { name: "Хэл" });
    expect(within(nav).getByText("Монгол")).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "English" })).toHaveAttribute("href", "/en/mongolia/brief");
    expect(within(nav).queryByText("Español")).toBeNull();
  });

  it("offers no choice of language where the brief is in English only", () => {
    hero("en", "sri-lanka", "Sri Lanka");
    expect(screen.queryByRole("navigation", { name: "Language" })).toBeNull();
  });

  it("keeps the reader's choices when the language changes", () => {
    window.history.replaceState(null, "", "/es/panama/brief?docs=NP%2CPEG&cur=usd");
    hero("es");
    const english = screen.getByRole("link", { name: "English" });
    fireEvent.click(english);
    expect(english).toHaveAttribute("href", "/en/panama/brief?docs=NP%2CPEG&cur=usd");
  });

  it("says the interface is machine-translated only where it is", () => {
    hero("es");
    expect(screen.getByText("Traducción automática")).toBeInTheDocument();
    cleanup();
    hero("en");
    expect(screen.queryByText("Machine translation")).toBeNull();
  });

  it("names its country and offers no other", () => {
    hero("es");
    expect(screen.getByText(/Panama/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Panama/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Mongolia" })).toBeNull();
  });
});
