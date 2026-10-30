import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { scopeOf } from "@/lib/brief/compute";
import type { Nr7Setup } from "@/lib/brief/nr7";
import type { Nr7Detail } from "@/lib/brief/nr7-detail";
import type { SpendingSetup } from "@/lib/brief/spending";
import { briefFixture } from "@/lib/brief/test-fixture";
import { Nr7Section } from "./nr7-section";

const SOURCE = briefFixture();
const [A, B] = SOURCE.commitments;

const SETUP: Nr7Setup = {
  publishedOn: "2026-02-28",
  rows: [
    { id: "NT01", number: "1", status: "on_track", targetId: A.id, reportText: "One", indicators: 4, actions: 2, lines: 1, spend: 10, spendUsd: 5 },
    { id: "NT02", number: "2", status: "limited", targetId: B.id, reportText: "Two", indicators: 0, actions: 0, lines: 0, spend: 0, spendUsd: null },
  ],
};

const DETAIL: Nr7Detail = {
  id: "NT02",
  level: "Progress towards target but at an insufficient rate",
  gbf: [{ code: "GBF-T03", title: "30% of areas are effectively conserved" }],
  words: { challenges: "Funding is short.", progress: "Coverage grew.", actions: null, effectiveness: null },
  indicators: [
    {
      id: "3.1",
      label: "3.1 Coverage of protected areas",
      shared: false,
      note: null,
      series: [
        { label: "Land", unit: "Percent", points: [{ year: 2020, value: 20 }, { year: 2025, value: 21 }] },
        { label: "Sea", unit: "Percent", points: [{ year: 2020, value: 1 }, { year: 2025, value: 2 }] },
        { label: "Rivers", unit: "Percent", points: [{ year: 2025, value: 3 }] },
      ],
    },
    { id: "18.2", label: "18.2 Harmful subsidies", shared: false, note: "A national screening assessed subsidies.", series: [] },
    { id: "A.3", label: "A.3 Red List Index", shared: true, note: null, series: [{ label: null, unit: "index", points: [{ year: 2020, value: 0.9 }] }] },
  ],
  answers: {
    mix: { yes: 1, partially: 2, underDevelopment: 0, no: 0, other: 1 },
    items: [{ question: "Is there a plan?", response: "Partially", value: "partially" }],
  },
  actions: [{ id: "BTR_1", name: "Forest rehabilitation", text: "Forest rehabilitation through better incentives" }],
};

const SPENDING = {
  unit: "million",
  currency: "US$",
  showMatches: true,
  lines: [{ id: "BER_a", name: "Protected areas programme", total: 10, totalUsd: null, matches: [A.id] }],
} as unknown as SpendingSetup;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SCOPE = scopeOf(SOURCE, SOURCE.documents.map((d) => d.id));

function renderSection(
  setup: Nr7Setup = SETUP,
  onExplore?: (id: string) => void,
  onOpenPair: (a: string, b: string) => void = () => {},
  scope = SCOPE,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <div data-brief="">
        <Nr7Section setup={setup} spending={SPENDING} source={SOURCE} scope={scope} onExplore={onExplore} onOpenPair={onOpenPair} />
      </div>
    </NextIntlClientProvider>,
  );
}

const rowNames = () => screen.getAllByRole("button", { expanded: false }).map((b) => b.textContent);

