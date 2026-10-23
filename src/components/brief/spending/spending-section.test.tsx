import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { parseBerAreas } from "@/lib/brief/ber-areas";
import { parseBerChain } from "@/lib/brief/ber-chain-shared";
import { spendingSetup, type SpendingSetup } from "@/lib/brief/spending";
import { legacyPayload, levelsPayload } from "@/lib/brief/spending-fixture";
import { briefFixture } from "@/lib/brief/test-fixture";
import { SpendingSection } from "./spending-section";

const SOURCE = briefFixture();
/** Country X: two years, US$ million, 10 reviewed of 300 public; P2 (Agriculture) holds 7. */
const LEGACY = spendingSetup(legacyPayload(), SOURCE)!;
/** A rebuilt record: two budget levels, 2022 holds the local budgets only. */
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

function renderSection(setup: SpendingSetup, onExploreArea?: (id: string) => void, docs = ["A", "B", "C"]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SpendingSection setup={setup} source={SOURCE} docs={docs} onExploreArea={onExploreArea} />
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
    renderSection(LEGACY, onExploreArea);
    fireEvent.click(screen.getByRole("button", { name: /^Protected areas/ }));
    expect(within(screen.getByRole("list", { name: "Budget lines in this area" })).getByText("Protected area security")).toBeTruthy();
    expect(screen.getByText(/3 targets in this area\. 2 of the 3 have a matching budget line\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Explore this area with its budget lines" }));
    expect(onExploreArea).toHaveBeenCalledWith("g1");
  });

  it("offers the ring only for an area with targets in the brief's documents", () => {
    // Water holds a line but, without document C, none of the targets.
    const moved = { ...LEGACY, lines: LEGACY.lines.map((l) => (l.id === "BER_P2" ? { ...l, area: "g5" } : l)) };
    renderSection(moved, vi.fn(), ["A", "B"]);
    fireEvent.click(screen.getByRole("button", { name: /^Water/ }));
    expect(screen.getByText("No target in this area.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Explore this area with its budget lines" })).toBeNull();
  });
});

describe("SpendingSection, a rebuilt record", () => {
  it("states the complete years only, out of State and local budget spending, with US$ beside", () => {
    renderSection(LEVELS);
    expect(
      screen.getByRole("heading", {
        name: "₮3.3 of every ₮100 of State and local budget spending in 2020–2021 was reviewed biodiversity spending.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("₮10 billion")).toBeTruthy();
    expect(screen.getByText("US$4.4 million")).toBeTruthy();
  });

  it("draws each budget level per year and says where a level is not in the data", () => {
    renderSection(LEVELS);
    expect(screen.getByText("Reviewed spending by year and budget")).toBeTruthy();
    // 2022 holds the local budgets only: its State budget reads "not in the data", never zero.
    expect(screen.getAllByText("not in the data").length).toBeGreaterThan(0);
    const table = screen.getByRole("table");
    expect(within(table).getByText("2022").closest("tr")?.textContent).toContain("not in the data");
    // Year totals only where both levels are in the data.
    expect(screen.getByText("₮4 billion in all")).toBeTruthy();
    expect(screen.queryAllByText(/in all$/).length).toBe(2);
  });

  it("lists the review's own lines, each opening to what it counted and who spends it", () => {
    renderSection(LEVELS);
    expect(
      screen.getByRole("heading", { name: "Security of protected areas holds 70% of the reviewed spending in 2020–2021." }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Security of protected areas.*Programme 71405/ }));
    expect(screen.getByText("Counted ₮7 billion of ₮26 billion spent, at the review's rates")).toBeTruthy();
    expect(screen.getByText("Other, counted at 5%")).toBeTruthy();
    expect(screen.getByText("Spent by 31 units in 2021, the largest:")).toBeTruthy();
    expect(screen.getByText("Khan Khentii administration")).toBeTruthy();
  });

  it("tags each line's area as AI-suggested and keeps an unplaced line apart", () => {
    renderSection(LEVELS);
    fireEvent.click(screen.getByRole("button", { name: /^Protected areas/ }));
    expect(screen.getByText("AI-suggested, not reviewed")).toBeTruthy();
    // No matches until the comparisons are rebuilt for these lines.
    expect(screen.queryByText(/have a matching budget line/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Not placed in an area yet/ }));
    expect(within(screen.getByRole("list", { name: "Budget lines in this area" })).getByText("Solid waste removal")).toBeTruthy();
    expect(screen.getByText("Kept apart until a person decides")).toBeTruthy();
    expect(screen.getByText(/0 of 2 lines have an area checked by a person/)).toBeTruthy();
  });

  it("switches the chart from amounts to each budget's share", () => {
    renderSection(LEVELS);
    const share = screen.getByRole("button", { name: "Share of each budget's spending" });
    fireEvent.click(share);
    expect(share.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryAllByText(/in all$/).length).toBe(0);
  });
});

describe("SpendingSection, reported progress beside the money", () => {
  const chain = parseBerChain({
    nationalTargets: [
      {
        id: "NT03",
        label: "NT03",
        text: "By 2030, 30% of the land is protected. With more words.",
        status: "on_track",
        gbf: [3],
        gbfTitles: { "3": "30% of areas are effectively conserved" },
        lines: [{ code: "71405", via: [3] }],
      },
      { id: "NT12", label: "NT12", text: "Green cities.", status: "no_progress", gbf: [12], gbfTitles: {}, lines: [] },
    ],
    lines: { "71405": { type: "7.01.12", gbf: [1, 3], status: "linked" }, "82212": { type: null, gbf: [], status: "apart" } },
  });
  const WITH_CHAIN = spendingSetup(levelsPayload(), SOURCE, { chain })!;

  it("leads with the national targets that lag and meet no reviewed budget line", () => {
    renderSection(WITH_CHAIN);
    expect(
      screen.getByRole("heading", {
        name: "The 7th National Report rates 1 of the 2 national targets at limited or no progress; 1 of these share no Global Biodiversity Framework (GBF) target with a reviewed budget line.",
      }),
    ).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: /National targets, their reported progress/ })).getAllByRole("button");
    expect(rows.map((r) => r.textContent?.slice(0, 4))).toEqual(["NT12", "NT03"]);
    expect(rows[0].textContent).toContain("No progress");
    expect(rows[0].textContent).toContain("No line");
    expect(screen.getByText(/1 of 2 lines have a GBF target on which both AI readings/)).toBeTruthy();
  });

  it("opens a national target to its lines and the GBF targets they meet it through", () => {
    renderSection(WITH_CHAIN);
    fireEvent.click(screen.getByRole("button", { name: /^NT03/ }));
    expect(screen.getByText("By 2030, 30% of the land is protected. With more words.")).toBeTruthy();
    expect(screen.getByText("Filed under GBF target 3 (30% of areas are effectively conserved).")).toBeTruthy();
    expect(screen.getByText("Through GBF target 3 (30% of areas are effectively conserved): 1 line, ₮7 billion")).toBeTruthy();
    const lines = within(screen.getByRole("list", { name: "Budget lines through GBF target 3" }));
    expect(lines.getByText("Security of protected areas")).toBeTruthy();
    expect(lines.getByText("expenditure type AI-suggested, not reviewed")).toBeTruthy();
  });
});
