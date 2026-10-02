import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { BriefApp } from "./brief-app";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
// jsdom implements neither scrollIntoView nor ResizeObserver (the walkthrough uses both).
Element.prototype.scrollIntoView = vi.fn();
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;
import { defaultSelection } from "@/lib/brief/selection";
import { initialExploreState } from "@/lib/brief/explore/state";
import { TOUR_STEPS } from "@/components/dashboard/coherence-briefing/tour/steps";
import type { BriefSource } from "@/lib/brief/source";
import { briefFixture } from "@/lib/brief/test-fixture";

const IDS = ["A1", "A2", "A3", "B1", "B2", "C1", "C2"];
const I = Object.fromEntries(IDS.map((id, i) => [id, i]));
// [a, b, level (high 0, medium 1, low 2, none 3, flagged 4), mechanism]
const ROWS: [string, string, number, number][] = [
  ["A1", "B1", 0, 0],
  ["A1", "B2", 1, 0],
  ["A2", "B1", 2, 0],
  ["A2", "B2", 4, 1],
  ["A3", "B1", 3, 0],
  ["B2", "A3", 1, 0],
  ["A1", "C1", 0, 0],
  ["A1", "C2", 0, 0],
  ["A2", "C1", 1, 0],
  ["A2", "C2", 2, 0],
  ["A3", "C1", 4, 2],
  ["A3", "C2", 4, 3],
  ["B1", "C1", 2, 0],
  ["B1", "C2", 2, 0],
  ["B2", "C1", 1, 0],
  ["C2", "B2", 4, 2],
];

const SOURCE: BriefSource = {
  countryId: "testland",
  countryName: "Testland",
  commitments: IDS.map((id) => ({ id, doc: id[0], label: `Label ${id}`, text: `Text of ${id}` })),
  documents: ["A", "B", "C"].map((id) => ({
    id,
    code: id,
    name: `Document ${id}`,
    full: `Document ${id} (full name)`,
    color: "#0468b1",
    count: IDS.filter((c) => c[0] === id).length,
    defaultOn: true,
  })),
  comparisons: ROWS.flatMap(([a, b, level, mech]) => [I[a], I[b], level, mech]),
  lenses: [
    {
      id: "globe",
      taxonomyType: "globe",
      categories: [{ id: "g1", name: "Protected areas" }],
      primary: { A1: "g1" },
    },
  ],
  themes: null,
  model: null,
};

function renderApp(source: BriefSource = SOURCE) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <BriefApp
        source={source}
        initialSelection={defaultSelection(source)}
        preparedOn="2026-09-23T10:00:00.000Z"
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => window.history.replaceState(null, "", "/testland/brief"));
afterEach(cleanup);

describe("BriefApp", () => {
  it("prints the standard brief on four pages", () => {
    renderApp();
    expect(screen.getByText("Prints on 4 pages")).toBeTruthy();
    expect(screen.getAllByTestId("brief-sheet")).toHaveLength(4);
  });

  it("states the scope on the title block and updates it when a document is left out", () => {
    renderApp();
    const figures = () =>
      within(screen.getByTestId("brief-title"))
        .getAllByTestId("brief-figure")
        .map((f) => f.textContent);
    expect(figures()).toEqual(["3 policy documents", "7 targets", "16 target pairs compared"]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Document C/ }));
    expect(figures()).toEqual(["2 policy documents", "5 targets", "6 target pairs compared"]);
    expect(window.location.search).toBe("?docs=A%2CB");
  });

  it("carries UNDP's logo quietly: on the landing with the tool's name, and on every printed page", () => {
    renderApp();
    const brand = screen.getByRole("link", { name: "UNDP Policy Coherence Analyzer" });
    expect(brand.getAttribute("href")).toBe("/");
    expect(within(brand).getByRole("img", { name: "UNDP" }).getAttribute("src")).toBe("/undp-logo.png");
    for (const sheet of screen.getAllByTestId("brief-sheet")) {
      expect(sheet.querySelector("header img[alt='UNDP']")).toBeTruthy();
    }
  });

  it("dates the brief in UNDP style", () => {
    renderApp();
    expect(screen.getAllByText(/Prepared on 23 September 2026 with the Policy Coherence Analyzer/).length).toBeGreaterThan(0);
  });

  it("keeps method text and document lists off the title block", () => {
    renderApp();
    const title = screen.getByTestId("brief-title");
    expect(within(title).queryByText(/AI model|Documents in this brief|Policy areas/)).toBeNull();
  });

  it("keeps at least two documents", () => {
    renderApp();
    fireEvent.click(screen.getByRole("checkbox", { name: /Document C/ }));
    const a = screen.getByRole("checkbox", { name: /Document A/ });
    expect((a as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("At least two documents are needed for a comparison.")).toBeTruthy();
  });

  it("reorders the sheets when a section moves", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Move Areas of alignment down" }));
    const first = screen.getAllByTestId("brief-sheet")[0];
    const ids = [...first.querySelectorAll("[data-section]")].map((n) => n.getAttribute("data-section"));
    expect(ids).toEqual(["overall", "aligned"]);
  });

  it("drops a page when sections are left out", () => {
    renderApp();
    const sections = screen.getByRole("group", { name: "In the brief" });
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Strongest alignments/ }));
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Documents side by side/ }));
    expect(screen.getByText("Prints on 3 pages")).toBeTruthy();
    expect(window.location.search).toContain("sections=");
  });
});

