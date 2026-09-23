import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { buildBriefData, type BriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { briefFixture } from "@/lib/brief/test-fixture";
import { MapSection } from "./sections/map";

const SOURCE = briefFixture();
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), "globe");

function renderMap(data: BriefData = DATA) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <MapSection data={data} />
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

  it("switches to alignment shading and numbers the commitments with the most aligned partners", () => {
    const { cell } = renderMap();
    fireEvent.click(screen.getByRole("radio", { name: "Alignment" }));
    expect(
      screen.getByRole("heading", {
        name: "Document A is the most closely aligned with the other documents: 75% of its comparisons, against 67% across all documents.",
      }),
    ).toBeTruthy();
    // A1 is aligned in all 12 of its comparisons: the top quarter.
    expect(cell("A1").getAttribute("data-step")).toBe("3");
    // A1-A4 are aligned with 12 commitments each, B1-B3 with 10: ranked by count.
    const key = screen.getAllByTestId("brief-map-key-row").map((row) => row.textContent);
    expect(key[0]).toContain("aligned with 12 commitments");
    expect(key[4]).toContain("Commitment B1");
    expect(key[4]).toContain("aligned with 10 commitments");
  });

  it("drops a selection whose commitment has left the brief instead of dimming the map", () => {
    const { cell, rerender } = renderMap();
    fireEvent.click(cell("B6"));
    const narrower = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "C"]), "globe");
    rerender(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <MapSection data={narrower} />
      </NextIntlClientProvider>,
    );
    const roles = screen.getAllByTestId("brief-cell").map((c) => c.getAttribute("data-role"));
    expect(roles.every((r) => r === null)).toBe(true);
  });

  it("states the overall share when no document is large enough to name", () => {
    const tiny = {
      ...SOURCE,
      commitments: ["X1", "X2", "X3", "Y1", "Y2", "Y3"].map((id) => ({ id, doc: id[0], label: id, text: `Text ${id}` })),
      documents: ["X", "Y"].map((id) => ({ id, code: id, name: `Doc ${id}`, full: id, color: "#000", count: 3, defaultOn: true })),
      // 9 comparisons X x Y, one of them a potential misalignment.
      comparisons: [0, 1, 2].flatMap((a) => [3, 4, 5].flatMap((b) => [a, b, a === 0 && b === 3 ? 4 : 1, 0])),
      lenses: [],
    };
    renderMap(buildBriefData(tiny, scopeOf(tiny, ["X", "Y"]), null));
    expect(
      screen.getByRole("heading", { name: "11% of comparisons show potential misalignment." }),
    ).toBeTruthy();
  });
});
