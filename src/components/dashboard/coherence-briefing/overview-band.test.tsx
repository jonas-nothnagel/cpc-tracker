import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { buildOverviewTiles, OverviewBand } from "./overview-band";
import type { HeadlineVerdict } from "@/lib/coherence-briefing";
import type { FinancingCoherenceSummary } from "@/lib/financing-coherence";
import type { ImplementationCoverage } from "@/lib/implementation-coherence";

afterEach(cleanup);

const VERDICT: HeadlineVerdict = {
  bucket: "mixed",
  headline: "",
  signalPairs: 60,
  alignmentPairs: 42,
  tensionPairs: 17,
  tensionShare: 17 / 59,
};

const FINANCING = {
  totalTrackedExpenditure: 890.4,
  unit: "billion",
  currency: "MNT",
} as FinancingCoherenceSummary;

const IMPLEMENTATION = { totalActions: 148 } as ImplementationCoverage;

describe("buildOverviewTiles", () => {
  it("emits all five tiles, in reading order, when every source exists", () => {
    const tiles = buildOverviewTiles({
      verdict: VERDICT,
      financing: FINANCING,
      implementationCoverage: IMPLEMENTATION,
    });
    expect(tiles.map((t) => t.id)).toEqual([
      "corpus",
      "strong",
      "flagged",
      "finance",
      "implementation",
    ]);
    expect(tiles.map((t) => t.href)).toEqual([
      "#corpus",
      "#direction",
      "#friction-types",
      "#financing",
      "#implementation",
    ]);
  });

  it("takes its numbers from the header verdict, so the band can never disagree with the synthesis sentence", () => {
    const tiles = buildOverviewTiles({
      verdict: VERDICT,
      financing: null,
      implementationCoverage: null,
    });
    // Same formula the sentence prints: alignmentPairs / (alignmentPairs +
    // tensionPairs). 42 / 59 → 71%.
    expect(tiles.find((t) => t.id === "strong")?.pct).toBe(71);
    expect(tiles.find((t) => t.id === "flagged")?.count).toBe(17);
  });

  it("formats the finance tile as real money and counts reported actions", () => {
    const tiles = buildOverviewTiles({
      verdict: VERDICT,
      financing: FINANCING,
      implementationCoverage: IMPLEMENTATION,
    });
    expect(tiles.find((t) => t.id === "finance")?.money).toBe("890 billion MNT");
    expect(tiles.find((t) => t.id === "implementation")?.count).toBe(148);
  });

  it("drops the finance tile without a BER and the implementation tile without a BTR", () => {
    expect(
      buildOverviewTiles({
        verdict: VERDICT,
        financing: null,
        implementationCoverage: IMPLEMENTATION,
      }).map((t) => t.id),
    ).toEqual(["corpus", "strong", "flagged", "implementation"]);
    expect(
      buildOverviewTiles({
        verdict: VERDICT,
        financing: FINANCING,
        implementationCoverage: null,
      }).map((t) => t.id),
    ).toEqual(["corpus", "strong", "flagged", "finance"]);
    // The Sri Lanka shape: neither source, three tiles, no dead links.
    expect(
      buildOverviewTiles({
        verdict: VERDICT,
        financing: null,
        implementationCoverage: null,
      }).map((t) => t.id),
    ).toEqual(["corpus", "strong", "flagged"]);
  });
});

function renderBand({
  financing = null,
  implementationCoverage = null,
}: {
  financing?: FinancingCoherenceSummary | null;
  implementationCoverage?: ImplementationCoverage | null;
} = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OverviewBand
        countryName="Sri Lanka"
        targetCount={128}
        documentCount={6}
        tiles={buildOverviewTiles({
          verdict: VERDICT,
          financing,
          implementationCoverage,
        })}
      />
    </NextIntlClientProvider>,
  );
}

describe("OverviewBand", () => {
  it("renders the three data-independent tiles plus the Ask shortcut (Sri Lanka shape)", () => {
    renderBand();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "#corpus",
      "#direction",
      "#friction-types",
      "#explore",
    ]);
    expect(screen.getByText(/71%/)).toBeInTheDocument();
    expect(screen.getByText(/reach strong alignment/)).toBeInTheDocument();
    expect(screen.getByText("Ask a question")).toBeInTheDocument();
  });

  it("uses the guardrail vocabulary for the flagged side", () => {
    renderBand();
    expect(screen.getByText(/potential misalignments/)).toBeInTheDocument();
    expect(screen.queryByText(/tension|contradiction/i)).toBeNull();
  });

  it("shows the finance and implementation facts when the data exists", () => {
    renderBand({
      financing: FINANCING,
      implementationCoverage: IMPLEMENTATION,
    });
    expect(screen.getByText("890 billion MNT")).toBeInTheDocument();
    expect(screen.getByText(/reported actions/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Biodiversity Expenditure Review/ }),
    ).toHaveAttribute("href", "#financing");
    expect(
      screen.getByRole("link", { name: /Biennial Transparency Report/ }),
    ).toHaveAttribute("href", "#implementation");
  });
});
