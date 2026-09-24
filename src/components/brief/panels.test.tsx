import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { briefFixture } from "@/lib/brief/test-fixture";
import { BriefPanels, type PanelState } from "./panels";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

const SOURCE = briefFixture({ notes: true });
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), "globe");

function renderPanels(stack: PanelState[], onPush = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <div data-brief>
        <BriefPanels
          stack={stack}
          source={SOURCE}
          data={DATA}
          onPush={onPush}
          onBack={vi.fn()}
          onClose={vi.fn()}
        />
      </div>
    </NextIntlClientProvider>,
  );
  return { onPush };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BriefPanels", () => {
  it("lists a pair of documents' potential misalignments through the busiest commitment first", () => {
    const { onPush } = renderPanels([{ kind: "docPair", a: "B", b: "C" }]);
    expect(screen.getByText("9 potential misalignments. Most frequent targets first.")).toBeTruthy();
    expect(screen.getAllByTestId("brief-strand-row")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show all 9" }));
    const rows = screen.getAllByTestId("brief-strand-row");
    expect(rows).toHaveLength(9);
    expect(rows[0].textContent).toContain("6 Commitment B6");
    expect(rows[0].textContent).toContain("4 Commitment C4");
    // Short labels carry the start of their verbatim text.
    expect(rows[0].textContent).toContain("Verbatim text of commitment B6");
    fireEvent.click(within(rows[0]).getByRole("button"));
    expect(onPush).toHaveBeenCalledWith({ kind: "pair", a: "B6", b: "C4" });
  });

  it("reads a pair of documents with the AI's first sentences, the rest on request", () => {
    renderPanels([{ kind: "docPair", a: "A", b: "B" }]);
    expect(screen.getByText("A and B on land")).toBeTruthy();
    expect(screen.getByText("Both expand restoration.")).toBeTruthy();
    expect(screen.queryByText(/They also share monitoring/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "More" })[0]);
    expect(screen.getByText(/They also share monitoring/)).toBeTruthy();
    expect(screen.getByText("Cropland expansion may compete with protected areas.")).toBeTruthy();
    expect(screen.getByText("Joint land-use screening could help.")).toBeTruthy();
  });

  it("lists a pair of documents' strongest aligned target pairs", () => {
    const { onPush } = renderPanels([{ kind: "docPair", a: "A", b: "C" }]);
    expect(screen.getByText("30 aligned target pairs, strongest first")).toBeTruthy();
    const rows = screen.getAllByTestId("brief-aligned-pair-row");
    expect(rows).toHaveLength(5);
    fireEvent.click(within(rows[1]).getByRole("button"));
    expect(onPush).toHaveBeenCalledWith({ kind: "pair", a: "A1", b: "C3" });
  });

  it("groups a commitment's partners by how they read", () => {
    renderPanels([{ kind: "commitment", id: "B6" }]);
    expect(screen.getByText("Potential misalignment with 7 targets")).toBeTruthy();
    expect(screen.getByText("Aligned with 4 targets")).toBeTruthy();
    expect(screen.getByText("Verbatim text of commitment B6.")).toBeTruthy();
  });

  it("says when a theme's AI text was written for the full set of documents", () => {
    const storyline = {
      name: "Shared land restoration",
      type: "reinforcement" as const,
      description: "About land restoration.",
      pathway: "Joint monitoring could be a starting point.",
      contributing_doc_pairs: ["A<->B"],
      confidence: "high" as const,
      pair_count: 1,
      spans_documents: ["A", "B"],
    };
    const full = { storylines: [storyline], summary_paragraph: "", doc_pair_count: 3 };
    const withThemes = { ...SOURCE, themes: { ...full, states: { "": full } } };
    const data = buildBriefData(withThemes, scopeOf(withThemes, ["A", "B"]), null);
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-brief>
          <BriefPanels
            stack={[{ kind: "theme", type: "reinforcement", name: "Shared land restoration" }]}
            source={withThemes}
            data={data}
            onPush={vi.fn()}
            onBack={vi.fn()}
            onClose={vi.fn()}
          />
        </div>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("About land restoration.")).toBeTruthy();
    expect(screen.getByText("Theme names were identified across all documents.")).toBeTruthy();
  });

  it("opens a pair of documents on the brief's result bar", () => {
    renderPanels([{ kind: "docPair", a: "A", b: "B" }]);
    expect(
      screen.getByRole("img", {
        name: "Document A and Document B: 67% aligned, 17% potential misalignment, from 36 target pairs",
      }),
    ).toBeTruthy();
  });

  it("sets the two documents apart, and lays their target pairs out in one column each", () => {
    renderPanels([{ kind: "docPair", a: "B", b: "C" }]);
    expect(screen.getAllByTestId("brief-docpair-doc").map((e) => e.textContent)).toEqual(["Document B", "Document C"]);
    const cols = screen.getAllByTestId("brief-docpair-cols")[0];
    expect(within(cols).getByText("Document B")).toBeTruthy();
    expect(within(cols).getByText("Document C")).toBeTruthy();
    // Each row: the first document's target on the left, the second's on the right.
    const row = screen.getAllByTestId("brief-strand-row")[0];
    const [left, right] = within(row).getAllByTestId("brief-docpair-cell");
    expect(left.textContent).toContain("Commitment B6");
    expect(right.textContent).toContain("Commitment C4");
    // The column names are for the eye; each cell names its document for a screen reader.
    expect(left.textContent).toContain("Document B");
    expect(right.textContent).toContain("Document C");
  });

  it("asks for feedback on a pair of documents' AI reading, and only where there is one", async () => {
    renderPanels([{ kind: "docPair", a: "A", b: "B" }]);
    expect(await screen.findByRole("group", { name: "Feedback on this AI-generated assessment" })).toBeTruthy();
    cleanup();
    renderPanels([{ kind: "docPair", a: "B", b: "C" }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("group", { name: "Feedback on this AI-generated assessment" })).toBeNull();
  });

  it("opens a target on its own result bar", () => {
    renderPanels([{ kind: "commitment", id: "B6" }]);
    expect(
      screen.getByRole("img", {
        name: "6 Commitment B6: 33% aligned, 58% potential misalignment, from 12 target pairs",
      }),
    ).toBeTruthy();
  });

  it("shows a theme's size, its example and feedback on its AI summary", async () => {
    const themed = briefFixture({ themes: true });
    const data = buildBriefData(themed, scopeOf(themed, ["A", "B", "C"]), null);
    const onPush = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-brief>
          <BriefPanels
            stack={[{ kind: "theme", type: "friction", name: "Water allocation pressure" }]}
            source={themed}
            data={data}
            onPush={onPush}
            onBack={vi.fn()}
            onClose={vi.fn()}
          />
        </div>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("9 potential misalignments")).toBeTruthy();
    expect(screen.getByText("Resources involved: water and land")).toBeTruthy();
    const example = screen.getByRole("figure");
    expect(within(example).getByText("Verbatim text of commitment B5.")).toBeTruthy();
    fireEvent.click(within(example).getByRole("button", { name: "Read in full" }));
    expect(onPush).toHaveBeenCalledWith({ kind: "pair", a: "B5", b: "C4" });
    expect(await screen.findByRole("group", { name: "Feedback on this AI-generated assessment" })).toBeTruthy();
  });

  it("labels a pair of documents' AI summary with its confidence and a caveat", () => {
    renderPanels([{ kind: "docPair", a: "A", b: "B" }]);
    expect(screen.getByText("Medium confidence")).toBeTruthy();
    expect(screen.getByText("AI-generated synthesis. Treat as a prompt to review, not a settled finding.")).toBeTruthy();
  });

  it("labels a theme as identified by AI, with its confidence and a caveat", () => {
    const themed = briefFixture({ themes: true });
    const data = buildBriefData(themed, scopeOf(themed, ["A", "B", "C"]), null);
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-brief>
          <BriefPanels
            stack={[{ kind: "theme", type: "friction", name: "Water allocation pressure" }]}
            source={themed}
            data={data}
            onPush={vi.fn()}
            onBack={vi.fn()}
            onClose={vi.fn()}
          />
        </div>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Recurring theme of potential misalignment, identified by AI")).toBeTruthy();
    expect(screen.getByText("High confidence")).toBeTruthy();
    expect(screen.getByText("AI-generated synthesis. Treat as a prompt to review, not a settled finding.")).toBeTruthy();
  });

  it("reads one comparison as the two targets and the AI's explanation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          pair: {
            targetAId: "B6",
            targetBId: "C4",
            alignment: "flagged",
            mechanism: "resource_competition",
            contestedResources: ["wetland"],
            description: "Both claim the same wetland.",
          },
          targetA: { id: "B6", text: "Text B6", sourceDocument: "B", sourceLabel: "6 Commitment B6", country: "Testland", isQuantitative: false, isTimeBound: false },
          targetB: { id: "C4", text: "Text C4", sourceDocument: "C", sourceLabel: "4 Commitment C4", country: "Testland", isQuantitative: false, isTimeBound: false },
        }),
      })),
    );
    renderPanels([{ kind: "pair", a: "B6", b: "C4" }]);
    expect(await screen.findByRole("heading", { name: "Potential misalignment" })).toBeTruthy();
    expect(screen.getByText("Competing for resources")).toBeTruthy();
    expect(screen.getByText("Verbatim text of commitment B6.")).toBeTruthy();
    expect(screen.getByText("Verbatim text of commitment C4.")).toBeTruthy();
    expect(screen.getByText("Resources involved: wetland")).toBeTruthy();
    expect(await screen.findByRole("group", { name: "Feedback on this AI-generated assessment" })).toBeTruthy();
  });

  it("loads one comparison with its AI reading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          pair: {
            targetAId: "B6",
            targetBId: "C4",
            alignment: "flagged",
            mechanism: "resource_competition",
            description: "Both claim the same wetland.",
          },
          targetA: { id: "B6", text: "Text B6", sourceDocument: "B", sourceLabel: "6 Commitment B6", country: "Testland", isQuantitative: false, isTimeBound: false },
          targetB: { id: "C4", text: "Text C4", sourceDocument: "C", sourceLabel: "4 Commitment C4", country: "Testland", isQuantitative: false, isTimeBound: false },
        }),
      })),
    );
    renderPanels([{ kind: "pair", a: "B6", b: "C4" }]);
    await waitFor(() => expect(screen.getByText("Both claim the same wetland.")).toBeTruthy());
  });
});
