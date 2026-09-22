/**
 * Single kill switch for the glossary system.
 *
 * Set to `false` and every `GlossaryTerm` renders as the plain text it
 * annotates and every `ReadingLine` renders nothing, leaving each surface
 * exactly as it read before the glossary existed. No other file changes.
 *
 * Its own module (rather than living in `index.ts`) so `glossary-term.tsx` can
 * import it without a circular import through the barrel.
 */
export const GLOSSARY_ENABLED = true;
