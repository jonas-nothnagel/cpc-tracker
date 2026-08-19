"use client";

/**
 * GuidedReadOffer — the briefing's first-visit orientation.
 *
 * WHY THIS EXISTS: the Panama focus group (23 Jul 2026) showed the barrier is
 * "quickly understanding what the results show", and that a live facilitator
 * intro fixes it (9 of 11 understood the purpose after one) while the
 * per-chart walkthroughs sat unused behind an unlabelled dot. This is that
 * intro, in product: a one-minute guided pass over the whole briefing —
 * what each part shows, why it matters, what to do with it — offered once
 * to first-time visitors and restartable any time from a labelled text
 * affordance.
 *
 * Form rules (DESIGN.md): the offer is an inline strip in the page flow,
 * never a modal — nothing is gated or dimmed, and the tour only runs when
 * the reader asks for it. The strip is a resting surface: hairline border,
 * no shadow; its primary button is square.
 *
 * State: a `cpc.*` localStorage flag (same pattern as
 * `cpc.briefing.primer-collapsed`) marks the offer as seen after any
 * decision — start, skip, or storage errors (treated as seen so the strip
 * never nags or breaks). Resolved in a mount effect, not a lazy
 * initializer, so server and first client render always agree; the strip
 * appears one frame after mount, which beats a hydration mismatch.
 *
 * Analytics calls are confined to this component (REMOVABLE SYSTEM:
 * src/lib/analytics/README.md).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { track } from "@/lib/analytics/client";
import { TOUR_STEPS } from "./steps";
import { TourOverlay } from "./tour-overlay";
import { useTour } from "./use-tour";

/** DOM id of the element the guided read's `data-tour` targets are resolved
 *  inside; the briefing sets it on its outermost content container. */
export const BRIEFING_SCOPE_ID = "coherence-briefing-scope";

const SEEN_KEY = "cpc.briefing.guided-read-seen";

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Blocked storage: treat as seen so the offer never nags or breaks.
    return true;
  }
}

function writeSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Best-effort only.
  }
}

export function GuidedReadOffer() {
  const t = useTranslations("briefing.guidedRead");
  const tour = useTour();
  // null until the seen flag resolves on the client; then offer or quiet.
  const [mode, setMode] = useState<null | "offer" | "quiet">(null);

  useEffect(() => {
    if (readSeen()) {
      setMode("quiet");
    } else {
      setMode("offer");
      track("guided_read_offer_shown");
    }
  }, []);

  const start = (source: "offer" | "affordance") => {
    writeSeen();
    track("guided_read_started", { source });
    tour.start(
      TOUR_STEPS.guidedRead,
      document.getElementById(BRIEFING_SCOPE_ID),
    );
    setMode("quiet");
  };

  const dismiss = () => {
    writeSeen();
    track("guided_read_dismissed", { source: "offer" });
    setMode("quiet");
  };

  const handleNext = () => {
    if (tour.stepIndex === tour.steps.length - 1) {
      track("guided_read_completed", { steps: tour.steps.length });
    }
    tour.next();
  };

  const handleClose = () => {
    track("guided_read_dismissed", {
      source: "tour",
      step: tour.stepIndex + 1,
    });
    tour.close();
  };

  return (
    <>
      {mode === "offer" && (
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border border-line bg-white px-4 py-3.5">
          <p className="min-w-[16rem] flex-1 text-body text-[var(--undp-black)]">
            {t("offerBody")}
          </p>
          <div className="flex items-center gap-4">
            {/* Square corners on purpose: the UNDP primary-action signature. */}
            <button
              type="button"
              onClick={() => start("offer")}
              className="inline-flex items-center bg-[var(--undp-blue)] px-4 py-2 text-data font-semibold text-white transition-colors hover:bg-[var(--undp-blue-dark)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--undp-blue)]"
            >
              {t("start")}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="text-caption text-[var(--undp-gray)] underline transition-colors hover:text-[var(--undp-black)]"
            >
              {t("skip")}
            </button>
          </div>
        </div>
      )}
      {/* The quiet affordance stays for everyone, labelled: a one-shot offer
          would recreate the unlabelled-dot problem one level up (only 6 of 11
          Panama participants felt they could return to the tool unaided). */}
      {mode === "quiet" && (
        <button
          type="button"
          onClick={() => start("affordance")}
          className="mt-4 text-caption text-[var(--undp-gray)] underline transition-colors hover:text-[var(--undp-black)]"
        >
          {t("reopen")}
        </button>
      )}
      {tour.active && (
        <TourOverlay
          tourId="guidedRead"
          steps={tour.steps}
          stepIndex={tour.stepIndex}
          onNext={handleNext}
          onBack={tour.back}
          onClose={handleClose}
        />
      )}
    </>
  );
}
