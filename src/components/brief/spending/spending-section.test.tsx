import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import type { Currency } from "@/components/brief/contracts/money";
import { parseBerAreas } from "@/lib/brief/ber-areas";
import { spendingSetup, type SpendingSetup } from "@/lib/brief/spending";
import { legacyPayload, levelsPayload } from "@/lib/brief/spending-fixture";
import { briefFixture } from "@/lib/brief/test-fixture";
import { SpendingSection } from "./spending-section";

const SOURCE = briefFixture();
/** Country X: two years, US$ million, 10 reviewed of 300 public; P2 (Agriculture) holds 7. */
const LEGACY = spendingSetup(legacyPayload(), SOURCE)!;
/** A rebuilt record in tugrik billion: two budget levels, 2022 holds the
 *  local budgets only; ₮2,000 per US$ in 2020, ₮2,500 in 2021. */
const LEVELS = spendingSetup(levelsPayload(), SOURCE, {
  areas: parseBerAreas(
    {
      lines: [
        { code: "71405", area: "g1", status: "models-agree", first: { ranked: [{ reasoning: "Protected areas." }] } },
        { code: "82212", area: null, status: "models-differ", first: { ranked: [] } },
      ],
    },
    null,
    "globe",
  ),
})!;

afterEach(cleanup);

function renderSection(
  setup: SpendingSetup,
  {
    onExploreArea,
    docs = ["A", "B", "C"],
    currency = "usd",
    onCurrency = () => {},
  }: { onExploreArea?: (id: string) => void; docs?: string[]; currency?: Currency; onCurrency?: (c: Currency) => void } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SpendingSection setup={setup} source={SOURCE} docs={docs} currency={currency} onCurrency={onCurrency} onExploreArea={onExploreArea} />
    </NextIntlClientProvider>,
  );
}

describe("SpendingSection, Country X's illustrative file", () => {
  it("states the record out of all public spending, in every hundred", () => {
    renderSection(LEGACY);
    expect(
      screen.getByRole("heading", { name: "US$3.3 of every US$100 of public spending in 2020–2021 was reviewed biodiversity spending." }),
    ).toBeTruthy();
    expect(screen.getByText("US$10 million")).toBeTruthy();
    expect(screen.getByText("US$300 million")).toBeTruthy();
    expect(screen.getByText(/Illustrative figures/)).toBeTruthy();
    // A review in US$ has no currency to choose.
    expect(screen.queryByRole("group", { name: "Amounts in" })).toBeNull();
  });

  it("names the area holding the most spending beside its share of the targets", () => {
    renderSection(LEGACY);
    expect(
      screen.getByRole("heading", { name: "Agriculture holds 70% of the reviewed spending and 17% of the targets." }),
    ).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: /Biodiversity areas/ })).getAllByRole("button");
    expect(rows.map((r) => r.textContent?.split(/\d/)[0])).toEqual(["Agriculture", "Protected areas", "Water"]);
    expect(rows[2].textContent).toContain("None");
  });

  it("opens an area to its budget lines and hands it to the ring", () => {
    const onExploreArea = vi.fn();
    renderSection(LEGACY, { onExploreArea });
    fireEvent.click(screen.getByRole("button", { name: /^Protected areas/ }));
    expect(within(screen.getByRole("list", { name: "Budget lines in this area" })).getByText("Protected area security")).toBeTruthy();
    expect(screen.getByText(/3 targets in this area\. 2 of the 3 have a matching budget line\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Explore this area with its budget lines" }));
    expect(onExploreArea).toHaveBeenCalledWith("g1");
  });

  it("offers the ring only for an area with targets in the brief's documents", () => {
    // Water holds a line but, without document C, none of the targets.
    const moved = { ...LEGACY, lines: LEGACY.lines.map((l) => (l.id === "BER_P2" ? { ...l, area: "g5" } : l)) };
    renderSection(moved, { onExploreArea: vi.fn(), docs: ["A", "B"] });
    fireEvent.click(screen.getByRole("button", { name: /^Water/ }));
    expect(screen.getByText("No target in this area.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Explore this area with its budget lines" })).toBeNull();
  });
});

