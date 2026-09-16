import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { DrawerShell } from "@/components/ui/drawer-shell";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { PairDrawer } from "./pair-drawer";
import { buildNr7Report, nr7PairContext } from "./nr7-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "./nr7-report/test-fixture";
import type { AlignmentResult } from "@/types";

beforeAll(() => {
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as typeof window.requestAnimationFrame;
});
afterEach(cleanup);

const flag = (a: string, b: string): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "flagged", description: "Both plans claim the same river basin.", mechanism: "resource_competition" });
const pair = flag("NBSAP_4", "NDC_1");
// NDC_1 is flagged against NT04 and NT02; NAP_1 against NT04 only.
const model = buildNr7Report(FIXTURE_NR7, [...FIXTURE_ALIGNMENT, pair, flag("NBSAP_2", "NDC_1"), flag("NBSAP_4", "NAP_1")], FIXTURE_TARGETS)!;

function renderPair(p: AlignmentResult, nationalTargetId: string | null) {
  const nr7 = nationalTargetId ? nr7PairContext(model, nationalTargetId, p.targetAId, p.targetBId) : null;
  const onOpenTargetProfile = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DrawerShell open onClose={vi.fn()} dialogLabel="Pair detail">
        <PairDrawer
          data={{ mode: "target-pair", pair: p, targetA: FIXTURE_TARGETS.get(p.targetAId)!, targetB: FIXTURE_TARGETS.get(p.targetBId)!, nr7 }}
          countryConfig={null}
          onOpenTargetPair={vi.fn()}
          onOpenTargetProfile={onOpenTargetProfile}
        />
      </DrawerShell>
    </NextIntlClientProvider>,
  );
  return { onOpenTargetProfile };
}

describe("PairDrawer opened from a biodiversity report row", () => {
  it("leads with the national target, its rating and the report's words, then the pair, then the counterpart's profile link", () => {
    const { onOpenTargetProfile } = renderPair(pair, "NT04");
    const ctx = screen.getByTestId("pair-nr7-context");
    expect(ctx).toHaveTextContent("From national target 4");
    expect(ctx).toHaveTextContent("No progress");
    // The full text as the report gives it, not the row face's shortened form.
    expect(ctx).toHaveTextContent("By 2030, reduce pollution.");
    expect(ctx).toHaveTextContent("What the report says holds it back (the report's words)");
    expect(ctx).toHaveTextContent("Monitoring stations cover only the capital.");
    // The context is the report's; the only AI label is the rationale's.
    expect(within(ctx).queryByText(/AI/)).toBeNull();
    const body = document.body.textContent!;
    const at = (text: string) => body.indexOf(text);
    expect(at("From national target 4")).toBeLessThan(at("NBSAP_4 text"));
    expect(at("NBSAP_4 text")).toBeLessThan(at("possibly misaligned with"));
    expect(at("possibly misaligned with")).toBeLessThan(at("NDC_1 text"));
    expect(at("NDC_1 text")).toBeLessThan(at("AI rationale"));
    // The counterpart repeats on two national targets: one link to every pair flagged on it.
    const repeats = screen.getByTestId("pair-nr7-repeats");
    expect(repeats).toHaveTextContent("The biodiversity report's rows flag this target against 2 national targets.");
    expect(at("NDC_1 text")).toBeLessThan(at("All its flagged pairs"));
    fireEvent.click(within(repeats).getByRole("button", { name: /All its flagged pairs/ }));
    expect(onOpenTargetProfile).toHaveBeenCalledWith("NDC_1");
  });

  it("offers no profile link for a counterpart flagged on one national target only, and no context block without one", () => {
    renderPair(flag("NBSAP_4", "NAP_1"), "NT04");
    expect(screen.getByTestId("pair-nr7-context")).toBeInTheDocument();
    expect(screen.queryByTestId("pair-nr7-repeats")).toBeNull();
    cleanup();
    renderPair(pair, null);
    expect(screen.queryByTestId("pair-nr7-context")).toBeNull();
    expect(screen.queryByTestId("pair-nr7-repeats")).toBeNull();
    expect(screen.getByText("Both plans claim the same river basin.")).toBeInTheDocument();
  });
});
