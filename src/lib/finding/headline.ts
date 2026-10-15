import type { AlignmentLevel, AlignmentMechanism } from "@/types";

export interface HeadlineInput {
  level: AlignmentLevel;
  mechanism?: AlignmentMechanism;
  contestedResources?: string[];
  sharedContext?: string;
  sameDoc: boolean;
}

export interface FindingHeadline {
  /** Message key (relative to the `finding` namespace) for the claim sentence. */
  key: string;
  /** Message key for composing the {docs} placeholder. */
  docsKey: string;
  /** Extra placeholder values the sentence needs beyond {docs}. */
  values: { resources?: string; context?: string };
}

const ALIGNED_KEY: Record<Exclude<AlignmentLevel, "flagged">, string> = {
  high: "headline.alignedHigh",
  medium: "headline.alignedMedium",
  low: "headline.alignedLow",
  none: "headline.alignedNone",
};

/**
 * Pick the headline template for a pair. Deterministic selection over the
 * stored enum fields; the sentence itself lives in the message catalogs, so
 * nothing here is generated. Contested resources and shared context are
 * passed through verbatim (they are pipeline-extracted words).
 */
export function buildFindingHeadline(input: HeadlineInput): FindingHeadline {
  const docsKey = input.sameDoc ? "headline.docsSame" : "headline.docsPair";
  const values: FindingHeadline["values"] = {};

  if (input.level !== "flagged") {
    return { key: ALIGNED_KEY[input.level], docsKey, values };
  }

  switch (input.mechanism) {
    case "resource_competition": {
      const resources = (input.contestedResources ?? [])
        .map((r) => r.trim())
        .filter(Boolean);
      if (resources.length > 0) {
        values.resources = resources.join(", ");
        return { key: "headline.flaggedResourceNamed", docsKey, values };
      }
      return { key: "headline.flaggedResource", docsKey, values };
    }
    case "goal_conflict":
      return { key: "headline.flaggedGoal", docsKey, values };
    case "delivery_friction": {
      const context = input.sharedContext?.trim();
      if (context) {
        values.context = context;
        return { key: "headline.flaggedDeliveryContext", docsKey, values };
      }
      return { key: "headline.flaggedDelivery", docsKey, values };
    }
    default:
      return { key: "headline.flaggedGeneric", docsKey, values };
  }
}
