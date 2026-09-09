import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { ReviewGroups } from "./review-list";
import { buildReviewGroups } from "./review-groups";
import { computeActionPlanAlignment } from "@/lib/implementation-coherence";
import { buildNr7Report } from "../../nr7-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "../../nr7-report/test-fixture";
import type { AlignmentResult, BTRAction, BtrData, Target } from "@/types";

afterEach(cleanup);

const mit = (name: string, status: string, entity = "Ministry of Energy"): BTRAction => ({
  name, description: "", objectives: "", instrumentType: "", status, sector: "sector_energy", gasesAffected: "",
  startYear: "", implementingEntity: entity, reductionEstimates: {}, actionType: "mitigation",
});
const btr = (measures: BTRAction[]): BtrData => ({
  progressIndicators: [], mitigationMeasures: measures, sectorEmissions: { bySector: [] }, projections: [], technologySupport: [], capacityBuilding: [],
});
const target = (id: string, doc: string): Target => ({ id, text: `${id} full text`, sourceDocument: doc, sourceLabel: id.replace("_", " "), country: "T", isQuantitative: false, isTimeBound: false });
const flag = (a: string, b: string, manageability: "manageable" | "fundamental", why: string): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "flagged", description: why, manageability });

const policy = [target("NDC_1", "NDC"), target("NAP_1", "NAP"), target("NBSAP_1", "NBSAP")];
const measures = Array.from({ length: 6 }, (_, i) => mit(`Action ${i + 1}`, i === 0 ? "Ongoing" : "Planned", i === 0 ? "Ministry of Energy / Aimag Governors" : "Ministry of Energy"));
const pairs: AlignmentResult[] = [];
measures.forEach((_, i) => { for (let k = 0; k < 6 - i; k += 1) pairs.push(flag(`BTR_${i + 1}`, policy[k % 3].id, k === 0 ? "fundamental" : "manageable", `Rationale ${i + 1}.${k}`)); });
const summary = computeActionPlanAlignment(pairs, btr(measures), policy, 5, {});
const nr7Report = buildNr7Report(FIXTURE_NR7, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;

function renderGroups(opts: { nr7?: boolean; summary?: typeof summary | null } = {}) {
  const withNr7 = opts.nr7 ?? true;
  const s = opts.summary === undefined ? summary : opts.summary;
  const groups = buildReviewGroups({ summary: s, nr7Report: withNr7 ? nr7Report : null, btrActions: s ? 6 : 0 });
  const spies = { onOpenActionPair: vi.fn(), onOpenTarget: vi.fn(), onFocusNr7Target: vi.fn(), onFocusNr7Indicator: vi.fn() };
  const utils = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ReviewGroups
        groups={groups}
        nr7Report={withNr7 ? nr7Report : null}
        nr7PairTargets={new Map([["NT02", { actionId: "NR7_9", nbsapId: "NBSAP_2" }]])}
        visibleTargetIds={new Set(FIXTURE_TARGETS.keys())}
        countryConfig={null}
        {...spies}
      />
    </NextIntlClientProvider>,
  );
  return { ...utils, ...spies, groups };
}

