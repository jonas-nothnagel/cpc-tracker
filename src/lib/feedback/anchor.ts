/**
 * Derive a feedback anchor id from display text (e.g. an LLM-generated
 * storyline name). Client-safe, pure.
 *
 * Unicode-aware: storyline names are localized (Mongolian narratives are
 * Cyrillic), so the slug keeps letters/numbers from any script, accents
 * included. NFC normalization makes precomposed and decomposed input
 * produce the same slug; no accent stripping, which would corrupt
 * Cyrillic (NFD turns "й" into "и" + combining breve). Anchor ids never
 * become filesystem paths; only the country id does.
 *
 * Returns null when nothing anchor-shaped survives (punctuation-only text),
 * in which case the caller should hide the feedback control rather than
 * guess an identity.
 */
/**
 * Canonical anchor identity: sorted ids joined with "__". The ledger
 * (validate.ts) and the localStorage mirror (feedback-control.tsx) MUST
 * derive keys identically or own-vote restore silently breaks.
 */
export function anchorKeyOf(anchorIds: string[]): string {
  return [...anchorIds].sort().join("__");
}

export function slugifyAnchorId(text: string): string | null {
  const slug = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
  return /[\p{L}\p{N}]/u.test(slug) ? slug : null;
}
