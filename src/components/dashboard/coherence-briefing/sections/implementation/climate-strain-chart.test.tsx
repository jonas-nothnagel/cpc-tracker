import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { ClimateStrainChart } from "./climate-strain-chart";
import { buildReviewGroups } from "./review-groups";
import { computeActionPlanAlignment } from "@/lib/implementation-coherence";
import type { AlignmentResult, BTRAction, BtrData, Target } from "@/types";

afterEach(cleanup);

const mit = (name: string, status: string, entity = "Ministry of Energy"): BTRAction => ({
  name, description: "", objectives: "", instrumentType: "", status, sector: "sector_energy", gasesAffected: "",
  startYear: "", implementingEntity: entity, reductionEstimates: {}, actionType: "mitigation",
});
const btr = (measures: BTRAction[]): BtrData => ({
  progressIndicators: [], mitigationMeasures: measures, sectorEmissions: { bySector: [] }, projections: [], technologySupport: [], capacityBuilding: [],
});
const target = (id: string, doc: string): Target => ({ id, text: `${id} full text`, sourceDocument: doc, sourceLabel: id.replace("_", " "), country: "T", isQuantitative: false, isTimeBound: false });
const flag = (a: string, b: string, manageability: "manageable" | "fundamental", why: string): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "flagged", description: why, manageability });

const policy = [target("NDC_1", "NDC"), target("NAP_1", "NAP"), target("NBSAP_1", "NBSAP")];
const measures = Array.from({ length: 6 }, (_, i) => mit(`Action ${i + 1}`, i === 0 ? "Ongoing" : "Planned", i === 0 ? "Ministry of Energy / Aimag Governors" : "Ministry of Energy"));
const pairs: AlignmentResult[] = [];
measures.forEach((_, i) => { for (let k = 0; k < 6 - i; k += 1) pairs.push(flag(`BTR_${i + 1}`, policy[k % 3].id, k === 0 ? "fundamental" : "manageable", `Rationale ${i + 1}.${k}`)); });
const summary = computeActionPlanAlignment(pairs, btr(measures), policy, 5, {});

function renderChart() {
  const group = buildReviewGroups({ summary, nr7Report: null, btrActions: 6 }).climate!;
  const onOpenActionPair = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ClimateStrainChart group={group} countryConfig={null} onOpenActionPair={onOpenActionPair} />
    </NextIntlClientProvider>,
  );
  return { group, onOpenActionPair };
}

describe("ClimateStrainChart", () => {
  it("draws five ranked bars with an accessible name, a two-word legend and a show-all", () => {
    renderChart();
    const bars = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(bars).toHaveLength(5);
    const first = within(bars[0]).getByRole("button");
    expect(first).toHaveAttribute("aria-label", "Action 1: 6 flagged pairs, 1 design-level");
    expect(first).toHaveAttribute("data-tour", "review-row");
    expect(within(bars[1]).getByRole("button")).not.toHaveAttribute("data-tour");
    // Longest bar spans the track; every bar carries its count as text.
    expect(bars[0].querySelector('[style*="width: 100%"]')).not.toBeNull();
    expect(within(bars[4]).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("design-level")).toBeInTheDocument();
    expect(screen.getByText("coordination-level")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all 6" })).toBeInTheDocument();
  });

  it("opens a bar to its commitments with the labelled AI rationale, the status word and the pair link", () => {
    const { onOpenActionPair } = renderChart();
    const first = within(screen.getAllByRole("listitem")[0]).getByRole("button");
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Ongoing")).toBeInTheDocument();
    expect(screen.getAllByText("Why it was flagged (AI-estimated)").length).toBeGreaterThan(0);
    expect(screen.getByText("Rationale 1.0")).toBeInTheDocument();
    expect(screen.getByText("Design-level")).toBeInTheDocument();
    expect(screen.getByText(/Named on this action/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Open the pair/ })[0]);
    expect(onOpenActionPair).toHaveBeenCalledWith("BTR_1", "NDC_1");
  });

  it("show all reveals every flagged action and show fewer folds them back", () => {
    renderChart();
    fireEvent.click(screen.getByRole("button", { name: "Show all 6" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("keeps the face factual: no suggestion or blame words", () => {
    renderChart();
    expect(document.body.textContent).not.toMatch(/\b(should|must|responsible|blame|ministry|contradict|tension)\b/i);
  });
});
