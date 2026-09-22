import { describe, expect, it } from "vitest";
import en from "../../../../../messages/en.json";
import { TOUR_STEPS } from "./steps";

/**
 * Code→catalog check: every declared tour step must have its title and body
 * in the message catalog. The locale-parity test keeps en/es/mn in lockstep
 * with each other, but nothing else keeps steps.ts in lockstep with en.json;
 * a renamed step id would otherwise surface as a runtime MISSING_MESSAGE.
 */
describe("tour step copy", () => {
  const catalog = en.briefing.tour as Record<
    string,
    { steps?: Record<string, { title?: string; body?: string }> }
  >;

  it("every step of every tour has a title and body in en.json", () => {
    for (const [tourId, steps] of Object.entries(TOUR_STEPS)) {
      const entries = catalog[tourId]?.steps;
      expect(entries, `briefing.tour.${tourId}.steps`).toBeTruthy();
      for (const step of steps) {
        const entry = entries?.[step.id];
        expect(
          entry?.title,
          `briefing.tour.${tourId}.steps.${step.id}.title`,
        ).toBeTruthy();
        expect(
          entry?.body,
          `briefing.tour.${tourId}.steps.${step.id}.body`,
        ).toBeTruthy();
      }
    }
  });
});
