import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { FullPicture, useNr7FullPicture } from "./full-picture";
import { buildReviewGroups } from "./review-groups";
import { buildNr7Report } from "../../nr7-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS, RECURRING_NR7, RECURRING_PAIRS } from "../../nr7-report/test-fixture";
import { rankPolicyLinkCandidates } from "./review-groups";
import type { ActionPlanAlignmentSummary, ImplementationCoverage } from "@/lib/implementation-coherence";

afterEach(cleanup);

const nr7Report = buildNr7Report(FIXTURE_NR7, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;
const coverage = {
  hasMeasureAlignment: true, reached: 3, total: 4, totalActions: 2, btrActions: 2, nr7Actions: 0,
  byDocument: [{ doc: "NDC", reached: 1, total: 2, flaggedTargets: 0, links: [{ targetId: "NDC_1", targetLabel: "NDC 1", targetText: "t", actionId: "BTR_1", actionName: "A", actionType: "mitigation", actionStatus: "Ongoing", actionUnderWay: true, rationale: "", institutionLabels: [], misalignments: [] }], uncovered: [{ targetId: "NDC_2", targetLabel: "NDC 2", targetText: "t", misalignments: [] }] }],
} as unknown as ImplementationCoverage;
const summary = { totalFlaggedPairs: 0 } as ActionPlanAlignmentSummary;

const crossChecks = buildReviewGroups({ summary: null, nr7Report, btrActions: 0 }).biodiversity!;

const recurring = rankPolicyLinkCandidates(buildNr7Report(RECURRING_NR7, RECURRING_PAIRS, FIXTURE_TARGETS)!)!.recurring!;

function Harness({ report = "nr7", withNr7 = true, folded = false, withRecurring = false, onState, onOpenRowDetail, onSelectRow }: { report?: "btr" | "nr7"; withNr7?: boolean; folded?: boolean; withRecurring?: boolean; onState?: (s: ReturnType<typeof useNr7FullPicture>) => void; onOpenRowDetail?: (targetId: string) => void; onSelectRow?: (targetId: string) => void }) {
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
      crossChecks={folded ? crossChecks : null}
      recurring={withRecurring ? recurring : null}
      visibleTargetIds={new Set(FIXTURE_TARGETS.keys())}
      countryConfig={null}
      onOpenActionPair={vi.fn()}
      onOpenTarget={vi.fn()}
      onOpenRowDetail={onOpenRowDetail}
      onSelectRow={onSelectRow}
    />
  );
}

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);

describe("FullPicture", () => {
  it("folds the indicators closed under the biodiversity report, with the count in the summary; the national targets are the rows above, not a second list", () => {
    wrap(<Harness report="nr7" />);
    const details = [...document.querySelectorAll('[data-tour="full-picture"] > details')] as HTMLDetailsElement[];
    expect(details).toHaveLength(1);
    expect(details.every((d) => !d.open)).toBe(true);
    expect(screen.getByText("4 of 5 with reported values")).toBeInTheDocument();
    expect(screen.queryByText(/NR7 by national target/)).toBeNull();
    expect(screen.queryByText("Coverage by document")).toBeNull();
  });

  it("folds the cross-checks first when the policy-link rows lead the slide, without tour anchors", () => {
    wrap(<Harness report="nr7" folded />);
    const details = [...document.querySelectorAll('[data-tour="full-picture"] > details')] as HTMLDetailsElement[];
    expect(details).toHaveLength(2);
    expect(details[0].id).toBe("full-picture-nr7-cross-checks");
    expect(screen.getByText("Ratings that do not match their own evidence")).toBeInTheDocument();
    expect(screen.getByText("5 places, no AI involved")).toBeInTheDocument();
    expect(within(details[0]).getAllByRole("listitem")).toHaveLength(4);
    expect(details[0].querySelector('[data-tour="review-visual"], [data-tour="review-row"]')).toBeNull();
  });

  it("folds the pairs that repeat first, closed, with the count in the summary; a target's name asks the rows to open it", () => {
    const onSelectRow = vi.fn();
    let latest: ReturnType<typeof useNr7FullPicture> | undefined;
    wrap(<Harness folded withRecurring onSelectRow={onSelectRow} onState={(s) => { latest = s; }} />);
    const details = [...document.querySelectorAll('[data-tour="full-picture"] > details')] as HTMLDetailsElement[];
    expect(details.map((d) => d.id)).toEqual(["full-picture-nr7-recurring", "full-picture-nr7-cross-checks", "full-picture-nr7-indicators"]);
    expect(details[0].open).toBe(false);
    expect(screen.getByText("Pairs that repeat across targets")).toBeInTheDocument();
    expect(screen.getByText("2 targets in other plans, each flagged on two or more national targets")).toBeInTheDocument();
    act(() => latest!.setRecurringOpen(true));
    fireEvent.click(within(details[0]).getByRole("button", { name: "National target 4: rated No progress" }));
    expect(onSelectRow).toHaveBeenCalledWith("NT04");
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

  it("focusIndicator opens the indicators section and outlines the card; a target chip on a card asks the rows to open that target", () => {
    let latest: ReturnType<typeof useNr7FullPicture> | undefined;
    const onOpenRowDetail = vi.fn();
    wrap(<Harness onState={(s) => { latest = s; }} onOpenRowDetail={onOpenRowDetail} />);
    act(() => latest!.focusIndicator("A.3"));
    expect((document.getElementById("full-picture-nr7-indicators") as HTMLDetailsElement).open).toBe(true);
    expect(document.getElementById("nr7-ind-A.3")!.className).toContain("ring-1");
    fireEvent.click(within(document.getElementById("nr7-ind-A.3")!).getByRole("button", { name: "Open national target 2" }));
    expect(onOpenRowDetail).toHaveBeenCalledWith("NT02");
  });

  it("without rows on the slide the target chips on indicator cards are text, and the folded cross-checks offer no row link", () => {
    let latest: ReturnType<typeof useNr7FullPicture> | undefined;
    wrap(<Harness folded onState={(s) => { latest = s; }} />);
    act(() => latest!.focusIndicator("A.3"));
    expect(within(document.getElementById("nr7-ind-A.3")!).queryByRole("button", { name: "Open national target 2" })).toBeNull();
    act(() => latest!.setCrossChecksOpen(true));
    fireEvent.click(within(document.getElementById("full-picture-nr7-cross-checks")!).getAllByRole("button")[0]);
    expect(screen.queryByRole("button", { name: /See the national target/ })).toBeNull();
  });

  it("renders nothing for the biodiversity report without an NR7", () => {
    wrap(<Harness report="nr7" withNr7={false} />);
    expect(document.querySelectorAll('[data-tour="full-picture"] > details')).toHaveLength(0);
  });

  it("the hook carries a row request until the rows hand it back", () => {
    const { result } = renderHook(() => useNr7FullPicture());
    act(() => result.current.requestRow("NT01", true));
    expect(result.current.rowRequest).toEqual({ targetId: "NT01", detail: true });
    act(() => result.current.clearRowRequest());
    expect(result.current.rowRequest).toBeNull();
  });
});
