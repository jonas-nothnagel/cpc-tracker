import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import type { GeoFile } from "@/lib/brief/contracts/geo";
import { setupFixture } from "@/lib/brief/contracts/test-fixture";
import type { LensId } from "@/lib/brief/source";
import { ContractsSection } from "./contracts-section";
import { CurrencyProvider } from "./money";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

const ring = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];
const GEO: GeoFile = {
  source: "test",
  features: [
    { code: "MN-043", name: "Khovd", point: [91, 47], rings: [ring(90, 46, 92, 48)] },
    { code: "MN-057", name: "Zavkhan", point: [96, 48], rings: [ring(95, 47, 97, 49)] },
    { code: "MN-1", name: "Ulaanbaatar", point: [106.5, 47.5], rings: [ring(106, 47, 107, 48)] },
  ],
  band: ["MN-1"],
};
const SETUP = setupFixture();

interface Opts {
  docs?: string[];
  lens?: LensId | null;
  onExplore?: (id: string) => void;
}

function renderSection(opts: Opts = {}) {
  const onLens = vi.fn();
  const onCurrency = vi.fn();
  const ui = (o: Opts) => (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CurrencyProvider currency="mnt" rate={3500}>
        <div data-brief>
          <ContractsSection
            contracts={{ setup: SETUP, geo: GEO }}
            docs={o.docs ?? ["A", "B", "C"]}
            lens={o.lens === undefined ? "globe" : o.lens}
            onLens={onLens}
            currency="mnt"
            onCurrency={onCurrency}
            onExplore={o.onExplore}
          />
        </div>
      </CurrencyProvider>
    </NextIntlClientProvider>
  );
  const utils = render(ui(opts));
  return { ...utils, onLens, onCurrency, rerenderWith: (next: Opts) => utils.rerender(ui({ ...opts, ...next })) };
}

const step = (name: string) => document.querySelector<HTMLElement>(`[data-step="${name}"]`)!;
const focusLine = () => screen.getByRole("group", { name: "Focus" }).textContent;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ContractsSection", () => {
  it("is headed by its name, with the currency and the focus beneath", () => {
    const { onCurrency } = renderSection();
    expect(screen.getByRole("heading", { level: 2, name: "Public contracts" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("group", { name: "Amounts in" })).getByRole("button", { name: "US$" }));
    expect(onCurrency).toHaveBeenCalledWith("usd");
    expect(focusLine()).toContain("the whole record");
  });

  it("walks from the record to where it lands, and stops at the map", () => {
    renderSection();
    expect([...document.querySelectorAll<HTMLElement>("[data-step]")].map((el) => el.dataset.step)).toEqual([
      "record",
      "purpose",
      "places",
    ]);
  });

  it("reads by the brief's policy areas, and hands a lens chosen here to the brief", () => {
    const { onLens } = renderSection({ lens: "ipcc" });
    const lenses = within(step("purpose")).getByRole("group", { name: "Policy areas" });
    expect(within(lenses).getByRole("button", { name: "Climate mitigation" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(lenses).getByRole("button", { name: "Biodiversity" }));
    expect(onLens).toHaveBeenCalledWith("globe");
  });

  it("reads by Biodiversity while the brief reads by a lens no contract carries", () => {
    renderSection({ lens: "hr" });
    const lenses = within(step("purpose")).getByRole("group", { name: "Policy areas" });
    expect(within(lenses).getByRole("button", { name: "Biodiversity" })).toHaveAttribute("aria-pressed", "true");
  });

  it("lets the policy area in focus go when the brief's lens changes, for good", () => {
    const { rerenderWith } = renderSection();
    const areas = within(step("purpose")).getByRole("list", { name: "By policy area" });
    fireEvent.click(within(areas).getByRole("button", { name: /Restoration/ }));
    expect(focusLine()).toContain("Restoration");
    rerenderWith({ lens: "ipcc" });
    expect(focusLine()).toContain("the whole record");
    rerenderWith({ lens: "globe" });
    expect(focusLine()).toContain("the whole record");
  });

  it("offers on the map only the documents in the brief", () => {
    renderSection({ docs: ["A", "B"] });
    const docs = within(step("places")).getByRole("group", { name: "Document" });
    expect(within(docs).getAllByRole("button").map((b) => b.textContent)).toEqual(["All", "A", "B"]);
  });

  it("lets a document in focus go when the brief leaves it out, for good", () => {
    const { rerenderWith } = renderSection();
    fireEvent.click(within(within(step("places")).getByRole("group", { name: "Document" })).getByRole("button", { name: "C" }));
    expect(focusLine()).toContain("Document C");
    rerenderWith({ docs: ["A", "B"] });
    expect(focusLine()).toContain("the whole record");
    rerenderWith({ docs: ["A", "B", "C"] });
    expect(focusLine()).toContain("the whole record");
  });

  it("opens a contract in full in its panel", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderSection();
    fireEvent.click(within(step("record")).getByRole("button", { name: /See one contract in full/ }));
    expect(screen.getByRole("dialog", { name: "Contract: Contract p1" })).toBeInTheDocument();
  });

  it("takes a target behind a place to the centre of the ring, closing the panel first", async () => {
    vi.useFakeTimers();
    try {
      const onExplore = vi.fn();
      renderSection({ docs: ["A", "B"], onExplore });
      fireEvent.click(within(step("places")).getByRole("button", { name: /^Khovd/ }));
      // Within the brief's documents: C1 (strongly matched in Khovd too) is not offered.
      expect(within(step("places")).queryByRole("button", { name: /Shift freight to rail/ })).toBeNull();
      fireEvent.click(within(step("places")).getByRole("button", { name: /Restore degraded land/ }));
      const panel = screen.getByRole("dialog", { name: /Restore degraded land/ });
      fireEvent.click(within(panel).getByRole("button", { name: /Explore this target/ }));
      expect(screen.queryByRole("dialog")).toBeNull();
      // Only once the panel has handed focus back, so the page is not pulled back to it.
      expect(onExplore).not.toHaveBeenCalled();
      await act(async () => {
        vi.runAllTimers();
      });
      expect(onExplore).toHaveBeenCalledWith("B1");
    } finally {
      vi.useRealTimers();
    }
  });
});
