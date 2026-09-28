import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { setupFixture } from "@/lib/brief/contracts/test-fixture";
import type { GeoFile } from "@/lib/brief/contracts/geo";
import type { LensKey } from "@/lib/brief/contracts/model";
import { Overview } from "./overview";

const GEO: GeoFile = {
  source: "test",
  features: [
    { code: "MN-043", name: "Khovd", point: [91, 47], rings: [[[90, 46], [92, 46], [92, 48], [90, 48], [90, 46]]] },
    { code: "MN-1", name: "Ulaanbaatar", point: [106.5, 47.5], rings: [[[106, 47], [107, 47], [107, 48], [106, 48], [106, 47]]] },
  ],
};

function renderOverview(opts: { geo?: GeoFile | null; lens?: LensKey; onLens?: (l: LensKey) => void; onContract?: (id: string) => void } = {}) {
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
    expect(screen.getByRole("heading", { name: "₮250 billion in 40 public contracts since 2024" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "₮8.8 of every ₮100 was contracted for work mainly for nature or climate" })).toBeInTheDocument();
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
          <Overview setup={setupFixture()} geo={GEO} lens="ipcc" onLens={vi.fn()} onContract={vi.fn()} onTarget={vi.fn()} />
        </div>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Waste draws 45% of the money contracted mainly for nature or climate, with 1 target" })).toBeInTheDocument();
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

  it("lists the largest contracts of the area in the finding", () => {
    renderOverview();
    const item = screen.getByRole("button", { name: /Contract p4/ });
    expect(item).toBeInTheDocument();
  });
});
