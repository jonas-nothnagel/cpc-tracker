import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import type { Currency } from "@/components/brief/contracts/money";
import { parseBerAreas } from "@/lib/brief/ber-areas";
import { parseBerNames } from "@/lib/brief/ber-names-shared";
import { spendingSetup, type SpendingSetup } from "@/lib/brief/spending";
import { activitiesPayload, holdersPayload, legacyPayload, levelsPayload } from "@/lib/brief/spending-fixture";
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

  it("titles the areas by what they show, with no tag on the title, each area's two shares on its row", () => {
    renderSection(LEGACY);
    expect(screen.getByRole("heading", { level: 3, name: "Targets and reviewed spending by biodiversity area" })).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: /Biodiversity areas/ })).getAllByRole("button");
    expect(rows.map((r) => r.textContent?.split(/\d/)[0])).toEqual(["Agriculture", "Protected areas", "Water"]);
    expect(rows[0].textContent).toContain("17%");
    expect(rows[0].textContent).toContain("70%");
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

  it("lists the review's own lines under a title, each opening to what it counted and who spends it", () => {
    renderSection(LEVELS);
    expect(screen.getByRole("heading", { level: 3, name: "Reviewed spending by programme, 2020–2021" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Security of protected areas.*Programme 71405/ }));
    // ₮7 bn counted of ₮26 bn spent, converted as the line's own spending is.
    expect(screen.getByText("Counted US$3.1 million of US$11.5 million spent, at the review's rates")).toBeTruthy();
    expect(screen.getByText("Other, counted at 5%")).toBeTruthy();
    expect(screen.getByText("Spent by 31 units in 2021, the largest:")).toBeTruthy();
    expect(screen.getByText("Khan Khentii administration")).toBeTruthy();
    // One level in the review's data: nothing to switch.
    expect(screen.queryByRole("group", { name: "Show by institution or by programme" })).toBeNull();
  });

  it("says what a line pays for in a sentence, abbreviations kept, the names set apart", () => {
    const data = levelsPayload();
    const line = data.berData.record.lines[0] as Record<string, unknown>;
    line.payments = [
      { name: "Wages and salaries, bonuses", share: 0.61 },
      { name: "VAT and fees", share: 0.2 },
    ];
    renderSection(spendingSetup(data, SOURCE)!);
    fireEvent.click(screen.getByRole("button", { name: /Security of protected areas.*Programme 71405/ }));
    expect(screen.getByText("Pays for wages and salaries, bonuses 61%; VAT and fees 20%.")).toBeTruthy();
  });

  it("lists the review's lines largest first in the currency the page states", () => {
    // More rupees, spent once the rupee had fallen: fewer US$ than the other.
    const record = {
      currency: "LKR",
      unit: "million",
      levels: [{ id: "all", name: "Central government" }],
      groups: [{ id: "CBA" }, { id: "DBU" }, { id: "OASBE" }, { id: "OAMBE" }],
      years: [
        { year: "2015", levels: ["all"], complete: true, reviewed: { all: 100 }, byGroup: { CBA: 100 }, public: { all: 10000 }, usdRate: 100 },
        { year: "2016", levels: ["all"], complete: true, reviewed: { all: 150 }, byGroup: { CBA: 150 }, public: { all: 10000 }, usdRate: 300 },
      ],
      lines: [
        { code: "LATE", kind: "institution", group: "CBA", name: "Late agency", amounts: { "2016": { all: { gross: 150, rate: 1, counted: 150 } } } },
        { code: "EARLY", kind: "institution", group: "CBA", name: "Early agency", amounts: { "2015": { all: { gross: 100, rate: 1, counted: 100 } } } },
        { code: "P001", kind: "project", name: "A project", amounts: { "2015": { all: { gross: 1, rate: 1, counted: 1 } } } },
      ],
    };
    const setup = spendingSetup({ berData: { record } }, SOURCE)!;
    const rows = () =>
      within(screen.getByRole("list", { name: "Institutions in the review, largest first" }))
        .getAllByRole("button")
        .map((b) => b.textContent ?? "");
    renderSection(setup);
    // US$1 million (LKR 100 million at 100) above US$0.5 million (150 at 300).
    expect(rows().map((r) => r.split("Counted")[0])).toEqual(["Early agency", "Late agency"]);
    cleanup();
    renderSection(setup, { currency: "mnt" });
    expect(rows().map((r) => r.split("Counted")[0])).toEqual(["Late agency", "Early agency"]);
  });

  it("lists Panama's spending by institution first and by programme on request, under one title", () => {
    const panama = spendingSetup(activitiesPayload(), SOURCE, {
      names: parseBerNames({
        names: {
          "0-10": { en: "Ministry of Agricultural Development" },
          "0-27": { en: "Ministry of Environment" },
          "0-10-1-3": { en: "Agricultural Health" },
        },
      }),
      locale: "en",
    })!;
    renderSection(panama);
    const title = { level: 3, name: "Reviewed spending by institution and programme, 2016–2017" };
    const group = screen.getByRole("group", { name: "Show by institution or by programme" });
    const rows = () => within(screen.getByRole("list", { name: /in the review, largest first$/ })).getAllByRole("button");
    expect(screen.getByRole("heading", title)).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Institution" })).toHaveAttribute("aria-pressed", "true");
    // The environment ministry first: the most money, over two programmes.
    expect(rows()[0].textContent).toMatch(/^Ministry of Environment2 programmes/);
    expect(rows()[0].querySelector(".sp-item-name")).toHaveAttribute("title", "Ministerio de Ambiente");
    fireEvent.click(rows()[0]);
    expect(screen.getByText("Its programmes, largest first:")).toBeTruthy();
    expect(screen.getByText("Dirección General y Administración")).toBeTruthy();
    // By programme: the agriculture ministry's programme leads; the title stays.
    fireEvent.click(within(group).getByRole("button", { name: "Programme" }));
    expect(rows()[0].textContent).toMatch(/^Agricultural HealthMinistry of Agricultural Development/);
    expect(screen.queryByText("Its programmes, largest first:")).toBeNull();
    expect(screen.getByRole("heading", title)).toBeTruthy();
  });

  it("lists Mongolia's spending by who holds the budget, in US$ at each year's rate", () => {
    renderSection(spendingSetup(holdersPayload(), SOURCE)!);
    expect(screen.getByRole("heading", { level: 3, name: "Reviewed spending by institution and programme, 2020–2021" })).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: "Institutions in the review, largest first" })).getAllByRole("button");
    expect(rows.map((r) => r.querySelector(".sp-item-name")?.textContent)).toEqual([
      "Minister for Nature and Tourism1 programme",
      "Capital city1 programme",
      "Bulgan province1 programme",
    ]);
    fireEvent.click(rows[1]);
    // ₮1 bn at 2,000 and ₮1.5 bn at 2,500: US$1.1 million, on the row and its line.
    const item = within(rows[1].closest("li")!);
    expect(item.getByText("Solid waste removal")).toBeTruthy();
    expect(item.getAllByText("US$1.1 million")).toHaveLength(2);
    expect(item.queryByText(/₮/)).toBeNull();
  });

  it("names a line by its machine translation, untagged, with the review's own name on hover", () => {
    const named = spendingSetup(levelsPayload(), SOURCE, {
      names: parseBerNames({ names: { "71405": { en: "Protection of protected areas" } } }),
      locale: "en",
    })!;
    renderSection(named);
    expect(screen.getByText("Protection of protected areas")).toHaveAttribute("title", "Security of protected areas");
    expect(screen.queryByText(/machine translation/i)).toBeNull();
  });

  it("tags each line's area as AI-suggested and keeps an unplaced line apart, with no fine print", () => {
    renderSection(LEVELS);
    fireEvent.click(screen.getByRole("button", { name: /^Protected areas/ }));
    expect(screen.getByText("AI-suggested, not yet reviewed")).toBeTruthy();
    // No matches until the comparisons are rebuilt for these lines.
    expect(screen.queryByText(/have a matching budget line/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Not yet assigned to an area/ }));
    expect(within(screen.getByRole("list", { name: "Budget lines in this area" })).getByText("Solid waste removal")).toBeTruthy();
    expect(screen.getByText("Not assigned, pending review")).toBeTruthy();
    expect(screen.queryByText(/lines have an area/)).toBeNull();
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
