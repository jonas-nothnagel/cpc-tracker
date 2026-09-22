/**
 * Glossary term registry (part of the removable glossary system —
 * see `src/components/ui/glossary/README.md`).
 *
 * WHY THIS EXISTS: the Panama focus group (23 Jul 2026) rated "full
 * understanding of the graphs" 5/11 and "relationships easy to interpret"
 * 5/11, and 8 of 11 named contextual tooltips as the help they wanted. Guided
 * tours had already shipped a week before that session, so the gap is not more
 * tours: it is vocabulary that is defined where the reader meets it.
 *
 * This file holds only the ids. Every term string and definition lives in the
 * message catalog under `glossary.<id>.term` / `glossary.<id>.definition`, so
 * en / es / mn stay in lockstep and the i18n parity gate covers them.
 *
 * WRITING DEFINITIONS (they are user-facing policy copy, not developer docs):
 *   - Plain language. The readers are country-office staff and policy makers,
 *     not analysts. No pipeline vocabulary, no model names, no thresholds.
 *   - Say what the thing IS, and where useful what it is NOT. Several of these
 *     terms were misread in testing precisely because the limit went unstated.
 *   - Respect the negative-side vocabulary rules (CLAUDE.md and the briefing
 *     HANDOFF): "potential misalignment", never "contradiction" or "tension",
 *     and never "low" as a standalone positive label.
 */

export const GLOSSARY_TERMS = [
  /** What the whole tool measures. */
  "coherence",
  /** The unit of policy content. */
  "target",
  /** The unit every figure on the briefing actually counts. */
  "pair",
  /** The positive side of the pairwise verdict. */
  "aligned",
  /** The negative side. Framed as a review prompt, never as a finding. */
  "potentialMisalignment",
  /** The sector/theme classification currently in use. */
  "sectorLens",
  /** Dual-mode classification: the single top-scoring theme. */
  "primaryTheme",
  /** Dual-mode classification: every theme above the relevance threshold. */
  "relevantTheme",
  /** Level 3 source. */
  "btr",
  /** Level 2 source. */
  "ber",
] as const;

export type GlossaryTermId = (typeof GLOSSARY_TERMS)[number];

export function isGlossaryTermId(value: string): value is GlossaryTermId {
  return (GLOSSARY_TERMS as readonly string[]).includes(value);
}
