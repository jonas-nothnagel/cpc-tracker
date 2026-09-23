import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { BriefApp } from "./brief-app";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
import { defaultSelection } from "@/lib/brief/selection";
import type { BriefSource } from "@/lib/brief/source";

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
    expect(screen.getByText("7 commitments in 3 policy documents, compared 16 times")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Document C/ }));
    expect(screen.getByText("5 commitments in 2 policy documents, compared 6 times")).toBeTruthy();
    expect(window.location.search).toBe("?docs=A%2CB");
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
    fireEvent.click(screen.getByRole("button", { name: "Move What works well together down" }));
    const first = screen.getAllByTestId("brief-sheet")[0];
    const ids = [...first.querySelectorAll("[data-section]")].map((n) => n.getAttribute("data-section"));
    expect(ids).toEqual(["overall", "apart"]);
  });

  it("drops a page when the map is left out", () => {
    renderApp();
    const sections = screen.getByRole("group", { name: "Sections" });
    fireEvent.click(within(sections).getByRole("checkbox", { name: /Map of commitments/ }));
    expect(screen.getByText("Prints on 2 pages")).toBeTruthy();
    expect(window.location.search).toContain("sections=");
  });
});

describe("BriefApp accessibility and provenance", () => {
  it("lets the reader pause and resume the moving text", () => {
    renderApp();
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
    expect(screen.getByText("Commitment texts on this page are translations of the original documents.")).toBeTruthy();
    expect(screen.getByText("The moving lines are commitments from the documents, shown in translation.")).toBeTruthy();
  });

  it("keeps an open drill-down off the printed page", () => {
    renderApp();
    fireEvent.click(screen.getAllByTestId("brief-pair-row")[0].querySelector("button") as HTMLElement);
    expect(screen.getByRole("dialog").closest("[data-screen-only]")).not.toBeNull();
  });
});
