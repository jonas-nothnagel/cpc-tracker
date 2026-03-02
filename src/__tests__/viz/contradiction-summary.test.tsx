import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContradictionSummary } from "@/components/viz/contradiction-summary";
import { MOCK_TARGETS, MOCK_ALIGNMENT_DATA, MOCK_ALIGNMENT_ONLY } from "./test-fixtures";

describe("ContradictionSummary", () => {
  it("renders nothing when no contradictions exist", () => {
    const { container } = render(
      <ContradictionSummary
        alignmentData={MOCK_ALIGNMENT_ONLY}
        targets={MOCK_TARGETS}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders section when contradictions exist", () => {
    render(
      <ContradictionSummary
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    expect(screen.getByText("Policy Contradictions")).toBeInTheDocument();
  });

  it("shows the correct count of contradictions", () => {
    const { container } = render(
      <ContradictionSummary
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    expect(container.textContent).toContain("2 potential contradictions detected");
  });

  it("shows contradiction type badges", () => {
    render(
      <ContradictionSummary
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    expect(screen.getAllByText("Resource competition").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Implementation tension").length).toBeGreaterThan(0);
  });

  it("sorts by severity (most severe first)", () => {
    render(
      <ContradictionSummary
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    const labels = screen.getAllByText(/^Moderate contradiction$|^Low tension$/);
    expect(labels[0].textContent).toBe("Moderate contradiction");
    expect(labels[1].textContent).toBe("Low tension");
  });

  it("shows target texts for contradictions", () => {
    const { container } = render(
      <ContradictionSummary
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    expect(container.textContent).toContain("Foster sustainable livestock management");
    expect(container.textContent).toContain("Reduce CO2 by 5.277 million tons by 2030");
  });

  it("shows descriptions for contradictions", () => {
    const { container } = render(
      <ContradictionSummary
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    expect(container.textContent).toContain("Competing demands on rangeland resources.");
  });

  it("renders filter dropdowns", () => {
    const { container } = render(
      <ContradictionSummary
        alignmentData={MOCK_ALIGNMENT_DATA}
        targets={MOCK_TARGETS}
      />
    );
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBe(2);
  });
});
