import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";
import { DrawerShell } from "@/components/ui/drawer-shell";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { Nr7ReportDrawer } from "./nr7-report-drawer";
import { buildNr7Report } from "./nr7-self-report";
import { DEFAULT_NR7_REPORT_VIEW, type Nr7ReportView } from "./view";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "./test-fixture";

afterEach(cleanup);

const model = buildNr7Report(FIXTURE_NR7, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;

function renderDrawer(view: Partial<Nr7ReportView> = {}, opts: { canOpenPair?: boolean } = {}) {
  const onViewChange = vi.fn();
  const onOpenNbsap = vi.fn();
  const onOpenPair = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DrawerShell open onClose={() => {}} dialogLabel="NR7 detail">
        <Nr7ReportDrawer
          model={model}
          view={{ ...DEFAULT_NR7_REPORT_VIEW, ...view }}
          onViewChange={onViewChange}
          countryName="Testland"
          canOpenNbsap={(id) => FIXTURE_TARGETS.has(id)}
          canOpenPair={() => opts.canOpenPair ?? false}
          onOpenNbsap={onOpenNbsap}
          onOpenPair={onOpenPair}
        />
      </DrawerShell>
    </NextIntlClientProvider>,
  );
  return { onViewChange, onOpenNbsap, onOpenPair };
}

describe("Nr7ReportDrawer", () => {
  it("switches views through the host-owned view state", () => {
    const { onViewChange } = renderDrawer();
    expect(screen.getByRole("button", { name: "By national target (4)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "All indicators (5)" }));
    expect(onViewChange).toHaveBeenCalledWith(expect.objectContaining({ tab: "indicators" }));
  });

  it("lists every signal, including the drawer-only shared-indicator decline", () => {
    renderDrawer();
    const section = screen.getByText("Worth a closer look").parentElement!;
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(5); // 4 per-target rules + Red List Index decline
    expect(items[items.length - 1].textContent).toContain("A.3 Red List Index: 0.965 to 0.953");
  });

  it("expands a target to its questionnaire, other answers and target-specific indicators", () => {
    const { onOpenNbsap } = renderDrawer({ expandedTargetId: "NT01" });
    const row = document.getElementById("nr7-row-NT01")!;
    expect(within(row).getByText("Level of progress, as reported: On track to achieve target")).toBeInTheDocument();
    expect(within(row).getByText("Does your country use environmental economic accounting?")).toBeInTheDocument();
    expect(within(row.querySelector("table")!).getAllByText("Under development")).toHaveLength(2);
    // The enum answer is shown as recorded, split into words, under its own heading.
    expect(within(row).getByText("Other answers, as recorded in the reporting tool")).toBeInTheDocument();
    expect(within(row).getByText("“mitigation, adaptation, disaster risk reduction”")).toBeInTheDocument();
    // Target-specific indicator (the WWF categories) renders; the shared Red List Index is a chip.
    expect(within(row).getByText("Ecosystem Category (WWF)")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "A.3" })).toBeInTheDocument();
    expect(within(row).getByText(/may use different dates or definitions/)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: /Open NBSAP target 1/ }));
    expect(onOpenNbsap).toHaveBeenCalledWith("NBSAP_1");
    expect(within(row).queryByRole("button", { name: /side by side/ })).toBeNull();
  });

  it("offers the pair link only when the host can resolve one", () => {
    const { onOpenPair } = renderDrawer({ expandedTargetId: "NT02" }, { canOpenPair: true });
    const row = document.getElementById("nr7-row-NT02")!;
    fireEvent.click(within(row).getByRole("button", { name: /side by side/ }));
    expect(onOpenPair).toHaveBeenCalledWith("NT02");
  });

  it("a shared-indicator chip switches to the indicators view focused on that card", () => {
    const { onViewChange } = renderDrawer({ expandedTargetId: "NT01" });
    fireEvent.click(within(document.getElementById("nr7-row-NT01")!).getByRole("button", { name: "A.3" }));
    expect(onViewChange).toHaveBeenCalledWith(expect.objectContaining({ tab: "indicators", focusIndicatorId: "A.3" }));
  });

  it("the indicators view groups every indicator, draws small multiples and shows country notes", () => {
    const { onViewChange } = renderDrawer({ tab: "indicators", focusIndicatorId: "3.1" });
    expect(screen.getByText("5 indicators: 4 with values, 1 without (1 with a country note).")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(5);
    const pa = document.getElementById("nr7-ind-3.1")!;
    expect(pa.className).toContain("ring-1");
    expect(within(pa).getAllByRole("listitem")).toHaveLength(2);
    expect(within(pa).getByText("20.77 → 20.77 % (2020–2025)")).toBeInTheDocument();
    expect(within(pa).getByText("15.01 → 18.9 % (2020–2025)")).toBeInTheDocument();
    const sub = document.getElementById("nr7-ind-18.2")!;
    expect(within(sub).getByText("No values reported")).toBeInTheDocument();
    expect(within(sub).getByText(/BIOFIN methodology/)).toBeInTheDocument();
    expect(within(sub).getByText("Not attached to a national target")).toBeInTheDocument();
    // A target chip jumps back to that target.
    fireEvent.click(within(pa).getByRole("button", { name: "Open national target 2" }));
    expect(onViewChange).toHaveBeenCalledWith(expect.objectContaining({ tab: "targets", expandedTargetId: "NT02", focusIndicatorId: null }));
  });

  it("names the source and keeps suggestions out of the copy", () => {
    renderDrawer();
    expect(screen.getByText(/Source: Testland's 7th National Report/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b(should|must|fail|ministry)\b/i);
  });
});
