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
  it("prints the standard brief on three pages", () => {
    renderApp();
    expect(screen.getByText("Prints on 3 pages")).toBeTruthy();
    expect(screen.getAllByTestId("brief-sheet")).toHaveLength(3);
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
    const sections = screen.getByRole("group", { name: "In the printed brief" });
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Strongest alignments/ }));
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Documents side by side/ }));
    expect(screen.getByText("Prints on 2 pages")).toBeTruthy();
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

  it("opens on the coherence overview and takes the reader from the aligned group to its step", () => {
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    renderApp(briefFixture({ themes: true }));
    expect(screen.getByTestId("brief-hub")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "67% aligned" }));
    const targets = scroll.mock.contexts.map((el) => (el as HTMLElement).dataset.step);
    expect(targets).toContain("reinforce");
  });

  it("moves focus to the step it leads to", () => {
    renderApp(briefFixture({ themes: true }));
    fireEvent.click(screen.getByRole("button", { name: "67% aligned" }));
    const heading = document.querySelector('[data-step="reinforce"] h2');
    expect(document.activeElement).toBe(heading);
  });

  it("keeps the overview on screen whatever the printed brief holds", () => {
    renderApp(briefFixture({ themes: true }));
    const sections = screen.getByRole("group", { name: "In the printed brief" });
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Areas of alignment/ }));
    expect(screen.getByRole("button", { name: "67% aligned" })).toBeTruthy();
    expect(sheets().querySelector('[data-section="together"]')).toBeNull();
  });

  it("shows the overview's sections once, in the overview", () => {
    renderApp(briefFixture({ themes: true }));
    const flow = screen.getByTestId("brief-flow");
    for (const id of ["overall", "together", "aligned", "apart", "commitments", "documents"]) {
      expect(flow.querySelector(`[data-section="${id}"]`)).toBeNull();
    }
  });

  it("adds the policy areas below the overview when the brief holds them", () => {
    renderApp();
    const flow = screen.getByTestId("brief-flow");
    expect(flow.querySelector('[data-section="areas"]')).toBeNull();
    const sections = screen.getByRole("group", { name: "In the printed brief" });
    fireEvent.click(within(sections).getByRole("checkbox", { name: /By policy area/ }));
    expect(flow.querySelector('[data-section="areas"]')).not.toBeNull();
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
      "Recurring themes",
      "Strongest alignments",
      "Targets to review first",
      "Documents side by side",
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
    expect(
      screen.getAllByText("Target texts on this page are translations of the original documents.").length,
    ).toBeGreaterThan(0);
  });

  it("keeps an open drill-down off the printed page", () => {
    renderApp();
    const flow = screen.getByTestId("brief-flow");
    // The overview opens with its first document open.
    fireEvent.click(within(within(flow).getAllByTestId("brief-pair-row")[0]).getByRole("button"));
    expect(screen.getByRole("dialog").closest("[data-screen-only]")).not.toBeNull();
  });
});
