import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { Nr7RecurringCounterparts } from "./nr7-recurring-counterparts";
import { rankPolicyLinkCandidates } from "../sections/implementation/review-groups";
import { buildNr7Report } from "../nr7-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "../nr7-report/test-fixture";
import type { AlignmentResult, Nr7Data } from "@/types";

afterEach(cleanup);

const behind: Nr7Data = {
  ...FIXTURE_NR7,
  progressItems: FIXTURE_NR7.progressItems.map((i) => (i.targetId === "NT01" ? { ...i, progressStatus: "limited" as const } : i)),
};
const flag = (a: string, b: string): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "flagged", description: "why", mechanism: "delivery_friction", manageability: "manageable" });
// NDC_1 flagged against NT01 (limited), NT02 (on track) and NT04 (no progress); NAP_1 against NT01 and NT02; NDC_2 against NT04 only.
export const RECURRING_PAIRS = [...FIXTURE_ALIGNMENT, flag("NBSAP_1", "NDC_1"), flag("NBSAP_2", "NDC_1"), flag("NBSAP_4", "NDC_1"), flag("NBSAP_1", "NAP_1"), flag("NBSAP_2", "NAP_1"), flag("NBSAP_4", "NDC_2")];

function renderColumn(props: { onOpenRow?: (id: string) => void; visible?: Set<string>; cap?: number } = {}) {
  const group = rankPolicyLinkCandidates(buildNr7Report(behind, RECURRING_PAIRS, FIXTURE_TARGETS)!)!;
  const recurring = props.cap === undefined ? group.recurring! : { ...group.recurring!, top: group.recurring!.items.slice(0, props.cap), rest: group.recurring!.items.slice(props.cap), hidden: group.recurring!.items.length - props.cap };
  const onOpenTarget = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Nr7RecurringCounterparts group={recurring} countryConfig={null} countryName="Testland" visibleTargetIds={props.visible ?? new Set(FIXTURE_TARGETS.keys())} onOpenTarget={onOpenTarget} onOpenRow={props.onOpenRow} />
    </NextIntlClientProvider>,
  );
  return { onOpenTarget };
}

const items = () => screen.getAllByTestId("recurring-counterpart");

describe("Nr7RecurringCounterparts", () => {
  it("lists the counterparts flagged against two or more national targets, most first, with the count over the report and the targets as chips", () => {
    const { onOpenTarget } = renderColumn();
    expect(screen.getByText("Where the pairs to review repeat")).toBeInTheDocument();
    expect(screen.getByText("Testland · 7th National Report (NR7) against the policy targets")).toBeInTheDocument();
    // NDC_1 alone carries 3 of 6 pairs: one target carries half.
    expect(screen.getByText("One target in other national plans carries half of the 6 pairs the AI flagged across the rows. A target listed here is the same pair to review on every national target beside it.")).toBeInTheDocument();
    expect(screen.getByTestId("nr7-links-default")).toHaveTextContent("Open a row on the slide to see that target's links instead.");
    expect(items()).toHaveLength(2);
    expect(within(items()[0]).getByTestId("recurring-count")).toHaveTextContent("on 3 of 4 national targets, 2 behind schedule");
    expect(within(items()[1]).getByTestId("recurring-count")).toHaveTextContent("on 2 of 4 national targets, 1 behind schedule");
    // Chips: behind schedule first, each titled with the target and its rating; text, since no row handler is given.
    const chips = within(items()[0]).getAllByTitle(/^National target/);
    expect(chips.map((c) => c.textContent)).toEqual(["1", "4", "2"]);
    expect(chips.map((c) => c.getAttribute("title"))).toEqual(["National target 1: rated Limited progress", "National target 4: rated No progress", "National target 2: rated On track"]);
    expect(chips.every((c) => c.tagName === "SPAN")).toBe(true);
    // The counterpart opens its target profile.
    fireEvent.click(within(items()[0]).getByRole("button", { name: "NDC · NDC_1" }));
    expect(onOpenTarget).toHaveBeenCalledWith("NDC_1");
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
    expect(document.querySelector('[data-tour="nr7-links-caveat"]')).toHaveTextContent("AI-estimated alignment between target texts");
    expect(document.body.textContent).not.toMatch(/\b(should|must|because|responsible|blame|ministry|contradict|tension)\b/i);
  });

  it("opens the matching row from a chip when the host lets it, and shows a hidden counterpart as text", () => {
    const onOpenRow = vi.fn();
    renderColumn({ onOpenRow, visible: new Set(["NAP_1"]) });
    fireEvent.click(within(items()[0]).getByRole("button", { name: "National target 4: rated No progress" }));
    expect(onOpenRow).toHaveBeenCalledWith("NT04");
    // NDC_1 is not in the visible corpus: named, not linked.
    expect(within(items()[0]).queryByRole("button", { name: "NDC · NDC_1" })).toBeNull();
    expect(within(items()[0]).getByTitle("NDC_1 text")).toHaveTextContent("NDC · NDC_1");
    expect(within(items()[1]).getByRole("button", { name: "NAP · NAP_1" })).toBeInTheDocument();
  });

  it("folds the rest behind Show all and folds back", () => {
    renderColumn({ cap: 1 });
    expect(items()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Show all 2" }));
    expect(items()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(items()).toHaveLength(1);
  });
});
