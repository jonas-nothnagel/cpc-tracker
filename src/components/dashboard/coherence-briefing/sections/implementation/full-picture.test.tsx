import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { FullPicture, useNr7FullPicture } from "./full-picture";
import { buildNr7Report } from "../../nr7-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "../../nr7-report/test-fixture";
import type { ActionPlanAlignmentSummary, ImplementationCoverage } from "@/lib/implementation-coherence";

afterEach(cleanup);

const nr7Report = buildNr7Report(FIXTURE_NR7, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;
const coverage = {
  hasMeasureAlignment: true, reached: 3, total: 4, totalActions: 2, btrActions: 2, nr7Actions: 0,
  byDocument: [{ doc: "NDC", reached: 1, total: 2, flaggedTargets: 0, links: [{ targetId: "NDC_1", targetLabel: "NDC 1", targetText: "t", actionId: "BTR_1", actionName: "A", actionType: "mitigation", actionStatus: "Ongoing", actionUnderWay: true, rationale: "", institutionLabels: [], misalignments: [] }], uncovered: [{ targetId: "NDC_2", targetLabel: "NDC 2", targetText: "t", misalignments: [] }] }],
} as unknown as ImplementationCoverage;
const summary = { totalFlaggedPairs: 0 } as ActionPlanAlignmentSummary;

function Harness({ report = "nr7", withNr7 = true, onState }: { report?: "btr" | "nr7"; withNr7?: boolean; onState?: (s: ReturnType<typeof useNr7FullPicture>) => void }) {
  const state = useNr7FullPicture();
  onState?.(state);
  return (
    <FullPicture
      report={report}
      state={state}
      coverage={coverage}
      summary={summary}
      nr7Status={new Map()}
      nr7Report={withNr7 ? nr7Report : null}
      nr7PairTargets={new Map()}
      visibleTargetIds={new Set(FIXTURE_TARGETS.keys())}
      countryConfig={null}
      onOpenActionPair={vi.fn()}
      onOpenTarget={vi.fn()}
    />
  );
}

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);

describe("FullPicture", () => {
  it("folds the two NR7 sections closed under the biodiversity report, with counts in their summaries", () => {
    wrap(<Harness report="nr7" />);
    const details = [...document.querySelectorAll('[data-tour="full-picture"] > details')] as HTMLDetailsElement[];
    expect(details).toHaveLength(2);
    expect(details.every((d) => !d.open)).toBe(true);
    expect(screen.getByText("4 national targets, 2 rated on track")).toBeInTheDocument();
    expect(screen.getByText("4 of 5 with reported values")).toBeInTheDocument();
    expect(screen.queryByText("Coverage by document")).toBeNull();
  });

  it("folds only the coverage section under the climate report, legend and disclaimer inside", () => {
    wrap(<Harness report="btr" />);
    const details = [...document.querySelectorAll('[data-tour="full-picture"] > details')] as HTMLDetailsElement[];
    expect(details).toHaveLength(1);
    expect(details[0].open).toBe(false);
    expect(screen.getByText("3 of 4 targets have an aligned reported action")).toBeInTheDocument();
    expect(screen.queryByText("NR7 by national target")).toBeNull();
    // The dot-map keeps its legend and disclaimer inside the folded section.
    expect(screen.getByText("has an aligned reported action")).toBeInTheDocument();
    expect(screen.getByText(/AI-estimated and indicative/)).toBeInTheDocument();
  });

  it("focusTarget opens the NR7 targets section with that row expanded; focusIndicator opens and outlines the card", () => {
    let latest: ReturnType<typeof useNr7FullPicture> | undefined;
    wrap(<Harness onState={(s) => { latest = s; }} />);
    act(() => latest!.focusTarget("NT02"));
    expect((document.getElementById("full-picture-nr7-targets") as HTMLDetailsElement).open).toBe(true);
    expect(document.querySelector("#nr7-row-NT02 button")).toHaveAttribute("aria-expanded", "true");
    act(() => latest!.focusIndicator("A.3"));
    expect((document.getElementById("full-picture-nr7-indicators") as HTMLDetailsElement).open).toBe(true);
    expect(document.getElementById("nr7-ind-A.3")!.className).toContain("ring-1");
  });

  it("renders nothing for the biodiversity report without an NR7", () => {
    wrap(<Harness report="nr7" withNr7={false} />);
    expect(document.querySelectorAll('[data-tour="full-picture"] > details')).toHaveLength(0);
  });

  it("the hook toggles a target off again", () => {
    const { result } = renderHook(() => useNr7FullPicture());
    act(() => result.current.toggleTarget("NT01"));
    expect(result.current.expandedTargetId).toBe("NT01");
    act(() => result.current.toggleTarget("NT01"));
    expect(result.current.expandedTargetId).toBeNull();
  });
});
