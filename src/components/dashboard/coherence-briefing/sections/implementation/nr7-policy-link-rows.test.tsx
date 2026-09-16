import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { Nr7PolicyLinkRows } from "./nr7-policy-link-rows";
import { rankPolicyLinkCandidates } from "./review-groups";
import { buildNr7Report } from "../../nr7-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "../../nr7-report/test-fixture";
import type { AlignmentResult, Nr7Data, Target } from "@/types";

afterEach(cleanup);

// NT01 and NT02 rated behind schedule beside NT04: three linked candidates.
const behind: Nr7Data = {
  ...FIXTURE_NR7,
  progressItems: FIXTURE_NR7.progressItems.map((i) => (i.targetId === "NT01" || i.targetId === "NT02" ? { ...i, progressStatus: "limited" as const } : i)),
};
const flag = (a: string, b: string): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "flagged", description: "why", mechanism: "delivery_friction", manageability: "manageable" });
const flagged = flag("NBSAP_4", "NDC_1");

function renderRows(alignment: AlignmentResult[] = FIXTURE_ALIGNMENT, cap?: number, targets: Map<string, Target> = FIXTURE_TARGETS) {
  const group = rankPolicyLinkCandidates(buildNr7Report(behind, alignment, targets)!, cap)!;
  const spies = { onOpenTarget: vi.fn(), onFocusNr7Target: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Nr7PolicyLinkRows group={group} countryConfig={null} visibleTargetIds={new Set(targets.keys())} {...spies} />
    </NextIntlClientProvider>,
  );
  return { group, ...spies };
}

// Top-level rows only: an open row's flagged list adds nested list items.
const rows = () => [...document.querySelectorAll('[data-testid="policy-link-rows"] > ol > li')] as HTMLElement[];
const rowButton = (i: number) => within(rows()[i]).getAllByRole("button")[0];

