import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { setupFixture } from "@/lib/brief/contracts/test-fixture";
import type { GeoFile } from "@/lib/brief/contracts/geo";
import { emptyFocus, type Focus } from "@/lib/brief/contracts/focus";
import { buildField, layoutField } from "@/lib/brief/contracts/field";
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
  opts: {
    geo?: GeoFile | null;
    focus?: Partial<Focus>;
    step?: Step;
    steps?: Step[];
    currency?: Currency;
    setup?: ReturnType<typeof setupFixture>;
  } = {},
) {
  const onFocus = vi.fn();
  const onContract = vi.fn();
  const onList = vi.fn();
  const onTarget = vi.fn();
  const focus = { ...emptyFocus("globe"), ...opts.focus };
  const utils = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CurrencyProvider currency={opts.currency ?? "mnt"} rate={3500}>
        <div data-brief>
          <Overview
            setup={opts.setup ?? setupFixture()}
            geo={opts.geo === undefined ? GEO : opts.geo}
            focus={focus}
            onFocus={onFocus}
            onContract={onContract}
            onTarget={onTarget}
            onList={onList}
            initialStep={opts.step}
            steps={opts.steps}
          />
        </div>
      </CurrencyProvider>
    </NextIntlClientProvider>,
  );
  return { ...utils, onFocus, onContract, onList, onTarget };
}

const step = (name: string) => document.querySelector<HTMLElement>(`[data-step="${name}"]`)!;

/** A measured field (700 by 560), so the canvas draws and moves. */
function measured<T>(run: () => T): T {
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
  try {
    return run();
  } finally {
    vi.unstubAllGlobals();
    // The sizes live on Element.prototype: the stub on HTMLElement goes again.
    if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    if (height) Object.defineProperty(HTMLElement.prototype, "clientHeight", height);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
  }
}

function overviewAt(focus: Partial<Focus>, step: Step, onFocus = vi.fn(), onContract = vi.fn()) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CurrencyProvider currency="mnt" rate={3500}>
        <div data-brief>
          <Overview
            setup={SETUP}
            geo={GEO}
            focus={{ ...emptyFocus("globe"), ...focus }}
            onFocus={onFocus}
            onContract={onContract}
            onTarget={vi.fn()}
            onList={vi.fn()}
            initialStep={step}
          />
        </div>
      </CurrencyProvider>
    </NextIntlClientProvider>
  );
}
const SETUP = setupFixture();


afterEach(cleanup);

describe("while the page scrolls", () => {
  /** A 1000px window whose animation frames run when the test flushes them, one frame at a time. */
  function frames(scrollY = 0) {
    vi.stubGlobal("innerHeight", 1000);
    vi.stubGlobal("scrollY", scrollY);
    let next = 1;
    let queue = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      queue.set(next, cb);
      return next++;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
    return () =>
      act(() => {
        const run = queue;
        queue = new Map();
        run.forEach((cb) => cb(0));
      });
  }
  /** Where each step's top sits in the window. */
  function tops(at: Record<string, number>) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { top: at[this.dataset.step ?? ""] ?? 0 } as DOMRect;
    });
  }
  const mapLeads = () => screen.queryByRole("group", { name: "Money shown" }) !== null;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the step before until the map's step passes a line 30% down the window", () => {
    const flush = frames();
    tops({ record: -2000, purpose: -300, places: 400, areas: 2400 });
    renderOverview();
    fireEvent.scroll(window);
    flush();
    expect(mapLeads()).toBe(false);
    expect(document.querySelector(".ct-unit")).toBeNull();
    tops({ record: -2100, purpose: -400, places: 290, areas: 2300 });
    fireEvent.scroll(window);
    flush();
    expect(mapLeads()).toBe(true);
  });

  it("keeps the map while its long step is still being read, with the next step past the middle", () => {
    const flush = frames();
    tops({ record: -3000, purpose: -2000, places: -700, areas: 450 });
    renderOverview();
    fireEvent.scroll(window);
    flush();
    expect(mapLeads()).toBe(true);
  });

  it("leads with the step in view when the page opens part way down", () => {
    const flush = frames(2600);
    tops({ record: -3000, purpose: -2000, places: 100, areas: 1500 });
    renderOverview();
    flush();
    expect(mapLeads()).toBe(true);
  });
});

