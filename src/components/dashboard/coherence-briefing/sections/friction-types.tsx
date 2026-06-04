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
  const labels = useContradictionTypeLabels();
  if (totals.total === 0) {
    return (
      <SlideFrame
        id={FRICTION_TYPES_SECTION_ID}
        eyebrow="What kind of misalignment?"
        headline="No potential misalignment to characterise yet."
        body="Once the pipeline surfaces potential misalignment, the kind (conflicting goals, competing resources, or delivery) shows up here."
      />
    );
  }

  return (
    <SlideFrame
      id={FRICTION_TYPES_SECTION_ID}
      eyebrow="What kind of friction?"
      headline={composeHeadline(totals)}
      body={composeBody(totals, labels)}
      evidence={
        <FrictionTypeChart totals={totals} onSegmentClick={onOpenType} />
      }
    />
  );
}

function composeHeadline(t: FrictionTypeTotals): string {
  switch (t.dominantType) {
    case "goal_conflict":
      return "Most potential misalignment is conflicting goals, not competition for resources.";
    case "resource_competition":
      return "Most potential misalignment is competition for resources.";
    case "delivery_friction":
      return "Most potential misalignment is about delivery, not the goals themselves.";
    default:
      return "Potential misalignment takes three forms across the policy set.";
  }
}

function composeBody(
  t: FrictionTypeTotals,
  labels: Record<AlignmentMechanism, string>,
): string {
  const total = t.total;
  if (!t.dominantType) {
    return `${total.toLocaleString()} potentially misaligned pairs split across the three types. Click any segment to see how those pairs break down.`;
  }
  const pct = Math.round((t[t.dominantType] / total) * 100);
  const label = labels[t.dominantType].toLowerCase();
  return `Of ${total.toLocaleString()} potentially misaligned pairs, ${label} accounts for ${pct}%. Click any segment to see how those pairs break down by document, theme, and target.`;
}
