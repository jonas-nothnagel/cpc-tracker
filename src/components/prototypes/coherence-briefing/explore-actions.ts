/**
 * Pure mapping between the chat/insight action vocabulary (ChatAction +
 * Insight.filter) and the Explore section's wheel state.
 *
 * Kept out of index.tsx so the dispatch logic is unit-testable and the
 * component only wires the resolved intent to its state setters. Both the
 * insight bar's "Show me" and (optionally) the chat's own navigation tools
 * feed through here, so the wheel reacts the same way whatever drove it.
 */

import type { ChatAction } from "@/lib/coherence-chat";
import type { PolicyDocumentType } from "@/types";
import type { WheelFilter } from "./centerpiece/wheel";

/**
 * Map the insight/chat filter vocabulary onto the Explore wheel's three-way
 * filter. The detectors and the chat both emit the legacy explorer strings
 * (all | high_medium | high_contra | high | contradictions); the briefing
 * wheel only knows all | alignments | tensions. Returns null for an
 * unrecognised string so the caller can ignore it cleanly.
 */
export function mapInsightFilterToWheelFilter(
  filter: string | undefined,
): WheelFilter | null {
  switch (filter) {
    case "all":
      return "all";
    case "contradictions":
    case "high_contra":
      return "tensions";
    case "high":
    case "high_medium":
      return "alignments";
    default:
      return null;
  }
}

export type ExploreIntent =
  | { kind: "filter"; filter: WheelFilter }
  | { kind: "doc"; id: PolicyDocumentType }
  | { kind: "sector"; id: string; taxonomyType: string }
  | { kind: "pair"; a: string; b: string }
  | { kind: "target"; id: string }
  | { kind: "none" };

export interface ResolveActionContext {
  availableDocs: PolicyDocumentType[];
  /** Category ids of the active lens, so a focus_category on a real category
   *  is told apart from one carrying a document id. */
  sectorCategoryIds: Set<string>;
  taxonomyType: string;
}

/**
 * Resolve a ChatAction (from an insight's "Show me" or from the chat's own
 * navigation tools) into a concrete Explore intent. Pure: returns what the
 * caller should do, never touches state. `set_mode` and `show_docs` have no
 * analogue in the chip-free Explore wheel (it auto-groups from focus, nothing
 * is hidden) so they resolve to "none".
 */
export function resolveExploreAction(
  action: ChatAction,
  ctx: ResolveActionContext,
): ExploreIntent {
  switch (action.type) {
    case "set_filter": {
      const filter = mapInsightFilterToWheelFilter(action.filter);
      return filter ? { kind: "filter", filter } : { kind: "none" };
    }
    case "focus_category": {
      if (
        ctx.availableDocs.includes(action.categoryId as PolicyDocumentType)
      ) {
        return { kind: "doc", id: action.categoryId as PolicyDocumentType };
      }
      if (ctx.sectorCategoryIds.has(action.categoryId)) {
        return {
          kind: "sector",
          id: action.categoryId,
          taxonomyType: ctx.taxonomyType,
        };
      }
      return { kind: "none" };
    }
    case "select_pair":
      return { kind: "pair", a: action.targetAId, b: action.targetBId };
    case "select_target":
      // The briefing wheel has no single-target focus, but the orchestrator
      // can refocus the target's source document and open its flag-profile
      // decomposition. Resolving here keeps that wiring out of the resolver.
      return { kind: "target", id: action.targetId };
    case "set_mode":
    case "show_docs":
      return { kind: "none" };
    default:
      return { kind: "none" };
  }
}
