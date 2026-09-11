import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { Nr7PolicyLinkRows } from "./nr7-policy-link-rows";
import { rankPolicyLinkCandidates } from "./review-groups";
import { buildNr7Report } from "../../nr7-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "../../nr7-report/test-fixture";
import type { AlignmentResult, Nr7Data } from "@/types";

afterEach(cleanup);

// NT01 and NT02 rated behind schedule beside NT04: three linked candidates.
const behind: Nr7Data = {
  ...FIXTURE_NR7,
  progressItems: FIXTURE_NR7.progressItems.map((i) => (i.targetId === "NT01" || i.targetId === "NT02" ? { ...i, progressStatus: "limited" as const } : i)),
};
const flagged: AlignmentResult = { targetAId: "NBSAP_4", targetBId: "NDC_1", alignment: "flagged", description: "why", mechanism: "delivery_friction", manageability: "manageable" };

function renderRows(alignment: AlignmentResult[] = FIXTURE_ALIGNMENT, cap?: number) {
  const group = rankPolicyLinkCandidates(buildNr7Report(behind, alignment, FIXTURE_TARGETS)!, cap)!;
  const spies = { onOpenTarget: vi.fn(), onFocusNr7Target: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Nr7PolicyLinkRows group={group} countryConfig={null} visibleTargetIds={new Set(FIXTURE_TARGETS.keys())} {...spies} />
    </NextIntlClientProvider>,
  );
  return { group, ...spies };
}

// Top-level rows only: an open row's counterpart list adds nested list items.
const rows = () => [...document.querySelectorAll('[data-testid="policy-link-rows"] > ol > li')] as HTMLElement[];
const rowButton = (i: number) => within(rows()[i]).getAllByRole("button")[0];

describe("Nr7PolicyLinkRows", () => {
  it("shows the ranked targets: number and text, the GBF chip, the rating word and the link count", () => {
    renderRows();
    expect(rows()).toHaveLength(3);
    expect(rowButton(0)).toHaveAttribute("data-tour", "review-row");
    expect(rowButton(0).getAttribute("aria-label")).toBe("1 · By 2030, mainstream biodiversity into all…: rated Limited progress; aligned with 3 targets in 2 documents");
    expect(within(rows()[0]).getByText("Limited progress")).toBeInTheDocument();
    expect(within(rows()[0]).getByText("aligned with 3 targets in 2 documents")).toBeInTheDocument();
    expect(within(rows()[0]).getByTitle("Global Biodiversity Framework (GBF) target 14: The multiple values of biodiversity are integrated into decision-making at all levels")).toHaveTextContent("GBF T14");
    expect(within(rows()[1]).getByText("No progress")).toBeInTheDocument();
    expect(within(rows()[2]).getByText("aligned with 1 target in 1 document")).toBeInTheDocument();
    expect(document.querySelector('[data-tour="review-visual"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("opens a row to the documents, the counterparts, the report's own words and the links onward", () => {
    const { onOpenTarget, onFocusNr7Target } = renderRows();
    fireEvent.click(rowButton(0));
    const row = rows()[0];
    expect(rowButton(0)).toHaveAttribute("aria-expanded", "true");
    expect(within(row).getByText("Aligned targets by document (AI-estimated)")).toBeInTheDocument();
    expect(within(row).getByText("NDC").parentElement).toHaveTextContent("NDC 2");
    expect(within(row).getByText("NAP").parentElement).toHaveTextContent("NAP 1");
    expect(within(row).getByText("Most aligned targets in other documents (AI-estimated)")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "NDC · NDC_1" }));
    expect(onOpenTarget).toHaveBeenCalledWith("NDC_1");
    // No flagged links on this target: no misalignment line.
    expect(within(row).queryByText(/potential misalignment/)).toBeNull();
    // NT01 has no key-challenges text; the progress summary stands in, labelled as the report's words.
    expect(within(row).getByText("What the report says holds it back (the report's words, verbatim)")).toBeInTheDocument();
    expect(within(row).getByText(/Mainstreaming has advanced through the planning law/)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "See the national target" }));
    expect(onFocusNr7Target).toHaveBeenCalledWith("NT01");
    fireEvent.click(within(row).getByRole("button", { name: "Open NBSAP target 1" }));
    expect(onOpenTarget).toHaveBeenCalledWith("NBSAP_1");
    // Opening another row closes this one.
    fireEvent.click(rowButton(1));
    expect(rowButton(0)).toHaveAttribute("aria-expanded", "false");
    expect(rowButton(1)).toHaveAttribute("aria-expanded", "true");
  });

  it("names the potential misalignments and their main document, and the key challenges when the report gives them", () => {
    renderRows([...FIXTURE_ALIGNMENT, flagged]);
    // The flagged link lifts NT04 to the top.
    expect(rowButton(0).getAttribute("aria-label")).toMatch(/^4 · /);
    fireEvent.click(rowButton(0));
    const row = rows()[0];
    expect(within(row).getByText("1 potential misalignment, mostly with the NDC")).toBeInTheDocument();
    expect(within(row).getByText("Monitoring stations cover only the capital.")).toBeInTheDocument();
    expect(within(row).getByTitle(/GBF\) target 11:/)).toHaveTextContent("GBF T11");
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

  it("unfolds the counterparts past the first three on \"+ N more\"", () => {
    // A fourth document target aligned with NBSAP_1.
    const targets = new Map(FIXTURE_TARGETS);
    targets.set("NAP_2", { id: "NAP_2", text: "NAP_2 text", sourceDocument: "NAP", sourceLabel: "NAP_2", country: "Testland", isQuantitative: false, isTimeBound: false });
    const group = rankPolicyLinkCandidates(buildNr7Report(behind, [...FIXTURE_ALIGNMENT, { targetAId: "NBSAP_1", targetBId: "NAP_2", alignment: "high", description: "" }], targets)!)!;
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7PolicyLinkRows group={group} countryConfig={null} visibleTargetIds={new Set(targets.keys())} onOpenTarget={vi.fn()} onFocusNr7Target={vi.fn()} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(rowButton(0));
    const row = rows()[0];
    // NAP and NDC tie on two links each and sort by id, so the fourth counterpart is NDC_2.
    expect(within(row).queryByRole("button", { name: "NDC · NDC_2" })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "+ 1 more" }));
    expect(within(row).getByRole("button", { name: "NDC · NDC_2" })).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Show fewer" }));
    expect(within(row).queryByRole("button", { name: "NDC · NDC_2" })).toBeNull();
  });

  it("folds the rest behind Show all and never claims a suggestion on the face", () => {
    renderRows(FIXTURE_ALIGNMENT, 2);
    expect(rows()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Show all 3" }));
    expect(rows()).toHaveLength(3);
    expect(document.body.textContent).not.toMatch(/\b(should|must|responsible|blame|ministry|contradict|tension)\b/i);
  });
});
