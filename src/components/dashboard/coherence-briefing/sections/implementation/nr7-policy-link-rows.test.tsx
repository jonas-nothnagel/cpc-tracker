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
  const model = buildNr7Report(behind, alignment, targets)!;
  const group = rankPolicyLinkCandidates(model, cap)!;
  const spies = { onOpenTarget: vi.fn(), onFocusIndicator: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Nr7PolicyLinkRows group={group} model={model} countryConfig={null} visibleTargetIds={new Set(targets.keys())} {...spies} />
    </NextIntlClientProvider>,
  );
  return { group, model, ...spies };
}

// Top-level rows only: an open row's flagged list adds nested list items.
const rows = () => [...document.querySelectorAll('[data-testid="policy-link-rows"] > ol > li')] as HTMLElement[];
const rowButton = (i: number) => within(rows()[i]).getAllByRole("button")[0];

describe("Nr7PolicyLinkRows", () => {
  it("shows every target on one line: number and text without its deadline, the rating word and the count to review, behind schedule first", () => {
    renderRows();
    expect(rows()).toHaveLength(4);
    expect(rowButton(0)).toHaveAttribute("data-tour", "review-row");
    // The deadline prefix is dropped so the words that tell targets apart show; the raw text stays as the tooltip.
    expect(rowButton(0).getAttribute("aria-label")).toBe("1 · Mainstream biodiversity into all sectors.: rated Limited progress; none to review");
    expect(within(rows()[0]).getByTestId("policy-link-subject")).toHaveAttribute("title", "By 2030, mainstream biodiversity into all sectors.");
    expect(within(rows()[0]).getByText("Limited progress")).toBeInTheDocument();
    expect(within(rows()[0]).getByTestId("policy-link-flagged-face")).toHaveTextContent("none to review");
    expect(within(rows()[0]).queryByTestId("policy-link-flagged-mark")).toBeNull();
    // No aligned count, no bar, no document and no GBF chip on the face.
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
    // The view's one caveat sits under the list; no "(AI-estimated)" inside the rows.
    expect(screen.getByTestId("policy-link-caveat")).toHaveTextContent("Links to other plans are AI-estimated alignment between target texts");
    expect(document.body.textContent!.match(/AI-estimated/g)).toHaveLength(1);
  });

  it("opens a target without links to the report's words, the no-links line and the full entry", () => {
    renderRows();
    fireEvent.click(rowButton(3));
    const row = rows()[3];
    expect(rowButton(3)).toHaveAttribute("aria-expanded", "true");
    expect(within(row).getByText("The report gives no key-challenges text for this target.")).toBeInTheDocument();
    expect(within(row).getByTestId("policy-link-reach")).toHaveTextContent("No target in the other documents was judged strongly aligned with it.");
    expect(within(row).queryByTestId("policy-link-review")).toBeNull();
    expect(within(row).getByText("Full report entry")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /See the national target/ })).toBeNull();
  });

  it("opens a row in order: the report's words, the aligned count, the GBF target expanded, the full entry, one link to the plan", () => {
    const { onOpenTarget, onFocusIndicator } = renderRows();
    fireEvent.click(rowButton(0));
    const row = rows()[0];
    expect(rowButton(0)).toHaveAttribute("aria-expanded", "true");
    expect(within(row).getByTestId("policy-link-subject")).toHaveTextContent("1 · Mainstream biodiversity into all sectors.");
    // NT01 has no key-challenges text; the progress summary stands in, labelled as the report's words.
    expect(within(row).getByText("What the report says holds it back")).toBeInTheDocument();
    expect(within(row).getByText("(the report's words)")).toBeInTheDocument();
    expect(within(row).getByText(/Mainstreaming has advanced through the planning law/)).toBeInTheDocument();
    expect(within(row).getByTestId("policy-link-reach")).toHaveTextContent("Aligned strongly with 3 targets in 2 other documents.");
    expect(within(row).getByTestId("policy-link-reach")).not.toHaveTextContent(/column/);
    // The abbreviation is expanded where the chip first appears.
    expect(within(row).getByTestId("policy-link-gbf")).toHaveTextContent("Filed under Global Biodiversity Framework (GBF) target");
    expect(within(row).getByTitle(/GBF\) target 14:/)).toHaveTextContent("GBF T14");
    // The per-document counts and the aligned counterparts live in the column, not here.
    expect(within(row).queryByText(/by document/i)).toBeNull();
    expect(within(row).queryByRole("button", { name: "NDC · NDC_1" })).toBeNull();
    // No flagged links on this target: no review block.
    expect(within(row).queryByTestId("policy-link-review")).toBeNull();
    const at = (text: string) => row.textContent!.indexOf(text);
    expect(at("What the report says holds it back")).toBeLessThan(at("Aligned strongly with 3 targets"));
    expect(at("Aligned strongly with 3 targets")).toBeLessThan(at("Filed under"));
    expect(at("Filed under")).toBeLessThan(at("Full report entry"));
    // The full entry unfolds the questionnaire and indicators; a shared-indicator chip hands off.
    expect(within(row).queryByTestId("nr7-target-detail")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Full report entry" }));
    const detail = within(row).getByTestId("nr7-target-detail");
    expect(within(detail).getByText("Questionnaire")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "A.3" }));
    expect(onFocusIndicator).toHaveBeenCalledWith("A.3");
    // One link onward: the target in the biodiversity plan, abbreviation expanded.
    fireEvent.click(within(row).getByRole("button", { name: "The target in the biodiversity plan (NBSAP 1)" }));
    expect(onOpenTarget).toHaveBeenCalledWith("NBSAP_1");
    expect(within(row).queryByRole("button", { name: /Open NBSAP target/ })).toBeNull();
    // Opening another row closes this one.
    fireEvent.click(rowButton(1));
    expect(rowButton(0)).toHaveAttribute("aria-expanded", "false");
    expect(rowButton(1)).toHaveAttribute("aria-expanded", "true");
  });

  it("counts the pairs to review on the face, as a mark and a number, and lists them plainly in the open row after the report's words", () => {
    renderRows([...FIXTURE_ALIGNMENT, flagged, { ...flagged, targetBId: "NDC_2" }, { ...flagged, targetBId: "NAP_1" }]);
    // The flagged links lift NT04 to the top; the face says how many, never which document (the body says that once).
    expect(rowButton(0).getAttribute("aria-label")).toBe("4 · Reduce pollution.: rated No progress; 3 to review");
    const face = within(rows()[0]).getByTestId("policy-link-flagged-face");
    expect(face).toHaveTextContent("3 to review");
    expect(face).not.toHaveTextContent(/NDC|mostly/);
    expect(within(face).getByTestId("policy-link-flagged-mark")).toBeInTheDocument();
    expect(face.querySelector("[style*='width']")).toBeNull();
    fireEvent.click(rowButton(0));
    const row = rows()[0];
    const at = (text: string) => row.textContent!.indexOf(text);
    expect(at("What the report says holds it back")).toBeLessThan(at("Aligned strongly with 3 targets"));
    expect(at("Aligned strongly with 3 targets")).toBeLessThan(at("Flagged pairs (3)"));
    const review = within(row).getByTestId("policy-link-review");
    expect(within(review).getByRole("button", { name: "NDC · NDC_1" })).toBeInTheDocument();
    // A plain list: the box says what they are, no pill repeats it on every line.
    expect(within(review).queryByText("potential misalignment")).toBeNull();
    expect(review.querySelector('[data-review="true"]')).toBeNull();
    expect(within(row).getByText("Monitoring stations cover only the capital.")).toBeInTheDocument();
    expect(within(row).getByTitle(/GBF\) target 11:/)).toHaveTextContent("GBF T11");
  });

  it("opens a flagged pair as the pair with the national target as context when the host offers it, else the counterpart alone", () => {
    const model = buildNr7Report(behind, [...FIXTURE_ALIGNMENT, flagged], FIXTURE_TARGETS)!;
    const group = rankPolicyLinkCandidates(model)!;
    const onOpenTarget = vi.fn();
    const onOpenPair = vi.fn();
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7PolicyLinkRows group={group} model={model} countryConfig={null} visibleTargetIds={new Set(FIXTURE_TARGETS.keys())} onOpenTarget={onOpenTarget} onOpenPair={onOpenPair} onFocusIndicator={vi.fn()} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(rowButton(0));
    fireEvent.click(within(within(rows()[0]).getByTestId("policy-link-review")).getByRole("button", { name: "NDC · NDC_1" }));
    expect(onOpenPair).toHaveBeenCalledWith("NT04", "NDC_1");
    expect(onOpenTarget).not.toHaveBeenCalled();
    unmount();
    // Without a pair opener the counterpart opens as a target, as before.
    const fallback = renderRows([...FIXTURE_ALIGNMENT, flagged]);
    fireEvent.click(rowButton(0));
    fireEvent.click(within(within(rows()[0]).getByTestId("policy-link-review")).getByRole("button", { name: "NDC · NDC_1" }));
    expect(fallback.onOpenTarget).toHaveBeenCalledWith("NDC_1");
  });

  it("hands the open row to the host when the host owns it", () => {
    const model = buildNr7Report(behind, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;
    const group = rankPolicyLinkCandidates(model)!;
    const onSelect = vi.fn();
    const ui = (selectedId: string | null) => (
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7PolicyLinkRows group={group} model={model} countryConfig={null} visibleTargetIds={new Set()} onOpenTarget={vi.fn()} onFocusIndicator={vi.fn()} selectedId={selectedId} onSelect={onSelect} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(ui(null));
    fireEvent.click(rowButton(1));
    expect(onSelect).toHaveBeenCalledWith("NT04");
    // Controlled: nothing opens until the host passes the id back.
    expect(rowButton(1)).toHaveAttribute("aria-expanded", "false");
    rerender(ui("NT04"));
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

  it("answers a request from below the rows: unfolds Show all, opens the row with its full entry, hands the request back", () => {
    const model = buildNr7Report(behind, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;
    const group = rankPolicyLinkCandidates(model, 2)!;
    const onRowRequestHandled = vi.fn();
    const ui = (rowRequest: { targetId: string; detail: boolean } | null) => (
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7PolicyLinkRows group={group} model={model} countryConfig={null} visibleTargetIds={new Set()} onOpenTarget={vi.fn()} onFocusIndicator={vi.fn()} rowRequest={rowRequest} onRowRequestHandled={onRowRequestHandled} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(ui(null));
    expect(rows()).toHaveLength(2);
    // NT03 sits behind "Show all 4".
    rerender(ui({ targetId: "NT03", detail: true }));
    expect(rows()).toHaveLength(4);
    expect(rowButton(3)).toHaveAttribute("aria-expanded", "true");
    expect(within(rows()[3]).getByTestId("nr7-target-detail")).toBeInTheDocument();
    expect(onRowRequestHandled).toHaveBeenCalledTimes(1);
    // Closing the row folds its entry too.
    fireEvent.click(rowButton(3));
    expect(within(rows()[3]).queryByTestId("nr7-target-detail")).toBeNull();
  });
});
