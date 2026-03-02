import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardStats } from "@/components/viz/dashboard-stats";
import { MOCK_TARGETS } from "./test-fixtures";

describe("DashboardStats", () => {
  it("renders total targets count", () => {
    render(
      <DashboardStats
        targets={MOCK_TARGETS}
        alignmentCount={10}
        contradictionCount={2}
      />
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders alignment count", () => {
    const { container } = render(
      <DashboardStats
        targets={MOCK_TARGETS}
        alignmentCount={10}
        contradictionCount={0}
      />
    );
    expect(container.textContent).toContain("Alignment Opportunities");
  });

  it("renders contradiction card when count > 0", () => {
    const { container } = render(
      <DashboardStats
        targets={MOCK_TARGETS}
        alignmentCount={10}
        contradictionCount={3}
      />
    );
    expect(container.textContent).toContain("Contradictions Found");
  });

  it("does not render contradiction card when count is 0", () => {
    const { container } = render(
      <DashboardStats
        targets={MOCK_TARGETS}
        alignmentCount={10}
        contradictionCount={0}
      />
    );
    // Count occurrences of the text
    const matches = container.textContent?.match(/Contradictions Found/g);
    expect(matches).toBeNull();
  });

  it("renders per-document type cards", () => {
    const { container } = render(
      <DashboardStats
        targets={MOCK_TARGETS}
        alignmentCount={5}
        contradictionCount={0}
      />
    );
    expect(container.textContent).toContain("National Adaptation Plan Targets");
    expect(container.textContent).toContain("Nationally Determined Contributions");
    expect(container.textContent).toContain("National Biodiversity Targets");
  });
});