describe("BriefApp screen and print", () => {
  const sheets = () => document.querySelector(".brief-sheets") as HTMLElement;

  it("shows the brief as one flowing page and keeps the A4 pages for printing", () => {
    renderApp();
    expect(screen.getByTestId("brief-flow")).toBeTruthy();
    expect(sheets().getAttribute("aria-hidden")).toBe("true");
  });

  it("opens the A4 pages as a print preview from the print button", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Print or save as PDF" }));
    expect((screen.getByTestId("brief-flow") as HTMLElement).hidden).toBe(true);
    expect(sheets().getAttribute("aria-hidden")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to the brief" }));
    expect((screen.getByTestId("brief-flow") as HTMLElement).hidden).toBe(false);
    print.mockRestore();
  });

  it("opens the preview at its first page and returns to the same place", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    renderApp();
    Object.defineProperty(window, "scrollY", { value: 1800, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: "Print or save as PDF" }));
    expect(scroll.mock.contexts.map((el) => (el as Element).id)).toContain("brief-main");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Print" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to the brief" }));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 1800);
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    vi.unstubAllGlobals();
  });

  it("opens on the coherence overview and takes the reader from the aligned group on to the map", () => {
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    renderApp(briefFixture({ themes: true }));
    expect(screen.getByTestId("brief-hub")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "67% aligned" }));
    const targets = scroll.mock.contexts.map((el) => (el as HTMLElement).dataset.step);
    // The next step, as scrolling reaches it: the map, not a step further on.
    expect(targets).toEqual(["map"]);
  });

  it("moves focus to the step it leads to", () => {
    renderApp(briefFixture({ themes: true }));
    fireEvent.click(screen.getByRole("button", { name: "67% aligned" }));
    const heading = document.querySelector('[data-step="map"] h2');
    expect(document.activeElement).toBe(heading);
  });

  it("hands a target from the overview to the ring, and goes there", () => {
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <BriefApp
          source={SOURCE}
          initialSelection={defaultSelection(SOURCE)}
          preparedOn="2026-09-23T10:00:00.000Z"
          explore={{ layers: null, groups: ["docs"], initialState: initialExploreState(), initialPair: null }}
        />
      </NextIntlClientProvider>,
    );
    const ring = document.getElementById("brief-explore") as HTMLElement;
    expect(within(ring).queryByText(/Potential misalignment with \d+\./)).toBeNull();
    const row = within(document.querySelector('[data-step="apart"]') as HTMLElement).getAllByTestId("hub-apart-row")[0];
    fireEvent.click(within(row).getByRole("button", { pressed: false }));
    scroll.mockClear();
    fireEvent.click(within(row).getByRole("button", { name: "Explore this target" }));
    // The ring puts it in the centre and says how it reads against the rest.
    expect(within(ring).getByText(/Potential misalignment with 2\./)).toBeTruthy();
    expect(scroll.mock.contexts).toContain(ring);
    // Keyboard and screen-reader users arrive where the page went.
    expect(document.activeElement).toBe(document.getElementById("brief-explore-title"));
  });

  it("walks the page from top to bottom: each stop of the walkthrough below the one before", () => {
    renderApp(briefFixture({ themes: true }));
    // The builder is the menu beside the page, visited last.
    const stops = TOUR_STEPS.brief
      .filter((step) => step.target !== "brief-builder")
      .map((step) => document.querySelector(`[data-tour="${step.target}"]`));
    expect(stops.every(Boolean)).toBe(true);
    for (let k = 1; k < stops.length; k++) {
      expect(stops[k - 1]!.compareDocumentPosition(stops[k]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("the walkthrough reads the map by its edges: rows named at the left, columns under it", () => {
    const body = en.briefing.tour.brief.steps.map.body;
    expect(body).toMatch(/each row is a document named at the left/);
    expect(body).toMatch(/each column a document named under the map/);
    expect(body).not.toMatch(/diagonal/);
  });

  it("takes a section off the screen as well as the print, and brings it back", () => {
    renderApp(briefFixture({ themes: true }));
    const sections = screen.getByRole("group", { name: "In the brief" });
    const aligned = () => document.querySelector<HTMLElement>('[data-step="reinforce"]');
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Areas of alignment/ }));
    expect(sheets().querySelector('[data-section="together"]')).toBeNull();
    // What works well keeps its strongest alignments without its themes.
    expect(within(aligned()!).queryAllByTestId("brief-theme-row")).toHaveLength(0);
    expect(within(aligned()!).getAllByTestId("hub-strong-row").length).toBeGreaterThan(0);
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Strongest alignments/ }));
    expect(aligned()).toBeNull();
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Areas of alignment/ }));
    expect(within(aligned()!).getAllByTestId("brief-theme-row").length).toBeGreaterThan(0);
    expect(within(aligned()!).queryAllByTestId("hub-strong-row")).toHaveLength(0);
  });

  it("leaves out the overall picture and the map with the overall coherence", () => {
    renderApp(briefFixture({ themes: true }));
    const sections = screen.getByRole("group", { name: "In the brief" });
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Overall coherence/ }));
    expect(screen.queryByRole("button", { name: "67% aligned" })).toBeNull();
    expect(document.querySelector('[data-step="overview"]')).toBeNull();
    expect(document.querySelector('[data-step="map"]')).toBeNull();
    expect(document.querySelector('[data-step="reinforce"]')).not.toBeNull();
  });

  it("keeps the targets to review first without the potential misalignment themes and types", () => {
    renderApp(briefFixture({ themes: true }));
    const sections = screen.getByRole("group", { name: "In the brief" });
    const closer = () => document.querySelector<HTMLElement>('[data-step="apart"]');
    expect(closer()!.querySelector(".brief-hub-kinds")).not.toBeNull();
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Potential misalignment/ }));
    expect(within(closer()!).queryAllByTestId("brief-theme-row")).toHaveLength(0);
    expect(closer()!.querySelector(".brief-hub-kinds")).toBeNull();
    expect(within(closer()!).getAllByTestId("hub-apart-row").length).toBeGreaterThan(0);
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Targets to review first/ }));
    expect(closer()).toBeNull();
  });

  it("leaves out the documents, and the whole overview once none of its sections is kept", () => {
    renderApp(briefFixture({ themes: true }));
    const sections = screen.getByRole("group", { name: "In the brief" });
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Documents side by side/ }));
    expect(document.querySelector('[data-step="documents"]')).toBeNull();
    for (const name of [
      /Overall coherence/,
      /Areas of alignment/,
      /Strongest alignments/,
      /Potential misalignment/,
      /Targets to review first/,
    ]) {
      fireEvent.click(within(sections).getByRole("checkbox", { name }));
    }
    expect(screen.queryByTestId("brief-hub")).toBeNull();
  });

  it("goes from the landing straight into the overview, without repeating its figures", () => {
    renderApp();
    const flow = screen.getByTestId("brief-flow");
    expect(within(flow).queryByTestId("brief-intro")).toBeNull();
    expect(flow.firstElementChild?.getAttribute("data-testid")).toBe("brief-hub");
  });

  it("shows the overview's sections once, in the overview", () => {
    renderApp(briefFixture({ themes: true }));
    const flow = screen.getByTestId("brief-flow");
    for (const id of ["overall", "together", "aligned", "apart", "commitments", "documents"]) {
      expect(flow.querySelector(`[data-section="${id}"]`)).toBeNull();
    }
  });

  it("shows the policy areas below the overview in the standard brief, and leaves them out with the section", () => {
    renderApp();
    const flow = screen.getByTestId("brief-flow");
    expect(flow.querySelector('[data-section="areas"]')).not.toBeNull();
    const sections = screen.getByRole("group", { name: "In the brief" });
    fireEvent.click(within(sections).getByRole("checkbox", { name: /By policy area/ }));
    expect(flow.querySelector('[data-section="areas"]')).toBeNull();
  });

  it("shows the policy areas as the component after the overview", () => {
    renderApp(briefFixture({ themes: true }));
    const hub = screen.getByTestId("brief-hub");
    const areas = screen.getByTestId("brief-areas");
    expect(hub.compareDocumentPosition(areas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(areas).getByRole("heading", { level: 2 }).textContent).toContain("of the potential misalignments sit");
  });

  it("keeps the menu's policy areas and the component's choice as one", () => {
    const base = briefFixture();
    const source = {
      ...base,
      lenses: [
        ...base.lenses,
        { id: "ipcc" as const, taxonomyType: "sector", categories: [{ id: "s1", name: "Agriculture" }], primary: { A1: "s1" } },
      ],
    };
    renderApp(source);
    const areas = screen.getByTestId("brief-areas");
    fireEvent.click(within(areas).getByRole("button", { name: "Climate mitigation" }));
    expect((screen.getByRole("radio", { name: "Climate mitigation" }) as HTMLInputElement).checked).toBe(true);
    expect(window.location.search).toContain("lens=ipcc");
    fireEvent.click(screen.getByRole("radio", { name: "Biodiversity" }));
    expect(within(areas).getByRole("button", { name: "Biodiversity" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens a pair of policy areas' target pairs in a panel", () => {
    renderApp(briefFixture({ themes: true }));
    const areas = screen.getByTestId("brief-areas");
    const second = within(areas).getAllByTestId("brief-area-pair")[1];
    fireEvent.click(within(second).getByRole("button", { expanded: false }));
    fireEvent.click(within(areas).getByRole("button", { name: "See the 3 target pairs" }));
    expect(screen.getByRole("dialog", { name: "Target pairs between policy areas" })).toBeTruthy();
  });
});

describe("BriefApp walkthrough", () => {
  it("links the methodology page instead of explaining the method on the page", () => {
    renderApp();
    const link = screen.getByRole("link", { name: "How the analysis works" });
    expect(link.getAttribute("href")).toBe("/methodology");
  });

  it("walks the reader through the brief on request", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "How to read this brief" }));
    expect(screen.getByRole("dialog", { name: "Overall coherence" })).toBeTruthy();
  });

  it("walks through the overview on screen, never the print pages", () => {
    renderApp(briefFixture({ themes: true }));
    fireEvent.click(screen.getByRole("button", { name: "How to read this brief" }));
    const titles: string[] = [];
    for (let i = 0; i < 12; i++) {
      const dialog = document.querySelector("[role=dialog][aria-label]") as HTMLElement | null;
      if (!dialog) break;
      titles.push(dialog.getAttribute("aria-label") ?? "");
      const next = within(dialog).queryByRole("button", { name: "Next" });
      if (!next) break;
      fireEvent.click(next);
    }
    expect(titles).toEqual([
      "Overall coherence",
      "Map of the documents",
      "Strongest alignments",
      "Recurring themes",
      "Targets to review first",
      "Documents side by side",
      "By policy area",
      "Customize the brief",
    ]);
  });
});

