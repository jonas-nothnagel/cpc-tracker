import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { briefFixture } from "@/lib/brief/test-fixture";
import { BriefPanels, type PanelState } from "./panels";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

const SOURCE = briefFixture();
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
    const rows = screen.getAllByTestId("brief-strand-row");
    expect(rows).toHaveLength(9);
    expect(rows[0].textContent).toContain("6 Commitment B6");
    expect(rows[0].textContent).toContain("4 Commitment C4");
    // Short labels carry the start of their verbatim text.
    expect(rows[0].textContent).toContain("Verbatim text of commitment B6");
    fireEvent.click(within(rows[0]).getByRole("button"));
    expect(onPush).toHaveBeenCalledWith({ kind: "pair", a: "B6", b: "C4" });
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