describe("Nr7PolicyLinkRows", () => {
  it("shows every target on one line: number and text, the rating word and the potential misalignments in words, behind schedule first", () => {
    renderRows();
    expect(rows()).toHaveLength(4);
    expect(rowButton(0)).toHaveAttribute("data-tour", "review-row");
    expect(rowButton(0).getAttribute("aria-label")).toBe("1 · By 2030, mainstream biodiversity into all…: rated Limited progress; no potential misalignments");
    expect(within(rows()[0]).getByText("Limited progress")).toBeInTheDocument();
    expect(within(rows()[0]).getByTestId("policy-link-flagged-face")).toHaveTextContent("no potential misalignments");
    expect(within(rows()[0]).queryByTestId("policy-link-flagged-mark")).toBeNull();
    // No aligned count, no bar and no GBF chip on the face.
    expect(within(rows()[0]).queryByText(/aligned with/)).toBeNull();
    expect(rows()[0].querySelector("[style*='width']")).toBeNull();
    expect(within(rows()[0]).queryByText("GBF T14")).toBeNull();
    expect(within(rows()[1]).getByText("No progress")).toBeInTheDocument();
    // The one target not rated behind schedule comes last, under a caption.
    expect(screen.getAllByTestId("policy-link-rest-heading")).toHaveLength(1);
    expect(within(rows()[3]).getByTestId("policy-link-rest-heading")).toHaveTextContent("Rated on track, or unknown");
    expect(within(rows()[3]).getByText("Unknown")).toBeInTheDocument();
    expect(document.querySelector('[data-tour="review-visual"]')).not.toBeNull();
    // Four rows fit under the cap of five: nothing to unfold.
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show fewer" })).toBeNull();
  });

  it("opens a target without links to the report's words, the no-links line and the links onward only", () => {
    const { onFocusNr7Target } = renderRows();
    fireEvent.click(rowButton(3));
    const row = rows()[3];
    expect(rowButton(3)).toHaveAttribute("aria-expanded", "true");
    expect(within(row).getByText("The report gives no key-challenges text for this target.")).toBeInTheDocument();
    expect(within(row).getByTestId("policy-link-reach")).toHaveTextContent("No target in the other documents was judged strongly aligned with it (AI-estimated).");
    expect(within(row).queryByTestId("policy-link-review")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "See the national target" }));
    expect(onFocusNr7Target).toHaveBeenCalledWith("NT03");
  });

  it("opens a row to the GBF chip, the report's own words, one line for the aligned count, and the links onward", () => {
    const { onOpenTarget, onFocusNr7Target } = renderRows();
    fireEvent.click(rowButton(0));
    const row = rows()[0];
    expect(rowButton(0)).toHaveAttribute("aria-expanded", "true");
    expect(within(row).getByTitle(/GBF\) target 14:/)).toHaveTextContent("GBF T14");
    // NT01 has no key-challenges text; the progress summary stands in, labelled as the report's words.
    expect(within(row).getByText("What the report says holds it back (the report's words, verbatim)")).toBeInTheDocument();
    expect(within(row).getByText(/Mainstreaming has advanced through the planning law/)).toBeInTheDocument();
    expect(within(row).getByTestId("policy-link-reach")).toHaveTextContent("Aligned strongly with 3 targets in 2 other documents (AI-estimated); the column beside lists them.");
    // The per-document counts and the aligned counterparts live in the column, not here.
    expect(within(row).queryByText(/by document/i)).toBeNull();
    expect(within(row).queryByRole("button", { name: "NDC · NDC_1" })).toBeNull();
    // No flagged links on this target: no review block.
    expect(within(row).queryByTestId("policy-link-review")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "See the national target" }));
    expect(onFocusNr7Target).toHaveBeenCalledWith("NT01");
    fireEvent.click(within(row).getByRole("button", { name: "Open NBSAP target 1" }));
    expect(onOpenTarget).toHaveBeenCalledWith("NBSAP_1");
    // Opening another row closes this one.
    fireEvent.click(rowButton(1));
    expect(rowButton(0)).toHaveAttribute("aria-expanded", "false");
    expect(rowButton(1)).toHaveAttribute("aria-expanded", "true");
  });

  it("names the potential misalignments and their document on the face, as a mark and words, never a bar", () => {
    renderRows([...FIXTURE_ALIGNMENT, flagged]);
    // The flagged link lifts NT04 to the top, and shows on the closed row: a fixed mark and the count with its document.
    expect(rowButton(0).getAttribute("aria-label")).toBe("4 · By 2030, reduce pollution.: rated No progress; 1 potential misalignment, with the NDC");
    const face = within(rows()[0]).getByTestId("policy-link-flagged-face");
    expect(face).toHaveTextContent("1 potential misalignment, with the NDC");
    expect(within(face).getByTestId("policy-link-flagged-mark")).toBeInTheDocument();
    expect(face.querySelector("[style*='width']")).toBeNull();
    fireEvent.click(rowButton(0));
    const row = rows()[0];
    // The report's own reason leads, then the aligned count, then the flagged pairs.
    const at = (text: string) => row.textContent!.indexOf(text);
    expect(at("What the report says holds it back")).toBeLessThan(at("Aligned strongly with 3 targets"));
    expect(at("Aligned strongly with 3 targets")).toBeLessThan(at("Flagged as potential misalignments (AI-estimated)"));
    const review = within(row).getByTestId("policy-link-review");
    expect(within(review).getByText("1 potential misalignment, with the NDC")).toBeInTheDocument();
    expect(review.querySelector('[data-review="true"]')).not.toBeNull();
    expect(review).toHaveTextContent("NDC · NDC_1");
    expect(within(row).getByText("Monitoring stations cover only the capital.")).toBeInTheDocument();
    expect(within(row).getByTitle(/GBF\) target 11:/)).toHaveTextContent("GBF T11");
  });

  it("says \"mostly with\" when the flagged pairs come from more than one document", () => {
    renderRows([...FIXTURE_ALIGNMENT, flagged, { ...flagged, targetBId: "NDC_2" }, { ...flagged, targetBId: "NAP_1" }]);
    expect(within(rows()[0]).getByTestId("policy-link-flagged-face")).toHaveTextContent("3 potential misalignments, mostly with the NDC");
  });

  it("hands the open row to the host when the host owns it", () => {
    const group = rankPolicyLinkCandidates(buildNr7Report(behind, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!)!;
    const onSelect = vi.fn();
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7PolicyLinkRows group={group} countryConfig={null} visibleTargetIds={new Set()} onOpenTarget={vi.fn()} onFocusNr7Target={vi.fn()} selectedId={null} onSelect={onSelect} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(rowButton(1));
    expect(onSelect).toHaveBeenCalledWith("NT04");
    // Controlled: nothing opens until the host passes the id back.
    expect(rowButton(1)).toHaveAttribute("aria-expanded", "false");
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7PolicyLinkRows group={group} countryConfig={null} visibleTargetIds={new Set()} onOpenTarget={vi.fn()} onFocusNr7Target={vi.fn()} selectedId="NT04" onSelect={onSelect} />
      </NextIntlClientProvider>,
    );
    expect(rowButton(1)).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(rowButton(1));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("unfolds the flagged pairs past the first three on \"+ N more\"", () => {
    const targets = new Map(FIXTURE_TARGETS);
    targets.set("NAP_2", { id: "NAP_2", text: "NAP_2 text", sourceDocument: "NAP", sourceLabel: "NAP_2", country: "Testland", isQuantitative: false, isTimeBound: false });
    renderRows([...FIXTURE_ALIGNMENT, flagged, flag("NBSAP_4", "NDC_2"), flag("NBSAP_4", "NAP_1"), flag("NBSAP_4", "NAP_2")], undefined, targets);
    fireEvent.click(rowButton(0));
    const review = within(rows()[0]).getByTestId("policy-link-review");
    // NDC leads (two pairs), NAP follows; the fourth entry is NAP_2.
    expect(within(review).queryByRole("button", { name: "NAP · NAP_2" })).toBeNull();
    fireEvent.click(within(review).getByRole("button", { name: "+ 1 more" }));
    expect(within(review).getByRole("button", { name: "NAP · NAP_2" })).toBeInTheDocument();
    fireEvent.click(within(review).getByRole("button", { name: "Show fewer" }));
    expect(within(review).queryByRole("button", { name: "NAP · NAP_2" })).toBeNull();
  });

  it("folds the rest behind Show all, folds back, and never claims a suggestion on the face", () => {
    renderRows(FIXTURE_ALIGNMENT, 3);
    expect(rows()).toHaveLength(3);
    expect(screen.queryByTestId("policy-link-rest-heading")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all 4" }));
    expect(rows()).toHaveLength(4);
    expect(screen.getByTestId("policy-link-rest-heading")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(rows()).toHaveLength(3);
    expect(document.body.textContent).not.toMatch(/\b(should|must|responsible|blame|ministry|contradict|tension)\b/i);
  });
});
