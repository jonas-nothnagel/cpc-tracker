"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Rect } from "./geometry";
import type { TourStep } from "./steps";

export interface ResolvedStep {
  step: TourStep;
  el: Element;
}

interface TourState {
  active: boolean;
  stepIndex: number;
  steps: ResolvedStep[];
}

type TourAction =
  | { type: "START"; steps: ResolvedStep[] }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "CLOSE" };

const IDLE: TourState = { active: false, stepIndex: 0, steps: [] };

function reducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "START":
      return { active: true, stepIndex: 0, steps: action.steps };
    case "NEXT":
      if (state.stepIndex >= state.steps.length - 1) return IDLE;
      return { ...state, stepIndex: state.stepIndex + 1 };
    case "BACK":
      return { ...state, stepIndex: Math.max(0, state.stepIndex - 1) };
    case "CLOSE":
      return IDLE;
  }
}

/**
 * Resolve declared steps against a scope root, dropping any whose
 * `data-tour` target is not currently rendered. Scoping matters: the same
 * centerpiece can be mounted twice (inline aside + expand overlay), so a
 * global document query could spotlight the wrong instance.
 */
export function resolveSteps(steps: TourStep[], root: Element | null): ResolvedStep[] {
  if (!root) return [];
  const resolved: ResolvedStep[] = [];
  for (const step of steps) {
    for (const target of [step.target, ...(step.altTargets ?? [])]) {
      const el = root.querySelector(`[data-tour="${target}"]`);
      if (el) {
        resolved.push({ step, el });
        break;
      }
    }
  }
  return resolved;
}

/** Step-navigation state machine for a guided tour. */
export function useTour() {
  const [state, dispatch] = useReducer(reducer, IDLE);

  const start = useCallback((steps: TourStep[], root: Element | null) => {
    const resolved = resolveSteps(steps, root);
    if (resolved.length > 0) dispatch({ type: "START", steps: resolved });
  }, []);

  const next = useCallback(() => dispatch({ type: "NEXT" }), []);
  const back = useCallback(() => dispatch({ type: "BACK" }), []);
  const close = useCallback(() => dispatch({ type: "CLOSE" }), []);

  const current: ResolvedStep | null = state.active
    ? (state.steps[state.stepIndex] ?? null)
    : null;

  return {
    active: state.active,
    stepIndex: state.stepIndex,
    steps: state.steps,
    current,
    start,
    next,
    back,
    close,
  };
}

/**
 * Track a target element's viewport rect while the tour is showing it.
 * Re-measures on window resize, any scroll (capture phase catches both the
 * page deck and inner scrollable lists), and target resizes (the
 * centerpieces are responsive SVGs). Measurement is rAF-throttled.
 * Calls `onDisconnect` when the target unmounts mid-tour (e.g. the sticky
 * aside swaps centerpieces) so the tour can end cleanly.
 */
export function useTargetRect(el: Element | null, onDisconnect: () => void): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  const frame = useRef(0);
  // Latest-callback ref, updated in an effect (not during render) so the
  // scroll/resize listeners always see the current handler.
  const onDisconnectRef = useRef(onDisconnect);
  useEffect(() => {
    onDisconnectRef.current = onDisconnect;
  });

  useEffect(() => {
    if (!el) {
      setRect(null);
      return;
    }

    const measure = () => {
      if (!el.isConnected) {
        onDisconnectRef.current();
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const schedule = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(el);

    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      observer.disconnect();
    };
  }, [el]);

  return rect;
}
