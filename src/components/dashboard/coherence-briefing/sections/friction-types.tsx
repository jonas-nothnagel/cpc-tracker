"use client";

/**
 * Friction-types — answers "what kind of friction?" by naming the dominant
 * mechanism (goal_conflict / resource_competition / delivery_friction) across
 * the corpus. Clicking a segment opens the FlagProfileDrawer, which decomposes
 * that mechanism into the documents, themes, and targets it plays out across
 * (replacing the old single cherry-picked example per type).
 *
 * Counts come from frictionTypeTotalsFromAlignment so this slide and the
 * profile drawer share one source of truth (alignment[].mechanism).
 */

import { useTranslations } from "next-intl";
import { SlideFrame } from "../slide-frame";
import { FrictionTypeChart } from "../centerpiece/friction-type-chart";
import { TourButton } from "../tour/tour-button";
import type { FrictionTypeTotals } from "@/lib/coherence-briefing";
import { useContradictionTypeLabels } from "@/lib/labels";
import type { AlignmentMechanism } from "@/types";

export const FRICTION_TYPES_SECTION_ID = "friction-types";

export function FrictionTypesSection({
  totals,
  onOpenType,
}: {
  totals: FrictionTypeTotals;
  onOpenType: (mechanism: AlignmentMechanism) => void;
}) {
  const t = useTranslations("briefing.frictionTypes");
  const labels = useContradictionTypeLabels();
  if (totals.total === 0) {
    return (
      <SlideFrame
        id={FRICTION_TYPES_SECTION_ID}
        eyebrow={t("emptyEyebrow")}
        headline={t("emptyHeadline")}
        body={t("emptyBody")}
      />
    );
  }

  return (
    <SlideFrame
      id={FRICTION_TYPES_SECTION_ID}
      eyebrow={t("eyebrow")}
      headline={composeHeadline(totals, t)}
      body={composeBody(totals, labels, t)}
      tourButton={
        <TourButton tourId="frictionTypes" scopeId={FRICTION_TYPES_SECTION_ID} />
      }
      evidence={
        <FrictionTypeChart totals={totals} onSegmentClick={onOpenType} />
      }
    />
  );
}

function composeHeadline(
  totals: FrictionTypeTotals,
  t: ReturnType<typeof useTranslations<"briefing.frictionTypes">>,
): string {
  switch (totals.dominantType) {
    case "goal_conflict":
      return t("headline.goalConflict");
    case "resource_competition":
      return t("headline.resourceCompetition");
    case "delivery_friction":
      return t("headline.deliveryFriction");
    default:
      return t("headline.mixed");
  }
}

function composeBody(
  totals: FrictionTypeTotals,
  labels: Record<AlignmentMechanism, string>,
  t: ReturnType<typeof useTranslations<"briefing.frictionTypes">>,
): string {
  const total = totals.total;
  if (!totals.dominantType) {
    return t("body.mixed", { total });
  }
  const pct = Math.round((totals[totals.dominantType] / total) * 100);
  const label = labels[totals.dominantType].toLowerCase();
  return t("body.dominant", { total, label, pct });
}
