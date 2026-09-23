import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { CoherenceCanvasProps } from "./types";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

import { CoherenceCanvas } from "./coherence-canvas";

afterEach(cleanup);

const PROPS: CoherenceCanvasProps = {
  countryId: "mongolia",
  docs: [
    { id: "NDC", label: "NDC", full: "Nationally Determined Contribution", color: "#0468b1", targetCount: 24 },
    { id: "NBSAP", label: "NBSAP", full: "Biodiversity Strategy", color: "#0d9488", targetCount: 21 },
    { id: "FSS", label: "FSS", full: "Food Supply and Security Measures", color: "#b45309", targetCount: 40 },
  ],
  edges: [
    {
      key: "NDC~NBSAP",
      a: "NDC",
      b: "NBSAP",
      compared: 120,
      flagged: 2,
      alignedShare: 0.9,
      rel: 0.3,
      inflamed: false,
      pathwayLine: "2 potential misalignments in 120 compared pairs (2%)",
      moreLine: "",
      strands: [],
    },
    {
      key: "FSS~NDC",
      a: "FSS",
      b: "NDC",
      compared: 200,
      flagged: 40,
      alignedShare: 0.7,
      rel: 2.4,
      inflamed: true,
      pathwayLine: "40 potential misalignments in 200 compared pairs (20%)",
      moreLine: "and 38 more, ranked",
      strands: [
        {
          pairKey: "FSS_18__NDC_22",
          rowTitle: "3.4 Fodder production ↔ Livestock mitigation",
          signals: "High confidence · Design-level · Competing for resources",
          claim: "Possible competition for land between Food Supply and Security Measures and Nationally Determined Contribution",
          aTag: "FSS · 3.4 Fodder production",
          aText: "Provide organisational and financial support to increase fodder cultivation.",
          bTag: "NDC · Livestock mitigation",
          bText: "Reduce agricultural CO2 while keeping the herd within carrying capacity.",
          mechanismSentence: "The goals are compatible but compete for the same limited resource.",
          rationale: "Both targets operate in the livestock sector and compete over a finite envelope.",
        },
        {
          pairKey: "FSS_1__NDC_2",
          rowTitle: "3.1 New cropland ↔ Ecosystems",
          signals: "Medium confidence · Competing for resources",
          claim: "Possible competition for land between Food Supply and Security Measures and Nationally Determined Contribution",
          aTag: "FSS · 3.1 New cropland",
          aText: "Convert reclaimed land into agricultural land.",
          bTag: "NDC · Ecosystems",
          bText: "Protect and regenerate vulnerable ecosystems.",
          rationale: "Land conversion competes with regeneration in the same landscapes.",
        },
      ],
    },
  ],
  strings: {
    back: "Back to all documents",
    topStrands: "Strongest signals first",
    showRationale: "Show the AI rationale",
    hideRationale: "Hide the AI rationale",
    aiDisclaimer: "AI-generated assessment of this pair.",
    openPage: "Open as a page",
    targetsWord: "targets",
    clickHint: "Select a red fiber to follow it",
    legendTissue: "Green lines: aligned share.",
    legendNerve: "Red fibers: above-average potential misalignment.",
  },
};

function renderCanvas() {
  return render(<CoherenceCanvas {...PROPS} />);
}

describe("CoherenceCanvas", () => {
  it("draws one page per document and fibers only for inflamed pathways", () => {
    renderCanvas();
    expect(screen.getAllByTestId("pulse-doc")).toHaveLength(3);
    expect(screen.getAllByTestId("pulse-nerve")).toHaveLength(1);
  });

  it("opens a pathway with its ranked strands on fiber click", () => {
    renderCanvas();
    fireEvent.click(screen.getByTestId("pulse-nerve-hit-FSS~NDC"));
    expect(screen.getByText("3.4 Fodder production ↔ Livestock mitigation")).toBeTruthy();
    expect(screen.getByText("and 38 more, ranked")).toBeTruthy();
    expect(screen.getByText("Back to all documents")).toBeTruthy();
  });

  it("opens one strand at a time with verbatim texts and a rationale disclosure", () => {
    renderCanvas();
    fireEvent.click(screen.getByTestId("pulse-nerve-hit-FSS~NDC"));
    fireEvent.click(screen.getByText("3.4 Fodder production ↔ Livestock mitigation"));
    expect(
      screen.getByText(
        "Provide organisational and financial support to increase fodder cultivation.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/finite envelope/)).toBeNull();
    fireEvent.click(screen.getByText("Show the AI rationale"));
    expect(screen.getByText(/finite envelope/)).toBeTruthy();
  });

  it("returns to the overview from a pathway", () => {
    renderCanvas();
    fireEvent.click(screen.getByTestId("pulse-nerve-hit-FSS~NDC"));
    fireEvent.click(screen.getByText("Back to all documents"));
    expect(screen.queryByText("3.4 Fodder production ↔ Livestock mitigation")).toBeNull();
  });
});
