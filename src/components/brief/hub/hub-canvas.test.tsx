import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { hubParticles, layoutHub } from "@/lib/brief/hub";
import { briefFixture } from "@/lib/brief/test-fixture";
import { HubCanvas, type HubTarget } from "./hub-canvas";

const SOURCE = briefFixture({ themes: true });
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), null);
const W = 800;
const H = 500;

// jsdom lays nothing out: give the field a size so its groups exist.
const sizes = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  h: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
  ctx: HTMLCanvasElement.prototype.getContext,
};

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => W });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => H });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

afterEach(() => {
  cleanup();
  if (sizes.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", sizes.w);
  if (sizes.h) Object.defineProperty(HTMLElement.prototype, "clientHeight", sizes.h);
  HTMLCanvasElement.prototype.getContext = sizes.ctx;
});

const tipFor = ({ group, part }: HubTarget) => `${group.key}${part ? ` | ${part.key}` : ""}`;

describe("HubCanvas", () => {
  it("names the part under the pointer, and forgets it when the step changes", () => {
    const layout = layoutHub({ kind: "reinforce" }, hubParticles(DATA), DATA, W, H);
    const part = layout.groups[0].parts![0];
    const { container, rerender } = render(
      <HubCanvas data={DATA} stage={{ kind: "reinforce" }} labelFor={() => null} tipFor={tipFor} />,
    );
    const field = container.querySelector(".brief-hub-canvas") as HTMLElement;
    fireEvent.pointerMove(field, { clientX: (part.x0 + part.x1) / 2, clientY: (part.y0 + part.y1) / 2 });
    expect(screen.getByRole("presentation").textContent).toBe("Shared land restoration | A<->C");
    // The dots re-form for the next step under a still pointer: the old
    // name must not be read against the new step's groups.
    rerender(<HubCanvas data={DATA} stage={{ kind: "strong" }} labelFor={() => null} tipFor={tipFor} />);
    expect(screen.queryByRole("presentation")).toBeNull();
  });
});
