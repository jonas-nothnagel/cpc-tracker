"use client";

/**
 * ReadingLine — one persistent, plain-language line saying HOW TO READ the
 * visual beside it.
 *
 * Distinct from the SlideFrame `body`, which states the finding. The finding
 * answers "what does the data say"; the reading line answers "what am I
 * looking at", which is the question the Panama focus group could not answer
 * (5/11 fully understood the graphs). Guided tours already covered this, but
 * behind a click that most readers never take, so this one is always visible.
 *
 * Copy budget: ~20 words. Anything longer is a finding or a caveat, not a
 * reading line, and belongs in `body` or a drawer.
 */

import type { ReactNode } from "react";
import { GLOSSARY_ENABLED } from "./config";
import { GlossaryTerm } from "./glossary-term";
import { GLOSSARY_TERMS, type GlossaryTermId } from "@/data/glossary";

export function ReadingLine({ children }: { children: ReactNode }) {
  if (!GLOSSARY_ENABLED) return null;
  return (
    <p className="text-caption text-[var(--undp-gray)] max-w-prose mb-4 -mt-2">
      {children}
    </p>
  );
}

/**
 * Rich-text tag handlers for `t.rich`, one per glossary term, so a message can
 * mark its own vocabulary: `"Each cell is one <pair>pair</pair> of documents."`
 *
 * Returning every term (rather than asking each call site to name the ones it
 * uses) means a translator can move a term into or out of a sentence without a
 * code change — which matters because the Spanish and Mongolian phrasings do
 * not put the same words in the same places.
 */
export function glossaryTags(): Record<
  GlossaryTermId,
  (chunks: ReactNode) => ReactNode
> {
  const tag = (id: GlossaryTermId) => {
    const Tagged = (chunks: ReactNode) => (
      <GlossaryTerm id={id}>{chunks}</GlossaryTerm>
    );
    Tagged.displayName = `GlossaryTag(${id})`;
    return Tagged;
  };
  // Generated from the registry rather than listed by hand, so adding a term
  // cannot leave a message with a tag that has no handler (which throws at
  // render time, not at build time).
  const tags = {} as Record<GlossaryTermId, (chunks: ReactNode) => ReactNode>;
  for (const id of GLOSSARY_TERMS) tags[id] = tag(id);
  return tags;
}
