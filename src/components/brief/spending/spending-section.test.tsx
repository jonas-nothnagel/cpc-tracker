import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import type { SpendingSetup } from "@/lib/brief/spending";
import { briefFixture } from "@/lib/brief/test-fixture";
import { SpendingSection } from "./spending-section";

const SOURCE = briefFixture();

/** Two years, US$ million: 10 reviewed of 300 public; P2 (Agriculture) holds 7. */
const SETUP: SpendingSetup = {
  currency: "US$",
  unit: "million",
  years: ["2020", "2021"],
  publicSpending: { "2020": 100, "2021": 200 },
  illustrative: true,
  lines: [
    { id: "BER_P1", code: "P1", name: "Protected area security", years: { "2020": 1, "2021": 2 }, total: 3, area: "g1", matches: ["A1"] },
    { id: "BER_P2", code: "P2", name: "Irrigation support", years: { "2020": 3, "2021": 4 }, total: 7, area: "g2", matches: [] },
  ],
  areas: SOURCE.lenses[0].categories,
};

afterEach(cleanup);

function renderSection(onExploreArea?: (id: string) => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SpendingSection setup={SETUP} source={SOURCE} docs={["A", "B", "C"]} onExploreArea={onExploreArea} />
    </NextIntlClientProvider>,
  );
}

describe("SpendingSection", () => {
  it("states the record out of all public spending, in every hundred", () => {
    renderSection();
    expect(screen.getByRole("heading", { name: /US\$3\.3 of every US\$100 of public spending/ })).toBeTruthy();
    expect(screen.getByText("US$10.0 million")).toBeTruthy();
    expect(screen.getByText("US$300 million")).toBeTruthy();
    expect(screen.getByText(/Illustrative figures/)).toBeTruthy();
  });

  it("names the area holding the most spending beside its share of the targets", () => {
    renderSection();
    expect(
      screen.getByRole("heading", { name: "Agriculture holds 70% of the reviewed spending and 17% of the targets." }),
    ).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: /Biodiversity areas/ })).getAllByRole("button");
    expect(rows.map((r) => r.textContent?.split(/\d/)[0])).toEqual(["Agriculture", "Protected areas", "Water"]);
    expect(rows[2].textContent).toContain("None");
  });

  it("opens an area to its budget lines and hands it to the ring", () => {
    const onExploreArea = vi.fn();
    renderSection(onExploreArea);
    fireEvent.click(screen.getByRole("button", { name: /Protected areas/ }));
    expect(screen.getByText("Protected area security")).toBeTruthy();
    expect(screen.getByText(/3 targets in this area\. 1 of the 3 have a matching budget line\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Explore this area with its budget lines" }));
    expect(onExploreArea).toHaveBeenCalledWith("g1");
  });
});
