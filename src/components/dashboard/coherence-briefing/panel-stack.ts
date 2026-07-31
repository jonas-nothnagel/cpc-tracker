/**
 * The briefing's detail panels, modelled as one back-navigable stack.
 *
 * Every drill-down in the briefing opens a right-hand panel: a target pair, a
 * document pair, a theme, a sector, a friction type, a single target, or one
 * document's targets. Those used to be five independent pieces of state, so
 * moving between them destroyed the one you came from and there was no way back
 * short of closing the panel and finding your place on the page again. They are
 * now entries on a single stack: opening from the page starts a fresh trail,
 * drilling deeper pushes, and back pops.
 *
 * Entries are identifiers, never resolved objects. The briefing recomputes every
 * number from the currently visible targets and alignment, so a panel that
 * captured a pair list or a storyline at push time would keep showing it after
 * the reader toggles a document off. Ids re-resolve on each render, which also
 * makes the stack cheap to compare and straightforward to test.
 */

import type { AlignmentMechanism, PolicyDocumentType } from "@/types";

export type BriefingPanel =
  /** One target compared with one other. Order is the reading order the opener
   *  chose (reported action first, budget line first) and is never normalised. */
  | { kind: "target-pair"; aId: string; bId: string }
  | { kind: "doc-pair"; docA: PolicyDocumentType; docB: PolicyDocumentType }
  | { kind: "theme"; name: string }
  /** Dormant: the Direction slide lists every theme inline, so nothing opens
   *  this today. Kept because ThemeDrawer still renders the grid, and picking
   *  from it now pushes a theme rather than replacing the panel. */
  | { kind: "all-storylines" }
  | {
      kind: "sector";
      categoryId: string;
      categoryName: string;
      taxonomyType: string;
    }
  /** Every potentially misaligned pair of one mechanism, optionally scoped to
   *  one document's cross-document pairs. */
  | { kind: "friction-type"; mechanism: AlignmentMechanism; doc?: PolicyDocumentType }
  | { kind: "target-profile"; targetId: string }
  | { kind: "doc-targets"; doc: PolicyDocumentType };

/**
 * Stable identity of a panel. Drives duplicate detection, React keys, and the
 * shell's "the subject changed, move focus and scroll to top" signal.
 *
 * Document pairs are unordered (NDC↔NBSAP is the same panel as NBSAP↔NDC).
 * Target pairs are ordered, because which target reads first is a deliberate
 * choice at the call site. Sector keys omit categoryName: it is a display label
 * for the same id, and including it would make a locale change look like a
 * different panel.
 */
export function panelKey(panel: BriefingPanel): string {
  switch (panel.kind) {
    case "target-pair":
      return `target-pair:${panel.aId}|${panel.bId}`;
    case "doc-pair": {
      const [a, b] = [panel.docA, panel.docB].sort();
      return `doc-pair:${a}|${b}`;
    }
    case "theme":
      return `theme:${panel.name}`;
    case "all-storylines":
      return "all-storylines";
    case "sector":
      return `sector:${panel.taxonomyType}|${panel.categoryId}`;
    case "friction-type":
      return `friction-type:${panel.mechanism}|${panel.doc ?? ""}`;
    case "target-profile":
      return `target-profile:${panel.targetId}`;
    case "doc-targets":
      return `doc-targets:${panel.doc}`;
  }
}

export function panelsEqual(a: BriefingPanel, b: BriefingPanel): boolean {
  return panelKey(a) === panelKey(b);
}

/** Start a fresh trail. A click on the page always resets rather than deepens:
 *  the reader jumped somewhere new, so "back" should not walk a route they have
 *  already left. */
export function openPanel(panel: BriefingPanel): BriefingPanel[] {
  return [panel];
}

/** Drill one level deeper. Re-opening what is already on top is a no-op, so a
 *  panel never gets a back row pointing at itself. */
export function pushPanel(
  stack: BriefingPanel[],
  panel: BriefingPanel,
): BriefingPanel[] {
  const top = stack[stack.length - 1];
  if (top && panelsEqual(top, panel)) return stack;
  return [...stack, panel];
}

/** Step back one level. Returns the same array at the root so React can skip
 *  the render. */
export function popPanel(stack: BriefingPanel[]): BriefingPanel[] {
  return stack.length > 1 ? stack.slice(0, -1) : stack;
}

/**
 * Which `briefing.drawer.backTo.*` message describes stepping back to `panel`.
 *
 * Four of these render as "Back to {name}" in English and could collapse into
 * one key. They stay separate because Mongolian attaches a case particle that
 * depends on the noun being referred to, so a single shared key would force one
 * wrong ending. Do not merge them.
 */
export function backLabelKey(panel: BriefingPanel): string {
  switch (panel.kind) {
    case "target-pair":
      return "targetPair";
    case "doc-pair":
      return "docPair";
    case "theme":
      return "theme";
    case "all-storylines":
      return "allThemes";
    case "sector":
      return "sector";
    case "friction-type":
      return "frictionType";
    case "target-profile":
      return "target";
    case "doc-targets":
      return "docTargets";
  }
}

/**
 * The `kind` reported to analytics. The first five values are the ones already
 * emitted before the stack existed, kept byte-for-byte so historical
 * `drawer_opened` counts stay comparable.
 *
 * Note for whoever extends DRAWER_KIND_SECTION: "friction-type",
 * "target-profile" and "doc-targets" open from several sections each, so
 * attributing them to one section would be as dishonest as attributing
 * "target-pair", which is already deliberately excluded there.
 */
export function panelAnalyticsKind(panel: BriefingPanel): string {
  return panel.kind === "all-storylines" ? "storylines" : panel.kind;
}
