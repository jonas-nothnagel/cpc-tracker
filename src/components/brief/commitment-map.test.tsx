import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { briefFixture } from "@/lib/brief/test-fixture";
import { MapSection } from "./sections/map";

const SOURCE = briefFixture();
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), "globe");

function renderMap() {
  const view = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <MapSection data={DATA} />
    </NextIntlClientProvider>,
  );
  const cell = (id: string) => view.container.querySelector(`[data-id="${id}"]`) as Element;
  return { ...view, cell };
}

afterEach(cleanup);

describe("MapSection", () => {
  it("draws one cell per commitment, shaded by its potential misalignments", () => {
    const { cell } = renderMap();
    expect(screen.getAllByTestId("brief-cell")).toHaveLength(18);
    expect(cell("A1").getAttribute("data-step")).toBe("0");
    expect(cell("C4").getAttribute("data-step")).toBe("1"); // 2
    expect(cell("B5").getAttribute("data-step")).toBe("2"); // 4
    expect(cell("B6").getAttribute("data-step")).toBe("3"); // 7
  });

  it("names the document where the shading gathers, against the average", () => {
    renderMap();
    expect(
      screen.getByRole("heading", {
        name: "Potential misalignment gathers in Document B: 21% of its comparisons, against 14% across all documents.",
      }),
    ).toBeTruthy();
  });

  it("numbers the five most involved commitments and lists them in order", () => {
    renderMap();
    const key = screen.getAllByTestId("brief-map-key-row").map((row) => row.textContent);
    expect(key).toHaveLength(5);
    expect(key[0]).toContain("6 Commitment B6");
    expect(key[1]).toContain("6 Commitment A6");
    expect(key[2]).toContain("5 Commitment B5");
    expect(key[3]).toContain("4 Commitment C4");
    expect(key[4]).toContain("5 Commitment C5");
  });

  it("lights up a selected commitment's partners by tone and dims the rest", () => {
    const { cell } = renderMap();
    fireEvent.click(cell("B6"));
    expect(cell("B6").getAttribute("data-role")).toBe("selected");
    expect(cell("A6").getAttribute("data-role")).toBe("apart");
    expect(cell("C1").getAttribute("data-role")).toBe("apart");
    expect(cell("A1").getAttribute("data-role")).toBe("reinforce");
    expect(cell("A5").getAttribute("data-role")).toBe("dim");
    expect(cell("B1").getAttribute("data-role")).toBe("dim");
  });

  it("moves between commitments with the arrow keys and selects with Enter", () => {
    const { cell } = renderMap();
    const map = screen.getByRole("application");
    fireEvent.focus(map);
    fireEvent.keyDown(map, { key: "ArrowRight" });
    expect(cell("A2").getAttribute("data-focused")).toBe("true");
    fireEvent.keyDown(map, { key: "Enter" });
    expect(cell("A2").getAttribute("data-role")).toBe("selected");
  });

  it("switches to reinforcement shading", () => {
    const { cell } = renderMap();
    fireEvent.click(screen.getByRole("radio", { name: "Reinforcing links" }));
    expect(
      screen.getByRole("heading", {
        name: "Document A reinforces the other documents most: 75% of its comparisons, against 67% across all documents.",
      }),
    ).toBeTruthy();
    // A1 reinforces all 12 of its comparisons: the top quarter.
    expect(cell("A1").getAttribute("data-step")).toBe("3");
  });
});
