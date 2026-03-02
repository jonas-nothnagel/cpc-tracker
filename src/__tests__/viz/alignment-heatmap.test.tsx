import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlignmentHeatmap } from "@/components/viz/alignment-heatmap";
import { MOCK_TARGETS, MOCK_ALIGNMENT_DATA, MOCK_ALIGNMENT_ONLY } from "./test-fixtures";

const napTargets = MOCK_TARGETS.filter((t) => t.sourceDocument === "NAP");
const ndcTargets = MOCK_TARGETS.filter((t) => t.sourceDocument === "NDC");

describe("AlignmentHeatmap", () => {
  it("renders title and summary stats", () => {
    render(
      <AlignmentHeatmap
        title="NAP × NDC"
        alignmentData={MOCK_ALIGNMENT_DATA}
        rowTargets={napTargets}
        colTargets={ndcTargets}
        rowLabel="NAP ↓"
        colLabel="NDC →"
      />
    );
    expect(screen.getByText("NAP × NDC")).toBeInTheDocument();
  });

  it("renders legend with all relationship levels", () => {
    const { container } = render(
      <AlignmentHeatmap
        title="Test"
        alignmentData={MOCK_ALIGNMENT_DATA}
        rowTargets={napTargets}
        colTargets={ndcTargets}
        rowLabel="NAP ↓"
        colLabel="NDC →"
      />
    );
    expect(container.textContent).toContain("High contradiction");
    expect(container.textContent).toContain("Low tension");
    expect(container.textContent).toContain("No relationship");
  });

  it("shows contradiction count when contradictions exist", () => {
    const { container } = render(
      <AlignmentHeatmap
        title="Test"
        alignmentData={MOCK_ALIGNMENT_DATA}
        rowTargets={napTargets}
        colTargets={ndcTargets}
        rowLabel="NAP ↓"
        colLabel="NDC →"
      />
    );
    expect(container.textContent).toContain("contradiction");
  });

  it("renders row and column labels", () => {
    const { container } = render(
      <AlignmentHeatmap
        title="Test"
        alignmentData={[]}
        rowTargets={napTargets}
        colTargets={ndcTargets}
        rowLabel="NAP ↓"
        colLabel="NDC →"
      />
    );
    expect(container.textContent).toContain("NAP ↓");
    expect(container.textContent).toContain("NDC →");
    for (const t of napTargets) {
      expect(container.textContent).toContain(t.sourceLabel);
    }
    for (const t of ndcTargets) {
      expect(container.textContent).toContain(t.sourceLabel);
    }
  });
});
