"use client";

import { type RefObject } from "react";
import { useTranslations } from "next-intl";
import { TOUR_STEPS, type BriefingTourId } from "./steps";
import { TourOverlay } from "./tour-overlay";
import { useTour } from "./use-tour";

interface TourButtonProps {
  tourId: BriefingTourId;
  /** Element the tour's `data-tour` targets are resolved inside. */
  scopeRef?: RefObject<HTMLElement | null>;
  /**
   * Alternative scope: a DOM element id (e.g. a SlideFrame section id),
   * resolved at click time. Lets slide-level tours span both the `controls`
   * and `evidence` slots without threading a ref through SlideFrame.
   */
  scopeId?: string;
  className?: string;
}

/**
 * (i) button that launches the guided "How to read this chart" tour for a
 * briefing visualization. Follows the InfoBox trigger's visual language but
 * is a real <button> — these mount points are not nested in clickable
 * headings.
 */
export function TourButton({ tourId, scopeRef, scopeId, className = "" }: TourButtonProps) {
  const t = useTranslations("briefing.tour");
  const tour = useTour();

  return (
    <>
      <button
        type="button"
        onClick={() =>
          tour.start(
            TOUR_STEPS[tourId],
            scopeRef?.current ?? (scopeId ? document.getElementById(scopeId) : null),
          )
        }
        aria-label={t("openAria")}
        title={t("openAria")}
        className={`w-5 h-5 rounded-full text-caption font-semibold inline-flex items-center justify-center transition-colors cursor-pointer select-none ${
          tour.active
            ? "bg-[var(--undp-blue)] text-white"
            : "bg-gray-200 text-[var(--undp-gray)] hover:bg-[var(--undp-blue)]/10 hover:text-[var(--undp-blue)]"
        } ${className}`}
      >
        i
      </button>
      {tour.active && (
        <TourOverlay
          tourId={tourId}
          steps={tour.steps}
          stepIndex={tour.stepIndex}
          onNext={tour.next}
          onBack={tour.back}
          onClose={tour.close}
        />
      )}
    </>
  );
}
