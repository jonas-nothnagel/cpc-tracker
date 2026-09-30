import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { rollUp } from "@/lib/footprint/rollup";
import type { LedgerEvent } from "@/lib/footprint/types";
import { SustainabilityClient } from "./sustainability-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/data/footprint-events", () => {
  const words = (en: string) => ({ en, es: en, mn: en });
  return {
    FOOTPRINT_EVENTS: [
      {
        id: "comparison",
        from: "2026-06-26T00:00:00Z",
        to: "2026-06-26T23:59:59Z",
        countries: ["mongolia"],
        title: words("Model comparison"),
        detail: words("The analysis run again on another model."),
        source: "test",
      },
      {
        id: "first",
        from: "2026-06-02T00:00:00Z",
        to: "2026-06-02T23:59:59Z",
        title: words("First analysis"),
        detail: words("Every pair of targets compared."),
        source: "test",
      },
      {
        id: "nothing-recorded",
        from: "2026-09-01T00:00:00Z",
        to: "2026-09-30T23:59:59Z",
        title: words("Not in this ledger"),
        detail: words("No rows."),
        source: "test",
      },
    ],
  };
});

const entry = (o: Partial<LedgerEvent>): LedgerEvent => ({
  ts: "2026-06-01T00:00:00Z",
  component: "dev_pipeline",
  provider: "openai",
  model: "gpt-5.4",
  region: "USA",
  run_id: null,
  country: "mongolia",
  input_tokens: null,
  output_tokens: null,
  call_count: 1,
  cached_call_count: 0,
  energy_wh: 0,
  water_ml: 0,
  co2_geq: 0,
  minerals_ugsbeq: 0,
  source: "measured",
  schema: 2,
  ...o,
});

// Hand-checked: 20,000 g CO2e, 50,155 Wh, 350,515 mL, 66,206 ug Sb-eq,
// 49,062 requests of which 9,000 reused. Panama uses the most water.
const LEDGER: LedgerEvent[] = [
  entry({
    ts: "2026-06-02T07:03:00Z",
    co2_geq: 6000,
    energy_wh: 15000,
    water_ml: 50000,
    minerals_ugsbeq: 20000,
    call_count: 20000,
    cached_call_count: 1000,
  }),
  entry({
    ts: "2026-06-26T12:39:00Z",
    model: "Llama-4-Maverick-17B-128E-Instruct-FP8",
    source: "estimated",
    co2_geq: 12000,
    energy_wh: 30000,
    water_ml: 100000,
    minerals_ugsbeq: 40000,
    call_count: 20000,
  }),
  entry({
    ts: "2026-07-03T17:00:00Z",
    country: "panama",
    co2_geq: 1938,
    energy_wh: 5000,
    water_ml: 200000,
    minerals_ugsbeq: 6000,
    call_count: 9000,
    cached_call_count: 8000,
  }),
  entry({
    ts: "2026-07-02T13:31:00Z",
    component: "extract",
    country: null,
    co2_geq: 60,
    energy_wh: 150,
    water_ml: 500,
    minerals_ugsbeq: 200,
    call_count: 60,
  }),
  entry({
    ts: "2026-08-03T13:23:00Z",
    component: "chat",
    country: null,
    source: "api",
    co2_geq: 1.2,
    energy_wh: 3,
    water_ml: 10,
    minerals_ugsbeq: 4,
  }),
  entry({
    ts: "2026-08-04T13:23:00Z",
    component: "chat",
    country: null,
    source: "api",
    co2_geq: 0.8,
    energy_wh: 2,
    water_ml: 5,
    minerals_ugsbeq: 2,
  }),
];

function serve(events: LedgerEvent[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => rollUp(events) })),
  );
}

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <SustainabilityClient />
    </NextIntlClientProvider>,
  );
}

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const rows = () => screen.getAllByTestId("fp-row");
const names = () => rows().map((r) => text(r.querySelector(".fp-row-name")));
const chart = () => screen.getByRole("img", { name: /Running total/ });
const eventFigures = () => screen.getAllByTestId("fp-event").map((e) => text(e.querySelector(".fp-event-figures")));

