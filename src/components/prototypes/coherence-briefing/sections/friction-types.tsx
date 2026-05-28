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

import { SlideFrame } from "../slide-frame";
import { FrictionTypeChart } from "../centerpiece/friction-type-chart";
import type { FrictionTypeTotals } from "@/lib/coherence-briefing";
import { CONTRADICTION_TYPE_LABELS } from "@/lib/utils";
import type { AlignmentMechanism } from "@/types";

export const FRICTION_TYPES_SECTION_ID = "friction-types";

export function FrictionTypesSection({
  totals,
  onOpenType,
}: {
  totals: FrictionTypeTotals;
  onOpenType: (mechanism: AlignmentMechanism) => void;
}) {
  if (totals.total === 0) {
    return (
      <SlideFrame
        id={FRICTION_TYPES_SECTION_ID}
        eyebrow="What kind of friction?"
        headline="No flagged pairs to characterise yet."
        body="Once the pipeline flags pairs for review, the kind of friction (goal / resource / delivery) shows up here."
      />
    );
  }

  return (
    <SlideFrame
      id={FRICTION_TYPES_SECTION_ID}
      eyebrow="What kind of friction?"
      headline={composeHeadline(totals)}
      body={composeBody(totals)}
      evidence={
        <FrictionTypeChart totals={totals} onSegmentClick={onOpenType} />
      }
    />
  );
}

function composeHeadline(t: FrictionTypeTotals): string {
  switch (t.dominantType) {
    case "goal_conflict":
      return "Most flagged pairs are goal conflicts, not resource competition.";
    case "resource_competition":
      return "Resource competition drives most of the flagged friction.";
    case "delivery_friction":
      return "Most friction is operational, not fundamental.";
    default:
      return "Friction takes three forms across the policy set.";
  }
}

function composeBody(t: FrictionTypeTotals): string {
  const total = t.total;
  if (!t.dominantType) {
    return `${total.toLocaleString()} flagged pairs split across the three mechanisms. Click any segment to see how those pairs break down.`;
  }
  const pct = Math.round((t[t.dominantType] / total) * 100);
  const label = CONTRADICTION_TYPE_LABELS[t.dominantType].toLowerCase();
  return `Of ${total.toLocaleString()} flagged pairs, ${label} accounts for ${pct}%. Click any segment to see how those pairs break down by document, theme, and target.`;
}
