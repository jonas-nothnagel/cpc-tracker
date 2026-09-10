import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { Nr7CrossChecks } from "./nr7-cross-checks";
import { buildReviewGroups } from "./review-groups";
import { buildNr7Report } from "../../nr7-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "../../nr7-report/test-fixture";

afterEach(cleanup);

const nr7Report = buildNr7Report(FIXTURE_NR7, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;

function renderRows(cap?: number) {
  const group = buildReviewGroups({ summary: null, nr7Report, btrActions: 0, cap }).biodiversity!;
  const spies = { onOpenActionPair: vi.fn(), onOpenTarget: vi.fn(), onFocusNr7Target: vi.fn(), onFocusNr7Indicator: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Nr7CrossChecks
        group={group}
        model={nr7Report}
        nr7PairTargets={new Map([["NT02", { actionId: "NR7_9", nbsapId: "NBSAP_2" }]])}
        visibleTargetIds={new Set(FIXTURE_TARGETS.keys())}
        {...spies}
      />
    </NextIntlClientProvider>,
  );
  return { group, ...spies };
}

const rowButton = (i: number) => within(screen.getAllByRole("listitem")[i]).getAllByRole("button")[0];

describe("Nr7CrossChecks", () => {
  it("shows the eligible cross-checks first: target number, rating word and the evidence label per kind", () => {
    const { group } = renderRows();
    expect(group.items.map((i) => i.signal.rule)).toEqual([
      "ratingVsAnswers", "unknownWithData", "flatWhileOnTrack", "reachWhileNoChange", "sharedIndicatorDeclining",
    ]);
    // Four eligible rows first; the held-back shared decline waits behind "Show all".
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Show all 5" }));
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rowButton(0)).toHaveAttribute("data-tour", "review-row");
    expect(rowButton(0).getAttribute("aria-label")).toMatch(/^1 · .*: rated On track; 2 of 3 building blocks not yet in place$/);
    expect(within(rows[0]).getByText("On track")).toBeInTheDocument();
    expect(within(rows[0]).getByText("2 of 3 building blocks not yet in place")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Unknown")).toBeInTheDocument();
    expect(within(rows[1]).getByText("2 figures reported, no rating")).toBeInTheDocument();
    expect(within(rows[2]).getByText("figure unchanged since 2020")).toBeInTheDocument();
    expect(within(rows[2]).getByRole("img", { name: "unchanged" })).toBeInTheDocument();
    expect(within(rows[3]).getByText("No progress")).toBeInTheDocument();
    expect(within(rows[3]).getByText("linked to 3 policy targets")).toBeInTheDocument();
    // The held-back shared decline sits last, labelled by how many targets share it.
    expect(within(rows[4]).getByText("4 national targets")).toBeInTheDocument();
    expect(within(rows[4]).getByText("0.965 to 0.953 index")).toBeInTheDocument();
  });

  it("caps at the top five and reveals the rest on show all", () => {
    renderRows(3);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Show all 5" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("opens a rating-versus-answers row to the answers not in place and the target links", () => {
    const { onFocusNr7Target, onOpenTarget } = renderRows();
    fireEvent.click(rowButton(0));
    expect(rowButton(0)).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Answers not yet in place (2 of 3)")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /See the national target/ }));
    expect(onFocusNr7Target).toHaveBeenCalledWith("NT01");
    fireEvent.click(screen.getByRole("button", { name: /Open NBSAP target 1/ }));
    expect(onOpenTarget).toHaveBeenCalledWith("NBSAP_1");
  });

  it("opens an indicator row to its card, and a shared-indicator row to the indicator link", () => {
    const { onFocusNr7Indicator } = renderRows();
    fireEvent.click(rowButton(2));
    expect(screen.getByText(/Indicator values and the narrative may use different dates/)).toBeInTheDocument();
    fireEvent.click(rowButton(2));
    fireEvent.click(screen.getByRole("button", { name: "Show all 5" }));
    fireEvent.click(rowButton(4));
    fireEvent.click(screen.getByRole("button", { name: /See the indicator/ }));
    expect(onFocusNr7Indicator).toHaveBeenCalledWith("A.3");
  });

  it("keeps the face factual: no suggestion or blame words", () => {
    renderRows();
    expect(document.body.textContent).not.toMatch(/\b(should|must|responsible|blame|ministry|contradict|tension)\b/i);
  });
});
