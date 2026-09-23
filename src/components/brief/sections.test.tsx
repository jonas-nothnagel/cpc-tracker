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
  it("overall: states the verdict and labels every group of dots with its share", () => {
    wrap(<OverallSection data={DATA} />);
    expect(screen.getByRole("heading", { name: "Coherence is mixed across Testland's policies." })).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();
    expect(screen.getByText("19%")).toBeTruthy();
    expect(screen.getByText("14%")).toBeTruthy();
    expect(screen.getByText("Each dot is one comparison between two commitments.")).toBeTruthy();
  });

  it("together: names the two documents that reinforce each other most", () => {
    wrap(<ThemeSectionView data={DATA} tone="reinforce" countryId="testland" />);
    expect(
      screen.getByRole("heading", {
        name: "Document A and Document C reinforce each other most often: 83% of their comparisons.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("No recurring theme was identified for this selection of documents.")).toBeTruthy();
    expect(screen.getByText("Verbatim text of commitment A1.")).toBeTruthy();
  });

  it("apart: names the two documents with the most potential misalignment", () => {
    wrap(<ThemeSectionView data={DATA} tone="apart" countryId="testland" />);
    expect(
      screen.getByRole("heading", {
        name: "Document B and Document C show the most potential misalignment: 25% of their comparisons.",
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
    expect(within(rows[0]).getByText("6 Commitment B6")).toBeTruthy();
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
    expect(screen.getByText("too few comparisons")).toBeTruthy();
    cleanup();
    wrap(<AreasSection data={DATA} lensName="Biodiversity" />);
    expect(
      screen.getByRole("heading", {
        name: "Agriculture shows the highest share of potential misalignment: 64%.",
      }),
    ).toBeTruthy();
  });
});
