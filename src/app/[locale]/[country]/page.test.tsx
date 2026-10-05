import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn();
vi.mock("@/i18n/navigation", () => ({ redirect: (args: unknown) => redirect(args) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import CountryPage from "./page";

const open = (country: string, search: Record<string, string | string[]> = {}, locale = "en") =>
  CountryPage({ params: Promise.resolve({ locale, country }), searchParams: Promise.resolve(search) });

beforeEach(() => redirect.mockClear());

describe("/{country}", () => {
  it("opens the country's brief, in the link's language and with its choices", async () => {
    await open("Panama", { docs: "NP,PEG", lens: "globe" }, "es");
    expect(redirect).toHaveBeenCalledWith({ href: "/panama/brief?docs=NP%2CPEG&lens=globe", locale: "es" });
  });

  it("opens the brief with no choices when the link carries none", async () => {
    await open("mongolia");
    expect(redirect).toHaveBeenCalledWith({ href: "/mongolia/brief", locale: "en" });
  });

  it("finds no page for a country that is not shown", async () => {
    await expect(open("atlantis")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redirect).not.toHaveBeenCalled();
  });
});
