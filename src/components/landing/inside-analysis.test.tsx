import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { InsideAnalysis } from "./inside-analysis";

// next-intl's createNavigation imports next/navigation in a way vitest cannot
// resolve; the section only needs an anchor here (as in finding-card.test).
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

const COUNTRIES = [
  { id: "mongolia", name: "Mongolia" },
  { id: "panama", name: "Panama" },
];

// Shares checked by hand: Panama 3,216 / 3,613 = 89%, 108 / 3,613 = 3%;
// Mongolia 8,846 / 13,404 = 66%, 671 / 13,404 = 5%.
const OVERVIEWS: Record<string, unknown> = {
  mongolia: {
    documents: 8,
    targets: 178,
    counts: { reinforce: 8846, partial: 3756, apart: 671, none: 131, total: 13404 },
    lead: "aligned",
  },
  panama: {
    documents: 4,
    targets: 100,
    counts: { reinforce: 3216, partial: 271, apart: 108, none: 18, total: 3613 },
    lead: "aligned",
  },
};

let failing = new Set<string>();

beforeEach(() => {
  failing = new Set();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const id = new URL(url, "http://localhost").searchParams.get("country") ?? "";
      if (failing.has(id)) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => OVERVIEWS[id] };
    }),
  );
  // No idle prefetch: each country loads when it is chosen.
  vi.stubGlobal("requestIdleCallback", () => 1);
  // The random first pick lands on Panama (index 1 of 2).
  vi.spyOn(Math, "random").mockReturnValue(0.6);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderSection() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <InsideAnalysis countries={COUNTRIES} />
    </NextIntlClientProvider>,
  );
}

describe("InsideAnalysis", () => {
  it("previews the chosen country's brief: its finding, its figures and a link to the brief", async () => {
    renderSection();
    expect(
      await screen.findByRole("heading", {
        name: "Across Panama's policies, 89% of target pairs are aligned and 3% show potential misalignment.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("4 policy documents. 100 targets. 3,613 target pairs compared."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Read the Panama brief/ })).toHaveAttribute(
      "href",
      "/panama/brief",
    );
  });

  it("switches country from plain buttons, the chosen one pressed", async () => {
    renderSection();
    await screen.findByRole("heading", { name: /^Across Panama's policies/ });
    fireEvent.click(screen.getByRole("button", { name: "Mongolia" }));
    expect(screen.getByRole("button", { name: "Mongolia" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Panama" })).toHaveAttribute("aria-pressed", "false");
    expect(
      await screen.findByRole("heading", {
        name: "Across Mongolia's policies, 66% of target pairs are aligned and 5% show potential misalignment.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("8 policy documents. 178 targets. 13,404 target pairs compared.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Read the Mongolia brief/ })).toHaveAttribute(
      "href",
      "/mongolia/brief",
    );
  });

  it("draws the field with each group's share over it", async () => {
    // A measurable field (jsdom lays nothing out); Panama by hand:
    // 3,216 / 3,613 = 89%, 271 = 8%, 108 = 3%, 18 = <1%.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(560);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(260);
    renderSection();
    // The field measures itself once mounted, so its shares follow the
    // headline by a render.
    const shares = () => [...document.querySelectorAll(".brief-dots-label")].map((el) => el.textContent);
    await waitFor(() => expect(shares()).toEqual(["89%", "8%", "3%", "<1%"]));
  });

  it("says when a country's preview is unavailable, and still links to its brief", async () => {
    failing.add("panama");
    renderSection();
    expect(await screen.findByText("Preview not available for Panama right now.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Across/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Read the Panama brief/ })).toHaveAttribute(
      "href",
      "/panama/brief",
    );
  });
});