describe("Nr7Section", () => {
  it("leads with how many targets the report rates behind schedule, in numbers", () => {
    renderSection();
    expect(screen.getByRole("heading", { level: 3 }).textContent).toContain("rates 1 of 2 national targets behind schedule");
    expect(screen.getByText(/published February 28, 2026/)).toBeTruthy();
  });

  it("reads down the report's scale, on track first", () => {
    renderSection();
    expect(rowNames()[0]).toMatch(/^1/);
    expect(rowNames()[1]).toMatch(/^2/);
    expect(screen.getByRole("columnheader", { name: /Rating in the report/ }).getAttribute("aria-sort")).toBe("descending");
  });

  it("sorts by any column, and says so to a screen reader", () => {
    renderSection();
    const header = screen.getByRole("columnheader", { name: /Indicators/ });
    expect(header.getAttribute("aria-sort")).toBe("none");
    fireEvent.click(within(header).getByRole("button"));
    expect(header.getAttribute("aria-sort")).toBe("descending");
    expect(rowNames()[0]).toMatch(/^1/);
    fireEvent.click(within(header).getByRole("button"));
    expect(header.getAttribute("aria-sort")).toBe("ascending");
    expect(rowNames()[0]).toMatch(/^2/);
  });

  it("states ratings in words, never by colour alone", () => {
    renderSection();
    expect(screen.getAllByText("Limited progress").length).toBeGreaterThan(0);
    expect(screen.getAllByText("On track").length).toBeGreaterThan(0);
  });

  const openFirstRow = async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => DETAIL }));
    vi.stubGlobal("fetch", fetchMock);
    renderSection();
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
    await screen.findByText("Funding is short.");
    return fetchMock;
  };

  it("opens a row on the report's entry beside what the AI reads, with the report's words last", async () => {
    const fetchMock = await openFirstRow();
    expect(String(fetchMock.mock.calls[0]).includes("id=NT01")).toBe(true);
    expect(screen.getByText("3.1 Coverage of protected areas")).toBeTruthy();
    expect(screen.getByText(/Land: 20 Percent in 2020 to 21 Percent in 2025/)).toBeTruthy();
    expect(screen.getByText("A national screening assessed subsidies.")).toBeTruthy();
    expect(screen.getByText(/Rating: Progress towards target/)).toBeTruthy();
    expect(screen.getByText("Protected areas programme")).toBeTruthy();
    expect(screen.getByText("Forest rehabilitation").getAttribute("title")).toBe("Forest rehabilitation through better incentives");
    const order = ["In the report", "Read by AI against the target", "Budget lines strongly matching", "Aligned (12)", "Narrative in the report"];
    const places = order.map((text) => screen.getByText(text));
    for (let i = 1; i < places.length; i += 1) {
      expect(places[i - 1].compareDocumentPosition(places[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("keeps the row's name in the row and gives the whole wording its own line", async () => {
    const long = "By 2035, the country will strengthen its protected areas ".repeat(5).trim();
    const source = { ...SOURCE, commitments: SOURCE.commitments.map((c) => (c.id === A.id ? { ...c, text: long } : c)) };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => DETAIL })));
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-brief="">
          <Nr7Section setup={SETUP} spending={SPENDING} source={source} scope={SCOPE} onOpenPair={() => {}} />
        </div>
      </NextIntlClientProvider>,
    );
    const row = screen.getAllByRole("button", { expanded: false })[0];
    fireEvent.click(row);
    await screen.findByText("Funding is short.");
    expect(row.textContent).not.toContain(long);
    expect(screen.getByText(long).tagName).toBe("P");
  });

  it("says nothing the numbers do not: no highest share, no prompt", async () => {
    await openFirstRow();
    expect(screen.queryByText(/highest share/)).toBeNull();
    expect(screen.queryByText(/Worth a closer look/)).toBeNull();
  });

  it("keeps the targets behind the two shares collapsed, each opening its pair", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => DETAIL })));
    const onOpenPair = vi.fn();
    renderSection({ ...SETUP, rows: [{ ...SETUP.rows[0], targetId: "A6" }] }, undefined, onOpenPair);
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
    await screen.findByText("Funding is short.");
    const rows = () => screen.getAllByRole("button").filter((b) => b.className === "n7-listed-open");
    expect(rows()).toHaveLength(0);
    expect(screen.getByText("Aligned (0)").tagName).toBe("P");
    const toggle = screen.getByRole("button", { name: "Potential misalignment (6)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(rows()).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Show all 6" }));
    expect(rows()).toHaveLength(6);
    fireEvent.click(rows()[0]);
    expect(onOpenPair).toHaveBeenCalledWith("A6", "B1");
    fireEvent.click(toggle);
    expect(rows()).toHaveLength(0);
  });

  it("takes a target to the ring's centre from a share, without opening the row", () => {
    const onExplore = vi.fn();
    // A share shows from 30 pairs on; the fixture gives a target 12.
    const many = { ...SCOPE, comparisons: [...SCOPE.comparisons, ...SCOPE.comparisons, ...SCOPE.comparisons] };
    renderSection(SETUP, onExplore, undefined, many);
    const share = screen.getAllByRole("button").filter((b) => b.className === "n7-share")[0];
    expect(share.getAttribute("title")).toBe("Explore this target");
    fireEvent.click(share);
    expect(onExplore).toHaveBeenCalledWith(A.id);
    expect(screen.queryByText("In the report")).toBeNull();
  });

  it("offers the report's own wording beside a translation", async () => {
    const translated: Nr7Detail = { ...DETAIL, words: { ...DETAIL.words, challenges: "Funding is short." }, original: { challenges: "Falta financiamiento." } };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => translated })));
    renderSection();
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
    await screen.findByText("Funding is short.");
    fireEvent.click(screen.getByRole("button", { name: "Taken directly from the report" }));
    expect(screen.getByText("Falta financiamiento.")).toBeTruthy();
  });

  it("shows one passage of the report at a time", async () => {
    await openFirstRow();
    expect(screen.queryByText("Coverage grew.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Main actions" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Progress" }));
    expect(screen.getByText("Coverage grew.")).toBeTruthy();
    expect(screen.queryByText("Funding is short.")).toBeNull();
    expect(screen.getByRole("button", { name: "Progress" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("leads with a target's own indicators; those across several targets wait for a click", async () => {
    await openFirstRow();
    expect(screen.queryByText("A.3 Red List Index")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all 3" }));
    expect(screen.getByText("A.3 Red List Index")).toBeTruthy();
    expect(screen.getByText("Reported across several targets")).toBeTruthy();
  });

  it("shows an indicator's first two breakdowns; the others wait for a click", async () => {
    await openFirstRow();
    expect(screen.getByText(/Sea: 1 Percent in 2020 to 2 Percent in 2025/)).toBeTruthy();
    expect(screen.queryByText(/Rivers/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "and 1 more breakdown" }));
    expect(screen.getByText(/Rivers: 3 Percent in 2025/)).toBeTruthy();
  });

  it("says so when the report's entry cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    renderSection();
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
    await waitFor(() => expect(screen.getByText("The report's entry could not be read.")).toBeTruthy());
  });

  it("hands a target to the ring", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => DETAIL })));
    const onExplore = vi.fn();
    renderSection(SETUP, onExplore);
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);
    const link = await screen.findByRole("button", { name: "Explore this target" });
    expect(link.compareDocumentPosition(screen.getByText("In the report")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(link);
    expect(onExplore).toHaveBeenCalledWith(A.id);
  });

  it("leaves out the reported actions where the country has none", () => {
    renderSection({ ...SETUP, rows: SETUP.rows.map((r) => ({ ...r, actions: null })) });
    expect(screen.queryByRole("columnheader", { name: /Reported actions/ })).toBeNull();
  });
});
