import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { ControlsStrip } from "./controls-strip";
import type { CategoryBudgetSummary } from "@/lib/coherence-budget";

afterEach(cleanup);

const L = en.explorer.controls;
const W = en.explorer.workbench;

function renderStrip(overrides: Partial<Parameters<typeof ControlsStrip>[0]> = {}) {
  const props = {
    view: "coherence" as const,
    groupMode: "document" as const,
    onGroupChange: vi.fn(),
    filter: "high_contra" as const,
    onFilter: vi.fn(),
    budgetSummary: null,
    budgetScale: "targets" as const,
    onBudgetScaleChange: vi.fn(),
    availableDocs: ["NDC", "NBSAP"],
    categoryLegend: [],
    hiddenDocs: new Set<string>(),
    onToggleDoc: vi.fn(),
    onPreviewGroup: vi.fn(),
    countryConfig: null,
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ControlsStrip {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const BUDGET = {
  period: { start: 2020, end: 2024 },
  totalBudget: 1,
  currency: "MNT",
  entries: [],
} as unknown as CategoryBudgetSummary;

describe("ControlsStrip", () => {
  it("offers the three base groupings as pressed/unpressed pills, plus GGA and human rights only when present", () => {
    const props = renderStrip();
    expect(screen.getByRole("button", { name: L.groupDocuments }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: L.groupGlobe }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: L.groupSectors })).toBeTruthy();
    expect(screen.queryByRole("button", { name: L.groupGga })).toBeNull();
    expect(screen.queryByRole("button", { name: L.groupHr })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: L.groupGlobe }));
    expect(props.onGroupChange).toHaveBeenCalledWith("globe");
    cleanup();
    renderStrip({ hasGga: true, hasHr: true });
    expect(screen.getByRole("button", { name: L.groupGga })).toBeTruthy();
    expect(screen.getByRole("button", { name: L.groupHr })).toBeTruthy();
  });

  it("cycles Show through strong+potential, potential only, strong only", () => {
    let props = renderStrip({ filter: "high_contra" });
    fireEvent.click(screen.getByRole("button", { name: L.filterHighContra }));
    expect(props.onFilter).toHaveBeenCalledWith("contradictions");
    cleanup();
    props = renderStrip({ filter: "contradictions" });
    fireEvent.click(screen.getByRole("button", { name: L.filterContradictions }));
    expect(props.onFilter).toHaveBeenCalledWith("high");
    cleanup();
    props = renderStrip({ filter: "high" });
    fireEvent.click(screen.getByRole("button", { name: L.filterHigh }));
    expect(props.onFilter).toHaveBeenCalledWith("high_contra");
  });

  it("lets a document row hide its document and trace it on hover", () => {
    const props = renderStrip();
    const row = screen.getByRole("button", { name: /NDC/ });
    fireEvent.mouseEnter(row);
    expect(props.onPreviewGroup).toHaveBeenCalledWith("NDC");
    fireEvent.mouseLeave(row);
    expect(props.onPreviewGroup).toHaveBeenLastCalledWith(null);
    fireEvent.click(row);
    expect(props.onToggleDoc).toHaveBeenCalledWith("NDC");
  });

  it("shows the hide-unclassified toggle only when the grouping has unplaced targets", () => {
    renderStrip();
    expect(screen.queryByRole("button", { pressed: false, name: /no clear/i })).toBeNull();
    cleanup();
    const onHide = vi.fn();
    renderStrip({
      groupMode: "hr",
      hasHr: true,
      canHideUnclassified: true,
      hideUnclassified: false,
      onHideUnclassifiedChange: onHide,
      unclassifiedCount: 348,
    });
    const toggle = screen.getByRole("button", { name: /348/ });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(onHide).toHaveBeenCalledWith(true);
  });

  it("in Finance shows the period and, on the GLOBE lens only, the arc-scale control", () => {
    renderStrip({ view: "finance", budgetSummary: BUDGET, groupMode: "document" });
    expect(screen.getByText(/2020/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: W.finance.scaleBySpend })).toBeNull();
    cleanup();
    const props = renderStrip({ view: "finance", budgetSummary: BUDGET, groupMode: "globe" });
    fireEvent.click(screen.getByRole("button", { name: W.finance.scaleBySpend }));
    expect(props.onBudgetScaleChange).toHaveBeenCalledWith("spend");
  });
});