describe("BriefApp accessibility and provenance", () => {
  it("does not narrate the moving text", () => {
    renderApp();
    expect(screen.queryByText(/moving lines/)).toBeNull();
  });

  it("lets the reader pause and resume the moving text", () => {
    renderApp();
    // The name says what the button does next; a pressed state on top would
    // announce "Play the moving text, pressed".
    expect(screen.getByRole("button", { name: "Pause the moving text" }).getAttribute("aria-pressed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pause the moving text" }));
    expect(document.querySelector(".brief-drift")?.getAttribute("data-paused")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Play the moving text" }));
    expect(document.querySelector(".brief-drift")?.getAttribute("data-paused")).toBe("false");
  });

  it("says when commitment texts are shown in translation", () => {
    const translated = {
      ...SOURCE,
      commitments: SOURCE.commitments.map((c, i) => (i === 0 ? { ...c, translated: "translation" as const } : c)),
    };
    renderApp(translated);
    const hero = document.querySelector(".brief-hero") as HTMLElement;
    expect(within(hero).getByText("Target texts on this page are translations of the original documents.")).toBeTruthy();
  });

  it("keeps an open drill-down off the printed page", () => {
    renderApp();
    const flow = screen.getByTestId("brief-flow");
    // The overview opens with its first document open.
    fireEvent.click(within(within(flow).getAllByTestId("brief-pair-row")[0]).getByRole("button"));
    expect(screen.getByRole("dialog").closest("[data-screen-only]")).not.toBeNull();
  });
});
