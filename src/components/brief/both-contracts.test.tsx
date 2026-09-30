import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import type { ServingBoth } from "@/lib/brief/contracts/both";
import { BothContracts } from "./both-contracts";

afterEach(cleanup);

const both = (n: number): ServingBoth => {
  const contracts = Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    title: `Soil protection on farmland, lot ${i + 1}`,
    year: 2024,
    value: (n - i) * 1e9,
  }));
  return { contracts, value: contracts.reduce((s, c) => s + c.value, 0) };
};

function show(value: ServingBoth) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <BothContracts both={value} countryId="mongolia" />
    </NextIntlClientProvider>,
  );
  return screen.getByRole("region", { name: "Contracts serving both targets" });
}

describe("BothContracts", () => {
  it("names the contracts serving both targets, with their count and amount, each opening on the contracts page", () => {
    const list = show(both(2));
    expect(within(list).getByText("2 contracts, ₮3 billion")).toBeInTheDocument();
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "Soil protection on farmland, lot 1₮2 billion · 2024",
      "Soil protection on farmland, lot 2₮1 billion · 2024",
    ]);
    expect(links[0]).toHaveAttribute("href", "/mongolia/brief/contracts?contract=c1");
    expect(within(list).getByText("AI-identified, for review · contracted, not verified delivered")).toBeInTheDocument();
  });

  it("shows the five largest first and the rest on request", () => {
    const list = show(both(7));
    expect(within(list).getAllByRole("link")).toHaveLength(5);
    fireEvent.click(within(list).getByRole("button", { name: "Show all 7" }));
    expect(within(list).getAllByRole("link")).toHaveLength(7);
  });
});
