import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { layoutAreaField } from "@/lib/brief/area-layout";
import { AreaField } from "./area-field";

const W = 212;
const saved = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  ctx: HTMLCanvasElement.prototype.getContext,
};

// jsdom lays nothing out: give the field a width and no canvas.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => W });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

afterEach(() => {
  cleanup();
  if (saved.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", saved.w);
  HTMLCanvasElement.prototype.getContext = saved.ctx;
});

const ROWS = [
  { id: "r1", targets: ["a", "b"] },
  { id: "r2", targets: ["c"] },
];
const REST = new Map([
  ["a", 4],
  ["b", 0],
  ["c", 0],
]);

function renderField(overrides: Partial<Parameters<typeof AreaField>[0]> = {}) {
  const onPick = vi.fn();
  const { container } = render(
    <AreaField
      rows={ROWS}
      restClouds={REST}
      clouds={REST}
      inks={new Map()}
      side="apart"
      rowLabel={(id) => `row ${id}`}
      marked={new Set()}
      dimmed={new Set()}
      pointed={null}
      tipFor={(id) => `target ${id}`}
      formatCount={(n) => String(n)}
      onPick={onPick}
      {...overrides}
    />,
  );
  return { onPick, field: container.querySelector(".brief-av-field") as HTMLElement };
}

describe("AreaField", () => {
  it("names every row in the order given, marking and setting back the rows asked for", () => {
    renderField({ marked: new Set(["r2"]), dimmed: new Set(["r1"]) });
    const rows = [...document.querySelectorAll("[data-row]")];
    expect(rows.map((r) => r.textContent)).toEqual(["row r1", "row r2"]);
    expect(rows[1].getAttribute("data-marked")).toBe("true");
    expect(rows[0].getAttribute("data-dim")).toBe("true");
    expect(rows[0].getAttribute("data-marked")).toBeNull();
  });

  it("names the target under the pointer and hands it on when selected", () => {
    const { field, onPick } = renderField();
    const a = layoutAreaField(ROWS, REST, W).at.get("a")!;
    fireEvent.pointerMove(field, { clientX: a.x, clientY: a.y - 2 });
    expect(screen.getByRole("presentation").textContent).toBe("target a");
    fireEvent.click(field, { clientX: a.x, clientY: a.y - 2 });
    expect(onPick).toHaveBeenCalledWith("a");
    fireEvent.pointerLeave(field);
    expect(screen.queryByRole("presentation")).toBeNull();
  });

  it("says the exact count above a cloud cut at its limit", () => {
    const clouds = new Map([
      ["a", 211],
      ["b", 0],
      ["c", 0],
    ]);
    renderField({ restClouds: clouds, clouds });
    expect(document.querySelector('[data-cut="a"]')?.textContent).toBe("211");
    expect(document.querySelector('[data-cut="b"]')).toBeNull();
  });
});
