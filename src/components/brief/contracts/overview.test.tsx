import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { setupFixture } from "@/lib/brief/contracts/test-fixture";
import type { GeoFile } from "@/lib/brief/contracts/geo";
import type { LensKey } from "@/lib/brief/contracts/model";
import { CurrencyProvider } from "./money";
import { Overview } from "./overview";

const GEO: GeoFile = {
  source: "test",
  features: [
    {
      code: "MN-043",
      name: "Khovd",
      point: [91, 47],
      rings: [
        [
          [90, 46],
          [92, 46],
          [92, 48],
          [90, 48],
          [90, 46],
        ],
      ],
    },
    {
      code: "MN-1",
      name: "Ulaanbaatar",
      point: [106.5, 47.5],
      rings: [
        [
          [106, 47],
          [107, 47],
          [107, 48],
          [106, 48],
          [106, 47],
        ],
      ],
    },
  ],
};

function renderOverview(
  opts: {
    geo?: GeoFile | null;
    lens?: LensKey;
    onLens?: (l: LensKey) => void;
    onContract?: (id: string) => void;
  } = {},
) {
  const onContract = opts.onContract ?? vi.fn();
  const onLens = opts.onLens ?? vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <div data-brief>
        <Overview
          setup={setupFixture()}
          geo={opts.geo === undefined ? GEO : opts.geo}
          lens={opts.lens ?? "globe"}
          onLens={onLens}
          onContract={onContract}
          onTarget={vi.fn()}
        />
      </div>
    </NextIntlClientProvider>,
  );
  return { ...utils, onContract, onLens };
}

afterEach(cleanup);

describe("Overview", () => {
  it("walks from the record to where it lands, each step named", () => {
    renderOverview();
    for (const kicker of ["The record", "For nature and climate", "Toward each policy area", "Where it lands"]) {
      expect(screen.getByText(kicker)).toBeInTheDocument();
    }
  });

  it("drops the map step where the country has no outlines", () => {
    renderOverview({ geo: null });
    expect(screen.queryByText("Where it lands")).toBeNull();
  });

  it("states the record and its share for nature or climate in numbers", () => {
    renderOverview();
    expect(
      screen.getByRole("heading", {
        name: "₮250 billion in 40 public contracts since 2024",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "₮8.8 of every ₮100 was contracted for work mainly for nature or climate",
      }),
    ).toBeInTheDocument();
  });

  it("states the same findings in US$ when the reader chooses it", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-brief>
          <CurrencyProvider currency="usd" rate={3500}>
            <Overview setup={setupFixture()} geo={GEO} lens="globe" onLens={vi.fn()} onContract={vi.fn()} onTarget={vi.fn()} />
          </CurrencyProvider>
        </div>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "US$71.4 million in 40 public contracts since 2024" })).toBeInTheDocument();
    expect(screen.getByText(/About ₮250 billion\./)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "US$8.8 of every US$100 was contracted for work mainly for nature or climate" }),
    ).toBeInTheDocument();
  });

  it("names the policy area with most targets and least money, per lens", () => {
    const { rerender } = renderOverview();
    expect(
      screen.getByRole("heading", {
        name: "Sustainable use holds 3 of the 6 targets and 9% of the money contracted mainly for nature or climate",
      }),
    ).toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-brief>
          <Overview
            setup={setupFixture()}
            geo={GEO}
            lens="ipcc"
            onLens={vi.fn()}
            onContract={vi.fn()}
            onTarget={vi.fn()}
          />
        </div>
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("heading", {
        name: "Waste draws 45% of the money contracted mainly for nature or climate, with 1 target",
      }),
    ).toBeInTheDocument();
  });

  it("switches the lens from its plain-text control", () => {
    const { onLens } = renderOverview();
    fireEvent.click(screen.getByRole("button", { name: "Mitigation sectors" }));
    expect(onLens).toHaveBeenCalledWith("ipcc");
  });

  it("opens the example contract in full", () => {
    const { onContract } = renderOverview();
    fireEvent.click(screen.getByRole("button", { name: /See one contract in full/ }));
    expect(onContract).toHaveBeenCalledWith("p1");
  });

  it("marks a title not yet translated, as Mongolian, wherever a contract is listed", () => {
    const setup = setupFixture();
    const p4 = setup.file.contracts.find((c) => c.id === "p4")!;
    p4.title = "Бэлчээр хамгаалах";
    p4.translated = false;
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-brief>
          <Overview setup={setup} geo={GEO} lens="globe" onLens={vi.fn()} onContract={vi.fn()} onTarget={vi.fn()} />
        </div>
      </NextIntlClientProvider>,
    );
    const title = screen.getByText("Бэлчээр хамгаалах");
    expect(title).toHaveAttribute("lang", "mn");
    expect(title.closest("button")?.textContent).toContain("not yet translated");
  });

  it("highlights nothing at rest, and a picked area's name once picked", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-brief>
          <Overview
            setup={setupFixture()}
            geo={GEO}
            lens="globe"
            onLens={vi.fn()}
            onContract={vi.fn()}
            onTarget={vi.fn()}
            initialStep="areas"
          />
        </div>
      </NextIntlClientProvider>,
    );
    const names = document.querySelectorAll(".ct-label-button");
    expect(names.length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".ct-label-button[data-lit]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Restoration" }));
    const lit = document.querySelectorAll(".ct-label-button[data-lit]");
    expect(lit).toHaveLength(1);
    expect(lit[0].textContent).toBe("Restoration");
  });

  it("names the field as an image on its canvas, its names as buttons outside the image", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-brief>
          <Overview setup={setupFixture()} geo={GEO} lens="globe" onLens={vi.fn()} onContract={vi.fn()} onTarget={vi.fn()} initialStep="areas" />
        </div>
      </NextIntlClientProvider>,
    );
    const image = screen.getByRole("img", { name: /squares of ₮5 billion/ });
    expect(image.tagName).toBe("CANVAS");
    const name = screen.getByRole("button", { name: "Restoration" });
    expect(name.closest("[role='img']")).toBeNull();
    expect(document.querySelector(".ct-field [role='status']")).toBeNull();
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

  it("lists the largest contracts of the area in the finding", () => {
    renderOverview();
    const item = screen.getByRole("button", { name: /Contract p4/ });
    expect(item).toBeInTheDocument();
  });
});