describe("SpendingSection, a rebuilt record", () => {
  it("states money in US$ by default, each year at its own rate", () => {
    renderSection(LEVELS);
    expect(
      screen.getByRole("heading", {
        name: "US$3.3 of every US$100 of State and local budget spending in 2020–2021 was reviewed biodiversity spending.",
      }),
    ).toBeTruthy();
    // ₮4 bn at ₮2,000 and ₮6 bn at ₮2,500 per US$; public ₮150 bn each year.
    expect(screen.getByText("US$4.4 million")).toBeTruthy();
    expect(screen.getByText("US$135 million")).toBeTruthy();
    expect(screen.queryByText("₮10 billion")).toBeNull();
  });

  it("switches every amount to the review's own currency, and keeps the choice in the link", () => {
    const onCurrency = vi.fn();
    const { unmount } = renderSection(LEVELS, { onCurrency });
    const choice = screen.getByRole("group", { name: "Amounts in" });
    expect(within(choice).getByRole("button", { name: "US$" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(choice).getByRole("button", { name: "₮" }));
    expect(onCurrency).toHaveBeenCalledWith("mnt");
    expect(new URLSearchParams(window.location.search).get("cur")).toBe("mnt");
    unmount();
    renderSection(LEVELS, { currency: "mnt" });
    expect(
      screen.getByRole("heading", {
        name: "₮3.3 of every ₮100 of State and local budget spending in 2020–2021 was reviewed biodiversity spending.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("₮10 billion")).toBeTruthy();
  });

  it("stacks each year's budgets into its total and names a budget the year's data do not hold", () => {
    const { container } = renderSection(LEVELS, { currency: "mnt" });
    expect(screen.getByText("Reviewed spending by year and budget")).toBeTruthy();
    // The total stands on top only where both budgets are in the data.
    expect([...container.querySelectorAll(".sp-stack-value[data-total]")].map((n) => n.textContent)).toEqual(["4.0", "6.0"]);
    // 2022 holds the local budgets only: its State budget is named, never drawn as zero.
    expect(screen.getByText("State budget not in the data")).toBeTruthy();
    const year2022 = [...container.querySelectorAll(".sp-year")][2];
    expect(year2022.querySelectorAll(".sp-seg").length).toBe(1);
    expect(within(screen.getByRole("table")).getByText("2022").closest("tr")?.textContent).toContain("not in the data");
  });

  it("switches the chart from amounts to each budget's share, side by side", () => {
    const { container } = renderSection(LEVELS);
    const share = screen.getByRole("button", { name: "Share of each budget's spending" });
    fireEvent.click(share);
    expect(share.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll(".sp-stack").length).toBe(0);
    expect(container.querySelectorAll(".sp-bar").length).toBe(5);
  });

  it("lists the review's own lines, each opening to what it counted and who spends it", () => {
    renderSection(LEVELS);
    expect(
      screen.getByRole("heading", { name: "Security of protected areas holds 70% of the reviewed spending in 2020–2021." }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Security of protected areas.*Programme 71405/ }));
    // ₮7 bn counted of ₮26 bn spent, converted as the line's own spending is.
    expect(screen.getByText("Counted US$3.1 million of US$11.5 million spent, at the review's rates")).toBeTruthy();
    expect(screen.getByText("Other, counted at 5%")).toBeTruthy();
    expect(screen.getByText("Spent by 31 units in 2021, the largest:")).toBeTruthy();
    expect(screen.getByText("Khan Khentii administration")).toBeTruthy();
  });

  it("tags each line's area as AI-suggested and keeps an unplaced line apart, with no fine print", () => {
    renderSection(LEVELS);
    fireEvent.click(screen.getByRole("button", { name: /^Protected areas/ }));
    expect(screen.getByText("AI-suggested, not reviewed")).toBeTruthy();
    // No matches until the comparisons are rebuilt for these lines.
    expect(screen.queryByText(/have a matching budget line/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Not placed in an area yet/ }));
    expect(within(screen.getByRole("list", { name: "Budget lines in this area" })).getByText("Solid waste removal")).toBeTruthy();
    expect(screen.getByText("Kept apart until a person decides")).toBeTruthy();
    expect(screen.queryByText(/checked by a person;/)).toBeNull();
  });

  it("shows the areas' targets and spending as amounts on request, the bars still drawn by share", () => {
    const { container } = renderSection(LEVELS, { currency: "mnt" });
    const row = () => within(screen.getByRole("list", { name: /Biodiversity areas/ })).getByRole("button", { name: /^Protected areas/ });
    const widths = () => [...row().querySelectorAll(".sp-bar-line > span")].map((s) => (s as HTMLElement).style.width);
    const before = widths();
    expect(row().textContent).toContain("17%");
    expect(row().textContent).toContain("70%");
    fireEvent.click(within(screen.getByRole("group", { name: "Show shares or amounts" })).getByRole("button", { name: "Amount" }));
    expect(row().textContent).toContain("3 targets");
    expect(row().textContent).toContain("₮7 billion");
    expect(widths()).toEqual(before);
    expect(container.querySelector(".sp-areas")?.getAttribute("data-mode")).toBe("amount");
  });
});
