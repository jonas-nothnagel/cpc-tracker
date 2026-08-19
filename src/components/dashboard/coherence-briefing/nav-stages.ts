/**
 * Jump-nav stage grouping (removable — see the rollback note below).
 *
 * WHY THIS EXISTS: "the organization of the information caused confusion" was
 * the most-cited complaint in the Panama focal-group session (23 Jul 2026),
 * 6 of 11. The briefing is nine sections scrolling past a sticky visual that
 * swaps underneath the reader, and the jump nav presented them as nine equal
 * chips with no indication that they answer three different questions.
 *
 * This groups the same nine sections, in the same order, under three named
 * stages plus Explore. It changes NOTHING about the sections themselves, the
 * scroll order, or the IntersectionObserver that tracks the active one: this
 * module is read only by the nav.
 *
 * ROLLBACK: export `SECTION_STAGES = null` and the nav renders the flat
 * nine-item list it rendered before. Full removal is deleting this file and its
 * single import in `index.tsx`.
 *
 * Stage names and captions live in the message catalog under `briefing.stages`,
 * never here, so all three locales stay in lockstep.
 */

import { DIRECTION_SECTION_ID } from "./sections/direction";
import { DOC_FOCUS_SECTION_ID } from "./sections/doc-focus";
import { DOC_PAIRS_SECTION_ID } from "./sections/doc-pairs";
import { FRICTION_TYPES_SECTION_ID } from "./sections/friction-types";
import { WHERE_TO_FOCUS_SECTION_ID } from "./sections/where-to-focus";
import { SECTORS_SECTION_ID } from "./sections/sectors";
import { FINANCING_SECTION_ID } from "./sections/financing";
import { IMPLEMENTATION_SECTION_ID } from "./sections/implementation";
import { EXPLORE_SECTION_ID } from "./sections/explore";

/** Message-catalog key segment under `briefing.stages`. */
export type StageId = "policies" | "friction" | "delivery" | "explore";

export interface NavStage {
  id: StageId;
  /** Sections belonging to this stage, in scroll order. */
  sections: string[];
}

/**
 * The grouping. Each stage answers one question:
 *   policies — what do the documents say, and how do they sit together?
 *   friction — where do they pull apart, and what is it about?
 *   delivery — is there money behind them, and is anything reported?
 *   explore  — everything the briefing did not pre-compute.
 *
 * Set to `null` to fall back to a flat nav.
 */
export const SECTION_STAGES: NavStage[] | null = [
  {
    id: "policies",
    sections: [DIRECTION_SECTION_ID, DOC_FOCUS_SECTION_ID, DOC_PAIRS_SECTION_ID],
  },
  {
    id: "friction",
    sections: [
      FRICTION_TYPES_SECTION_ID,
      WHERE_TO_FOCUS_SECTION_ID,
      SECTORS_SECTION_ID,
    ],
  },
  {
    id: "delivery",
    sections: [FINANCING_SECTION_ID, IMPLEMENTATION_SECTION_ID],
  },
  { id: "explore", sections: [EXPLORE_SECTION_ID] },
];

export interface ResolvedStage<T extends string> {
  id: StageId;
  /** Sections of this stage that are actually being rendered, in nav order. */
  sections: T[];
  /** Running position of each section in the whole nav, for the 01..09 numbers. */
  firstIndex: number;
}

/**
 * Project the sections a country actually renders onto the stages.
 *
 * `order` is already filtered (Financing drops without BER data, Implementation
 * without BTR), so a stage can come back empty — Sri Lanka has neither, which
 * empties "delivery" entirely — and empty stages are dropped rather than
 * rendered as a heading with nothing under it.
 *
 * Any section not claimed by a stage is appended as its own single-section
 * group, so adding a section to `SECTION_ORDER` without touching this file
 * still shows it in the nav rather than silently hiding it.
 */
export function resolveStages<T extends string>(
  order: T[],
): ResolvedStage<T>[] | null {
  if (!SECTION_STAGES) return null;

  const claimed = new Set(SECTION_STAGES.flatMap((s) => s.sections));
  const position = new Map(order.map((id, i) => [id, i]));
  const resolved: ResolvedStage<T>[] = [];

  for (const stage of SECTION_STAGES) {
    const sections = stage.sections.filter((id): id is T =>
      position.has(id as T),
    );
    if (sections.length === 0) continue;
    resolved.push({
      id: stage.id,
      sections,
      firstIndex: position.get(sections[0])!,
    });
  }

  for (const id of order) {
    if (claimed.has(id)) continue;
    resolved.push({
      id: "explore",
      sections: [id],
      firstIndex: position.get(id)!,
    });
  }

  return resolved.sort((a, b) => a.firstIndex - b.firstIndex);
}

/**
 * The sections that open each stage after the first, for the given visible
 * order. The briefing renders a stage-boundary marker above each of these
 * (Sri Lanka review, Aug 2026: readers wanted a visible transition between
 * areas). A country whose order drops a stage's first section moves the
 * marker to the stage's next visible section; a fully empty stage emits
 * none; with stages rolled back (`SECTION_STAGES = null`) the map is empty
 * and no markers render.
 */
export function stageMarkerSections<T extends string>(
  order: T[],
): Map<T, StageId> {
  const stages = resolveStages(order);
  const map = new Map<T, StageId>();
  if (stages) {
    for (const stage of stages.slice(1)) map.set(stage.sections[0], stage.id);
  }
  return map;
}
