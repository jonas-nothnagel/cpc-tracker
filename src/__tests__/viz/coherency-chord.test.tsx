import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoherencyChord } from "@/components/viz/coherency-chord";
import { MOCK_TARGETS, MOCK_ALIGNMENT_DATA } from "./test-fixtures";

describe("CoherencyChord", () => {
  it("renders the overview title", () => {
    render(
      <CoherencyChord
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    expect(screen.getByText("Document Coherency Overview")).toBeInTheDocument();
  });

  it("shows relationship counts in description", () => {
    const { container } = render(
      <CoherencyChord
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    expect(container.textContent).toContain("target pairs show relationships");
  });

  it("shows contradiction count when present", () => {
    const { container } = render(
      <CoherencyChord
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    expect(container.textContent).toContain("contradiction");
  });

  it("renders table with Conflicts column header", () => {
    const { container } = render(
      <CoherencyChord
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    const table = container.querySelector("table");
    expect(table).toBeInTheDocument();
    expect(table?.textContent).toContain("Conflicts");
    expect(table?.textContent).toContain("Coherency");
    expect(table?.textContent).toContain("Coverage");
    expect(table?.textContent).toContain("Aligned");
  });

  it("renders SVG chord diagram", () => {
    const { container } = render(
      <CoherencyChord
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("shows minimum documents message when less than 2 doc types", () => {
    const singleDocTargets = MOCK_TARGETS.filter((t) => t.sourceDocument === "NAP");
    render(
      <CoherencyChord
        alignmentData={[]}
        targets={singleDocTargets}
      />
    );
    expect(screen.getByText(/At least two document types/)).toBeInTheDocument();
  });

  it("renders document type labels in legend", () => {
    const { container } = render(
      <CoherencyChord
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    expect(container.textContent).toContain("NDC");
    expect(container.textContent).toContain("NAP");
    expect(container.textContent).toContain("NBT");
  });
});
