import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import type { Currency } from "@/components/brief/contracts/money";
import { parseBerAreas } from "@/lib/brief/ber-areas";
import { parseBerNames } from "@/lib/brief/ber-names-shared";
import type { BriefSource, LensId } from "@/lib/brief/source";
import { spendingSetup, type SpendingSetup } from "@/lib/brief/spending";
import { activitiesPayload, holdersPayload, legacyPayload, levelsPayload, sameNamePayload } from "@/lib/brief/spending-fixture";
import { briefFixture } from "@/lib/brief/test-fixture";
import { SpendingSection } from "./spending-section";

const SOURCE = briefFixture();
/** Country X: two years, US$ million, 10 reviewed of 300 public; P2 (Agriculture) holds 7. */
const LEGACY = spendingSetup(legacyPayload(), SOURCE)!;
/** A rebuilt record in tugrik billion: two budget levels, 2022 holds the
 *  local budgets only; ₮2,000 per US$ in 2020, ₮2,500 in 2021. */
const LEVELS = spendingSetup(levelsPayload(), SOURCE, {
  areas: {
    globe: parseBerAreas(
      {
        lines: [
          { code: "71405", area: "g1", status: "second-agrees", first: { ranked: [{ reasoning: "Protected areas." }] }, second: { ranked: [{ reasoning: "Ranger wages." }] } },
          { code: "82212", area: null, status: "no-clear-area", first: { ranked: [] }, second: { ranked: [] } },
        ],
      },
      null,
      "globe",
    ),
  },
})!;
/** The fixture with a climate mitigation lens beside Biodiversity. */
const CLIMATE = {
  ...SOURCE,
  lenses: [
    ...SOURCE.lenses,
    {
      id: "ipcc" as const,
      taxonomyType: "sector",
      categories: [
        { id: "s1", name: "Energy" },
        { id: "s2", name: "Agriculture, forestry and other land use" },
      ],
      primary: { A1: "s1", A2: "s1", B4: "s2", B5: "s2", B6: "s2", C1: "s2" } as Record<string, string>,
    },
  ],
};
/** The rebuilt record placed in both lenses: 71405 (7 of the 10) in
 *  Protected areas and in land use; 82212 in no specific area of either. */
const BOTH = spendingSetup(levelsPayload(), CLIMATE, {
  areas: {
    globe: parseBerAreas({ lines: [{ code: "71405", area: "g1", status: "second-agrees" }, { code: "82212", area: null, status: "no-clear-area" }] }, null, "globe"),
    ipcc: parseBerAreas({ lines: [{ code: "71405", area: "s2", status: "second-agrees" }, { code: "82212", area: null, status: "no-clear-area" }] }, null, "sector"),
  },
})!;

afterEach(cleanup);

function renderSection(
  setup: SpendingSetup,
  {
    onExploreArea,
    docs = ["A", "B", "C"],
    currency = "usd",
    onCurrency = () => {},
    source = SOURCE,
    lens = null,
    onLens,
  }: {
    onExploreArea?: (id: string, lens: LensId) => void;
    docs?: string[];
    currency?: Currency;
    onCurrency?: (c: Currency) => void;
    source?: BriefSource;
    lens?: LensId | null;
    onLens?: (next: LensId) => void;
  } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SpendingSection
        setup={setup}
        source={source}
        docs={docs}
        lens={lens}
        onLens={onLens}
        currency={currency}
        onCurrency={onCurrency}
        onExploreArea={onExploreArea}
      />
    </NextIntlClientProvider>,
  );
}

/** A Sri Lanka-like record of eight agencies in LKR million, the review's
 *  reason given for two; Sri Lanka Customs is of the other groups but
 *  counted at 100%. */
