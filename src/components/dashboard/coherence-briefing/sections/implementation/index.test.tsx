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
// The same report with no policy alignment visible: no target behind schedule
// has a link, so the cross-checks lead the biodiversity view instead.
const nr7ReportUnlinked = buildNr7Report(FIXTURE_NR7, [], FIXTURE_TARGETS)!;

const wordCount = (s: string) => s.trim().split(/\s+/).length;

function renderSlide(opts: { report?: ImplementationReport; withBtr?: boolean; withNr7?: boolean; linked?: boolean; locale?: "en" | "es" | "mn"; onReportChange?: (r: ImplementationReport) => void } = {}) {
  const withBtr = opts.withBtr ?? true;
  const withNr7 = opts.withNr7 ?? true;
  const messages = { en, es, mn }[opts.locale ?? "en"];
  render(
    <NextIntlClientProvider locale={opts.locale ?? "en"} messages={messages}>
      <ImplementationSection
        coverage={withBtr ? coverage : { ...coverage, btrActions: 0, totalActions: 0 }}
        summary={summary}
        nr7Data={withNr7 ? FIXTURE_NR7 : null}
        nr7Report={withNr7 ? (opts.linked === false ? nr7ReportUnlinked : nr7Report) : null}
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
const start = () => document.querySelector('[data-tour="where-to-start"]')?.textContent ?? "";

describe("ImplementationSection", () => {
  it("climate report: the finding, a plain body, where to start, the bars and one folded section", () => {
    renderSlide({ report: "btr" });
    expect(headline()).toBe("6 of Testland's 6 reported climate actions may work against targets in its other plans.");
    expect(body()).toBe("2 of these 6 are already under way. Most of the targets involved are in the NDC and the NAP.");
    expect(wordCount(body())).toBeLessThanOrEqual(35);
    expect(start()).toContain("Where to start");
    expect(start()).toContain("Start with the top 2 bars: together they hold half of the concerns.");
    expect(start()).toContain("AI-estimated review prompts, not findings.");
    expect(screen.getByRole("group", { name: "Choose a report" })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-tour="review-visual"] li')).toHaveLength(5);
    expect(document.querySelectorAll('[data-tour="full-picture"] > details')).toHaveLength(1);
    expect(screen.getByText("Coverage by document")).toBeInTheDocument();
    expect(screen.getByText(/Evidence: Testland's Biennial Transparency Report \(BTR\) and 7th National Report/)).toBeInTheDocument();
  });

  it("biodiversity report: the finding, a plain body, where to start, the policy-link rows and two folded sections", () => {
    renderSlide({ report: "nr7" });
    expect(headline()).toBe("Testland's biodiversity report rates 1 of 4 national targets behind schedule.");
    expect(body()).toBe("Each row is one national target: its rating, and how many linked pairs the AI flagged as potential misalignments. None is flagged.");
    expect(wordCount(body())).toBeLessThanOrEqual(35);
    expect(start()).toContain("Where to start");
    expect(start()).toContain("Start with the top row: what the report says holds it back, then whether the linked plans bear on it.");
    expect(start()).not.toContain("AI-estimated");
    expect(start()).not.toContain("Nothing on this tab is AI-generated.");
    // One caveat on the view, under the rows; nothing else repeats it.
    expect(screen.getByTestId("policy-link-caveat")).toHaveTextContent("Links to other plans are AI-estimated alignment between target texts");
    expect(document.body.textContent!.match(/AI-estimated/g)).toHaveLength(1);
    // All four national targets, the one behind schedule with links first; the headline counts that one.
    expect(document.querySelectorAll('[data-tour="review-visual"] li')).toHaveLength(4);
    expect(document.querySelector('[data-tour="review-row"]')?.getAttribute("aria-label")).toMatch(/^4 · /);
    expect(screen.getByTestId("policy-link-rows")).toBeInTheDocument();
    // The cross-checks fold below, with the indicators; the national targets are the rows, not a second list.
    const details = [...document.querySelectorAll('[data-tour="full-picture"] > details')] as HTMLDetailsElement[];
    expect(details).toHaveLength(2);
    expect(screen.queryByText(/NR7 by national target/)).toBeNull();
    expect(details.every((d) => !d.open)).toBe(true);
    expect(screen.getByText("Ratings that do not match their own evidence")).toBeInTheDocument();
    expect(screen.getByText("5 places, no AI involved")).toBeInTheDocument();
    expect(screen.getByTestId("cross-check-rows").closest("details")).toBe(details[0]);
    expect(screen.queryByText("Coverage by document")).toBeNull();
    expect(screen.getByText(/Evidence: Testland's 7th National Report \(NR7\)/)).toBeInTheDocument();
  });

  it("biodiversity report: the body names the document most flagged pairs are with, once, and the headline stays one number", () => {
    const contested = buildNr7Report(FIXTURE_NR7, [...FIXTURE_ALIGNMENT, flag("NBSAP_4", "NDC_1", "manageable")], FIXTURE_TARGETS)!;
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ImplementationSection coverage={coverage} summary={summary} nr7Data={FIXTURE_NR7} nr7Report={contested} visibleTargetIds={new Set(FIXTURE_TARGETS.keys())} report="nr7" onReportChange={vi.fn()} countryName="Testland" countryConfig={null} onOpenActionPair={vi.fn()} onOpenTarget={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(headline()).toBe("Testland's biodiversity report rates 1 of 4 national targets behind schedule.");
    expect(body()).toBe("Each row is one national target: its rating, and how many linked pairs the AI flagged as potential misalignments. Most flagged pairs are with the NDC.");
    expect(start()).toContain("Start with the top row");
    expect(screen.getAllByTestId("policy-link-flagged-face")[0]).toHaveTextContent("1 to review");
    // Where the pairs repeat is the sticky column's business, never a second list on the slide.
    expect(screen.queryByTestId("recurring-counterparts")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\b(should|must|because|responsible|blame|ministry|contradict|tension)\b/i);
  });

  it("biodiversity report without visible policy alignment: the cross-checks lead, as before", () => {
    renderSlide({ report: "nr7", linked: false });
    expect(headline()).toBe("In 4 places, Testland's biodiversity report rates a target one way while its own evidence points another.");
    expect(body()).toBe("The report rates progress on 4 national targets and also gives questionnaire answers and figures for them. In these 4 places a rating and that evidence do not match. No AI is involved.");
    expect(wordCount(body())).toBeLessThanOrEqual(35);
    expect(start()).toContain("is the rating right, or is the evidence?");
    expect(start()).toContain("Nothing on this tab is AI-generated.");
    // Three eligible cross-checks on the face (the reach rule needs alignment); the held-back one sits behind "Show all".
    expect(document.querySelectorAll('[data-tour="review-visual"] li')).toHaveLength(3);
    expect(screen.queryByTestId("policy-link-rows")).toBeNull();
    expect(document.querySelectorAll('[data-tour="full-picture"] > details')).toHaveLength(1);
  });

  it("the toggle sits above the headline and hands the switch to the host", () => {
    const onReportChange = vi.fn();
    renderSlide({ report: "btr", onReportChange });
    const group = screen.getByRole("group", { name: "Choose a report" });
    const heading = screen.getByRole("heading", { level: 2 });
    // The headline is about the chosen report, so the choice comes first in reading order.
    expect(group.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(headline()).toMatch(/biodiversity report rates 1 of 4 national targets behind schedule/);
  });

  it.each(["es", "mn"] as const)("%s keeps both bodies under 35 words and every template filled", (locale) => {
    renderSlide({ report: "btr", locale });
    expect(wordCount(body())).toBeLessThanOrEqual(35);
    expect(`${headline()} ${body()} ${start()}`).not.toMatch(/\{|\}/);
    cleanup();
    renderSlide({ report: "nr7", locale });
    expect(wordCount(body())).toBeLessThanOrEqual(35);
    expect(`${headline()} ${body()} ${start()}`).not.toMatch(/\{|\}/);
    cleanup();
    renderSlide({ report: "nr7", locale, linked: false });
    expect(wordCount(body())).toBeLessThanOrEqual(35);
    expect(`${headline()} ${body()} ${start()}`).not.toMatch(/\{|\}/);
  });

  it("keeps the faces factual in every locale", () => {
    for (const report of ["btr", "nr7"] as const) {
      for (const linked of [true, false]) {
        renderSlide({ report, linked });
        expect(document.body.textContent).not.toMatch(/\b(should|must|responsible|blame|ministry|contradict|tension)\b/i);
        cleanup();
      }
    }
  });
});
