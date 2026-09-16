import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { Nr7RecurringCounterparts } from "./nr7-recurring-counterparts";
import { rankPolicyLinkCandidates } from "./review-groups";
import { buildNr7Report } from "../../nr7-report";
import { FIXTURE_TARGETS, RECURRING_NR7, RECURRING_PAIRS } from "../../nr7-report/test-fixture";

afterEach(cleanup);

function renderFold(props: { onSelectRow?: (id: string) => void; visible?: Set<string>; cap?: number } = {}) {
  const group = rankPolicyLinkCandidates(buildNr7Report(RECURRING_NR7, RECURRING_PAIRS, FIXTURE_TARGETS)!)!;
  const recurring = props.cap === undefined ? group.recurring! : { ...group.recurring!, top: group.recurring!.items.slice(0, props.cap), rest: group.recurring!.items.slice(props.cap), hidden: group.recurring!.items.length - props.cap };
  const onOpenTarget = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Nr7RecurringCounterparts group={recurring} countryConfig={null} visibleTargetIds={props.visible ?? new Set(FIXTURE_TARGETS.keys())} onOpenTarget={onOpenTarget} onSelectRow={props.onSelectRow} />
    </NextIntlClientProvider>,
  );
  return { onOpenTarget };
}

const items = () => screen.getAllByTestId("recurring-counterpart");

describe("Nr7RecurringCounterparts", () => {
  it("lists the counterparts flagged against two or more national targets, most first, with the count over the report and the targets by name", () => {
    const { onOpenTarget } = renderFold();
    expect(items()).toHaveLength(2);
    expect(within(items()[0]).getByTestId("recurring-count")).toHaveTextContent("Flagged against 3 of the 4 national targets, 2 of them rated behind schedule");
    expect(within(items()[1]).getByTestId("recurring-count")).toHaveTextContent("Flagged against 2 of the 4 national targets, one of them rated behind schedule");
    // The national targets by name, behind schedule first, each with its rating word; text, since no row handler is given.
    const hits = within(within(items()[0]).getByRole("list", { name: "National targets this is flagged against" })).getAllByRole("listitem");
    expect(hits.map((h) => h.textContent)).toEqual([
      "1 · Mainstream biodiversity into all sectors. (Limited progress)",
      "4 · Reduce pollution. (No progress)",
      "2 · Protect 30% of the territory. (On track)",
    ]);
    expect(hits.every((h) => h.querySelector("button") === null)).toBe(true);
    // The counterpart opens its target profile.
    fireEvent.click(within(items()[0]).getByRole("button", { name: "NDC · NDC_1" }));
    expect(onOpenTarget).toHaveBeenCalledWith("NDC_1");
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
    // No caveat of its own (the view's one caveat sits under the rows), no eyebrow or intro.
    expect(document.body.textContent).not.toMatch(/AI-estimated|Where the pairs/);
    expect(document.body.textContent).not.toMatch(/\b(should|must|because|responsible|blame|ministry|contradict|tension)\b/i);
  });

  it("opens the matching row from a target's name when the host lets it, and shows a hidden counterpart as text", () => {
    const onSelectRow = vi.fn();
    renderFold({ onSelectRow, visible: new Set(["NAP_1"]) });
    fireEvent.click(within(items()[0]).getByRole("button", { name: "National target 4: rated No progress" }));
    expect(onSelectRow).toHaveBeenCalledWith("NT04");
    // NDC_1 is not in the visible corpus: named, not linked.
    expect(within(items()[0]).queryByRole("button", { name: "NDC · NDC_1" })).toBeNull();
    expect(within(items()[0]).getByTitle("NDC_1 text")).toHaveTextContent("NDC · NDC_1");
    expect(within(items()[1]).getByRole("button", { name: "NAP · NAP_1" })).toBeInTheDocument();
  });

  it("folds the rest behind Show all and folds back", () => {
    renderFold({ cap: 1 });
    expect(items()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Show all 2" }));
    expect(items()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(items()).toHaveLength(1);
  });
});
