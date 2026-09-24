import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { briefFixture } from "@/lib/brief/test-fixture";
import { exploreReducer, initialExploreState, type ExploreState } from "@/lib/brief/explore/state";
import { Explore } from "./explore";

const SOURCE = briefFixture();
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), null);

const saved = { ctx: HTMLCanvasElement.prototype.getContext, fetch: globalThis.fetch };

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.fetch = vi.fn(async (url: string) => {
    const params = new URLSearchParams(String(url).split("?")[1]);
    const a = params.get("a")!;
    const b = params.get("b")!;
    const target = (id: string) => ({ id, text: `Verbatim text of commitment ${id}.`, sourceDocument: id[0], sourceLabel: id });
    return {
      ok: true,
      json: async () => ({
        pair: { targetAId: a, targetBId: b, alignment: "flagged", mechanism: "goal_conflict", description: "The AI's reading." },
        targetA: target(a),
        targetB: target(b),
      }),
    };
  }) as never;
});

afterEach(() => {
  cleanup();
  HTMLCanvasElement.prototype.getContext = saved.ctx;
  globalThis.fetch = saved.fetch;
});

function Harness({ initial }: { initial?: Partial<ExploreState> }) {
  const [state, dispatch] = useReducer(exploreReducer, { ...initialExploreState(), ...initial });
  return <Explore source={SOURCE} data={DATA} state={state} dispatch={dispatch} groups={["docs", "globe"]} />;
}

function renderExplore(initial?: Partial<ExploreState>) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <Harness initial={initial} />
    </NextIntlClientProvider>,
  );
}

const side = () => document.querySelector(".ex-side") as HTMLElement;

describe("Explore", () => {
  it("rests on the ring with the targets to review first and the strongest alignments", () => {
    renderExplore();
    expect(screen.getByRole("application", { name: /18 targets on a ring/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Targets to review first" })).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-review-row")).toHaveLength(6);
    expect(screen.getAllByTestId("explore-strong-row").length).toBeGreaterThan(0);
  });

  it("puts a ranked target in the centre and says how it reads against the rest", () => {
    renderExplore();
    const first = screen.getAllByTestId("explore-review-row")[0];
    fireEvent.click(within(first).getByRole("button"));
    // B6: aligned with 4 of its 12 comparisons, potential misalignment with 7.
    expect(within(side()).getByText(/Aligned with 4 of the 12 targets it was compared with\./)).toBeInTheDocument();
    expect(within(side()).getByText(/Potential misalignment with 7\./)).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-apart-row")).toHaveLength(7);
    expect(screen.queryAllByTestId("explore-strong-partner-row")).toHaveLength(0);
  });

  it("opens a comparison beside the ring and moves its other target to the centre", async () => {
    renderExplore({ focus: "B6" });
    const row = screen.getAllByTestId("explore-apart-row")[0];
    fireEvent.click(within(row).getByRole("button"));
    const pair = await screen.findByTestId("explore-pair");
    expect(await within(pair).findByText("The AI's reading.")).toBeInTheDocument();
    fireEvent.click(within(pair).getByRole("button", { name: "Put in the centre" }));
    // A6 is now in the centre: potential misalignment with all six B targets.
    expect(within(side()).getByText(/Aligned with 0 of the 12 targets/)).toBeInTheDocument();
    expect(within(side()).getByText(/Potential misalignment with 6\./)).toBeInTheDocument();
  });

  it("steps back to the target that was in the centre before", async () => {
    renderExplore({ focus: "B6" });
    fireEvent.click(within(screen.getAllByTestId("explore-apart-row")[0]).getByRole("button"));
    const pair = await screen.findByTestId("explore-pair");
    fireEvent.click(within(pair).getByRole("button", { name: "Put in the centre" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(within(side()).getByText(/Potential misalignment with 7\./)).toBeInTheDocument();
  });

  it("finds targets by their words and centres the one chosen", () => {
    renderExplore();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the targets" }), { target: { value: "b5" } });
    expect(screen.getByText("1 target matches.")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("explore-result-row")).getByRole("button"));
    // B5: strongly aligned with A1-A4, potential misalignment with A6 and C4-C6.
    expect(within(side()).getByText(/Potential misalignment with 4\./)).toBeInTheDocument();
  });

  it("moves from seat to seat by keyboard, centres one with Enter and opens its comparison with Space", async () => {
    renderExplore();
    const ring = screen.getByRole("application");
    ring.focus();
    fireEvent.keyDown(ring, { key: "ArrowRight" });
    fireEvent.keyDown(ring, { key: "Enter" });
    // A1: aligned with all 12 targets it was compared with, 6 of them strongly.
    expect(within(side()).getByText(/Aligned with 12 of the 12 targets/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Strong alignments (6)" })).toBeInTheDocument();
    // Six seats on is the first of B (sorted against A1): Space opens its comparison.
    for (let i = 0; i < 6; i++) fireEvent.keyDown(ring, { key: "ArrowRight" });
    fireEvent.keyDown(ring, { key: " " });
    expect(await screen.findByTestId("explore-pair")).toBeInTheDocument();
    fireEvent.keyDown(ring, { key: "Escape" });
    expect(screen.queryByTestId("explore-pair")).toBeNull();
    fireEvent.keyDown(ring, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Targets to review first" })).toBeInTheDocument();
  });

  it("switches kinds of lines on and off, with their counts for the target in the centre", () => {
    renderExplore({ focus: "A1" });
    const lines = screen.getByRole("group", { name: "Lines" });
    const strong = within(lines).getByRole("button", { name: /Strong alignment/ });
    const moderate = within(lines).getByRole("button", { name: /Moderate alignment/ });
    expect(strong).toHaveAttribute("aria-pressed", "true");
    expect(moderate).toHaveAttribute("aria-pressed", "false");
    expect(strong).toHaveTextContent("6");
    fireEvent.click(moderate);
    expect(moderate).toHaveAttribute("aria-pressed", "true");
  });

  it("groups the ring by a policy area lens on request", () => {
    renderExplore();
    const lens = screen.getByRole("button", { name: "Biodiversity" });
    fireEvent.click(lens);
    expect(lens).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("application", { name: /grouped by Biodiversity/ })).toBeInTheDocument();
  });
});
