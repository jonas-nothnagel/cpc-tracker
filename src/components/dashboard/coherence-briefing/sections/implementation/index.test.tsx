import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";
import mn from "../../../../../../messages/mn.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
vi.mock("../../tour/tour-button", () => ({ TourButton: () => null }));

import { ImplementationSection, type ImplementationReport } from "./index";
import { computeActionPlanAlignment, computeImplementationCoverage } from "@/lib/implementation-coherence";
import { buildNr7Report } from "../../nr7-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "../../nr7-report/test-fixture";
import type { AlignmentResult, BTRAction, BtrData, Target } from "@/types";

afterEach(cleanup);

const mit = (name: string, status: string): BTRAction => ({
  name, description: "", objectives: "", instrumentType: "", status, sector: "sector_energy", gasesAffected: "",
  startYear: "", implementingEntity: "Ministry of Energy", reductionEstimates: {}, actionType: "mitigation",
});
const btr = (measures: BTRAction[]): BtrData => ({
  progressIndicators: [], mitigationMeasures: measures, sectorEmissions: { bySector: [] }, projections: [], technologySupport: [], capacityBuilding: [],
});
const target = (id: string, doc: string): Target => ({ id, text: `${id} full text`, sourceDocument: doc, sourceLabel: id.replace("_", " "), country: "T", isQuantitative: false, isTimeBound: false });
const flag = (a: string, b: string, manageability: "manageable" | "fundamental"): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "flagged", description: "why", manageability });

const policy = [target("NDC_1", "NDC"), target("NAP_1", "NAP"), target("NBSAP_1", "NBSAP")];
const measures = Array.from({ length: 6 }, (_, i) => mit(`Action ${i + 1}`, i < 2 ? "Ongoing" : "Planned"));
const pairs: AlignmentResult[] = [{ targetAId: "BTR_1", targetBId: "NDC_1", alignment: "high", description: "" }];
measures.forEach((_, i) => { for (let k = 0; k < 6 - i; k += 1) pairs.push(flag(`BTR_${i + 1}`, policy[k % 3].id, k === 0 ? "fundamental" : "manageable")); });
const btrData = btr(measures);
const summary = computeActionPlanAlignment(pairs, btrData, policy, 5, {});
const coverage = computeImplementationCoverage(pairs, btrData, policy);
const nr7Report = buildNr7Report(FIXTURE_NR7, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;

const wordCount = (s: string) => s.trim().split(/\s+/).length;

function renderSlide(opts: { report?: ImplementationReport; withBtr?: boolean; withNr7?: boolean; locale?: "en" | "es" | "mn"; onReportChange?: (r: ImplementationReport) => void } = {}) {
  const withBtr = opts.withBtr ?? true;
  const withNr7 = opts.withNr7 ?? true;
  const messages = { en, es, mn }[opts.locale ?? "en"];
  render(
    <NextIntlClientProvider locale={opts.locale ?? "en"} messages={messages}>
      <ImplementationSection
        coverage={withBtr ? coverage : { ...coverage, btrActions: 0, totalActions: 0 }}
        summary={summary}
        nr7Data={withNr7 ? FIXTURE_NR7 : null}
        nr7Report={withNr7 ? nr7Report : null}
        visibleTargetIds={new Set(FIXTURE_TARGETS.keys())}
        report={opts.report ?? "btr"}
        onReportChange={opts.onReportChange ?? vi.fn()}
        countryName="Testland"
        countryConfig={null}
        onOpenActionPair={vi.fn()}
        onOpenTarget={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

const headline = () => screen.getByRole("heading", { level: 2 }).textContent ?? "";
const body = () => screen.getByRole("heading", { level: 2 }).nextElementSibling?.textContent ?? "";

describe("ImplementationSection", () => {
  it("climate report: the finding, a short takeaway body, the bars and one folded section", () => {
    renderSlide({ report: "btr" });
    expect(headline()).toBe("6 reported climate actions may pull against 3 policy commitments.");
    expect(body()).toBe("2 of them carry half of the flagged pairs, and 2 are already under way. Most flags fall on NDC and NAP targets. AI-estimated review prompts, not findings.");
    expect(wordCount(body())).toBeLessThanOrEqual(35);
    expect(screen.getByRole("group", { name: "Choose a report" })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-tour="review-visual"] li')).toHaveLength(5);
    expect(document.querySelectorAll('[data-tour="full-picture"] > details')).toHaveLength(1);
    expect(screen.getByText("Coverage by document")).toBeInTheDocument();
    expect(screen.getByText(/Evidence: Testland's Biennial Transparency Report \(BTR\) and 7th National Report/)).toBeInTheDocument();
  });

  it("biodiversity report: the finding, a computed takeaway body, the rows and two folded sections", () => {
    renderSlide({ report: "nr7" });
    expect(headline()).toBe("5 places where Testland's biodiversity report disagrees with itself.");
    expect(body()).toBe("1 on-track target has most enabling conditions not yet in place; target 2's indicator unchanged since 2020; 1 target rated unknown despite reported values. Computed from the report's own statements.");
    expect(wordCount(body())).toBeLessThanOrEqual(35);
    // Four eligible cross-checks on the face; the held-back one sits behind "Show all".
    expect(document.querySelectorAll('[data-tour="review-visual"] li')).toHaveLength(4);
    expect(document.querySelectorAll('[data-tour="full-picture"] > details')).toHaveLength(2);
    expect(screen.queryByText("Coverage by document")).toBeNull();
    expect(screen.getByText(/Evidence: Testland's 7th National Report \(NR7\)/)).toBeInTheDocument();
  });

  it("the toggle hands the switch to the host", () => {
    const onReportChange = vi.fn();
    renderSlide({ report: "btr", onReportChange });
    fireEvent.click(screen.getByRole("button", { name: "Biodiversity report (NR7)" }));
    expect(onReportChange).toHaveBeenCalledWith("nr7");
  });

  it("a country with one report gets no toggle and never shows the missing report", () => {
    renderSlide({ report: "btr", withNr7: false });
    expect(screen.queryByRole("group", { name: "Choose a report" })).toBeNull();
    expect(screen.getByText(/Evidence: Testland's Biennial Transparency Report \(BTR\)\./)).toBeInTheDocument();
    cleanup();
    // Asked for the NR7 while only a BTR exists: the climate report stays.
    renderSlide({ report: "nr7", withNr7: false });
    expect(headline()).toMatch(/reported climate actions/);
    cleanup();
    renderSlide({ report: "btr", withBtr: false });
    expect(screen.queryByRole("group", { name: "Choose a report" })).toBeNull();
    expect(headline()).toMatch(/biodiversity report disagrees/);
  });

  it.each(["es", "mn"] as const)("%s keeps both takeaway bodies under 35 words", (locale) => {
    renderSlide({ report: "btr", locale });
    expect(wordCount(body())).toBeLessThanOrEqual(35);
    expect(body()).not.toMatch(/\{|\}/);
    cleanup();
    renderSlide({ report: "nr7", locale });
    expect(wordCount(body())).toBeLessThanOrEqual(35);
    expect(body()).not.toMatch(/\{|\}/);
  });

  it("keeps the faces factual in every locale", () => {
    for (const report of ["btr", "nr7"] as const) {
      renderSlide({ report });
      expect(document.body.textContent).not.toMatch(/\b(should|must|responsible|blame|ministry|contradict|tension)\b/i);
      cleanup();
    }
  });
});