function agencies() {
  const rows = [
    { code: "FD", group: "CBA", name: "Forest Department", rate: 1, counted: 80 },
    { code: "DWC", group: "CBA", name: "Department of Wildlife Conservation", rate: 1, counted: 70 },
    { code: "CEA", group: "OASBE", name: "Central Environment Authority", rate: 0.5, counted: 60, rationale: "Main agency for EIAs." },
    { code: "SLC", group: "OASBE", name: "Sri Lanka Customs", rate: 1, counted: 50, rationale: "Its biodiversity division." },
    { code: "A5", group: "CBA", name: "Agency five", rate: 1, counted: 40 },
    { code: "A6", group: "CBA", name: "Agency six", rate: 1, counted: 30 },
    { code: "A7", group: "DBU", name: "Agency seven", rate: 1, counted: 20 },
    { code: "A8", group: "DBU", name: "Agency eight", rate: 1, counted: 10 },
  ];
  return {
    berData: {
      record: {
        currency: "LKR",
        unit: "million",
        levels: [{ id: "all", name: "Central government" }],
        groups: [{ id: "CBA" }, { id: "DBU" }, { id: "OASBE" }, { id: "OAMBE" }],
        years: [
          {
            year: "2015",
            levels: ["all"],
            complete: true,
            reviewed: { all: 360 },
            byGroup: { CBA: 220, DBU: 30, OASBE: 110, OAMBE: 0 },
            public: { all: 10000 },
            usdRate: 100,
          },
        ],
        lines: rows.map((r) => ({
          code: r.code,
          kind: "institution",
          group: r.group,
          name: r.name,
          ...(r.rationale ? { rationale: r.rationale } : {}),
          amounts: { "2015": { all: { gross: r.counted / r.rate, rate: r.rate, counted: r.counted } } },
        })),
      },
    },
  };
}

describe("SpendingSection, in two components", () => {
  it("sets the areas beside their sentence and the review's lines, apart from the record", () => {
    const { container } = renderSection(LEGACY);
    const [left, right] = [...container.querySelector(".sp-pair")!.children] as HTMLElement[];
    expect(within(left).getByRole("heading", { level: 3, name: "Targets and reviewed spending by thematic area" })).toBeTruthy();
    expect(within(right).getByRole("heading", { level: 3, name: /^Reviewed spending by/ })).toBeTruthy();
    // One serif title and serif sentences: the two sub-titles name their pictures in the sans.
    expect(container.querySelectorAll("h3.brief-hub-headline")).toHaveLength(0);
  });

  it("states how few areas hold half of the targets, and an opened area's own shares", () => {
    // Agriculture (g2) holds 8 of the 18 targets; Protected areas (g1) 2 and 30% of the spending.
    const primary: Record<string, string> = { B3: "g1", B4: "g1", C1: "g5", C2: "g5" };
    for (const id of ["A1", "A2", "A3", "A4", "A5", "A6", "B1", "B2"]) primary[id] = "g2";
    const source = { ...SOURCE, lenses: [{ ...SOURCE.lenses[0], primary }, ...SOURCE.lenses.slice(1)] };
    const { container } = renderSection(spendingSetup(legacyPayload(), source)!, { source });
    const sentence = () => container.querySelector(".sp-pair-side > .brief-hub-headline")?.textContent ?? null;
    expect(sentence()).toBe("2 of the 3 thematic areas hold 56% of the 18 targets and 100% of the reviewed biodiversity spending.");
    const row = () => within(screen.getByRole("list", { name: /Thematic areas/ })).getByRole("button", { name: /^Protected areas/ });
    fireEvent.click(row());
    expect(sentence()).toBe("Protected areas holds 30% of the reviewed biodiversity spending and 11% of the 18 targets.");
    fireEvent.click(row());
    expect(sentence()).toBe("2 of the 3 thematic areas hold 56% of the 18 targets and 100% of the reviewed biodiversity spending.");
  });

  it("lists six of the review's lines, the rest on request", () => {
    renderSection(spendingSetup(agencies(), SOURCE)!);
    const list = screen.getByRole("list", { name: "Institutions in the review, largest first" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Show all 8 institutions" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
  });

  it("opens a row only where the review says more about it", () => {
    renderSection(spendingSetup(agencies(), SOURCE)!);
    const list = screen.getByRole("list", { name: "Institutions in the review, largest first" });
    // The two agencies the review gives a reason for open; the others are plain rows.
    expect(within(list).getAllByRole("button").map((b) => b.querySelector(".sp-item-name")?.firstChild?.textContent)).toEqual([
      "Central Environment Authority",
      "Sri Lanka Customs",
    ]);
    const plain = within(list).getByText("Forest Department").closest(".sp-row")!;
    expect(plain.tagName).toBe("DIV");
    expect(plain.hasAttribute("aria-expanded")).toBe(false);
    fireEvent.click(within(list).getByRole("button", { name: /Sri Lanka Customs/ }));
    expect(screen.getByText("The review's reason: Its biodiversity division.")).toBeTruthy();
  });

  it("splits the years as the rows name the agencies, counted in full or in part", () => {
    const { container } = renderSection(spendingSetup(agencies(), SOURCE)!);
    expect([...container.querySelectorAll(".sp-legend li")].map((li) => li.textContent)).toEqual([
      "Agencies counted in full",
      "Agencies counted in part",
    ]);
    // Sri Lanka Customs' 50 stands with the agencies counted in full: 300 and 60 of the year's 360.
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1].textContent).toContain("US$3 million");
    expect(rows[1].textContent).toContain("US$600,000");
  });
});

