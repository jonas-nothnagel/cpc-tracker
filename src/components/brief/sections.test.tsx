import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { briefFixture } from "@/lib/brief/test-fixture";
import { OverallSection } from "./sections/overall";
import { ThemeSectionView } from "./sections/themes";
import { CommitmentsSection } from "./sections/commitments";
import { DocumentsSection } from "./sections/documents";
import { AreasSection } from "./sections/areas";
import { AlignedSection } from "./sections/aligned";

// jsdom has no canvas; the dot field draws nothing but its labels still render.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;

const SOURCE = briefFixture();
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), "globe");
const THEMED_SOURCE = briefFixture({ themes: true });
const THEMED = buildBriefData(THEMED_SOURCE, scopeOf(THEMED_SOURCE, ["A", "B", "C"]), null);

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("brief sections", () => {
  it("overall: states the shares the dots show and labels every group", () => {
    wrap(<OverallSection data={DATA} />);
    expect(
      screen.getByRole("heading", {
        name: "Across Testland's policies, 67% of target pairs are aligned and 14% show potential misalignment.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();
    expect(screen.getByText("19%")).toBeTruthy();
    expect(screen.getByText("14%")).toBeTruthy();
    expect(screen.queryByText(/Each dot/)).toBeNull();
  });

  it("opens every section with its finding, not a label above it", () => {
    wrap(<CommitmentsSection data={DATA} />);
    expect(screen.queryByText("Targets to review first")).toBeNull();
    cleanup();
    wrap(<OverallSection data={DATA} />);
    expect(screen.queryByText("Overall coherence")).toBeNull();
  });

  it("overall: on screen, the aligned and potential misalignment groups lead to their sections", () => {
    const onFocusTone = vi.fn();
    wrap(<OverallSection data={DATA} onFocusTone={onFocusTone} />);
    fireEvent.click(screen.getByRole("button", { name: "67% aligned" }));
    fireEvent.click(screen.getByRole("button", { name: "14% potential misalignment" }));
    expect(onFocusTone.mock.calls).toEqual([["reinforce"], ["apart"]]);
    expect(screen.queryByRole("button", { name: /partially aligned/ })).toBeNull();
  });

  it("overall: in print, the groups are plain labels", () => {
    wrap(<OverallSection data={DATA} variant="print" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("overall: leads with partial alignment when partial links are the larger group", () => {
    const counts = { reinforce: 420, partial: 554, apart: 15, none: 11, total: 1000 };
    wrap(<OverallSection data={{ ...DATA, counts, lead: "partial" }} />);
    expect(
      screen.getByRole("heading", {
        name: "Across Testland's policies, 55% of target pairs are partially aligned, 42% are aligned and 2% show potential misalignment.",
      }),
    ).toBeTruthy();
  });

  it("together: names the two documents that are most closely aligned", () => {
    wrap(<ThemeSectionView data={DATA} tone="reinforce" countryId="testland" />);
    expect(
      screen.getByRole("heading", {
        name: "Document A and Document C are the most closely aligned: 83% of their target pairs.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("No recurring theme in this selection.")).toBeTruthy();
    expect(screen.getByText("Verbatim text of commitment A1.")).toBeTruthy();
  });

  it("apart: names the two documents with the most potential misalignment", () => {
    wrap(<ThemeSectionView data={DATA} tone="apart" countryId="testland" />);
    expect(
      screen.getByRole("heading", {
        name: "Document B and Document C have the highest share of potential misalignment: 25% of their target pairs.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Verbatim text of commitment B6.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Read in full" })).toBeTruthy();
  });

  it("themes: lists each recurring theme with its size, documents and contested resources", () => {
    wrap(<ThemeSectionView data={THEMED} tone="apart" />);
    expect(screen.getByText("Recurring themes, identified by AI")).toBeTruthy();
    const rows = screen.getAllByTestId("brief-theme-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Water allocation pressure")).toBeTruthy();
    expect(within(rows[0]).getByText("9 potential misalignments")).toBeTruthy();
    expect(within(rows[0]).getByText("Resources involved: water and land")).toBeTruthy();
    expect(within(rows[0]).getByText("Document B and Document C")).toBeTruthy();
    expect(within(rows[1]).getByText("Goal overlap")).toBeTruthy();
  });

  it("themes: shows the first theme's example until the reader selects another", () => {
    wrap(<ThemeSectionView data={THEMED} tone="apart" />);
    expect(screen.getByText("Verbatim text of commitment B5.")).toBeTruthy();
    const second = within(screen.getAllByTestId("brief-theme-row")[1]).getByRole("button");
    fireEvent.click(second);
    expect(second.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Verbatim text of commitment A6.")).toBeTruthy();
    expect(screen.queryByText("Verbatim text of commitment B5.")).toBeNull();
  });

  it("themes: names the three documents most involved and counts the rest", () => {
    const docs = ["A", "B", "C", "D", "E"].map((id) => ({
      id,
      code: id,
      name: `Document ${id}`,
      full: id,
      color: "#000",
      count: 6,
      defaultOn: true,
    }));
    const row = {
      ...THEMED.apart.rows[0],
      docShares: { A: 0.2, B: 0.9, C: 0.5, D: 0.7, E: 0.1 },
    };
    const wide = {
      ...THEMED,
      scope: { ...THEMED.scope, docs },
      apart: { ...THEMED.apart, rows: [row] },
    };
    wrap(<ThemeSectionView data={wide} tone="apart" />);
    expect(screen.getByText("Document B, Document D, Document C and 2 more")).toBeTruthy();
  });

  it("themes: translates the resources and leaves out words without a translation", () => {
    const row = THEMED.apart.rows[0];
    const storyline = {
      ...row.storyline,
      aggregates: {
        ...row.storyline.aggregates!,
        contested_resources: [
          { resource: "water", count: 9 },
          { resource: "not-in-glossary", count: 8 },
          { resource: "land", count: 7 },
        ],
      },
    };
    const data = { ...THEMED, apart: { ...THEMED.apart, rows: [{ ...row, storyline }] } };
    render(
      <NextIntlClientProvider locale="es" messages={es} timeZone="UTC">
        <ThemeSectionView data={data} tone="apart" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Recursos implicados: agua y tierra")).toBeTruthy();
  });

  it("themes: alignment themes carry no contested resources", () => {
    wrap(<ThemeSectionView data={THEMED} tone="reinforce" />);
    const rows = screen.getAllByTestId("brief-theme-row");
    expect(within(rows[0]).getByText("Shared land restoration")).toBeTruthy();
    expect(within(rows[0]).getByText("54 aligned target pairs")).toBeTruthy();
    expect(screen.queryByText(/Resources involved/)).toBeNull();
  });

  it("themes: never tells the reader how to read the section", () => {
    wrap(<ThemeSectionView data={THEMED} tone="apart" />);
    expect(screen.queryByText(/Darker squares|named by AI from|takes no part/)).toBeNull();
  });

  it("commitments: leads with where potential misalignment concentrates", () => {
    wrap(<CommitmentsSection data={DATA} />);
    expect(
      screen.getByRole("heading", {
        name: "Of the 15 potential misalignments, 80% involve just 2 targets.",
      }),
    ).toBeTruthy();
    const rows = screen.getAllByTestId("brief-commitment-row");
    // A short label is only a clause number, so the start of the text follows it.
    expect(within(rows[0]).getByText("6 Commitment B6 Verbatim text of commitment B6.")).toBeTruthy();
    expect(within(rows[0]).getByText("7")).toBeTruthy();
    expect(within(rows[0]).getByText(/mostly with Document C/)).toBeTruthy();
  });

  it("aligned: leads with the target aligned with the largest share of the targets it was compared with", () => {
    wrap(<AlignedSection data={DATA} />);
    expect(
      screen.getByRole("heading", {
        name: "1 Commitment A1 Verbatim text of commitment A1. (Document A) is aligned with 100% of the targets it was compared with.",
      }),
    ).toBeTruthy();
    const rows = screen.getAllByTestId("brief-aligned-row");
    expect(rows).toHaveLength(8);
    expect(within(rows[0]).getByText(/mostly with Document B/)).toBeTruthy();
    expect(within(rows[4]).getByText("83%")).toBeTruthy();
  });

  it("documents: one row per document, most closely aligned with the others first", () => {
    wrap(<DocumentsSection data={DATA} />);
    expect(
      screen.getByRole("heading", {
        name: "Alignment with the other documents ranges from 58% for Document B to 75% for Document A.",
      }),
    ).toBeTruthy();
    const rows = screen.getAllByTestId("brief-doc-row").map((r) => r.getAttribute("data-doc"));
    expect(rows).toEqual(["A", "C", "B"]);
  });

  it("documents: on screen, a document opens to its pairs and a pair to its panel", () => {
    const onOpenDocPair = vi.fn();
    wrap(<DocumentsSection data={DATA} onOpenDocPair={onOpenDocPair} />);
    const first = screen.getAllByTestId("brief-doc-row")[0];
    fireEvent.click(within(first).getByRole("button", { expanded: false }));
    const pairs = within(first).getAllByTestId("brief-pair-row");
    expect(pairs.map((p) => p.getAttribute("data-pair"))).toEqual(["A~C", "A~B"]);
    fireEvent.click(within(pairs[0]).getByRole("button"));
    expect(onOpenDocPair).toHaveBeenCalledWith("A", "C");
  });

  it("documents: in print, the document rows stay closed", () => {
    wrap(<DocumentsSection data={DATA} variant="print" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getAllByTestId("brief-doc-row")).toHaveLength(3);
  });

  it("documents: names the measures above the bars instead of a legend", () => {
    wrap(<DocumentsSection data={DATA} />);
    const head = screen.getByTestId("brief-pairs-head");
    expect(within(head).getByText("Potential misalignment")).toBeTruthy();
    expect(within(head).getByText("Aligned")).toBeTruthy();
    expect(screen.queryByText(/average across/)).toBeNull();
  });

  it("areas: rates each policy area and marks the thin ones", () => {
    const thin = buildBriefData(SOURCE, scopeOf(SOURCE, ["B", "C"]), "globe");
    wrap(<AreasSection data={thin} lensName="Biodiversity" />);
    // With B and C only, both areas have 18 comparisons, under the floor of 30.
    expect(screen.getAllByText("too few target pairs")).toHaveLength(2);
    cleanup();
    wrap(<AreasSection data={DATA} lensName="Biodiversity" />);
    expect(
      screen.getByRole("heading", {
        name: "Agriculture shows the highest share of potential misalignment: 33%.",
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/average across/)).toBeNull();
  });

  it("areas: does not name a highest share when no rated area has any", () => {
    const calm = {
      ...DATA,
      areas: {
        rows: [{ id: "g1", name: "Protected areas", commitments: 3, comparisons: 36, apart: 0, share: 0 }],
        average: 0,
        max: 0,
      },
    };
    wrap(<AreasSection data={calm} lensName="Biodiversity" />);
    expect(
      screen.getByRole("heading", { name: "No rated policy area shows potential misalignment." }),
    ).toBeTruthy();
  });
});