describe("Overview", () => {
  it("walks from the record to where it lands, then what the money is for", () => {
    renderOverview();
    expect([...document.querySelectorAll("[data-step]")].map((el) => (el as HTMLElement).dataset.step)).toEqual(["record", "purpose", "places", "areas"]);
  });

  it("drops the map step where the country has no outlines", () => {
    renderOverview({ geo: null });
    expect([...document.querySelectorAll("[data-step]")].map((el) => (el as HTMLElement).dataset.step)).toEqual(["record", "purpose", "areas"]);
  });

  it("shows only the steps it is given, up to the map", () => {
    renderOverview({ steps: ["record", "purpose", "places"] });
    expect([...document.querySelectorAll("[data-step]")].map((el) => (el as HTMLElement).dataset.step)).toEqual(["record", "purpose", "places"]);
  });

  it("still drops the map from the steps it is given where the country has no outlines", () => {
    renderOverview({ geo: null, steps: ["record", "purpose", "places"] });
    expect([...document.querySelectorAll("[data-step]")].map((el) => (el as HTMLElement).dataset.step)).toEqual(["record", "purpose"]);
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
    measured(() => {
      const raf = vi.spyOn(window, "requestAnimationFrame");
      try {
        renderOverview();
        expect(raf).not.toHaveBeenCalled();
      } finally {
        raf.mockRestore();
      }
    });
  });
  it("redraws in place when a place or an area is chosen: the squares do not replay their move", () => {
    measured(() => {
      const { rerender } = render(overviewAt({}, "places"));
      const raf = vi.spyOn(window, "requestAnimationFrame");
      try {
        rerender(overviewAt({ place: "MN-043" }, "places"));
        expect(raf).not.toHaveBeenCalled();
      } finally {
        raf.mockRestore();
      }
    });
    cleanup();
    measured(() => {
      const { rerender } = render(overviewAt({}, "areas"));
      const raf = vi.spyOn(window, "requestAnimationFrame");
      try {
        rerender(overviewAt({ area: "g_restoration" }, "areas"));
        expect(raf).not.toHaveBeenCalled();
      } finally {
        raf.mockRestore();
      }
    });
  });

  it("selects a place from its block on the map, never a contract", () => {
    const onFocus = vi.fn();
    const onContract = vi.fn();
    render(overviewAt({}, "places", onFocus, onContract));
    const l = layoutField(buildField(SETUP.file), SETUP.file, { kind: "places", layer: "money", key: "" }, { w: 640, h: 480 }, { geo: GEO });
    const khovd = l.blocks.find((b) => b.code === "MN-043")!;
    fireEvent.click(document.querySelector(".ct-field")!, { clientX: khovd.x + khovd.w / 2, clientY: khovd.y + khovd.h / 2 });
    expect(onFocus).toHaveBeenCalledWith({ place: "MN-043" });
    expect(onContract).not.toHaveBeenCalled();
  });
  it("says so when all the money in focus names no single place, instead of 'No money'", () => {
    renderOverview({ step: "places", focus: { area: "g_sustainable" } });
    expect(within(step("places")).getByRole("heading", { level: 2 }).textContent).toBe(
      "100% of the money for Sustainable use names no single place",
    );
  });

  it("falls back to shares of the money where the record by place is missing", () => {
    const setup = setupFixture();
    delete setup.file.places;
    renderOverview({ step: "places", setup });
    expect(within(step("places")).getByRole("heading", { level: 2 }).textContent).toBe(
      "Khovd holds 64% of the money contracted mainly for nature or climate",
    );
    expect(document.body.textContent).not.toMatch(/per ₮100/);
  });

  it("tags the policy areas' targets table as an AI reading", () => {
    renderOverview({ step: "areas" });
    expect(within(step("areas")).getByText("AI reading: each contract compared with the targets")).toBeInTheDocument();
  });

  it("never leaves a sentence hanging when every strongly matching tender names no single place", () => {
    const setup = setupFixture();
    setup.file.contracts.push({ id: "x1", tender: "tx", year: 2025, tier: "principal", value: 1e9, title: "Subsidy reform study", translated: true, place: null, areas: {}, matches: ["C2"], misaligned: [] });
    renderOverview({ step: "places", setup, focus: { area: "none" } });
    fireEvent.click(within(within(step("places")).getByRole("group", { name: "What the map shows" })).getByRole("button", { name: "Strongly matching" }));
    expect(within(step("places")).getByRole("heading", { level: 2 }).textContent).toBe(
      "1 tender strongly matches targets with no policy area; 100% name no single place",
    );
  });

  it("offers 'No policy area' in the map's policy-area choice, and shows it when in focus", () => {
    renderOverview({ step: "places", focus: { area: "none" } });
    const select = within(step("places")).getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("none");
    expect(select.selectedOptions[0].textContent).toBe("No policy area");
  });

  it("lets the map change the lens as well", () => {
    const { onFocus } = renderOverview({ step: "places" });
    const lenses = within(step("places")).getByRole("group", { name: "Policy areas" });
    fireEvent.click(within(lenses).getByRole("button", { name: "Climate mitigation" }));
    expect(onFocus).toHaveBeenCalledWith({ lens: "ipcc", area: null });
  });

  it("names the targets behind a place's tenders, each a way to the target", () => {
    const { onTarget } = renderOverview({ step: "places", focus: { place: "none" } });
    fireEvent.click(within(within(step("places")).getByRole("group", { name: "What the map shows" })).getByRole("button", { name: "Potentially misaligned" }));
    const target = within(step("places")).getByRole("button", { name: /Shift freight to rail/ });
    expect(target.textContent).toContain("1 tender");
    fireEvent.click(target);
    expect(onTarget).toHaveBeenCalledWith("C1");
  });

  it("shows what the money is for already beside the years, an area a way to the focus", () => {
    const { onFocus } = renderOverview({ step: "purpose" });
    const areas = within(step("purpose")).getByRole("list", { name: "By policy area" });
    expect(within(areas).getAllByRole("button").map((b) => b.querySelector(".ct-rank-name")?.textContent)).toEqual([
      "Pollution management",
      "Restoration",
      "Sustainable use",
      "No policy area",
    ]);
    fireEvent.click(within(areas).getByRole("button", { name: /Restoration/ }));
    expect(onFocus).toHaveBeenCalledWith({ area: "g_restoration" });
  });

  it("names the page's focus in each step it shapes", () => {
    renderOverview({ focus: { doc: "C", place: "MN-043" } });
    for (const name of ["purpose", "places", "areas"]) {
      expect(within(step(name)).getByText("Focus: Document C · Khovd")).toBeInTheDocument();
    }
    expect(within(step("record")).queryByText(/Focus:/)).toBeNull();
  });
});