describe("SpendingSection, Country X's illustrative file", () => {
  it("states the record out of all public spending, in every hundred, beside the section's title", () => {
    renderSection(LEGACY);
    const title = screen.getByRole("heading", { level: 2, name: "Reviewed biodiversity spending" });
    const sentence = screen.getByText("US$3.3 of every US$100 of public spending in 2020–2021 was reviewed biodiversity spending.");
    // A sentence beside the title, not a second heading.
    expect(sentence.tagName).toBe("P");
    expect(sentence.closest(".brief-sec-head-side")).toBeTruthy();
    expect(title.closest(".brief-sec-head")).toBe(sentence.closest(".brief-sec-head"));
    expect(screen.getByText("US$10 million")).toBeTruthy();
    expect(screen.getByText("US$300 million")).toBeTruthy();
    expect(screen.getByText(/Illustrative figures/)).toBeTruthy();
    // A review in US$ has no currency to choose.
    expect(screen.queryByRole("group", { name: "Amounts in" })).toBeNull();
  });

  it("titles the areas by what they show, with no tag on the title, each area's two shares on its row", () => {
    renderSection(LEGACY);
    expect(screen.getByRole("heading", { level: 3, name: "Targets and reviewed spending by thematic area" })).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: /Thematic areas/ })).getAllByRole("button");
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
    expect(onExploreArea).toHaveBeenCalledWith("g1", "globe");
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
      screen.getByText("US$3.3 of every US$100 of State and local budget spending in 2020–2021 was reviewed biodiversity spending."),
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
    expect(screen.getByText("₮3.3 of every ₮100 of State and local budget spending in 2020–2021 was reviewed biodiversity spending.")).toBeTruthy();
    // The currency choice stands under the title.
    expect(screen.getByRole("group", { name: "Amounts in" }).closest(".brief-sec-head-main")).toBeTruthy();
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
        .getAllByRole("listitem")
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

  it("names the budget of a programme whose institution runs another under its name", () => {
    renderSection(spendingSetup(sameNamePayload(), SOURCE)!);
    const rows = () => within(screen.getByRole("list", { name: /in the review, largest first$/ })).getAllByRole("button");
    fireEvent.click(rows()[0]);
    expect(screen.getByText("Áreas Protegidas y Biodiversidad (operating budget)")).toBeTruthy();
    expect(screen.getByText("Áreas Protegidas y Biodiversidad (investment budget)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Programme" }));
    expect(rows().map((r) => r.querySelector(".sp-item-name")?.firstChild?.textContent)).toEqual([
      "Sanidad Agropecuaria",
      "Áreas Protegidas y Biodiversidad (operating budget)",
      "Áreas Protegidas y Biodiversidad (investment budget)",
    ]);
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

  it("tags each line's area as AI-suggested and keeps a line with no specific area as general spending, with no fine print", () => {
    renderSection(LEVELS);
    fireEvent.click(screen.getByRole("button", { name: /^Protected areas/ }));
    expect(screen.getByText("AI-suggested, not yet reviewed")).toBeTruthy();
    // No matches until the comparisons are rebuilt for these lines.
    expect(screen.queryByText(/have a matching budget line/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^General biodiversity spending, no specific area/ }));
    expect(within(screen.getByRole("list", { name: "Budget lines in this area" })).getByText("Solid waste removal")).toBeTruthy();
    expect(screen.getByText("No specific area")).toBeTruthy();
    expect(screen.queryByText(/lines have an area/)).toBeNull();
  });

  it("opens a line the review describes to the review's own tag and words", () => {
    const payload = levelsPayload();
    const described = payload.berData.record.lines.find((l: { code: string }) => l.code === "71405") as Record<string, unknown>;
    described.reviewDescription = { en: "Line linked to protected areas.", es: "Línea vinculada a áreas protegidas." };
    described.tags = { "2020": "Directo", "2021": "Directo" };
    const areas = parseBerAreas({ lines: [{ code: "71405", area: "g1", status: "second-agrees" }] }, null, "globe");
    renderSection(spendingSetup(payload, SOURCE, { areas: { globe: areas } })!);
    fireEvent.click(screen.getByRole("button", { name: /^Protected areas/ }));
    const lines = screen.getByRole("list", { name: "Budget lines in this area" });
    expect(screen.queryByText(/The review's description/)).toBeNull();
    fireEvent.click(within(lines).getByRole("button", { expanded: false }));
    expect(within(lines).getByText("Tagged by the review as direct biodiversity spending.")).toBeTruthy();
    expect(within(lines).getByText("The review's description: Line linked to protected areas.")).toBeTruthy();
  });

  it("shows the areas' targets and spending as amounts on request, the bars still drawn by share", () => {
    const { container } = renderSection(LEVELS, { currency: "mnt" });
    const row = () => within(screen.getByRole("list", { name: /Thematic areas/ })).getByRole("button", { name: /^Protected areas/ });
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

describe("SpendingSection, in the climate lenses", () => {
  const lensChoice = () => screen.queryByRole("group", { name: "Thematic areas" });
  const pressed = () =>
    within(lensChoice()!)
      .getAllByRole("button")
      .map((b) => [b.textContent, b.getAttribute("aria-pressed")]);
  const rowNames = () =>
    within(screen.getByRole("list", { name: /Thematic areas/ }))
      .getAllByRole("button")
      .map((r) => r.querySelector(".sp-area-name")?.textContent);

  it("offers the lenses its lines are placed in, the brief's lens pressed, and hands a choice to the brief", () => {
    const onLens = vi.fn();
    renderSection(BOTH, { source: CLIMATE, lens: "ipcc", onLens });
    expect(pressed()).toEqual([
      ["Biodiversity", "false"],
      ["Climate mitigation", "true"],
    ]);
    fireEvent.click(within(lensChoice()!).getByRole("button", { name: "Biodiversity" }));
    expect(onLens).toHaveBeenCalledWith("globe");
  });

  it("reads the areas in the lens shown, the area column named after it", () => {
    const { container } = renderSection(BOTH, { source: CLIMATE, lens: "ipcc", onLens: () => {} });
    expect(rowNames()).toEqual(["Agriculture, forestry and other land use", "Energy", "General biodiversity spending, no specific area"]);
    expect(container.querySelector(".sp-row-head")?.firstElementChild?.textContent).toBe("Climate mitigation");
    expect(container.querySelector(".sp-pair-side > .brief-hub-headline")).toBeNull();
  });

  it("falls back to Biodiversity where the brief's lens has no placements", () => {
    const { container } = renderSection(BOTH, { source: CLIMATE, lens: "hr", onLens: () => {} });
    expect(pressed()).toEqual([
      ["Biodiversity", "true"],
      ["Climate mitigation", "false"],
    ]);
    expect(rowNames()[0]).toBe("Protected areas");
    expect(container.querySelector(".sp-row-head")?.firstElementChild?.textContent).toBe("Biodiversity");
  });

  it("names the money as reviewed biodiversity spending under a climate lens, an area without a line too", () => {
    const { container } = renderSection(BOTH, { source: CLIMATE, lens: "ipcc", onLens: () => {} });
    const head = [...container.querySelector(".sp-row-head")!.children].map((c) => c.textContent);
    expect(head).toEqual(["Climate mitigation", "Share of the targets", "Share of the reviewed biodiversity spending"]);
    fireEvent.click(screen.getByRole("button", { name: /^Energy/ }));
    expect(screen.getByText("No reviewed biodiversity spending in this area.")).toBeTruthy();
    expect(container.querySelector(".sp-pair-side > .brief-hub-headline")?.textContent).toBe(
      "Energy holds 0% of the reviewed biodiversity spending and 11% of the 18 targets.",
    );
  });

  it("offers no choice where the lines are placed in Biodiversity only", () => {
    renderSection(LEVELS, { onLens: () => {} });
    expect(lensChoice()).toBeNull();
  });

  it("hands the ring an area in the lens shown, and closes an open area when the lens changes", () => {
    const onExploreArea = vi.fn();
    const { rerender } = renderSection(BOTH, { source: CLIMATE, lens: "ipcc", onLens: () => {}, onExploreArea });
    fireEvent.click(screen.getByRole("button", { name: /^Agriculture, forestry and other land use/ }));
    fireEvent.click(screen.getByRole("button", { name: "Explore this area with its budget lines" }));
    expect(onExploreArea).toHaveBeenCalledWith("s2", "ipcc");
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <SpendingSection setup={BOTH} source={CLIMATE} docs={["A", "B", "C"]} lens="globe" onLens={() => {}} onExploreArea={onExploreArea} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("list", { name: "Budget lines in this area" })).toBeNull();
  });
});