beforeEach(() => serve(LEDGER));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SustainabilityClient", () => {
  it("carries the UNDP logo with the tool's name, leading home", () => {
    renderPage();
    const home = screen.getByRole("link", { name: "UNDP Policy Coherence Analyzer" });
    expect(home.getAttribute("href")).toBe("/");
    expect(home.querySelector("img")?.getAttribute("src")).toBe("/undp-logo.png");
  });

  it("states the four totals, each with what it amounts to in everyday terms", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Environmental Footprint Dashboard");
    const figures = await screen.findAllByTestId("fp-figure");
    expect(figures.map((f) => text(f.querySelector(".fp-figure-value")))).toEqual([
      "20 kg CO2e",
      "50.2 kWh",
      "351 L",
      "66.2 mg Sb-eq",
    ]);
    expect(figures.map((f) => text(f.querySelector(".fp-figure-note")))).toEqual([
      "About the carbon of burning 8.5 litres of petrol",
      "About 0.6 full charges of a long-range electric car",
      "About 2.3 bathtubs of water",
      "Mineral resources used up, in antimony equivalent",
    ]);
    expect(screen.getByText("June 2 to August 4, 2026")).toBeTruthy();
    expect(screen.getByText("49,062 requests to AI models, 18% reused from earlier runs")).toBeTruthy();
    // Nothing on the page sorts figures into measured and estimated.
    expect(document.body.textContent).not.toMatch(/estimated/i);
  });

  it("shows each use as a row of dots in carbon first, largest first, with figures and no verdict", async () => {
    renderPage();
    expect(await screen.findByText("Carbon by use")).toBeTruthy();
    expect(screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent)).not.toContainEqual(
      expect.stringMatching(/%/),
    );
    expect(names()).toEqual(["Mongolia", "Panama", "Reading uploaded documents", "Chat"]);
    const [mongolia, panama, reading, chat] = rows();
    expect(text(mongolia.querySelector(".fp-row-meta"))).toBe("2 runs · 2 models");
    expect(text(mongolia.querySelector(".fp-row-value"))).toBe("18 kg");
    expect(text(chat.querySelector(".fp-row-meta"))).toBe("2 answers");
    // 18,000 g at 50 g a dot fills 360 dots; a use under half a dot gets none.
    expect(screen.getByText("50 g CO2e per dot")).toBeTruthy();
    expect([mongolia, panama, reading, chat].map((r) => r.getAttribute("data-dots"))).toEqual([
      "360",
      "39",
      "1",
      "0",
    ]);
  });

  it("switches everything below to the resource chosen among the four figures", async () => {
    renderPage();
    const figures = await screen.findAllByTestId("fp-figure");
    expect(figures[0].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(figures[2]);
    expect(figures[2].getAttribute("aria-pressed")).toBe("true");
    expect(figures[0].getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Water by use")).toBeTruthy();
    expect(screen.getByText("Water over time")).toBeTruthy();
    // Panama used the most water: the rows re-sort.
    expect(names()).toEqual(["Panama", "Mongolia", "Reading uploaded documents", "Chat"]);
    expect(text(rows()[0].querySelector(".fp-row-value"))).toBe("200 L");
    expect(chart().querySelector(".fp-total-label")?.textContent).toBe("351 L");
    // The events' figures follow the resource too.
    expect(eventFigures()).toEqual(["20,000 requests · 50 L", "20,000 requests · 100 L"]);
  });

  it("draws the running total with its events numbered in the order they happened", async () => {
    renderPage();
    expect(await screen.findByText("Carbon over time")).toBeTruthy();
    expect(chart().querySelector(".fp-total-label")?.textContent).toBe("20 kg");
    // Numbered on the line and listed under it; an event without rows is left out.
    expect([...chart().querySelectorAll(".fp-event-marker")].map((m) => m.textContent)).toEqual(["1", "2"]);
    const events = screen.getAllByTestId("fp-event");
    expect(events.map((e) => text(e.querySelector(".fp-event-title")))).toEqual(["First analysis", "Model comparison"]);
    expect(text(events[0].querySelector(".fp-event-date"))).toBe("June 2, 2026");
    expect(text(events[1].querySelector(".fp-event-detail"))).toBe("The analysis run again on another model.");
    expect(eventFigures()).toEqual(["20,000 requests · 6 kg", "20,000 requests · 12 kg"]);
    // The events name the steps: no other names at rest.
    expect(chart().querySelectorAll(".fp-step-label")).toHaveLength(0);
  });

  it("marks an event's steps while it is pointed at, in the list or on the line", async () => {
    renderPage();
    await screen.findByText("Carbon over time");
    const [, comparison] = screen.getAllByTestId("fp-event");
    fireEvent.pointerEnter(comparison);
    expect(chart().querySelectorAll(".fp-focus-step")).toHaveLength(1);
    expect(chart().querySelector('.fp-event-marker[data-active="true"]')?.textContent).toBe("2");
    fireEvent.pointerLeave(comparison);
    expect(chart().querySelectorAll(".fp-focus-step")).toHaveLength(0);
    const marker = chart().querySelectorAll(".fp-event-marker")[0];
    fireEvent.pointerEnter(marker);
    expect(screen.getByTestId("fp-event-card").textContent).toContain("First analysis");
    expect(screen.getAllByTestId("fp-event")[0].getAttribute("data-active")).toBe("true");
  });

  it("marks a use's steps on the running total while the use is pointed at", async () => {
    renderPage();
    await screen.findByText("Carbon by use");
    expect(chart().querySelectorAll(".fp-focus-step")).toHaveLength(0);
    const mongolia = within(rows()[0]).getByRole("button");
    fireEvent.pointerEnter(mongolia);
    expect(chart().querySelectorAll(".fp-focus-step")).toHaveLength(2);
    // The use's own largest steps are named while it is in focus.
    expect([...chart().querySelectorAll(".fp-step-label")].map((l) => l.textContent)).toEqual([
      "Mongolia +6 kg",
      "Mongolia +12 kg",
    ]);
    fireEvent.pointerLeave(mongolia);
    expect(chart().querySelectorAll(".fp-focus-step")).toHaveLength(0);
  });

  it("opens a use's runs under the field, newest first, and closes them again", async () => {
    renderPage();
    await screen.findByText("Carbon by use");
    const mongolia = within(rows()[0]).getByRole("button");
    fireEvent.click(mongolia);
    expect(mongolia.getAttribute("aria-pressed")).toBe("true");
    const panel = screen.getByTestId("fp-runs");
    expect(text(panel.querySelector(".fp-runs-title"))).toBe("Mongolia");
    expect(text(panel.querySelector(".fp-row-resources"))).toBe(
      "18 kg CO2e · 45 kWh · 150 L of water · 60 mg Sb-eq",
    );
    const runs = within(panel).getAllByTestId("fp-entry");
    expect(runs.map((r) => text(r.querySelector(".fp-entry-date")))).toEqual(["Jun 26, 2026", "Jun 2, 2026"]);
    expect(text(runs[0])).toContain("Llama-4-Maverick-17B-128E-Instruct-FP8");
    expect(text(runs[1])).toContain("20,000 requests, 1,000 reused");
    // The chosen use stays marked on the running total.
    expect(chart().querySelectorAll(".fp-focus-step")).toHaveLength(2);
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("fp-runs")).toBeNull();
    expect(mongolia.getAttribute("aria-pressed")).toBe("false");
  });

  it("says so when nothing has been recorded", async () => {
    serve([]);
    renderPage();
    expect(await screen.findByText(/No footprint recorded yet/)).toBeTruthy();
    expect(screen.queryAllByTestId("fp-figure")).toHaveLength(0);
  });
});
