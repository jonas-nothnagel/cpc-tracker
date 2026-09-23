import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import en from "../../../messages/en.json";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { briefFixture } from "@/lib/brief/test-fixture";
import { OverallSection } from "./sections/overall";
import { ThemeSectionView } from "./sections/themes";
import { CommitmentsSection } from "./sections/commitments";
import { DocumentsSection } from "./sections/documents";
import { AreasSection } from "./sections/areas";

// jsdom has no canvas; the dot field draws nothing but its labels still render.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;

const SOURCE = briefFixture();
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), "globe");

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
        name: "67% of comparisons between Testland's policies are aligned; 14% show potential misalignment.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();
    expect(screen.getByText("19%")).toBeTruthy();
    expect(screen.getByText("14%")).toBeTruthy();
    expect(screen.getByText("Each dot is one comparison between two commitments.")).toBeTruthy();
  });

  it("overall: leads with partial alignment when partial links are the larger group", () => {
    const counts = { reinforce: 420, partial: 554, apart: 15, none: 11, total: 1000 };
    wrap(<OverallSection data={{ ...DATA, counts, lead: "partial" }} />);
    expect(
      screen.getByRole("heading", {
        name: "55% of comparisons between Testland's policies are partially aligned, 42% are aligned and 2% show potential misalignment.",
      }),
    ).toBeTruthy();
  });

  it("together: names the two documents that are most closely aligned", () => {
    wrap(<ThemeSectionView data={DATA} tone="reinforce" countryId="testland" />);
    expect(
      screen.getByRole("heading", {
        name: "Document A and Document C are the most closely aligned: 83% of their comparisons.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("No recurring theme was identified for this selection of documents.")).toBeTruthy();
    expect(screen.getByText("Verbatim text of commitment A1.")).toBeTruthy();
  });

  it("apart: names the two documents with the most potential misalignment", () => {
    wrap(<ThemeSectionView data={DATA} tone="apart" countryId="testland" />);
    expect(
      screen.getByRole("heading", {
        name: "Document B and Document C have the highest share of potential misalignment: 25% of their comparisons.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Verbatim text of commitment B6.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show the AI reading" })).toBeTruthy();
  });

  it("commitments: leads with where potential misalignment concentrates", () => {
    wrap(<CommitmentsSection data={DATA} />);
    expect(
      screen.getByRole("heading", {
        name: "80% of the 15 potential misalignments trace back to 2 commitments.",
      }),
    ).toBeTruthy();
    const rows = screen.getAllByTestId("brief-commitment-row");
    // A short label is only a clause number, so the start of the text follows it.
    expect(within(rows[0]).getByText("6 Commitment B6 Verbatim text of commitment B6.")).toBeTruthy();
    expect(within(rows[0]).getByText("7")).toBeTruthy();
    expect(within(rows[0]).getByText(/mostly with Document C/)).toBeTruthy();
  });

  it("documents: orders pairs of documents by their share of potential misalignment", () => {
    wrap(<DocumentsSection data={DATA} />);
    expect(
      screen.getByRole("heading", {
        name: "Potential misalignment ranges from 0% to 25% across pairs of documents.",
      }),
    ).toBeTruthy();
    const rows = screen.getAllByTestId("brief-pair-row").map((r) => r.getAttribute("data-pair"));
    expect(rows).toEqual(["B~C", "A~B", "A~C"]);
  });

  it("areas: rates each policy area and marks the thin ones", () => {
    const thin = buildBriefData(SOURCE, scopeOf(SOURCE, ["B", "C"]), "globe");
    wrap(<AreasSection data={thin} lensName="Biodiversity" />);
    // With B and C only, both areas have 18 comparisons, under the floor of 30.
    expect(screen.getAllByText("too few comparisons")).toHaveLength(2);
    cleanup();
    wrap(<AreasSection data={DATA} lensName="Biodiversity" />);
    expect(
      screen.getByRole("heading", {
        name: "Agriculture shows the highest share of potential misalignment: 33%.",
      }),
    ).toBeTruthy();
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
