import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { setupFixture } from "@/lib/brief/contracts/test-fixture";
import type { GeoFile } from "@/lib/brief/contracts/geo";
import { emptyFocus, type Focus } from "@/lib/brief/contracts/focus";
import { CurrencyProvider, type Currency } from "./money";
import { Overview, type Step } from "./overview";

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

function renderOverview(
  opts: { geo?: GeoFile | null; focus?: Partial<Focus>; step?: Step; currency?: Currency } = {},
) {
  const onFocus = vi.fn();
  const onContract = vi.fn();
  const onList = vi.fn();
  const focus = { ...emptyFocus("globe"), ...opts.focus };
  const utils = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CurrencyProvider currency={opts.currency ?? "mnt"} rate={3500}>
        <div data-brief>
          <Overview
            setup={setupFixture()}
            geo={opts.geo === undefined ? GEO : opts.geo}
            focus={focus}
            onFocus={onFocus}
            onContract={onContract}
            onTarget={vi.fn()}
            onList={onList}
            initialStep={opts.step}
          />
        </div>
      </CurrencyProvider>
    </NextIntlClientProvider>,
  );
  return { ...utils, onFocus, onContract, onList };
}

const step = (name: string) => document.querySelector<HTMLElement>(`[data-step="${name}"]`)!;

afterEach(cleanup);

describe("Overview", () => {
  it("walks from the record to where it lands, then what the money is for", () => {
    renderOverview();
    expect([...document.querySelectorAll("[data-step]")].map((el) => (el as HTMLElement).dataset.step)).toEqual(["record", "purpose", "places", "areas"]);
  });

  it("drops the map step where the country has no outlines", () => {
    renderOverview({ geo: null });
    expect([...document.querySelectorAll("[data-step]")].map((el) => (el as HTMLElement).dataset.step)).toEqual(["record", "purpose", "areas"]);
  });

  it("states the record and its share for nature or climate in numbers", () => {
    renderOverview();
    expect(within(step("record")).getByRole("heading", { level: 2 }).textContent).toBe("₮250 billion in 40 public contracts since 2024");
    expect(within(step("purpose")).getByRole("heading", { level: 2 }).textContent).toBe(
      "₮8.8 of every ₮100 was contracted for work mainly for nature or climate",
    );
  });

  it("states the same findings in US$ when the reader chooses it", () => {
    renderOverview({ currency: "usd" });
    expect(within(step("record")).getByRole("heading", { level: 2 }).textContent).toBe("US$71.4 million in 40 public contracts since 2024");
  });

  it("opens the example contract in full", () => {
    const { onContract } = renderOverview();
    fireEvent.click(screen.getByRole("button", { name: /See one contract in full/ }));
    expect(onContract).toHaveBeenCalledWith("p1");
  });

  it("follows a focus through the years: its first and last full years in one line", () => {
    renderOverview({ focus: { area: "g_restoration" } });
    expect(within(step("purpose")).getByText(/Money for Restoration/).textContent).toBe(
      "Money for Restoration: ₮4 billion in 2024, ₮4 billion in 2025.",
    );
  });

  it("offers three things for the map to show, and the whole record as a switch above it", () => {
    renderOverview({ step: "places" });
    const layers = within(step("places")).getByRole("group", { name: "What the map shows" });
    expect(within(layers).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Mainly for nature or climate",
      "Strongly matching",
      "Potentially misaligned",
    ]);
    const switcher = screen.getByRole("group", { name: "Money shown" });
    expect(within(switcher).getByRole("button", { name: "All contracts" })).toHaveAttribute("aria-pressed", "false");
  });

  it("puts a document chosen on the map in the page's focus", () => {
    const { onFocus } = renderOverview({ step: "places" });
    const docs = within(step("places")).getByRole("group", { name: "Document" });
    fireEvent.click(within(docs).getByRole("button", { name: "C" }));
    expect(onFocus).toHaveBeenCalledWith({ doc: "C" });
  });

  it("states where the potentially misaligned tenders are, naming no aimag", () => {
    renderOverview({ step: "places" });
    const layers = within(step("places")).getByRole("group", { name: "What the map shows" });
    fireEvent.click(within(layers).getByRole("button", { name: "Potentially misaligned" }));
    expect(within(step("places")).getByRole("heading", { level: 2 }).textContent).toBe(
      "1 of the 1 potentially misaligned tender names no single place; 0 name an aimag or the capital",
    );
  });

  it("shows every policy area's targets: potentially misaligned beside strongly matching", () => {
    renderOverview({ step: "areas" });
    const row = within(step("areas")).getByRole("button", { name: /Sustainable use/ });
    expect(row.textContent).toContain("3 of 3");
    expect(row.querySelector(".ct-bf-red-n")?.textContent).toBe("1");
  });

  it("puts an area selected in the table in the page's focus", () => {
    const { onFocus } = renderOverview({ step: "areas" });
    fireEvent.click(within(step("areas")).getByRole("button", { name: /Restoration/ }));
    expect(onFocus).toHaveBeenCalledWith({ area: "g_restoration" });
  });

  it("opens the area in focus: its facts, its targets and its contracts behind one link", () => {
    const { onList } = renderOverview({ step: "areas", focus: { area: "g_restoration" } });
    expect(within(step("areas")).getByText(/₮8 billion in 2 contracts mainly for nature or climate/)).toBeInTheDocument();
    fireEvent.click(within(step("areas")).getByRole("button", { name: "See its 2 contracts" }));
    expect(onList).toHaveBeenCalledWith(expect.objectContaining({ ids: ["p2", "p3"] }));
  });

  it("marks nothing at rest, and the name of the area in focus", () => {
    renderOverview({ step: "areas" });
    expect(document.querySelectorAll(".ct-label-button[data-lit]")).toHaveLength(0);
    cleanup();
    renderOverview({ step: "areas", focus: { area: "g_restoration" } });
    const lit = document.querySelectorAll(".ct-label-button[data-lit]");
    expect([...lit].map((b) => b.textContent)).toEqual(["Restoration"]);
  });

  it("names the field as an image on its canvas, its names as buttons outside the image", () => {
    renderOverview({ step: "areas" });
    const image = screen.getByRole("img", { name: /squares of ₮5 billion/ });
    expect(image.tagName).toBe("CANVAS");
    const name = document.querySelector(".ct-label-button");
    expect(name?.closest("[role='img']")).toBeNull();
  });

  it("opens on the measured field at once: no glide from a first guess at its size", () => {
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 700 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 560 });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private cb: () => void) {}
        observe() {
          this.cb();
        }
        disconnect() {}
      },
    );
    const raf = vi.spyOn(window, "requestAnimationFrame");
    try {
      renderOverview();
      expect(raf).not.toHaveBeenCalled();
    } finally {
      raf.mockRestore();
      vi.unstubAllGlobals();
      if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
      if (height) Object.defineProperty(HTMLElement.prototype, "clientHeight", height);
    }
  });
});