describe("ReviewGroups", () => {
  it("shows two groups with expanded abbreviations, five rows each and a show-all", () => {
    renderGroups();
    expect(screen.getByRole("heading", { name: "Climate report (Biennial Transparency Report, BTR)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Biodiversity report (7th National Report to the CBD, NR7)" })).toBeInTheDocument();
    const [climate, bio] = screen.getAllByRole("list");
    expect(within(climate).getAllByRole("listitem")).toHaveLength(5);
    expect(within(bio).getAllByRole("listitem")).toHaveLength(4); // four eligible signals; the held-back one waits
    expect(screen.getByRole("button", { name: "Show all 6" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all 5" })).toBeInTheDocument();
    expect(screen.getByText(/6 of 6 reported actions show potential misalignment/)).toBeInTheDocument();
    expect(screen.getByText(/AI-estimated review prompts, not findings/)).toBeInTheDocument();
  });

  it("orders the climate rows by flagged pairs and shows status, design-level count and commitments", () => {
    renderGroups();
    const [climate] = screen.getAllByRole("list");
    const first = within(climate).getAllByRole("listitem")[0];
    expect(first.textContent).toContain("Action 1");
    expect(first.textContent).toContain("Ongoing");
    expect(first.textContent).toContain("1 design-level");
    expect(first.textContent).toContain("3 commitments across NDC, NAP, NBSAP");
    expect(first.textContent).toContain("6 pairs");
  });

  it("expands a climate row inline to its commitments, rationale, pair link and named institutions", () => {
    const { onOpenActionPair } = renderGroups();
    const [climate] = screen.getAllByRole("list");
    const button = within(climate).getAllByRole("button")[0];
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const body = document.getElementById("review-climate-BTR_1")!;
    expect(within(body).getAllByText("Why it was flagged (AI-estimated)")).toHaveLength(3);
    expect(within(body).getByText("Rationale 1.0")).toBeInTheDocument();
    expect(within(body).getByText("Design-level")).toBeInTheDocument();
    expect(within(body).getAllByText("Coordination-level")).toHaveLength(2);
    expect(within(body).getByText(/Named on this action:/).textContent).toContain("Aimag Governors, Ministry of Energy");
    fireEvent.click(within(body).getAllByRole("button", { name: /Open the pair/ })[0]);
    expect(onOpenActionPair).toHaveBeenCalledWith("BTR_1", "NDC_1");
  });

  it("show all reveals the rest of the climate rows and can fold them again", () => {
    renderGroups();
    fireEvent.click(screen.getByRole("button", { name: "Show all 6" }));
    const [climate] = screen.getAllByRole("list");
    expect(within(climate).getAllByRole("listitem")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(within(screen.getAllByRole("list")[0]).getAllByRole("listitem")).toHaveLength(5);
  });

  it("expands an NR7 rating-vs-answers row to the answers not in place and links onward", () => {
    const { onFocusNr7Target, onOpenTarget } = renderGroups();
    const [, bio] = screen.getAllByRole("list");
    const row = within(bio).getAllByRole("listitem")[0];
    expect(row.textContent).toContain("National target 1");
    expect(row.textContent).toContain("On track");
    fireEvent.click(within(row).getAllByRole("button")[0]); // the row face
    expect(within(row).getByText("Answers not yet in place (2 of 3)")).toBeInTheDocument();
    expect(within(row).getAllByText("Under development")).toHaveLength(2);
    fireEvent.click(within(row).getByRole("button", { name: /See the national target/ }));
    expect(onFocusNr7Target).toHaveBeenCalledWith("NT01");
    fireEvent.click(within(row).getByRole("button", { name: /Open NBSAP target 1/ }));
    expect(onOpenTarget).toHaveBeenCalledWith("NBSAP_1");
  });

  it("the held-back funding rule appears only after show all, and links to the indicator", () => {
    const { onFocusNr7Indicator } = renderGroups();
    expect(screen.queryByText(/A.3 Red List Index/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all 5" }));
    const row = screen.getByText(/A.3 Red List Index: 0.965 to 0.953/).closest("li")!;
    expect(row.textContent).toContain("4 national targets");
    fireEvent.click(within(row).getAllByRole("button")[0]);
    fireEvent.click(within(row).getByRole("button", { name: /See the indicator/ }));
    expect(onFocusNr7Indicator).toHaveBeenCalledWith("A.3");
  });

  it("offers the pair link on an NR7 row only when the host resolved one", () => {
    const { onOpenActionPair } = renderGroups();
    fireEvent.click(screen.getByRole("button", { name: "Show all 5" }));
    const nt02 = screen.getByText(/National target 2/).closest("li")!;
    fireEvent.click(within(nt02).getAllByRole("button")[0]);
    fireEvent.click(within(nt02).getByRole("button", { name: /side by side/ }));
    expect(onOpenActionPair).toHaveBeenCalledWith("NR7_9", "NBSAP_2");
  });

  it("renders one group without an NR7 and an empty state without flags", () => {
    renderGroups({ nr7: false });
    expect(screen.queryByText(/Biodiversity report/)).toBeNull();
    cleanup();
    renderGroups({ summary: computeActionPlanAlignment([], btr([mit("A", "Planned")]), policy, 5, {}) });
    expect(screen.getByText("No reported climate action shows potential misalignment with the policy targets.")).toBeInTheDocument();
  });

  it("keeps suggestion and blame words off the faces", () => {
    const { container } = renderGroups();
    expect(container.textContent).not.toMatch(/\b(should|must|fail|blame|contradiction|tension)\b/i);
  });
});
