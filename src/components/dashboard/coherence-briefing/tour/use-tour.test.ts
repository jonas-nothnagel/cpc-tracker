import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { resolveSteps, useTour } from "./use-tour";
import type { TourStep } from "./steps";

const STEPS: TourStep[] = [
  { id: "one", target: "t-one" },
  { id: "two", target: "t-two" },
  { id: "three", target: "t-three" },
];

function host(targets: string[]): HTMLElement {
  const root = document.createElement("div");
  for (const t of targets) {
    const el = document.createElement("div");
    el.setAttribute("data-tour", t);
    root.appendChild(el);
  }
  return root;
}

describe("resolveSteps", () => {
  it("resolves each step to its data-tour element in declaration order", () => {
    const root = host(["t-two", "t-one", "t-three"]);
    const resolved = resolveSteps(STEPS, root);
    expect(resolved.map((r) => r.step.id)).toEqual(["one", "two", "three"]);
  });

  it("silently drops steps whose target is not rendered", () => {
    const root = host(["t-one", "t-three"]);
    const resolved = resolveSteps(STEPS, root);
    expect(resolved.map((r) => r.step.id)).toEqual(["one", "three"]);
  });

  it("returns nothing without a scope root", () => {
    expect(resolveSteps(STEPS, null)).toEqual([]);
  });

  it("only matches targets inside the scope root", () => {
    const outside = host(["t-one"]);
    document.body.appendChild(outside);
    const root = host(["t-two"]);
    expect(resolveSteps(STEPS, root).map((r) => r.step.id)).toEqual(["two"]);
    outside.remove();
  });
});

describe("resolveSteps with altTargets", () => {
  const FALLBACK_STEPS: TourStep[] = [
    { id: "delivery", target: "t-primary", altTargets: ["t-alt-a", "t-alt-b"] },
  ];

  it("prefers the primary target even when fallbacks are rendered", () => {
    const root = host(["t-alt-a", "t-primary"]);
    const resolved = resolveSteps(FALLBACK_STEPS, root);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].el.getAttribute("data-tour")).toBe("t-primary");
  });

  it("falls back through altTargets in declared order", () => {
    const root = host(["t-alt-b", "t-alt-a"]);
    const resolved = resolveSteps(FALLBACK_STEPS, root);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].el.getAttribute("data-tour")).toBe("t-alt-a");
  });

  it("drops the step when neither primary nor fallbacks resolve", () => {
    expect(resolveSteps(FALLBACK_STEPS, host(["t-unrelated"]))).toEqual([]);
  });
});

describe("useTour", () => {
  it("stays idle when no targets resolve", () => {
    const { result } = renderHook(() => useTour());
    act(() => result.current.start(STEPS, host([])));
    expect(result.current.active).toBe(false);
  });

  it("starts at the first step and advances with next()", () => {
    const { result } = renderHook(() => useTour());
    act(() => result.current.start(STEPS, host(["t-one", "t-two", "t-three"])));
    expect(result.current.active).toBe(true);
    expect(result.current.stepIndex).toBe(0);
    act(() => result.current.next());
    expect(result.current.stepIndex).toBe(1);
  });

  it("next() on the last step ends the tour", () => {
    const { result } = renderHook(() => useTour());
    act(() => result.current.start(STEPS, host(["t-one", "t-two"])));
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.active).toBe(false);
    expect(result.current.stepIndex).toBe(0);
  });

  it("back() stops at the first step", () => {
    const { result } = renderHook(() => useTour());
    act(() => result.current.start(STEPS, host(["t-one", "t-two"])));
    act(() => result.current.back());
    expect(result.current.active).toBe(true);
    expect(result.current.stepIndex).toBe(0);
  });

  it("close() resets to idle from any step", () => {
    const { result } = renderHook(() => useTour());
    act(() => result.current.start(STEPS, host(["t-one", "t-two"])));
    act(() => result.current.next());
    act(() => result.current.close());
    expect(result.current.active).toBe(false);
  });
});
