import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { buildBriefData } from "@/lib/brief/data";
import { scopeOf } from "@/lib/brief/compute";
import { briefFixture } from "@/lib/brief/test-fixture";
import { Hub } from "./hub";

const SOURCE = briefFixture({ themes: true });
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), null);

// Steps become active as they cross the middle of the window.
const observed: { el: Element; cb: IntersectionObserverCallback }[] = [];
const saved = { io: globalThis.IntersectionObserver, ctx: HTMLCanvasElement.prototype.getContext };

beforeEach(() => {
  observed.length = 0;
  globalThis.IntersectionObserver = class {
    cb: IntersectionObserverCallback;
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb;
    }
    observe(el: Element) {
      observed.push({ el, cb: this.cb });
    }
    unobserve() {}
    disconnect() {}
  } as never;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  globalThis.IntersectionObserver = saved.io;
  HTMLCanvasElement.prototype.getContext = saved.ctx;
});

function renderHub(handlers = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <Hub data={DATA} {...handlers} />
    </NextIntlClientProvider>,
  );
}

function enter(step: string) {
  const entry = observed.find((o) => (o.el as HTMLElement).dataset.step === step);
  if (!entry) throw new Error(`no observed step ${step}`);
  act(() => entry.cb([{ target: entry.el, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
}

const stage = () => document.querySelector("[data-hub-stage]")?.getAttribute("data-hub-stage");

describe("Hub", () => {
  it("opens on the overall picture and lets the reader go to aligned or potential misalignment", () => {
    renderHub();
    expect(
      screen.getByRole("heading", {
        name: "Across Testland's policies, 67% of target pairs are aligned and 14% show potential misalignment.",
      }),
    ).toBeTruthy();
    expect(stage()).toBe("overview");
    fireEvent.click(screen.getByRole("button", { name: "67% aligned" }));
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    expect(scroll.mock.contexts.map((el) => (el as HTMLElement).dataset.step)).toContain("reinforce");
  });

  it("re-forms the dots for the step in view", () => {
    renderHub();
    enter("reinforce");
    expect(stage()).toBe("reinforce");
    enter("apart");
    expect(stage()).toBe("apart");
  });

  it("lists the strongest alignments with their strong links", () => {
    renderHub();
    const step = document.querySelector('[data-step="reinforce"]') as HTMLElement;
    const rows = within(step).getAllByTestId("hub-strong-row");
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toContain("Commitment C1");
    expect(within(rows[0]).getByText("8")).toBeTruthy();
  });

  it("shows what kind of potential misalignment and the targets with the most", () => {
    renderHub();
    const step = document.querySelector('[data-step="apart"]') as HTMLElement;
    expect(within(step).getByText("Competing for resources")).toBeTruthy();
    const rows = within(step).getAllByTestId("hub-apart-row");
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toContain("Commitment B6");
  });

  it("builds the wheel around the document the reader picks", () => {
    renderHub();
    enter("documents");
    expect(stage()).toBe("doc:A");
    const step = document.querySelector('[data-step="documents"]') as HTMLElement;
    const rowB = within(step).getAllByTestId("brief-doc-row").find((r) => r.getAttribute("data-doc") === "B")!;
    fireEvent.click(within(rowB).getByRole("button", { expanded: false }));
    expect(stage()).toBe("doc:B");
  });
});
